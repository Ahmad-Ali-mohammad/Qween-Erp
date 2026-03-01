import { Request, Response } from 'express';
import { fail, ok } from '../../utils/response';
import * as service from './service';

export async function createPurchaseReturn(req: Request, res: Response) {
  try {
    const row = await service.createPurchaseReturn(req.body);
    ok(res, row, undefined, 201);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}

export async function approvePurchaseReturn(req: any, res: Response) {
  try {
    const row = await service.approvePurchaseReturn(Number(req.params.id), Number(req.user.id));
    ok(res, row);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}

export async function listPurchaseReturns(req: Request, res: Response) {
  try {
    const row = await service.listPurchaseReturns(req.query);
    ok(res, row);
  } catch (error) {
    fail(res, 'INTERNAL_SERVER_ERROR', (error as Error).message);
  }
}

export async function getPurchaseReturn(req: Request, res: Response) {
  try {
    const row = await service.getPurchaseReturn(Number(req.params.id));
    ok(res, row);
  } catch (error) {
    fail(res, 'NOT_FOUND', (error as Error).message);
  }
}

export async function deletePurchaseReturn(req: Request, res: Response) {
  try {
    const row = await service.deletePurchaseReturn(Number(req.params.id));
    ok(res, row);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}
