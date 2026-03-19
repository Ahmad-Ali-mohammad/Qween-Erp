import { Prisma } from '@prisma/client';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { audit } from '../../middleware/audit';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import { Errors, ok } from '../../utils/response';

const router = Router();

type ModelDelegate = {
  findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  findUnique: (args: Record<string, unknown>) => Promise<unknown>;
  create: (args: Record<string, unknown>) => Promise<unknown>;
  update: (args: Record<string, unknown>) => Promise<unknown>;
  delete: (args: Record<string, unknown>) => Promise<unknown>;
  count: (args?: Record<string, unknown>) => Promise<number>;
};

const jsonScalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const decimalScalar = z.union([z.number(), z.string()]);
const idParamSchema = z.object({ id: z.coerce.number().int().positive() }).strict();

function getPrismaModel(model: string) {
  const modelName = `${model.charAt(0).toUpperCase()}${model.slice(1)}`;
  return Prisma.dmmf.datamodel.models.find((entry) => entry.name === modelName) || null;
}

function fieldSchema(field: Prisma.DMMF.Field) {
  if (field.kind !== 'scalar') return null;

  let base: z.ZodTypeAny;
  switch (field.type) {
    case 'String':
      base = z.string();
      break;
    case 'Int':
      base = z.number().int();
      break;
    case 'BigInt':
      base = z.union([z.bigint(), z.number().int(), z.string()]);
      break;
    case 'Float':
      base = z.number();
      break;
    case 'Decimal':
      base = decimalScalar;
      break;
    case 'Boolean':
      base = z.boolean();
      break;
    case 'DateTime':
      base = z.union([z.string().datetime(), z.date()]);
      break;
    case 'Json':
      base = z.union([jsonScalar, z.array(jsonScalar), z.record(z.any())]);
      break;
    default:
      base = z.string();
      break;
  }

  const withCardinality = field.isList ? z.array(base) : base;
  return field.isRequired ? withCardinality : withCardinality.optional();
}

function buildStrictModelSchema(model: string, mode: 'create' | 'update') {
  const prismaModel = getPrismaModel(model);
  if (!prismaModel) {
    return z.record(z.any()).superRefine((_value, ctx) => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `تعذر تحميل نموذج Prisma: ${model}` });
    });
  }

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of prismaModel.fields) {
    if (field.kind !== 'scalar') continue;
    if (field.name === 'id' || field.name === 'createdAt' || field.name === 'updatedAt') continue;
    const schema = fieldSchema(field);
    if (!schema) continue;
    shape[field.name] = schema;
  }

  let schema = z.object(shape).strict();
  if (mode === 'update') schema = schema.partial();
  return schema.refine((value) => Object.keys(value).length > 0, 'يجب إرسال حقل واحد على الأقل');
}

function getDelegate(model: string): ModelDelegate {
  return (prisma as unknown as Record<string, ModelDelegate>)[model];
}

function parseIdParam(req: Request) {
  return idParamSchema.parse(req.params).id;
}

function parsePagination(req: Request) {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 20)));
  return { page, limit, skip: (page - 1) * limit };
}

async function listRows(model: string, req: Request, where: Record<string, unknown> = {}) {
  const delegate = getDelegate(model);
  const { page, limit, skip } = parsePagination(req);
  const [rows, total] = await Promise.all([
    delegate.findMany({ where, skip, take: limit, orderBy: { id: 'desc' } }),
    delegate.count({ where })
  ]);

  return {
    rows,
    meta: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit))
    }
  };
}

async function getIntegrationByKey(key: string) {
  return getDelegate('integrationSetting').findUnique({ where: { key } }) as Promise<Record<string, unknown> | null>;
}

async function upsertIntegrationByKey(
  key: string,
  payload: { provider?: string; isEnabled?: boolean; status?: string; settings?: Record<string, unknown> }
) {
  const delegate = getDelegate('integrationSetting');
  const exists = await delegate.findUnique({ where: { key } });
  const data = { key, provider: payload.provider, isEnabled: payload.isEnabled, status: payload.status, settings: payload.settings };
  if (exists) return delegate.update({ where: { key }, data });
  return delegate.create({ data });
}

