import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { ok } from '../../utils/response';
import { AuthRequest } from '../../types/auth';
import { assertBranchScopeAccess, assertProjectScopeAccess, getScopeIds } from '../../utils/access-scope';
import { prisma } from '../../config/database';
import * as equipmentService from '../equipment/service';
import * as maintenanceService from './service';

const router = Router();

const maintenanceSchema = z
  .object({
    assetId: z.coerce.number().int().positive(),
    projectId: z.coerce.number().int().positive().optional(),
    branchId: z.coerce.number().int().positive().optional(),
    supplierId: z.coerce.number().int().positive().optional(),
    serviceDate: z.string().optional(),
    type: z.string().trim().min(1).max(80),
    cost: z.coerce.number().nonnegative().optional(),
    description: z.string().trim().optional(),
    notes: z.string().trim().optional()
  })
  .strict();

const maintenanceCompleteSchema = z
  .object({
    completedAt: z.string().optional(),
    cost: z.coerce.number().nonnegative().optional(),
    notes: z.string().trim().optional()
  })
  .strict();

const scheduleSchema = z
  .object({
    assetId: z.coerce.number().int().positive(),
    branchId: z.coerce.number().int().positive().optional(),
    projectId: z.coerce.number().int().positive().optional(),
    supplierId: z.coerce.number().int().positive().optional(),
    title: z.string().trim().max(200).optional(),
    frequencyUnit: z.string().trim().min(1).max(20).optional(),
    frequencyValue: z.coerce.number().int().positive().optional(),
    startDate: z.string().optional(),
    nextDueDate: z.string().optional(),
    status: z.string().trim().max(40).optional(),
    notes: z.string().trim().optional()
  })
  .strict();

const workOrderSchema = z
  .object({
    scheduleId: z.coerce.number().int().positive().optional(),
    assetId: z.coerce.number().int().positive().optional(),
    branchId: z.coerce.number().int().positive().optional(),
    projectId: z.coerce.number().int().positive().optional(),
    supplierId: z.coerce.number().int().positive().optional(),
    priority: z.string().trim().min(1).max(20).optional(),
    requestedAt: z.string().optional(),
    dueDate: z.string().optional(),
    cost: z.coerce.number().nonnegative().optional(),
    description: z.string().trim().optional(),
    notes: z.string().trim().optional()
  })
  .strict();

const workOrderCompleteSchema = z
  .object({
    completedAt: z.string().optional(),
    cost: z.coerce.number().nonnegative().optional(),
    notes: z.string().trim().optional()
  })
  .strict();

const workOrderCancelSchema = z
  .object({
    notes: z.string().trim().optional()
  })
  .strict();

const sparePartSchema = z
  .object({
    itemId: z.coerce.number().int().positive(),
    warehouseId: z.coerce.number().int().positive().optional(),
    quantity: z.coerce.number().positive(),
    unitCost: z.coerce.number().nonnegative().optional(),
    notes: z.string().trim().optional()
  })
  .strict();

async function assertMaintenanceAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  if (!Number.isFinite(id)) return null;
  const row = await prisma.maintenanceLog.findUnique({
    where: { id },
    select: { id: true, branchId: true, projectId: true }
  });
  if (!row) return null;
  if (row.branchId) assertBranchScopeAccess(req, row.branchId, mode);
  if (row.projectId) assertProjectScopeAccess(req, row.projectId, mode);
  return row;
}

async function assertScheduleAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  if (!Number.isFinite(id)) return null;
  const row = await prisma.maintenanceSchedule.findUnique({
    where: { id },
    select: { id: true, branchId: true, projectId: true }
  });
  if (!row) return null;
  if (row.branchId) assertBranchScopeAccess(req, row.branchId, mode);
  if (row.projectId) assertProjectScopeAccess(req, row.projectId, mode);
  return row;
}

async function assertWorkOrderAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  if (!Number.isFinite(id)) return null;
  const row = await prisma.maintenanceWorkOrder.findUnique({
    where: { id },
    select: { id: true, branchId: true, projectId: true }
  });
  if (!row) return null;
  if (row.branchId) assertBranchScopeAccess(req, row.branchId, mode);
  if (row.projectId) assertProjectScopeAccess(req, row.projectId, mode);
  return row;
}

function assertMaintenancePayloadAccess(req: AuthRequest, payload: Record<string, unknown>, mode: 'read' | 'write' = 'write') {
  if (payload.branchId) assertBranchScopeAccess(req, Number(payload.branchId), mode);
  if (payload.projectId) assertProjectScopeAccess(req, Number(payload.projectId), mode);
}

router.use(authenticate);

