import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { AuthRequest } from '../../types/auth';
import {
  assertBranchScopeAccess,
  assertProjectScopeAccess,
  assertWarehouseScopeAccess,
  getScopeIds
} from '../../utils/access-scope';
import { Errors, ok } from '../../utils/response';
import * as service from './service';

const router = Router();

const dailyLogSchema = z
  .object({
    branchId: z.coerce.number().int().positive().optional(),
    siteId: z.coerce.number().int().positive().optional(),
    projectId: z.coerce.number().int().positive(),
    logDate: z.string().optional(),
    weather: z.string().trim().max(80).optional(),
    manpowerCount: z.coerce.number().int().min(0).optional(),
    equipmentCount: z.coerce.number().int().min(0).optional(),
    progressSummary: z.string().trim().optional(),
    issues: z.string().trim().optional(),
    notes: z.string().trim().optional()
  })
  .strict();

const materialLineSchema = z
  .object({
    itemId: z.coerce.number().int().positive(),
    quantity: z.coerce.number().positive(),
    estimatedUnitCost: z.coerce.number().nonnegative().optional(),
    notes: z.string().trim().optional()
  })
  .strict();

const materialRequestSchema = z
  .object({
    branchId: z.coerce.number().int().positive().optional(),
    siteId: z.coerce.number().int().positive().optional(),
    projectId: z.coerce.number().int().positive(),
    warehouseId: z.coerce.number().int().positive().optional(),
    requestDate: z.string().optional(),
    neededBy: z.string().optional(),
    notes: z.string().trim().optional(),
    lines: z.array(materialLineSchema).min(1)
  })
  .strict();

const fulfillMaterialRequestSchema = z
  .object({
    warehouseId: z.coerce.number().int().positive().optional(),
    fulfilledAt: z.string().optional()
  })
  .strict();

const progressSchema = z
  .object({
    branchId: z.coerce.number().int().positive().optional(),
    siteId: z.coerce.number().int().positive().optional(),
    projectId: z.coerce.number().int().positive(),
    phaseId: z.coerce.number().int().positive().optional(),
    taskId: z.coerce.number().int().positive().optional(),
    entryDate: z.string().optional(),
    progressPercent: z.coerce.number().min(0).max(100),
    quantityCompleted: z.coerce.number().nonnegative().optional(),
    description: z.string().trim().optional(),
    notes: z.string().trim().optional()
  })
  .strict();

const equipmentIssueSchema = z
  .object({
    branchId: z.coerce.number().int().positive().optional(),
    siteId: z.coerce.number().int().positive().optional(),
    projectId: z.coerce.number().int().positive().optional(),
    assetId: z.coerce.number().int().positive(),
    issueDate: z.string().optional(),
    severity: z.string().trim().max(40).optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().optional(),
    createMaintenance: z.boolean().optional()
  })
  .strict();

const resolveIssueSchema = z
  .object({
    resolutionNotes: z.string().trim().optional()
  })
  .strict();

function parseId(raw: unknown, label = 'id') {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw Errors.validation(`${label} غير صالح`);
  return value;
}

async function assertMaterialRequestAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const row = await prisma.siteMaterialRequest.findUnique({
    where: { id },
    select: { id: true, branchId: true, projectId: true, warehouseId: true }
  });
  if (!row) throw Errors.notFound('طلب المواد غير موجود');
  if (row.branchId) assertBranchScopeAccess(req, row.branchId, mode);
  if (row.projectId) assertProjectScopeAccess(req, row.projectId, mode);
  if (row.warehouseId) assertWarehouseScopeAccess(req, row.warehouseId, mode);
  return row;
}

async function assertDailyLogAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const row = await prisma.siteDailyLog.findUnique({
    where: { id },
    select: { id: true, branchId: true, projectId: true }
  });
  if (!row) throw Errors.notFound('اليومية الميدانية غير موجودة');
  if (row.branchId) assertBranchScopeAccess(req, row.branchId, mode);
  if (row.projectId) assertProjectScopeAccess(req, row.projectId, mode);
  return row;
}