const backupCreateSchema = buildStrictModelSchema('backupJob', 'create');
const backupUpdateSchema = buildStrictModelSchema('backupJob', 'update');
const securityPolicyUpsertSchema = buildStrictModelSchema('securityPolicy', 'update');
const userMfaUpdateSchema = buildStrictModelSchema('userMfaSetting', 'update').transform((body) => {
  const { userId: _userId, ...rest } = body as Record<string, unknown>;
  return rest;
});
const integrationUpdateSchema = buildStrictModelSchema('integrationSetting', 'update').transform((body) => {
  const { key: _key, ...rest } = body as Record<string, unknown>;
  return rest;
});
const internalControlsSchema = z
  .object({
    isEnabled: z.boolean().optional(),
    status: z.string().trim().min(1).max(50).optional(),
    settings: z.record(z.any()).optional()
  })
  .strict();

router.use(authenticate);

router.get('/permissions', requirePermissions(PERMISSIONS.USERS_READ), async (_req: Request, res: Response) => {
  ok(res, Object.values(PERMISSIONS).map((code) => ({ code })));
});

router.get('/backups', requirePermissions(PERMISSIONS.BACKUP_READ), async (req: Request, res: Response) => {
  const data = await listRows('backupJob', req);
  ok(res, data.rows, data.meta);
});

router.get('/backups/schedules', requirePermissions(PERMISSIONS.BACKUP_READ), async (req: Request, res: Response) => {
  const data = await listRows('backupJob', req, { isScheduled: true });
  ok(res, data.rows, data.meta);
});

router.get('/backups/:id', requirePermissions(PERMISSIONS.BACKUP_READ), async (req: Request, res: Response) => {
  const row = await getDelegate('backupJob').findUnique({ where: { id: parseIdParam(req) } });
  ok(res, row);
});

router.post('/backups', requirePermissions(PERMISSIONS.BACKUP_WRITE), validateBody(backupCreateSchema), audit('backup_jobs'), async (req: Request, res: Response) => {
  const row = await getDelegate('backupJob').create({ data: req.body });
  ok(res, row, undefined, 201);
});

router.put('/backups/:id', requirePermissions(PERMISSIONS.BACKUP_WRITE), validateBody(backupUpdateSchema), audit('backup_jobs'), async (req: Request, res: Response) => {
  const row = await getDelegate('backupJob').update({ where: { id: parseIdParam(req) }, data: req.body });
  ok(res, row);
});

router.delete('/backups/:id', requirePermissions(PERMISSIONS.BACKUP_WRITE), audit('backup_jobs'), async (req: Request, res: Response) => {
  await getDelegate('backupJob').delete({ where: { id: parseIdParam(req) } });
  ok(res, { deleted: true });
});

router.post('/backups/:id/restore', requirePermissions(PERMISSIONS.BACKUP_WRITE), audit('backup_jobs'), async (req: Request, res: Response) => {
  const row = await getDelegate('backupJob').create({
    data: {
      action: 'RESTORE',
      sourceBackupId: parseIdParam(req),
      status: 'QUEUED',
      requestedAt: new Date()
    }
  });
  ok(res, row, undefined, 202);
});

router.get('/security/policies', requirePermissions(PERMISSIONS.SECURITY_READ), async (_req: Request, res: Response) => {
  const row = await getDelegate('securityPolicy').findUnique({ where: { id: 1 } });
  ok(res, row);
});

router.put(
  '/security/policies',
  requirePermissions(PERMISSIONS.SECURITY_WRITE),
  validateBody(securityPolicyUpsertSchema),
  audit('security_policies'),
  async (req: Request, res: Response) => {
    const delegate = getDelegate('securityPolicy');
    const exists = await delegate.findUnique({ where: { id: 1 } });
    const row = exists ? await delegate.update({ where: { id: 1 }, data: req.body }) : await delegate.create({ data: { id: 1, ...req.body } });
    ok(res, row);
  }
);

router.get('/security/mfa/:userId', requirePermissions(PERMISSIONS.SECURITY_READ), async (req: Request, res: Response) => {
  const userId = z.coerce.number().int().positive().parse(req.params.userId);
  const row = await getDelegate('userMfaSetting').findUnique({ where: { userId } });
  ok(res, row);
});

router.put(
  '/security/mfa/:userId',
  requirePermissions(PERMISSIONS.SECURITY_WRITE),
  validateBody(userMfaUpdateSchema),
  audit('user_mfa_settings'),
  async (req: Request, res: Response) => {
    const delegate = getDelegate('userMfaSetting');
    const userId = z.coerce.number().int().positive().parse(req.params.userId);
    const exists = await delegate.findUnique({ where: { userId } });
    const row = exists ? await delegate.update({ where: { userId }, data: req.body }) : await delegate.create({ data: { ...req.body, userId } });
    ok(res, row);
  }
);

