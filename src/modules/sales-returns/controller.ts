import { Request, Response } from 'express';
import { ok, fail } from '../../utils/response';
import { CreateSalesReturnDto, SalesReturnQueryDto } from './dto';
import * as salesReturnService from './service';

export async function createSalesReturn(req: any, res: Response) {
  try {
    const salesReturn = await salesReturnService.createSalesReturn(req.body as any, req.user.id);
    ok(res, salesReturn);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}

export async function approveSalesReturn(req: any, res: Response) {
  try {
    const { id } = req.params;
    const salesReturn = await salesReturnService.approveSalesReturn(Number(id), req.user.id);
    ok(res, salesReturn);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}

export async function listSalesReturns(req: Request, res: Response) {
  try {
    const result = await salesReturnService.listSalesReturns(req.query as any);
    ok(res, result);
  } catch (error) {
    fail(res, 'INTERNAL_SERVER_ERROR', (error as Error).message);
  }
}

export async function getSalesReturn(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const salesReturn = await salesReturnService.getSalesReturn(Number(id));
    ok(res, salesReturn);
  } catch (error) {
    fail(res, 'NOT_FOUND', (error as Error).message);
  }
}

export async function deleteSalesReturn(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const result = await salesReturnService.deleteSalesReturn(Number(id));
    ok(res, result);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}
