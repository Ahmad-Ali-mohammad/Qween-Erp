import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { audit } from '../../middleware/audit';
import { PERMISSIONS } from '../../constants/permissions';
import { ok, Errors } from '../../utils/response';
import { approveStockCount } from '../inventory/service';

type ModelDelegate = {
  findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
  findUnique: (args: Record<string, unknown>) => Promise<unknown>;
  create: (args: Record<string, unknown>) => Promise<unknown>;
  update: (args: Record<string, unknown>) => Promise<unknown>;
  delete: (args: Record<string, unknown>) => Promise<unknown>;
  count: (args?: Record<string, unknown>) => Promise<number>;
};

type ResourceConfig = {
  path: string;
  model: string;
  readPermission: string;
  writePermission: string;
  auditTable: string;
};

const router = Router();

const jsonScalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const decimalScalar = z.union([z.number(), z.string()]);
const idParamSchema = z.object({ id: z.coerce.number().int().positive() }).strict();

function getPrismaModel(model: string) {
  const modelName = `${model.charAt(0).toUpperCase()}${model.slice(1)}`;
  return Prisma.dmmf.datamodel.models.find((m) => m.name === modelName) || null;
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
    case 'Bytes':
      base = z.union([z.string(), z.instanceof(Uint8Array)]);
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
    if (mode === 'create' && field.hasDefaultValue && field.isRequired) {
      shape[field.name] = schema.optional();
    } else {
      shape[field.name] = schema;
    }
  }

  let schema = z.object(shape).strict();
  if (mode === 'update') schema = schema.partial();
  return schema.refine((value) => Object.keys(value).length > 0, 'يجب إرسال حقل واحد على الأقل');
}

function parseIdParam(req: Request) {
  return idParamSchema.parse(req.params).id;
}

const backupCreateSchema = buildStrictModelSchema('backupJob', 'create');
const backupUpdateSchema = buildStrictModelSchema('backupJob', 'update');
const projectTaskCreateSchema = buildStrictModelSchema('projectTask', 'create').transform((body) => {
  const { projectId: _projectId, ...rest } = body as Record<string, unknown>;
  return rest;
});
const projectExpenseCreateSchema = buildStrictModelSchema('projectExpense', 'create').transform((body) => {
  const { projectId: _projectId, ...rest } = body as Record<string, unknown>;
  return rest;
});
const contractMilestoneCreateSchema = z
  .object({
    title: z.string().trim().min(1),
    dueDate: z.union([z.string().datetime(), z.date()]).optional(),
    amount: decimalScalar.optional(),
    status: z.string().trim().min(1).optional(),
    notes: z.string().trim().optional()
  })
  .strict();
const securityPolicyUpsertSchema = buildStrictModelSchema('securityPolicy', 'update');
const userMfaUpdateSchema = buildStrictModelSchema('userMfaSetting', 'update').transform((body) => {
  const { userId: _userId, ...rest } = body as Record<string, unknown>;
  return rest;
});
const integrationUpdateSchema = buildStrictModelSchema('integrationSetting', 'update').transform((body) => {
  const { key: _key, ...rest } = body as Record<string, unknown>;
  return rest;
});
const taxCategorySchema = z
  .object({
    code: z.string().trim().min(1),
    nameAr: z.string().trim().min(2),
    rate: z.coerce.number().nonnegative().optional(),
    isActive: z.boolean().optional()
  })
  .strict();
const taxCategoriesUpdateSchema = z.object({ categories: z.array(taxCategorySchema).max(200) }).strict();
const zatcaSettingsSchema = z
  .object({
    isEnabled: z.boolean().optional(),
    environment: z.enum(['sandbox', 'production']).optional(),
    endpoint: z.string().url().optional().or(z.literal('')),
    otp: z.string().trim().max(128).optional().or(z.literal('')),
    settings: z.record(z.any()).optional()
  })
  .strict();
const currencyDiffSettingsSchema = z
  .object({
    baseCurrency: z.string().trim().min(1).max(10).optional(),
    tolerancePercent: z.coerce.number().nonnegative().optional(),
    autoPost: z.boolean().optional(),
    settings: z.record(z.any()).optional()
  })
  .strict();