router.get('/internal-controls', requirePermissions(PERMISSIONS.AUDIT_READ), async (_req: Request, res: Response) => {
  const row = await getIntegrationByKey('internal-controls');
  ok(
    res,
    row ?? {
      key: 'internal-controls',
      provider: 'SYSTEM',
      isEnabled: false,
      status: 'DRAFT',
      settings: {}
    }
  );
});

router.put(
  '/internal-controls',
  requirePermissions(PERMISSIONS.SETTINGS_WRITE),
  validateBody(internalControlsSchema),
  audit('integration_settings'),
  async (req: Request, res: Response) => {
    const row = await upsertIntegrationByKey('internal-controls', {
      provider: 'SYSTEM',
      isEnabled: req.body.isEnabled ?? true,
      status: req.body.status ?? 'ACTIVE',
      settings: req.body.settings ?? {}
    });
    ok(res, row);
  }
);

router.get('/users/:id/permissions', requirePermissions(PERMISSIONS.USERS_READ), async (req: Request, res: Response) => {
  const id = parseIdParam(req);
  const row = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  ok(res, row?.role?.permissions ?? {});
});

router.put('/users/:id/permissions', requirePermissions(PERMISSIONS.USERS_WRITE), async (req: Request, res: Response) => {
  const id = parseIdParam(req);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw Errors.notFound('المستخدم غير موجود');

  const role = await prisma.role.findUnique({ where: { id: user.roleId } });
  if (!role) throw Errors.notFound('الدور غير موجود');

  const row = await prisma.role.update({ where: { id: role.id }, data: { permissions: req.body ?? {} } });
  ok(res, row.permissions ?? {});
});

router.get('/roles/:id', requirePermissions(PERMISSIONS.ROLES_READ), async (req: Request, res: Response) => {
  ok(res, await prisma.role.findUnique({ where: { id: parseIdParam(req) } }));
});

router.get('/roles/:id/permissions', requirePermissions(PERMISSIONS.ROLES_READ), async (req: Request, res: Response) => {
  const row = await prisma.role.findUnique({ where: { id: parseIdParam(req) } });
  ok(res, row?.permissions ?? {});
});

router.put('/roles/:id/permissions', requirePermissions(PERMISSIONS.ROLES_WRITE), async (req: Request, res: Response) => {
  const row = await prisma.role.update({ where: { id: parseIdParam(req) }, data: { permissions: req.body ?? {} } });
  ok(res, row.permissions ?? {});
});

router.get('/integrations', requirePermissions(PERMISSIONS.INTEGRATIONS_READ), async (_req: Request, res: Response) => {
  ok(res, await prisma.integrationSetting.findMany({ orderBy: { id: 'desc' } }));
});

router.get('/integrations/:name', requirePermissions(PERMISSIONS.INTEGRATIONS_READ), async (req: Request, res: Response) => {
  ok(res, await getDelegate('integrationSetting').findUnique({ where: { key: req.params.name } }));
});

router.put(
  '/integrations/:name',
  requirePermissions(PERMISSIONS.INTEGRATIONS_WRITE),
  validateBody(integrationUpdateSchema),
  audit('integration_settings'),
  async (req: Request, res: Response) => {
    const delegate = getDelegate('integrationSetting');
    const key = req.params.name;
    const exists = await delegate.findUnique({ where: { key } });
    const payload = { ...req.body, key };
    const row = exists ? await delegate.update({ where: { key }, data: payload }) : await delegate.create({ data: payload });
    ok(res, row);
  }
);

router.put('/integrations/:name/settings', requirePermissions(PERMISSIONS.INTEGRATIONS_WRITE), async (req: Request, res: Response) => {
  const key = String(req.params.name);
  const existing = await prisma.integrationSetting.findUnique({ where: { key } });
  const row = existing
    ? await prisma.integrationSetting.update({ where: { key }, data: { settings: req.body ?? {}, status: 'ACTIVE' } })
    : await prisma.integrationSetting.create({ data: { key, settings: req.body ?? {}, isEnabled: true, status: 'ACTIVE' } });
  ok(res, row);
});

router.post('/integrations/:name/test', requirePermissions(PERMISSIONS.INTEGRATIONS_READ), async (req: Request, res: Response) => {
  const key = String(req.params.name);
  const row = await prisma.integrationSetting.findUnique({ where: { key } });
  ok(res, { name: key, connected: Boolean(row), testedAt: new Date().toISOString() });
});

export default router;