async function assertProgressAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const row = await prisma.siteProgressEntry.findUnique({
    where: { id },
    select: { id: true, branchId: true, projectId: true }
  });
  if (!row) throw Errors.notFound('تحديث الإنجاز غير موجود');
  if (row.branchId) assertBranchScopeAccess(req, row.branchId, mode);
  if (row.projectId) assertProjectScopeAccess(req, row.projectId, mode);
  return row;
}

async function assertEquipmentIssueAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const row = await prisma.siteEquipmentIssue.findUnique({
    where: { id },
    select: { id: true, branchId: true, projectId: true }
  });
  if (!row) throw Errors.notFound('بلاغ المعدة غير موجود');
  if (row.branchId) assertBranchScopeAccess(req, row.branchId, mode);
  if (row.projectId) assertProjectScopeAccess(req, row.projectId, mode);
  return row;
}

router.use(authenticate);

router.get('/reference-data', requirePermissions(PERMISSIONS.SITE_READ), async (req: AuthRequest, res, next) => {
  try {
    ok(
      res,
      await service.getReferenceData({
        branchIds: getScopeIds(req, 'branch'),
        projectIds: getScopeIds(req, 'project'),
        warehouseIds: getScopeIds(req, 'warehouse')
      })
    );
  } catch (error) {
    next(error);
  }
});

