import { Request, Response } from 'express';
import { ok, fail } from '../../utils/response';
import * as service from './service';

export async function createPurchaseOrder(req: Request, res: Response) {
  try {
    const row = await service.createPurchaseOrder(req.body);
    ok(res, row, undefined, 201);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}

export async function updatePurchaseOrder(req: Request, res: Response) {
  try {
    const row = await service.updatePurchaseOrder(Number(req.params.id), req.body);
    ok(res, row);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}

export async function listPurchaseOrders(req: Request, res: Response) {
  try {
    const row = await service.listPurchaseOrders(req.query);
    ok(res, row);
  } catch (error) {
    fail(res, 'INTERNAL_SERVER_ERROR', (error as Error).message);
  }
}

export async function getPurchaseOrder(req: Request, res: Response) {
  try {
    const row = await service.getPurchaseOrder(Number(req.params.id));
    ok(res, row);
  } catch (error) {
    fail(res, 'NOT_FOUND', (error as Error).message);
  }
}

export async function deletePurchaseOrder(req: Request, res: Response) {
  try {
    const row = await service.deletePurchaseOrder(Number(req.params.id));
    ok(res, row);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}

export async function approvePurchaseOrder(req: Request, res: Response) {
  try {
    const row = await service.approvePurchaseOrder(Number(req.params.id));
    ok(res, row);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}

export async function sendPurchaseOrder(req: Request, res: Response) {
  try {
    const row = await service.sendPurchaseOrder(Number(req.params.id));
    ok(res, row);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}

export async function convertPurchaseOrder(req: any, res: Response) {
  try {
    const row = await service.convertPurchaseOrder(Number(req.params.id), Number(req.user.id));
    ok(res, row);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}
