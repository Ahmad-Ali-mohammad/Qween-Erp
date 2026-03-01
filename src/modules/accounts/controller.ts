import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { ok } from '../../utils/response';
import * as service from './service';

export async function list(req: Request, res: Response) {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  const skip = (page - 1) * limit;
  const search = String(req.query.search ?? '');

  const where = search
    ? {
        OR: [
          { code: { contains: search, mode: 'insensitive' as const } },
          { nameAr: { contains: search, mode: 'insensitive' as const } },
          { nameEn: { contains: search, mode: 'insensitive' as const } }
        ]
      }
    : {};

  const [rows, total] = await Promise.all([
    prisma.account.findMany({ where, skip, take: limit, orderBy: { code: 'asc' } }),
    prisma.account.count({ where })
  ]);

  ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
}

export async function create(req: Request, res: Response) {
  const account = await service.createAccount(req.body);
  ok(res, account, undefined, 201);
}

export async function getOne(req: Request, res: Response) {
  const id = Number(req.params.id);
  const account = await prisma.account.findUnique({ where: { id } });
  ok(res, account);
}

export async function update(req: Request, res: Response) {
  const id = Number(req.params.id);
  const account = await service.updateAccount(id, req.body);
  ok(res, account);
}

export async function remove(req: Request, res: Response) {
  const id = Number(req.params.id);
  const used = await prisma.journalLine.count({ where: { accountId: id } });
  if (used > 0) {
    await prisma.account.update({ where: { id }, data: { isActive: false } });
    ok(res, { id, deactivated: true });
    return;
  }
  await prisma.account.delete({ where: { id } });
  ok(res, { id, deleted: true });
}

export async function tree(_req: Request, res: Response) {
  const data = await service.getTree();
  ok(res, data);
}

export async function treeWithBalances(req: Request, res: Response) {
  const includeInactive = String(req.query.includeInactive ?? 'false') === 'true';
  const fiscalYear = req.query.fiscalYear ? Number(req.query.fiscalYear) : undefined;
  const period = req.query.period ? Number(req.query.period) : undefined;
  const data = await service.getTree({ includeInactive, fiscalYear, period });
  ok(res, data);
}

export async function balances(req: Request, res: Response) {
  const id = Number(req.params.id);
  const fiscalYear = req.query.fiscalYear ? Number(req.query.fiscalYear) : undefined;
  const period = req.query.period ? Number(req.query.period) : undefined;
  const data = await service.getBalance(id, fiscalYear, period);
  ok(res, data);
}

export async function subtree(req: Request, res: Response) {
  const id = Number(req.params.id);
  const fiscalYear = req.query.fiscalYear ? Number(req.query.fiscalYear) : undefined;
  const period = req.query.period ? Number(req.query.period) : undefined;
  const data = await service.getSubtreeBalance(id, fiscalYear, period);
  ok(res, data);
}

export async function move(req: Request, res: Response) {
  const id = Number(req.params.id);
  const moved = await service.moveAccount(id, req.body.newParentId ?? null);
  ok(res, moved);
}

export async function togglePosting(req: Request, res: Response) {
  const id = Number(req.params.id);
  const updated = await service.togglePosting(id, Boolean(req.body.allowPosting));
  ok(res, updated);
}

export async function rebuild(req: Request, res: Response) {
  const data = await service.rebuildLevels();
  ok(res, data);
}