router.get('/daily-logs', requirePermissions(PERMISSIONS.SITE_READ), async (req: AuthRequest, res, next) => {
  try {
    if (req.query.branchId) assertBranchScopeAccess(req, Number(req.query.branchId));
    if (req.query.projectId) assertProjectScopeAccess(req, Number(req.query.projectId));
    const data = await service.listDailyLogs(req.query, {
      branchIds: getScopeIds(req, 'branch'),
      projectIds: getScopeIds(req, 'project')
    });
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.post('/daily-log', requirePermissions(PERMISSIONS.SITE_WRITE), validateBody(dailyLogSchema), audit('site_daily_logs'), async (req: AuthRequest, res, next) => {
  try {
    if (req.body.branchId) assertBranchScopeAccess(req, req.body.branchId, 'write');
    assertProjectScopeAccess(req, req.body.projectId, 'write');
    ok(res, await service.createDailyLog({ ...req.body, createdById: req.user?.id }), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/daily-logs/:id', requirePermissions(PERMISSIONS.SITE_READ), async (req: AuthRequest, res, next) => {
  try {
    await assertDailyLogAccess(req, parseId(req.params.id));
    ok(res, await service.getDailyLog(parseId(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.get('/material-requests', requirePermissions(PERMISSIONS.SITE_READ), async (req: AuthRequest, res, next) => {
  try {
    if (req.query.branchId) assertBranchScopeAccess(req, Number(req.query.branchId));
    if (req.query.projectId) assertProjectScopeAccess(req, Number(req.query.projectId));
    if (req.query.warehouseId) assertWarehouseScopeAccess(req, Number(req.query.warehouseId));
    const data = await service.listMaterialRequests(req.query, {
      branchIds: getScopeIds(req, 'branch'),
      projectIds: getScopeIds(req, 'project'),
      warehouseIds: getScopeIds(req, 'warehouse')
    });
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.post('/material-requests', requirePermissions(PERMISSIONS.SITE_WRITE), validateBody(materialRequestSchema), audit('site_material_requests'), async (req: AuthRequest, res, next) => {
  try {
    if (req.body.branchId) assertBranchScopeAccess(req, req.body.branchId, 'write');
    if (req.body.warehouseId) assertWarehouseScopeAccess(req, req.body.warehouseId, 'write');
    assertProjectScopeAccess(req, req.body.projectId, 'write');
    ok(res, await service.createMaterialRequest({ ...req.body, requestedById: req.user?.id }), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/material-requests/:id', requirePermissions(PERMISSIONS.SITE_READ), async (req: AuthRequest, res, next) => {
  try {
    await assertMaterialRequestAccess(req, parseId(req.params.id));
    ok(res, await service.getMaterialRequest(parseId(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/material-requests/:id/submit', requirePermissions(PERMISSIONS.SITE_WRITE), audit('site_material_requests'), async (req: AuthRequest, res, next) => {
  try {
    await assertMaterialRequestAccess(req, parseId(req.params.id), 'write');
    ok(res, await service.submitMaterialRequest(parseId(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/material-requests/:id/approve', requirePermissions(PERMISSIONS.SITE_WRITE), audit('site_material_requests'), async (req: AuthRequest, res, next) => {
  try {
    await assertMaterialRequestAccess(req, parseId(req.params.id), 'write');
    ok(res, await service.approveMaterialRequest(parseId(req.params.id), req.user?.id));
  } catch (error) {
    next(error);
  }
});

router.post('/material-requests/:id/fulfill', requirePermissions(PERMISSIONS.SITE_WRITE), validateBody(fulfillMaterialRequestSchema), audit('site_material_requests'), async (req: AuthRequest, res, next) => {
  try {
    await assertMaterialRequestAccess(req, parseId(req.params.id), 'write');
    if (req.body.warehouseId) assertWarehouseScopeAccess(req, req.body.warehouseId, 'write');
    ok(res, await service.fulfillMaterialRequest(parseId(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.get('/progress', requirePermissions(PERMISSIONS.SITE_READ), async (req: AuthRequest, res, next) => {
  try {
    if (req.query.branchId) assertBranchScopeAccess(req, Number(req.query.branchId));
    if (req.query.projectId) assertProjectScopeAccess(req, Number(req.query.projectId));
    const data = await service.listProgressEntries(req.query, {
      branchIds: getScopeIds(req, 'branch'),
      projectIds: getScopeIds(req, 'project')
    });
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.post('/progress', requirePermissions(PERMISSIONS.SITE_WRITE), validateBody(progressSchema), audit('site_progress_entries'), async (req: AuthRequest, res, next) => {
  try {
    if (req.body.branchId) assertBranchScopeAccess(req, req.body.branchId, 'write');
    assertProjectScopeAccess(req, req.body.projectId, 'write');
    ok(res, await service.createProgressEntry({ ...req.body, createdById: req.user?.id }), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/progress/:id', requirePermissions(PERMISSIONS.SITE_READ), async (req: AuthRequest, res, next) => {
  try {
    await assertProgressAccess(req, parseId(req.params.id));
    ok(res, await prisma.siteProgressEntry.findUnique({ where: { id: parseId(req.params.id) } }));
  } catch (error) {
    next(error);
  }
});

router.get('/equipment-issues', requirePermissions(PERMISSIONS.SITE_READ), async (req: AuthRequest, res, next) => {
  try {
    if (req.query.branchId) assertBranchScopeAccess(req, Number(req.query.branchId));
    if (req.query.projectId) assertProjectScopeAccess(req, Number(req.query.projectId));
    const data = await service.listEquipmentIssues(req.query, {
      branchIds: getScopeIds(req, 'branch'),
      projectIds: getScopeIds(req, 'project')
    });
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.post('/equipment-issues', requirePermissions(PERMISSIONS.SITE_WRITE), validateBody(equipmentIssueSchema), audit('site_equipment_issues'), async (req: AuthRequest, res, next) => {
  try {
    if (req.body.branchId) assertBranchScopeAccess(req, req.body.branchId, 'write');
    if (req.body.projectId) assertProjectScopeAccess(req, req.body.projectId, 'write');
    ok(res, await service.createEquipmentIssue({ ...req.body, reportedById: req.user?.id }), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/equipment-issues/:id', requirePermissions(PERMISSIONS.SITE_READ), async (req: AuthRequest, res, next) => {
  try {
    await assertEquipmentIssueAccess(req, parseId(req.params.id));
    ok(res, await service.getEquipmentIssue(parseId(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/equipment-issues/:id/resolve', requirePermissions(PERMISSIONS.SITE_WRITE), validateBody(resolveIssueSchema), audit('site_equipment_issues'), async (req: AuthRequest, res, next) => {
  try {
    await assertEquipmentIssueAccess(req, parseId(req.params.id), 'write');
    ok(res, await service.resolveEquipmentIssue(parseId(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

export default router;
