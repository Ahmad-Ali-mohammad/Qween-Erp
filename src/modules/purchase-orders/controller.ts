import { Response } from 'express';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../types/auth';
import { assertBranchScopeAccess, assertProjectScopeAccess, getScopeIds } from '../../utils/access-scope';
import { AppError, fail, ok } from '../../utils/response';
import * as service from './service';

function handleError(res: Response, error: unknown) {
  if (error instanceof AppError) {
    fail(res, error.code, error.message, error.status, error.details);
    return;
  }
  fail(res, 'INTERNAL_SERVER_ERROR', (error as Error).message);
}

function assertOrderPayloadAccess(req: AuthRequest, payload: Record<string, unknown>, mode: 'read' | 'write' = 'write') {
  if (payload.branchId) assertBranchScopeAccess(req, Number(payload.branchId), mode);
  if (payload.projectId) assertProjectScopeAccess(req, Number(payload.projectId), mode);
}

async function assertOrderRowAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const row = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: { id: true, branchId: true, projectId: true }
  });
  if (!row) throw new AppError('NOT_FOUND', 'أمر الشراء غير موجود', 404);
  if (row.branchId) assertBranchScopeAccess(req, row.branchId, mode);
  if (row.projectId) assertProjectScopeAccess(req, row.projectId, mode);
  return row;
}

export async function createPurchaseOrder(req: AuthRequest, res: Response) {
  try {
    assertOrderPayloadAccess(req, req.body, 'write');
    const row = await service.createPurchaseOrder(req.body);
    ok(res, row, undefined, 201);
  } catch (error) {
    handleError(res, error);
  }
}

export async function updatePurchaseOrder(req: AuthRequest, res: Response) {
  try {
    await assertOrderRowAccess(req, Number(req.params.id), 'write');
    assertOrderPayloadAccess(req, req.body, 'write');
    const row = await service.updatePurchaseOrder(Number(req.params.id), req.body);
    ok(res, row);
  } catch (error) {
    handleError(res, error);
  }
}

export async function listPurchaseOrders(req: AuthRequest, res: Response) {
  try {
    if (req.query.branchId) assertBranchScopeAccess(req, Number(req.query.branchId));
    if (req.query.projectId) assertProjectScopeAccess(req, Number(req.query.projectId));

    const row = await service.listPurchaseOrders({
      ...req.query,
      branchIds: getScopeIds(req, 'branch'),
      projectIds: getScopeIds(req, 'project')
    });
    ok(res, row);
  } catch (error) {
    handleError(res, error);
  }
}

export async function getPurchaseOrder(req: AuthRequest, res: Response) {
  try {
    await assertOrderRowAccess(req, Number(req.params.id));
    const row = await service.getPurchaseOrder(Number(req.params.id));
    ok(res, row);
  } catch (error) {
    handleError(res, error);
  }
}

export async function deletePurchaseOrder(req: AuthRequest, res: Response) {
  try {
    await assertOrderRowAccess(req, Number(req.params.id), 'write');
    const row = await service.deletePurchaseOrder(Number(req.params.id));
    ok(res, row);
  } catch (error) {
    handleError(res, error);
  }
}

export async function approvePurchaseOrder(req: AuthRequest, res: Response) {
  try {
    await assertOrderRowAccess(req, Number(req.params.id), 'write');
    const row = await service.approvePurchaseOrder(Number(req.params.id));
    ok(res, row);
  } catch (error) {
    handleError(res, error);
  }
}

export async function sendPurchaseOrder(req: AuthRequest, res: Response) {
  try {
    await assertOrderRowAccess(req, Number(req.params.id), 'write');
    const row = await service.sendPurchaseOrder(Number(req.params.id));
    ok(res, row);
  } catch (error) {
    handleError(res, error);
  }
}

export async function convertPurchaseOrder(req: AuthRequest, res: Response) {
  try {
    await assertOrderRowAccess(req, Number(req.params.id), 'write');
    const row = await service.convertPurchaseOrder(Number(req.params.id), Number(req.user!.id));
    ok(res, row);
  } catch (error) {
    handleError(res, error);
  }
}
