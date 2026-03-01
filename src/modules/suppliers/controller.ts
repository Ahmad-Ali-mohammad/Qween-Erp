import { Request, Response } from 'express';
import { ok, fail } from '../../utils/response';
import { CreateSupplierDto, UpdateSupplierDto, SupplierQueryDto, SupplierStatementQueryDto } from './dto';
import * as supplierService from './service';

export async function createSupplier(req: any, res: Response) {
  try {
    const supplier = await supplierService.createSupplier(req.body as any);
    ok(res, supplier);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}

export async function updateSupplier(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const supplier = await supplierService.updateSupplier(Number(id), req.body as any);
    ok(res, supplier);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}

export async function listSuppliers(req: Request, res: Response) {
  try {
    const result = await supplierService.listSuppliers(req.query as any);
    ok(res, result);
  } catch (error) {
    fail(res, 'INTERNAL_SERVER_ERROR', (error as Error).message);
  }
}

export async function getSupplier(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const supplier = await supplierService.getSupplier(Number(id));
    ok(res, supplier);
  } catch (error) {
    fail(res, 'NOT_FOUND', (error as Error).message);
  }
}

export async function deleteSupplier(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const result = await supplierService.deleteSupplier(Number(id));
    ok(res, result);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}

export async function getSupplierStatement(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const statement = await supplierService.getSupplierStatement(Number(id), req.query as any);
    ok(res, statement);
  } catch (error) {
    fail(res, 'NOT_FOUND', (error as Error).message);
  }
}