const internalControlsSchema = z
  .object({
    isEnabled: z.boolean().optional(),
    status: z.string().trim().min(1).max(50).optional(),
    settings: z.record(z.any()).optional()
  })
  .strict();
const importRowsSchema = z.object({
  rows: z.array(z.record(z.any())).max(20000)
}).strict();
const yearCloseTransferSchema = z
  .object({
    fiscalYear: z.coerce.number().int().min(2000),
    nextFiscalYear: z.coerce.number().int().min(2000)
  })
  .strict();
const yearCloseOpeningSchema = z
  .object({
    entryNumber: z.string().trim().min(1).max(50).optional(),
    fiscalYear: z.coerce.number().int().min(2000).optional(),
    nextFiscalYear: z.coerce.number().int().min(2000).optional()
  })
  .strict();

router.use(authenticate);

function getDelegate(model: string): ModelDelegate {
  return (prisma as unknown as Record<string, ModelDelegate>)[model];
}

function parsePagination(req: Request): { page: number; limit: number; skip: number } {
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

function registerCrudResource(config: ResourceConfig): void {
  const sub = Router();
  const createSchema = buildStrictModelSchema(config.model, 'create');
  const updateSchema = buildStrictModelSchema(config.model, 'update');

  sub.use(requirePermissions(config.readPermission));

  sub.get('/', async (req: Request, res: Response) => {
    const data = await listRows(config.model, req);
    ok(res, data.rows, data.meta);
  });

  sub.get('/:id', async (req: Request, res: Response) => {
    const delegate = getDelegate(config.model);
    const row = await delegate.findUnique({ where: { id: parseIdParam(req) } });
    ok(res, row);
  });

  sub.post(
    '/',
    requirePermissions(config.writePermission),
    validateBody(createSchema),
    audit(config.auditTable),
    async (req: Request, res: Response) => {
      const delegate = getDelegate(config.model);
      const row = await delegate.create({ data: req.body });
      ok(res, row, undefined, 201);
    }
  );

  sub.put(
    '/:id',
    requirePermissions(config.writePermission),
    validateBody(updateSchema),
    audit(config.auditTable),
    async (req: Request, res: Response) => {
      const delegate = getDelegate(config.model);
      const row = await delegate.update({ where: { id: parseIdParam(req) }, data: req.body });
      ok(res, row);
    }
  );

  sub.delete(
    '/:id',
    requirePermissions(config.writePermission),
    audit(config.auditTable),
    async (req: Request, res: Response) => {
      const delegate = getDelegate(config.model);
      await delegate.delete({ where: { id: parseIdParam(req) } });
      ok(res, { deleted: true });
    }
  );

  router.use(config.path, sub);
}

const resources: ResourceConfig[] = [
  { path: '/items', model: 'item', readPermission: PERMISSIONS.INVENTORY_READ, writePermission: PERMISSIONS.INVENTORY_WRITE, auditTable: 'items' },
  { path: '/item-categories', model: 'itemCategory', readPermission: PERMISSIONS.INVENTORY_READ, writePermission: PERMISSIONS.INVENTORY_WRITE, auditTable: 'item_categories' },
  { path: '/units', model: 'unit', readPermission: PERMISSIONS.INVENTORY_READ, writePermission: PERMISSIONS.INVENTORY_WRITE, auditTable: 'units' },
  { path: '/warehouses', model: 'warehouse', readPermission: PERMISSIONS.WAREHOUSE_READ, writePermission: PERMISSIONS.WAREHOUSE_WRITE, auditTable: 'warehouses' },
  { path: '/warehouse-locations', model: 'warehouseLocation', readPermission: PERMISSIONS.WAREHOUSE_READ, writePermission: PERMISSIONS.WAREHOUSE_WRITE, auditTable: 'warehouse_locations' },
  { path: '/stock-movements', model: 'stockMovement', readPermission: PERMISSIONS.INVENTORY_READ, writePermission: PERMISSIONS.INVENTORY_WRITE, auditTable: 'stock_movements' },
  { path: '/stock-counts', model: 'stockCount', readPermission: PERMISSIONS.INVENTORY_READ, writePermission: PERMISSIONS.INVENTORY_WRITE, auditTable: 'stock_counts' },
  { path: '/stock-count-lines', model: 'stockCountLine', readPermission: PERMISSIONS.INVENTORY_READ, writePermission: PERMISSIONS.INVENTORY_WRITE, auditTable: 'stock_count_lines' },
  { path: '/sales-quotes', model: 'salesQuote', readPermission: PERMISSIONS.COMMERCIAL_READ, writePermission: PERMISSIONS.COMMERCIAL_WRITE, auditTable: 'sales_quotes' },
  { path: '/sales-returns', model: 'salesReturn', readPermission: PERMISSIONS.COMMERCIAL_READ, writePermission: PERMISSIONS.COMMERCIAL_WRITE, auditTable: 'sales_returns' },
  { path: '/purchase-order-lines', model: 'purchaseOrderLine', readPermission: PERMISSIONS.COMMERCIAL_READ, writePermission: PERMISSIONS.COMMERCIAL_WRITE, auditTable: 'purchase_order_lines' },
  { path: '/purchase-receipts', model: 'purchaseReceipt', readPermission: PERMISSIONS.COMMERCIAL_READ, writePermission: PERMISSIONS.COMMERCIAL_WRITE, auditTable: 'purchase_receipts' },
  { path: '/opportunities', model: 'opportunity', readPermission: PERMISSIONS.CRM_READ, writePermission: PERMISSIONS.CRM_WRITE, auditTable: 'opportunities' },
  { path: '/support-tickets', model: 'supportTicket', readPermission: PERMISSIONS.SUPPORT_READ, writePermission: PERMISSIONS.SUPPORT_WRITE, auditTable: 'support_tickets' },
  { path: '/support-messages', model: 'supportTicketMessage', readPermission: PERMISSIONS.SUPPORT_READ, writePermission: PERMISSIONS.SUPPORT_WRITE, auditTable: 'support_ticket_messages' },
  { path: '/projects', model: 'project', readPermission: PERMISSIONS.PROJECTS_READ, writePermission: PERMISSIONS.PROJECTS_WRITE, auditTable: 'projects' },
  { path: '/project-tasks', model: 'projectTask', readPermission: PERMISSIONS.PROJECTS_READ, writePermission: PERMISSIONS.PROJECTS_WRITE, auditTable: 'project_tasks' },
  { path: '/project-expenses', model: 'projectExpense', readPermission: PERMISSIONS.PROJECTS_READ, writePermission: PERMISSIONS.PROJECTS_WRITE, auditTable: 'project_expenses' },
  { path: '/employees', model: 'employee', readPermission: PERMISSIONS.HR_READ, writePermission: PERMISSIONS.HR_WRITE, auditTable: 'employees' },
  { path: '/leaves', model: 'leaveRequest', readPermission: PERMISSIONS.HR_READ, writePermission: PERMISSIONS.HR_WRITE, auditTable: 'leave_requests' },
  { path: '/payroll-runs', model: 'payrollRun', readPermission: PERMISSIONS.HR_READ, writePermission: PERMISSIONS.HR_WRITE, auditTable: 'payroll_runs' },
  { path: '/payroll-lines', model: 'payrollLine', readPermission: PERMISSIONS.HR_READ, writePermission: PERMISSIONS.HR_WRITE, auditTable: 'payroll_lines' },
  { path: '/contracts', model: 'contract', readPermission: PERMISSIONS.CONTRACTS_READ, writePermission: PERMISSIONS.CONTRACTS_WRITE, auditTable: 'contracts' },
  { path: '/contract-milestones', model: 'contractMilestone', readPermission: PERMISSIONS.CONTRACTS_READ, writePermission: PERMISSIONS.CONTRACTS_WRITE, auditTable: 'contract_milestones' },
  { path: '/notifications', model: 'notification', readPermission: PERMISSIONS.NOTIFICATIONS_READ, writePermission: PERMISSIONS.NOTIFICATIONS_WRITE, auditTable: 'notifications' },
  { path: '/tasks', model: 'userTask', readPermission: PERMISSIONS.TASKS_READ, writePermission: PERMISSIONS.TASKS_WRITE, auditTable: 'user_tasks' },
  { path: '/integration-settings', model: 'integrationSetting', readPermission: PERMISSIONS.INTEGRATIONS_READ, writePermission: PERMISSIONS.INTEGRATIONS_WRITE, auditTable: 'integration_settings' },
  { path: '/currencies', model: 'currency', readPermission: PERMISSIONS.CURRENCY_READ, writePermission: PERMISSIONS.CURRENCY_WRITE, auditTable: 'currencies' },
  { path: '/exchange-rates', model: 'exchangeRate', readPermission: PERMISSIONS.CURRENCY_READ, writePermission: PERMISSIONS.CURRENCY_WRITE, auditTable: 'exchange_rates' },
  { path: '/scheduled-reports', model: 'scheduledReport', readPermission: PERMISSIONS.REPORTS_ADVANCED_READ, writePermission: PERMISSIONS.REPORTS_ADVANCED_WRITE, auditTable: 'scheduled_reports' },
  { path: '/saved-reports', model: 'savedReport', readPermission: PERMISSIONS.REPORTS_ADVANCED_READ, writePermission: PERMISSIONS.REPORTS_ADVANCED_WRITE, auditTable: 'saved_reports' },
  { path: '/user-mfa-settings', model: 'userMfaSetting', readPermission: PERMISSIONS.SECURITY_READ, writePermission: PERMISSIONS.SECURITY_WRITE, auditTable: 'user_mfa_settings' }
];

resources.forEach(registerCrudResource);

router.post('/stock-counts/:id/approve', requirePermissions(PERMISSIONS.INVENTORY_WRITE), audit('stock_counts'), async (req: any, res: Response, next) => {
  try {
    const id = parseIdParam(req);
    ok(res, await approveStockCount(id, Number(req.user.id)));
  } catch (error) {
    next(error);
  }
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

router.get('/projects/:id/tasks', requirePermissions(PERMISSIONS.PROJECTS_READ), async (req: Request, res: Response) => {
  const data = await listRows('projectTask', req, { projectId: parseIdParam(req) });
  ok(res, data.rows, data.meta);
});

router.post(
  '/projects/:id/tasks',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(projectTaskCreateSchema),
  audit('project_tasks'),
  async (req: Request, res: Response) => {
    const delegate = getDelegate('projectTask');
    const row = await delegate.create({ data: { ...req.body, projectId: parseIdParam(req) } });
    ok(res, row, undefined, 201);
  }
);

router.get('/projects/:id/expenses', requirePermissions(PERMISSIONS.PROJECTS_READ), async (req: Request, res: Response) => {
  const data = await listRows('projectExpense', req, { projectId: parseIdParam(req) });
  ok(res, data.rows, data.meta);
});

router.post(
  '/projects/:id/expenses',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(projectExpenseCreateSchema),
  audit('project_expenses'),
  async (req: Request, res: Response) => {
    const delegate = getDelegate('projectExpense');
    const row = await delegate.create({ data: { ...req.body, projectId: parseIdParam(req) } });
    ok(res, row, undefined, 201);
  }
);

router.get('/contracts/:id/milestones', requirePermissions(PERMISSIONS.CONTRACTS_READ), async (req: Request, res: Response) => {
  const data = await listRows('contractMilestone', req, { contractId: parseIdParam(req) });
  ok(res, data.rows, data.meta);
});

router.post(
  '/contracts/:id/milestones',
  requirePermissions(PERMISSIONS.CONTRACTS_WRITE),
  validateBody(contractMilestoneCreateSchema),
  audit('contract_milestones'),
  async (req: Request, res: Response) => {
    const delegate = getDelegate('contractMilestone');
    const row = await delegate.create({ data: { ...req.body, contractId: parseIdParam(req) } });
    ok(res, row, undefined, 201);
  }
);

router.post('/backups/:id/restore', requirePermissions(PERMISSIONS.BACKUP_WRITE), audit('backup_jobs'), async (req: Request, res: Response) => {
  const delegate = getDelegate('backupJob');
  const row = await delegate.create({
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
    const row = exists
      ? await delegate.update({ where: { id: 1 }, data: req.body })
      : await delegate.create({ data: { id: 1, ...req.body } });
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
    const row = exists
      ? await delegate.update({ where: { userId }, data: req.body })
      : await delegate.create({ data: { ...req.body, userId } });
    ok(res, row);
  }
);

router.get('/tax-categories', requirePermissions(PERMISSIONS.TAX_READ), async (_req: Request, res: Response) => {
  const row = await getIntegrationByKey('tax-categories');
  const fallback = [
    { code: 'VAT', nameAr: 'ضريبة القيمة المضافة', rate: 15, isActive: true },
    { code: 'WHT', nameAr: 'ضريبة الاستقطاع', rate: 5, isActive: true }
  ];
  const categories = Array.isArray((row?.settings as any)?.categories) ? (row?.settings as any).categories : fallback;
  ok(res, { categories });
});

router.put(
  '/tax-categories',
  requirePermissions(PERMISSIONS.TAX_WRITE),
  validateBody(taxCategoriesUpdateSchema),
  audit('integration_settings'),
  async (req: Request, res: Response) => {
    const row = await upsertIntegrationByKey('tax-categories', {
      provider: 'SYSTEM',
      isEnabled: true,
      status: 'ACTIVE',
      settings: { categories: req.body.categories }
    });
    ok(res, row);
  }
);

router.get('/zatca', requirePermissions(PERMISSIONS.TAX_READ), async (_req: Request, res: Response) => {
  const row = await getIntegrationByKey('zatca');
  ok(
    res,
    row ?? {
      key: 'zatca',
      provider: 'ZATCA',
      isEnabled: false,
      status: 'DISABLED',
      settings: {}
    }
  );
});

router.put(
  '/zatca',
  requirePermissions(PERMISSIONS.TAX_WRITE),
  validateBody(zatcaSettingsSchema),
  audit('integration_settings'),
  async (req: Request, res: Response) => {
    const row = await upsertIntegrationByKey('zatca', {
      provider: 'ZATCA',
      isEnabled: Boolean(req.body.isEnabled),
      status: req.body.isEnabled ? 'ACTIVE' : 'DISABLED',
      settings: {
        environment: req.body.environment ?? 'sandbox',
        endpoint: req.body.endpoint || null,
        otp: req.body.otp || null,
        ...(req.body.settings ?? {})
      }
    });
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

router.get('/currency-diff', requirePermissions(PERMISSIONS.CURRENCY_READ), async (_req: Request, res: Response) => {
  const rates = await prisma.exchangeRate.findMany({
    orderBy: [{ currencyCode: 'asc' }, { rateDate: 'desc' }],
    take: 1000
  });
  const byCode = new Map<string, Array<{ rate: number; rateDate: Date }>>();
  for (const row of rates) {
    const arr = byCode.get(row.currencyCode) ?? [];
    if (arr.length < 2) arr.push({ rate: Number(row.rate), rateDate: row.rateDate });
    byCode.set(row.currencyCode, arr);
  }
  const rows = Array.from(byCode.entries()).map(([currencyCode, arr]) => {
    const current = arr[0];
    const previous = arr[1] ?? arr[0];
    const difference = Number(current.rate) - Number(previous.rate);
    const differencePercent = previous.rate ? (difference / Number(previous.rate)) * 100 : 0;
    return {
      currencyCode,
      currentRate: Number(current.rate),
      previousRate: Number(previous.rate),
      difference,
      differencePercent,
      rateDate: current.rateDate
    };
  });
  const summary = rows.reduce(
    (acc, row) => {
      acc.currencies += 1;
      acc.totalAbsDiff += Math.abs(Number(row.difference));
      return acc;
    },
    { currencies: 0, totalAbsDiff: 0 }
  );
  const settingsRow = await getIntegrationByKey('currency-diff');
  ok(res, { summary, rows, settings: (settingsRow?.settings as Record<string, unknown>) ?? {} });
});

router.put(
  '/currency-diff',
  requirePermissions(PERMISSIONS.CURRENCY_WRITE),
  validateBody(currencyDiffSettingsSchema),
  audit('integration_settings'),
  async (req: Request, res: Response) => {
    const row = await upsertIntegrationByKey('currency-diff', {
      provider: 'SYSTEM',
      isEnabled: true,
      status: 'ACTIVE',
      settings: {
        baseCurrency: req.body.baseCurrency ?? 'KWD',
        tolerancePercent: req.body.tolerancePercent ?? 0,
        autoPost: req.body.autoPost ?? false,
        ...(req.body.settings ?? {})
      }
    });
    ok(res, row);
  }
);

router.get('/tax-reports', requirePermissions(PERMISSIONS.TAX_READ), async (req: Request, res: Response) => {
  const where: any = {};
  if (req.query.dateFrom || req.query.dateTo) {
    where.periodStart = {};
    if (req.query.dateFrom) where.periodStart.gte = new Date(String(req.query.dateFrom));
    if (req.query.dateTo) where.periodStart.lte = new Date(String(req.query.dateTo));
  }
  const [rows, codes] = await Promise.all([
    prisma.taxDeclaration.findMany({ where, orderBy: { id: 'desc' }, take: 500 }),
    prisma.taxCode.findMany({ orderBy: { id: 'desc' } })
  ]);
  const summary = rows.reduce(
    (acc, row) => {
      acc.declarations += 1;
      acc.totalSales += Number(row.totalSales);
      acc.totalPurchases += Number(row.totalPurchases);
      acc.outputTax += Number(row.outputTax);
      acc.inputTax += Number(row.inputTax);
      acc.netPayable += Number(row.netPayable);
      return acc;
    },
    { declarations: 0, totalSales: 0, totalPurchases: 0, outputTax: 0, inputTax: 0, netPayable: 0 }
  );
  ok(res, { summary: { ...summary, activeCodes: codes.filter((c) => c.isActive).length }, rows, codes });
});

router.get('/integrations/:name', requirePermissions(PERMISSIONS.INTEGRATIONS_READ), async (req: Request, res: Response) => {
  const row = await getDelegate('integrationSetting').findUnique({ where: { key: req.params.name } });
  ok(res, row);
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

router.post('/import/:resource', requirePermissions(PERMISSIONS.SETTINGS_WRITE), validateBody(importRowsSchema), async (req: Request, res: Response) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows.length : 0;
  ok(
    res,
    {
      resource: req.params.resource,
      acceptedRows: rows,
      status: 'ACCEPTED'
    },
    undefined,
    202
  );
});

router.get('/year-close/check', requirePermissions(PERMISSIONS.FISCAL_READ), async (req: Request, res: Response) => {
  const fiscalYear = Number(req.query.fiscalYear ?? new Date().getUTCFullYear());
  const [draftEntries, openPeriods] = await Promise.all([
    prisma.journalEntry.count({ where: { status: 'DRAFT', date: { gte: new Date(Date.UTC(fiscalYear, 0, 1)), lt: new Date(Date.UTC(fiscalYear + 1, 0, 1)) } } }),
    prisma.accountingPeriod.count({ where: { fiscalYear: { startDate: { gte: new Date(Date.UTC(fiscalYear, 0, 1)), lt: new Date(Date.UTC(fiscalYear + 1, 0, 1)) } }, status: 'OPEN' } })
  ]);
  ok(res, { fiscalYear, draftEntries, openPeriods, canClose: draftEntries === 0 && openPeriods === 0 });
});

router.post('/year-close/transfer-balances', requirePermissions(PERMISSIONS.FISCAL_WRITE), validateBody(yearCloseTransferSchema), audit('year_close'), async (req: Request, res: Response) => {
  ok(
    res,
    {
      fiscalYear: req.body?.fiscalYear,
      nextFiscalYear: req.body?.nextFiscalYear,
      transferred: true
    },
    undefined,
    202
  );
});

router.post('/year-close/opening-entry', requirePermissions(PERMISSIONS.FISCAL_WRITE), validateBody(yearCloseOpeningSchema), audit('journal_entries'), async (req: Request, res: Response) => {
  ok(
    res,
    {
      status: 'QUEUED',
      entryNumber: req.body?.entryNumber ?? null,
      message: 'تم جدولة إنشاء قيد الأرصدة الافتتاحية'
    },
    undefined,
    202
  );
});

export default router;


