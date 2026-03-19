import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { AuthRequest } from '../../types/auth';
import { assertBranchScopeAccess, assertProjectScopeAccess, getScopeIds } from '../../utils/access-scope';
import { ok } from '../../utils/response';
import assetRoutes from '../assets/route';
import * as service from './service';

const router = Router();

const allocationSchema = z
  .object({
    assetId: z.coerce.number().int().positive(),
    projectId: z.coerce.number().int().positive().optional(),
    branchId: z.coerce.number().int().positive().optional(),
    startDate: z.string().optional(),
    dailyRate: z.coerce.number().nonnegative().optional(),
    hourlyRate: z.coerce.number().nonnegative().optional(),
    operatorId: z.coerce.number().int().positive().optional(),
    notes: z.string().trim().optional()
  })
  .strict();

const allocationCloseSchema = z
  .object({
    endDate: z.string().optional(),
    hoursUsed: z.coerce.number().nonnegative().optional(),
    fuelCost: z.coerce.number().nonnegative().optional(),
    notes: z.string().trim().optional()
  })
  .strict();

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

async function assertAllocationAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const row = await prisma.equipmentAllocation.findUnique({
    where: { id },
    select: { id: true, branchId: true, projectId: true }
  });
  if (!row) return null;
  if (row.branchId) assertBranchScopeAccess(req, row.branchId, mode);
  if (row.projectId) assertProjectScopeAccess(req, row.projectId, mode);
  return row;
}

async function assertMaintenanceAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const row = await prisma.maintenanceLog.findUnique({
    where: { id },
    select: { id: true, branchId: true, projectId: true }
  });
  if (!row) return null;
  if (row.branchId) assertBranchScopeAccess(req, row.branchId, mode);
  if (row.projectId) assertProjectScopeAccess(req, row.projectId, mode);
  return row;
}

function assertEquipmentPayloadAccess(req: AuthRequest, payload: Record<string, unknown>, mode: 'read' | 'write' = 'write') {
  if (payload.branchId) assertBranchScopeAccess(req, Number(payload.branchId), mode);
  if (payload.projectId) assertProjectScopeAccess(req, Number(payload.projectId), mode);
}

router.use(authenticate);
router.use('/assets', assetRoutes);

router.get('/allocations', requirePermissions(PERMISSIONS.ASSETS_READ), async (req: AuthRequest, res, next) => {
  try {
    if (req.query.branchId) assertBranchScopeAccess(req, Number(req.query.branchId));
    if (req.query.projectId) assertProjectScopeAccess(req, Number(req.query.projectId));
    const data = await service.listAllocations({
      ...req.query,
      branchIds: getScopeIds(req, 'branch'),
      projectIds: getScopeIds(req, 'project')
    });
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.post('/allocations', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(allocationSchema), audit('equipment_allocations'), async (req: AuthRequest, res, next) => {
  try {
    assertEquipmentPayloadAccess(req, req.body, 'write');
    ok(res, await service.createAllocation(req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/allocations/:id', requirePermissions(PERMISSIONS.ASSETS_READ), async (req: AuthRequest, res, next) => {
  try {
    await assertAllocationAccess(req, Number(req.params.id));
    ok(res, await service.getAllocation(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.put('/allocations/:id', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(allocationSchema.partial()), audit('equipment_allocations'), async (req: AuthRequest, res, next) => {
  try {
    await assertAllocationAccess(req, Number(req.params.id), 'write');
    assertEquipmentPayloadAccess(req, req.body, 'write');
    ok(res, await service.updateAllocation(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.post('/allocations/:id/close', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(allocationCloseSchema), audit('equipment_allocations'), async (req: AuthRequest, res, next) => {
  try {
    await assertAllocationAccess(req, Number(req.params.id), 'write');
    ok(res, await service.closeAllocation(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.delete('/allocations/:id', requirePermissions(PERMISSIONS.ASSETS_WRITE), audit('equipment_allocations'), async (req: AuthRequest, res, next) => {
  try {
    await assertAllocationAccess(req, Number(req.params.id), 'write');
    ok(res, await service.deleteAllocation(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.get('/maintenance', requirePermissions(PERMISSIONS.ASSETS_READ), async (req: AuthRequest, res, next) => {
  try {
    if (req.query.branchId) assertBranchScopeAccess(req, Number(req.query.branchId));
    if (req.query.projectId) assertProjectScopeAccess(req, Number(req.query.projectId));
    const data = await service.listMaintenance({
      ...req.query,
      branchIds: getScopeIds(req, 'branch'),
      projectIds: getScopeIds(req, 'project')
    });
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.post('/maintenance', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(maintenanceSchema), audit('maintenance_logs'), async (req: AuthRequest, res, next) => {
  try {
    assertEquipmentPayloadAccess(req, req.body, 'write');
    ok(res, await service.createMaintenance(req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/maintenance/:id', requirePermissions(PERMISSIONS.ASSETS_READ), async (req: AuthRequest, res, next) => {
  try {
    await assertMaintenanceAccess(req, Number(req.params.id));
    ok(res, await service.getMaintenance(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.put('/maintenance/:id', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(maintenanceSchema.partial()), audit('maintenance_logs'), async (req: AuthRequest, res, next) => {
  try {
    await assertMaintenanceAccess(req, Number(req.params.id), 'write');
    assertEquipmentPayloadAccess(req, req.body, 'write');
    ok(res, await service.updateMaintenance(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.post('/maintenance/:id/complete', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(maintenanceCompleteSchema), audit('maintenance_logs'), async (req: AuthRequest, res, next) => {
  try {
    await assertMaintenanceAccess(req, Number(req.params.id), 'write');
    ok(res, await service.completeMaintenance(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.delete('/maintenance/:id', requirePermissions(PERMISSIONS.ASSETS_WRITE), audit('maintenance_logs'), async (req: AuthRequest, res, next) => {
  try {
    await assertMaintenanceAccess(req, Number(req.params.id), 'write');
    ok(res, await service.deleteMaintenance(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

export default router;
