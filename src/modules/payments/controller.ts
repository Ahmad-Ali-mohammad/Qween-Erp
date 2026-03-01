import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { ok } from '../../utils/response';
import * as service from './service';

export async function list(req: Request, res: Response) {
  const data = await service.listPayments(req.query);
  ok(res, data.rows, data.pagination);
}

export async function create(req: any, res: Response) {
  const payment = await service.createPayment(req.body, req.user.id);
  ok(res, payment, undefined, 201);
}

export async function getOne(req: Request, res: Response) {
  const payment = await prisma.payment.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      customer: true,
      supplier: true,
      bank: true,
      allocations: { include: { invoice: true } },
      journalEntry: true
    }
  });
  ok(res, payment);
}

export async function complete(req: any, res: Response) {
  const payment = await service.completePayment(Number(req.params.id), req.user.id, req.body.allocations ?? []);
  ok(res, payment);
}

export async function update(req: Request, res: Response) {
  const payment = await service.updatePayment(Number(req.params.id), req.body);
  ok(res, payment);
}

export async function cancel(req: Request, res: Response) {
  const payment = await service.cancelPayment(Number(req.params.id), req.body.reason);
  ok(res, payment);
}

export async function remove(req: Request, res: Response) {
  const data = await service.deletePayment(Number(req.params.id));
  ok(res, data);
}
