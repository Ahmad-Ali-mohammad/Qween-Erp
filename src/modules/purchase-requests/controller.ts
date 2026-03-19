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

function assertRequestPayloadAccess(req: AuthRequest, payload: Record<string, unknown>, mode: 'read' | 'write' = 'write') {
  if (payload.branchId) assertBranchScopeAccess(req, Number(payload.branchId), mode);
  if (payload.projectId) assertProjectScopeAccess(req, Number(payload.projectId), mode);
}

async function assertRequestRowAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const row = await prisma.purchaseRequest.findUnique({
    where: { id },
    select: { id: true, branchId: true, projectId: true }
  });
  if (!row) throw new AppError('NOT_FOUND', 'طلب الشراء غير موجود', 404);
  if (row.branchId) assertBranchScopeAccess(req, row.branchId, mode);
  if (row.projectId) assertProjectScopeAccess(req, row.projectId, mode);
  return row;
}

export async function createPurchaseRequest(req: AuthRequest, res: Response) {
  try {
    assertRequestPayloadAccess(req, req.body, 'write');
    ok(res, await service.createPurchaseRequest(req.body), undefined, 201);
  } catch (error) {
    handleError(res, error);
  }
}

export async function updatePurchaseRequest(req: AuthRequest, res: Response) {
  try {
    await assertRequestRowAccess(req, Number(req.params.id), 'write');
    assertRequestPayloadAccess(req, req.body, 'write');
    ok(res, await service.updatePurchaseRequest(Number(req.params.id), req.body));
  } catch (error) {
    handleError(res, error);
  }
}

export async function listPurchaseRequests(req: AuthRequest, res: Response) {
  try {
    if (req.query.branchId) assertBranchScopeAccess(req, Number(req.query.branchId));
    if (req.query.projectId) assertProjectScopeAccess(req, Number(req.query.projectId));

    const data = await service.listPurchaseRequests({
      ...req.query,
      branchIds: getScopeIds(req, 'branch'),
      projectIds: getScopeIds(req, 'project')
    });
    ok(res, data);
  } catch (error) {
    handleError(res, error);
  }
}

export async function getPurchaseRequest(req: AuthRequest, res: Response) {
  try {
    await assertRequestRowAccess(req, Number(req.params.id));
    ok(res, await service.getPurchaseRequest(Number(req.params.id)));
  } catch (error) {
    handleError(res, error);
  }
}

export async function deletePurchaseRequest(req: AuthRequest, res: Response) {
  try {
    await assertRequestRowAccess(req, Number(req.params.id), 'write');
    ok(res, await service.deletePurchaseRequest(Number(req.params.id)));
  } catch (error) {
    handleError(res, error);
  }
}

export async function approvePurchaseRequest(req: AuthRequest, res: Response) {
  try {
    await assertRequestRowAccess(req, Number(req.params.id), 'write');
    ok(res, await service.approvePurchaseRequest(Number(req.params.id)));
  } catch (error) {
    handleError(res, error);
  }
}

export async function convertPurchaseRequest(req: AuthRequest, res: Response) {
  try {
    await assertRequestRowAccess(req, Number(req.params.id), 'write');
    if (req.body?.supplierId) {
      await assertRequestRowAccess(req, Number(req.params.id), 'write');
    }
    ok(res, await service.convertPurchaseRequest(Number(req.params.id), Number(req.user!.id), req.body ?? {}));
  } catch (error) {
    handleError(res, error);
  }
}
