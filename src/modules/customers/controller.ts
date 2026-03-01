import { Request, Response } from 'express';
import { ok, fail } from '../../utils/response';
import { CreateCustomerDto, UpdateCustomerDto, CustomerQueryDto, CustomerStatementQueryDto } from './dto';
import * as customerService from './service';

export async function createCustomer(req: any, res: Response) {
  try {
    const customer = await customerService.createCustomer(req.body as any);
    ok(res, customer);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}

export async function updateCustomer(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const customer = await customerService.updateCustomer(Number(id), req.body as any);
    ok(res, customer);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}

export async function listCustomers(req: Request, res: Response) {
  try {
    const result = await customerService.listCustomers(req.query as any);
    ok(res, result);
  } catch (error) {
    fail(res, 'INTERNAL_SERVER_ERROR', (error as Error).message);
  }
}

export async function getCustomer(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const customer = await customerService.getCustomer(Number(id));
    ok(res, customer);
  } catch (error) {
    fail(res, 'NOT_FOUND', (error as Error).message);
  }
}

export async function deleteCustomer(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const result = await customerService.deleteCustomer(Number(id));
    ok(res, result);
  } catch (error) {
    fail(res, 'BUSINESS_RULE_VIOLATION', (error as Error).message);
  }
}

export async function getCustomerStatement(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const statement = await customerService.getCustomerStatement(Number(id), req.query as any);
    ok(res, statement);
  } catch (error) {
    fail(res, 'NOT_FOUND', (error as Error).message);
  }
}