router.get('/', requirePermissions(PERMISSIONS.ASSETS_READ), async (req: AuthRequest, res, next) => {
  try {
    if (req.query.branchId) assertBranchScopeAccess(req, Number(req.query.branchId));
    if (req.query.projectId) assertProjectScopeAccess(req, Number(req.query.projectId));
    const data = await equipmentService.listMaintenance({
      ...req.query,
      branchIds: getScopeIds(req, 'branch'),
      projectIds: getScopeIds(req, 'project')
    });
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(maintenanceSchema), audit('maintenance_logs'), async (req: AuthRequest, res, next) => {
  try {
    assertMaintenancePayloadAccess(req, req.body, 'write');
    ok(res, await equipmentService.createMaintenance(req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/schedules', requirePermissions(PERMISSIONS.ASSETS_READ), async (req: AuthRequest, res, next) => {
  try {
    if (req.query.branchId) assertBranchScopeAccess(req, Number(req.query.branchId));
    if (req.query.projectId) assertProjectScopeAccess(req, Number(req.query.projectId));
    const data = await maintenanceService.listSchedules(req.query, {
      branchIds: getScopeIds(req, 'branch'),
      projectIds: getScopeIds(req, 'project')
    });
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.post('/schedules', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(scheduleSchema), audit('maintenance_schedules'), async (req: AuthRequest, res, next) => {
  try {
    assertMaintenancePayloadAccess(req, req.body, 'write');
    ok(res, await maintenanceService.createSchedule(req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/schedules/:id', requirePermissions(PERMISSIONS.ASSETS_READ), async (req: AuthRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    await assertScheduleAccess(req, id);
    ok(res, await maintenanceService.getSchedule(id));
  } catch (error) {
    next(error);
  }
});

router.put('/schedules/:id', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(scheduleSchema.partial()), audit('maintenance_schedules'), async (req: AuthRequest, res, next) => {
  try {
    await assertScheduleAccess(req, Number(req.params.id), 'write');
    assertMaintenancePayloadAccess(req, req.body, 'write');
    ok(res, await maintenanceService.updateSchedule(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.get('/work-orders', requirePermissions(PERMISSIONS.ASSETS_READ), async (req: AuthRequest, res, next) => {
  try {
    if (req.query.branchId) assertBranchScopeAccess(req, Number(req.query.branchId));
    if (req.query.projectId) assertProjectScopeAccess(req, Number(req.query.projectId));
    const data = await maintenanceService.listWorkOrders(req.query, {
      branchIds: getScopeIds(req, 'branch'),
      projectIds: getScopeIds(req, 'project')
    });
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.post('/work-orders', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(workOrderSchema), audit('maintenance_work_orders'), async (req: AuthRequest, res, next) => {
  try {
    assertMaintenancePayloadAccess(req, req.body, 'write');
    ok(res, await maintenanceService.createWorkOrder({ ...req.body, createdById: req.user?.id ?? null }), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/work-orders/:id', requirePermissions(PERMISSIONS.ASSETS_READ), async (req: AuthRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    await assertWorkOrderAccess(req, id);
    ok(res, await maintenanceService.getWorkOrder(id));
  } catch (error) {
    next(error);
  }
});

router.put('/work-orders/:id', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(workOrderSchema.partial()), audit('maintenance_work_orders'), async (req: AuthRequest, res, next) => {
  try {
    await assertWorkOrderAccess(req, Number(req.params.id), 'write');
    assertMaintenancePayloadAccess(req, req.body, 'write');
    ok(res, await maintenanceService.updateWorkOrder(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.post('/work-orders/:id/complete', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(workOrderCompleteSchema), audit('maintenance_work_orders'), async (req: AuthRequest, res, next) => {
  try {
    await assertWorkOrderAccess(req, Number(req.params.id), 'write');
    ok(res, await maintenanceService.completeWorkOrder(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.post('/work-orders/:id/cancel', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(workOrderCancelSchema), audit('maintenance_work_orders'), async (req: AuthRequest, res, next) => {
  try {
    await assertWorkOrderAccess(req, Number(req.params.id), 'write');
    ok(res, await maintenanceService.cancelWorkOrder(Number(req.params.id), req.body?.notes ?? null));
  } catch (error) {
    next(error);
  }
});

router.get('/work-orders/:id/spare-parts', requirePermissions(PERMISSIONS.ASSETS_READ), async (req: AuthRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    await assertWorkOrderAccess(req, id);
    ok(res, await maintenanceService.listSpareParts(id));
  } catch (error) {
    next(error);
  }
});

router.post('/work-orders/:id/spare-parts', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(sparePartSchema), audit('maintenance_spare_parts'), async (req: AuthRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    await assertWorkOrderAccess(req, id, 'write');
    ok(res, await maintenanceService.addSparePart(id, req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.delete('/work-orders/:id/spare-parts/:partId', requirePermissions(PERMISSIONS.ASSETS_WRITE), audit('maintenance_spare_parts'), async (req: AuthRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    await assertWorkOrderAccess(req, id, 'write');
    ok(res, await maintenanceService.removeSparePart(Number(req.params.partId)));
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requirePermissions(PERMISSIONS.ASSETS_READ), async (req: AuthRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    await assertMaintenanceAccess(req, id);
    ok(res, await equipmentService.getMaintenance(id));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(maintenanceSchema.partial()), audit('maintenance_logs'), async (req: AuthRequest, res, next) => {
  try {
    await assertMaintenanceAccess(req, Number(req.params.id), 'write');
    assertMaintenancePayloadAccess(req, req.body, 'write');
    ok(res, await equipmentService.updateMaintenance(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/complete', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(maintenanceCompleteSchema), audit('maintenance_logs'), async (req: AuthRequest, res, next) => {
  try {
    await assertMaintenanceAccess(req, Number(req.params.id), 'write');
    ok(res, await equipmentService.completeMaintenance(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requirePermissions(PERMISSIONS.ASSETS_WRITE), audit('maintenance_logs'), async (req: AuthRequest, res, next) => {
  try {
    await assertMaintenanceAccess(req, Number(req.params.id), 'write');
    ok(res, await equipmentService.deleteMaintenance(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

export default router;
