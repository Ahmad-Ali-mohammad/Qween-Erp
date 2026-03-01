import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { ok } from '../../utils/response';
import * as service from './service';

export async function list(req: Request, res: Response) {
  const data = await service.listInvoices(req.query);
  ok(res, data.rows, data.pagination);
}

export async function create(req: any, res: Response) {
  const invoice = await service.createInvoice(req.body, req.user.id);
  ok(res, invoice, undefined, 201);
}

export async function getOne(req: Request, res: Response) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      customer: true,
      supplier: true,
      lines: true,
      payments: { include: { payment: true } },
      createdBy: true,
      journalEntry: true
    }
  });
  ok(res, invoice);
}

export async function issue(req: any, res: Response) {
  const invoice = await service.issueInvoice(Number(req.params.id), req.user.id);
  ok(res, invoice);
}

export async function update(req: Request, res: Response) {
  const invoice = await service.updateInvoice(Number(req.params.id), req.body);
  ok(res, invoice);
}

export async function cancel(req: Request, res: Response) {
  const invoice = await service.cancelInvoice(Number(req.params.id), req.body.reason);
  ok(res, invoice);
}

export async function remove(req: Request, res: Response) {
  const data = await service.deleteInvoice(Number(req.params.id));
  ok(res, data);
}
