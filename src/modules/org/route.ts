import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { AuthRequest } from '../../types/auth';
import { assertBranchScopeAccess, assertUnrestrictedScope, getScopeIds } from '../../utils/access-scope';
import { Errors, ok } from '../../utils/response';
import { getUserScopes, replaceUserScopes } from './access-service';

const router = Router();

const branchSchema = z
  .object({
    code: z.string().trim().min(1).max(30),
    nameAr: z.string().trim().min(2).max(200),
    nameEn: z.string().trim().max(200).optional(),
    timezone: z.string().trim().max(80).optional(),
    currencyCode: z.string().trim().min(1).max(10).optional(),
    numberingPrefix: z.string().trim().max(30).optional(),
    isActive: z.boolean().optional()
  })
  .strict();

const siteSchema = z
  .object({
    branchId: z.coerce.number().int().positive(),
    code: z.string().trim().min(1).max(30),
    nameAr: z.string().trim().min(2).max(200),
    nameEn: z.string().trim().max(200).optional(),
    location: z.string().trim().max(250).optional(),
    isActive: z.boolean().optional()
  })
  .strict();

const departmentSchema = z
  .object({
    code: z.string().trim().min(1).max(30),
    nameAr: z.string().trim().min(2).max(200),
    nameEn: z.string().trim().max(200).optional(),
    branchId: z.coerce.number().int().positive().nullable().optional(),
    parentId: z.coerce.number().int().positive().nullable().optional(),
    managerId: z.coerce.number().int().positive().nullable().optional(),
    isActive: z.boolean().optional()
  })
  .strict();

const userScopeSchema = z
  .object({
    defaultBranchId: z.coerce.number().int().positive().nullable().optional(),
    branchAccesses: z
      .array(
        z
          .object({
            branchId: z.coerce.number().int().positive(),
            canRead: z.boolean().optional(),
            canWrite: z.boolean().optional()
          })
          .strict()
      )
      .optional(),
    projectAccesses: z
      .array(
        z
          .object({
            projectId: z.coerce.number().int().positive(),
            canRead: z.boolean().optional(),
            canWrite: z.boolean().optional()
          })
          .strict()
      )
      .optional(),
    warehouseAccesses: z
      .array(
        z
          .object({
            warehouseId: z.coerce.number().int().positive(),
            canRead: z.boolean().optional(),
            canWrite: z.boolean().optional()
          })
          .strict()
      )
      .optional()
  })
  .strict();

function parseId(raw: unknown, label = 'id') {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw Errors.validation(`${label} غير صالح`);
  return value;
}

async function ensureBranchExists(branchId?: number | null) {
  if (!branchId) return;
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } });
  if (!branch) throw Errors.validation('الفرع غير موجود');
}

async function ensureDepartmentRelations(data: z.infer<typeof departmentSchema>) {
  await ensureBranchExists(data.branchId ?? undefined);

  if (data.parentId) {
    const parent = await prisma.department.findUnique({ where: { id: data.parentId }, select: { id: true } });
    if (!parent) throw Errors.validation('الإدارة الأم غير موجودة');
  }

  if (data.managerId) {
    const manager = await prisma.user.findUnique({ where: { id: data.managerId }, select: { id: true } });
    if (!manager) throw Errors.validation('المدير المسؤول غير موجود');
  }
}

async function deleteOrDeactivate<T extends { id: number }>(
  deleteAction: () => Promise<T>,
  deactivateAction: () => Promise<T>
) {
  try {
    return { row: await deleteAction(), deactivated: false };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2003', 'P2014', 'P2004'].includes(error.code)
    ) {
      return { row: await deactivateAction(), deactivated: true };
    }
    throw error;
  }
}

router.use(authenticate);

router.get('/bootstrap', requirePermissions(PERMISSIONS.ORG_READ), async (req: AuthRequest, res) => {
  const branchIds = getScopeIds(req, 'branch');
  const warehouseIds = getScopeIds(req, 'warehouse');

  const [company, branches, sites, departments, warehouses] = await Promise.all([
    prisma.companyProfile.findUnique({ where: { id: 1 } }),
    prisma.branch.findMany({
      where: {
        isActive: true,
        ...(branchIds.length ? { id: { in: branchIds } } : {})
      },
      orderBy: [{ code: 'asc' }, { id: 'asc' }]
    }),
    prisma.site.findMany({
      where: {
        isActive: true,
        ...(branchIds.length ? { branchId: { in: branchIds } } : {})
      },
      orderBy: [{ branchId: 'asc' }, { code: 'asc' }]
    }),
    prisma.department.findMany({
      where: {
        isActive: true,
        ...(branchIds.length ? { OR: [{ branchId: null }, { branchId: { in: branchIds } }] } : {})
      },
      orderBy: [{ code: 'asc' }, { id: 'asc' }]
    }),
    prisma.warehouse.findMany({
      where: {
        isActive: true,
        ...(warehouseIds.length ? { id: { in: warehouseIds } } : branchIds.length ? { branchId: { in: branchIds } } : {})
      },
      select: { id: true, code: true, nameAr: true, branchId: true, siteId: true },
      orderBy: [{ branchId: 'asc' }, { code: 'asc' }]
    })
  ]);

  ok(res, {
    company,
    branches,
    sites,
    departments,
    warehouses,
    access: req.user
      ? {
          defaultBranchId: req.user.defaultBranchId ?? null,
          branchIds: req.user.branchIds ?? [],
          projectIds: req.user.projectIds ?? [],
          warehouseIds: req.user.warehouseIds ?? []
        }
      : null
  });
});

