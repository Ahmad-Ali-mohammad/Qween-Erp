import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { ok } from '../../utils/response';
import * as service from './service';

export async function list(req: Request, res: Response) {
  const data = await service.listEntries(req.query);
  ok(res, data.rows, data.pagination);
}

export async function create(req: any, res: Response) {
  const entry = await service.createEntry(req.body, req.user.id);
  ok(res, entry, undefined, 201);
}

export async function getOne(req: Request, res: Response) {
  const entry = await prisma.journalEntry.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      createdBy: true,
      postedBy: true,
      period: { include: { fiscalYear: true } },
      lines: { include: { account: true, project: true, department: true, costCenter: true }, orderBy: { lineNumber: 'asc' } }
    }
  });
  ok(res, entry);
}

export async function post(req: any, res: Response) {
  const entry = await service.postEntry(Number(req.params.id), req.user.id);
  ok(res, entry);
}

export async function update(req: Request, res: Response) {
  const entry = await service.updateDraftEntry(Number(req.params.id), req.body);
  ok(res, entry);
}

export async function reverse(req: any, res: Response) {
  const entry = await service.reverseEntry(Number(req.params.id), req.user.id, req.body.reversalDate, req.body.reason);
  ok(res, entry);
}

export async function voidEntry(req: Request, res: Response) {
  const entry = await service.voidEntry(Number(req.params.id), req.body.reason);
  ok(res, entry);
}

export async function remove(req: Request, res: Response) {
  const data = await service.deleteDraft(Number(req.params.id));
  ok(res, data);
}

export async function bulkPost(req: any, res: Response) {
  const ids: number[] = Array.isArray(req.body?.ids) ? req.body.ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0) : [];
  const data = await service.bulkPostEntries(ids, req.user.id);
  ok(res, data);
}