router.get('/branches', requirePermissions(PERMISSIONS.ORG_READ), async (req: AuthRequest, res) => {
  const activeOnly = req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;
  const branchIds = getScopeIds(req, 'branch');

  const branches = await prisma.branch.findMany({
    where: {
      ...(activeOnly === undefined ? {} : { isActive: activeOnly }),
      ...(branchIds.length ? { id: { in: branchIds } } : {})
    },
    orderBy: [{ code: 'asc' }, { id: 'asc' }]
  });
  ok(res, branches);
});

router.post('/branches', requirePermissions(PERMISSIONS.ORG_WRITE), validateBody(branchSchema), audit('branches'), async (req: AuthRequest, res, next) => {
  try {
    assertUnrestrictedScope(req, 'branch', 'write', 'إنشاء الفروع يتطلب صلاحية عامة على الفروع');
    const branch = await prisma.branch.create({ data: req.body });
    ok(res, branch, undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/branches/:id', requirePermissions(PERMISSIONS.ORG_READ), async (req: AuthRequest, res, next) => {
  try {
    const id = parseId(req.params.id);
    assertBranchScopeAccess(req, id);
    const branch = await prisma.branch.findUnique({
      where: { id },
      include: {
        sites: { orderBy: { code: 'asc' } }
      }
    });
    if (!branch) throw Errors.notFound('الفرع غير موجود');
    ok(res, branch);
  } catch (error) {
    next(error);
  }
});

router.put('/branches/:id', requirePermissions(PERMISSIONS.ORG_WRITE), validateBody(branchSchema.partial()), audit('branches'), async (req: AuthRequest, res, next) => {
  try {
    const id = parseId(req.params.id);
    assertBranchScopeAccess(req, id, 'write');
    const branch = await prisma.branch.update({
      where: { id },
      data: req.body
    });
    ok(res, branch);
  } catch (error) {
    next(error);
  }
});

router.delete('/branches/:id', requirePermissions(PERMISSIONS.ORG_WRITE), audit('branches'), async (req: AuthRequest, res, next) => {
  try {
    const id = parseId(req.params.id);
    assertBranchScopeAccess(req, id, 'write');
    const branch = await deleteOrDeactivate(
      () => prisma.branch.delete({ where: { id } }),
      () => prisma.branch.update({ where: { id }, data: { isActive: false } })
    );
    ok(res, { id: branch.row.id, deleted: !branch.deactivated, deactivated: branch.deactivated });
  } catch (error) {
    next(error);
  }
});

router.get('/sites', requirePermissions(PERMISSIONS.ORG_READ), async (req: AuthRequest, res) => {
  const branchId = req.query.branchId ? parseId(req.query.branchId, 'branchId') : undefined;
  if (branchId) assertBranchScopeAccess(req, branchId);
  const branchIds = getScopeIds(req, 'branch');
  const activeOnly = req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;

  const sites = await prisma.site.findMany({
    where: {
      ...(branchId ? { branchId } : branchIds.length ? { branchId: { in: branchIds } } : {}),
      ...(activeOnly === undefined ? {} : { isActive: activeOnly })
    },
    include: { branch: { select: { id: true, code: true, nameAr: true } } },
    orderBy: [{ branchId: 'asc' }, { code: 'asc' }]
  });
  ok(res, sites);
});

router.post('/sites', requirePermissions(PERMISSIONS.ORG_WRITE), validateBody(siteSchema), audit('sites'), async (req: AuthRequest, res, next) => {
  try {
    assertBranchScopeAccess(req, req.body.branchId, 'write');
    await ensureBranchExists(req.body.branchId);
    const site = await prisma.site.create({ data: req.body });
    ok(res, site, undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/sites/:id', requirePermissions(PERMISSIONS.ORG_READ), async (req: AuthRequest, res, next) => {
  try {
    const id = parseId(req.params.id);
    const site = await prisma.site.findUnique({
      where: { id },
      include: { branch: { select: { id: true, code: true, nameAr: true } } }
    });
    if (!site) throw Errors.notFound('الموقع غير موجود');
    assertBranchScopeAccess(req, site.branchId ?? undefined);
    ok(res, site);
  } catch (error) {
    next(error);
  }
});

router.put('/sites/:id', requirePermissions(PERMISSIONS.ORG_WRITE), validateBody(siteSchema.partial()), audit('sites'), async (req: AuthRequest, res, next) => {
  try {
    const id = parseId(req.params.id);
    const current = await prisma.site.findUnique({ where: { id }, select: { branchId: true } });
    if (!current) throw Errors.notFound('الموقع غير موجود');

    assertBranchScopeAccess(req, current.branchId ?? undefined, 'write');
    if (req.body.branchId !== undefined) {
      assertBranchScopeAccess(req, req.body.branchId, 'write');
      await ensureBranchExists(req.body.branchId);
    }

    const site = await prisma.site.update({
      where: { id },
      data: req.body
    });
    ok(res, site);
  } catch (error) {
    next(error);
  }
});

router.delete('/sites/:id', requirePermissions(PERMISSIONS.ORG_WRITE), audit('sites'), async (req: AuthRequest, res, next) => {
  try {
    const id = parseId(req.params.id);
    const current = await prisma.site.findUnique({ where: { id }, select: { branchId: true } });
    if (!current) throw Errors.notFound('الموقع غير موجود');
    assertBranchScopeAccess(req, current.branchId ?? undefined, 'write');

    const site = await deleteOrDeactivate(
      () => prisma.site.delete({ where: { id } }),
      () => prisma.site.update({ where: { id }, data: { isActive: false } })
    );
    ok(res, { id: site.row.id, deleted: !site.deactivated, deactivated: site.deactivated });
  } catch (error) {
    next(error);
  }
});

router.get('/departments', requirePermissions(PERMISSIONS.ORG_READ), async (req: AuthRequest, res) => {
  const branchId = req.query.branchId ? parseId(req.query.branchId, 'branchId') : undefined;
  if (branchId) assertBranchScopeAccess(req, branchId);
  const branchIds = getScopeIds(req, 'branch');

  const departments = await prisma.department.findMany({
    where: branchId
      ? { branchId }
      : branchIds.length
        ? { OR: [{ branchId: null }, { branchId: { in: branchIds } }] }
        : {},
    include: { branch: { select: { id: true, code: true, nameAr: true } } },
    orderBy: [{ code: 'asc' }, { id: 'asc' }]
  });
  ok(res, departments);
});

router.post('/departments', requirePermissions(PERMISSIONS.ORG_WRITE), validateBody(departmentSchema), audit('departments'), async (req: AuthRequest, res, next) => {
  try {
    if (req.body.branchId) assertBranchScopeAccess(req, req.body.branchId, 'write');
    await ensureDepartmentRelations(req.body);
    const department = await prisma.department.create({ data: req.body });
    ok(res, department, undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/departments/:id', requirePermissions(PERMISSIONS.ORG_READ), async (req: AuthRequest, res, next) => {
  try {
    const id = parseId(req.params.id);
    const department = await prisma.department.findUnique({
      where: { id },
      include: { branch: { select: { id: true, code: true, nameAr: true } } }
    });
    if (!department) throw Errors.notFound('الإدارة غير موجودة');
    if (department.branchId) assertBranchScopeAccess(req, department.branchId);
    ok(res, department);
  } catch (error) {
    next(error);
  }
});

router.put('/departments/:id', requirePermissions(PERMISSIONS.ORG_WRITE), validateBody(departmentSchema.partial()), audit('departments'), async (req: AuthRequest, res, next) => {
  try {
    const id = parseId(req.params.id);
    const current = await prisma.department.findUnique({ where: { id }, select: { branchId: true } });
    if (!current) throw Errors.notFound('الإدارة غير موجودة');
    if (current.branchId) assertBranchScopeAccess(req, current.branchId, 'write');
    if (req.body.branchId) assertBranchScopeAccess(req, req.body.branchId, 'write');

    await ensureDepartmentRelations(req.body);
    const department = await prisma.department.update({
      where: { id },
      data: req.body
    });
    ok(res, department);
  } catch (error) {
    next(error);
  }
});

router.delete('/departments/:id', requirePermissions(PERMISSIONS.ORG_WRITE), audit('departments'), async (req: AuthRequest, res, next) => {
  try {
    const id = parseId(req.params.id);
    const current = await prisma.department.findUnique({ where: { id }, select: { branchId: true } });
    if (!current) throw Errors.notFound('الإدارة غير موجودة');
    if (current.branchId) assertBranchScopeAccess(req, current.branchId, 'write');

    const department = await deleteOrDeactivate(
      () => prisma.department.delete({ where: { id } }),
      () => prisma.department.update({ where: { id }, data: { isActive: false } })
    );
    ok(res, { id: department.row.id, deleted: !department.deactivated, deactivated: department.deactivated });
  } catch (error) {
    next(error);
  }
});

router.get('/users/:id/scopes', requirePermissions(PERMISSIONS.ORG_READ), async (req, res, next) => {
  try {
    ok(res, await getUserScopes(parseId(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.put('/users/:id/scopes', requirePermissions(PERMISSIONS.ORG_WRITE), validateBody(userScopeSchema), audit('user_access_scopes'), async (req, res, next) => {
  try {
    ok(res, await replaceUserScopes(parseId(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

export default router;
