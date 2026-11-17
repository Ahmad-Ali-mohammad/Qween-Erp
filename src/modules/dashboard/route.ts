import { qw } from '../../utils/where';
import { Router, Request, Response } from 'express';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { ok } from '../../utils/response';

const router = Router();

function parseOptionalDate(value: unknown, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

router.use(authenticate);

router.get('/dashboard/kpi', async (_req: Request, res: Response) => {
  const [draftEntries, pendingInvoices, pendingPayments, activeAssets, openTasks] = await Promise.all([
    prisma.orm.public.JournalEntry.where((r) => qw(r, { status: 'DRAFT' })).aggregate((a) => ({ n: a.count() })).then((r0) => r0.n),
    prisma.orm.public.Invoice.where((r) => qw(r, { status: { in: ['DRAFT', 'ISSUED', 'PARTIAL'] } })).aggregate((a) => ({ n: a.count() })).then((r0) => r0.n),
    prisma.orm.public.Payment.where((r) => qw(r, { status: 'PENDING' })).aggregate((a) => ({ n: a.count() })).then((r0) => r0.n),
    prisma.orm.public.FixedAsset.where((r) => qw(r, { status: 'ACTIVE' })).aggregate((a) => ({ n: a.count() })).then((r0) => r0.n),
    prisma.orm.public.UserTask.where((r) => qw(r, { status: { notIn: ['DONE', 'CLOSED', 'COMPLETED'] } })).aggregate((a) => ({ n: a.count() })).then((r0) => r0.n)
  ]);

  ok(res, { draftEntries, pendingInvoices, pendingPayments, activeAssets, openTasks });
});

router.get('/dashboard/charts/sales', async (req: Request, res: Response) => {
  const dateFrom = parseOptionalDate(req.query.fromDate, new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)));
  const dateTo = parseOptionalDate(req.query.toDate, new Date());
  const invoices = await prisma.orm.public.Invoice.where((r) => qw(r, { type: 'SALES', status: { in: ['ISSUED', 'PAID', 'PARTIAL'] }, date: { gte: dateFrom, lte: dateTo } })).orderBy((r) => r.date.asc()).all();

  const buckets = new Map<string, number>();
  for (const row of invoices) {
    const key = monthKey(new Date(row.date));
    buckets.set(key, (buckets.get(key) ?? 0) + Number(row.total));
  }

  ok(
    res,
    Array.from(buckets.entries()).map(([period, amount]) => ({ period, amount }))
  );
});

router.get('/dashboard/charts/expenses', async (req: Request, res: Response) => {
  const dateFrom = parseOptionalDate(req.query.fromDate, new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)));
  const dateTo = parseOptionalDate(req.query.toDate, new Date());
  const invoices = await prisma.orm.public.Invoice.where((r) => qw(r, { type: 'PURCHASE', status: { in: ['ISSUED', 'PAID', 'PARTIAL'] }, date: { gte: dateFrom, lte: dateTo } })).orderBy((r) => r.date.asc()).all();

  const buckets = new Map<string, number>();
  for (const row of invoices) {
    const key = monthKey(new Date(row.date));
    buckets.set(key, (buckets.get(key) ?? 0) + Number(row.total));
  }

  ok(
    res,
    Array.from(buckets.entries()).map(([period, amount]) => ({ period, amount }))
  );
});

router.get('/dashboard/recent-transactions', async (_req: Request, res: Response) => {
  const [journals, invoices, payments] = await Promise.all([
    prisma.orm.public.JournalEntry.orderBy([(r) => r.date.desc(), (r) => r.id.desc()]).limit(10).all(),
    prisma.orm.public.Invoice.include('customer', (inc) => inc.select('id', 'nameAr')).include('supplier', (inc) => inc.select('id', 'nameAr')).orderBy([(r) => r.date.desc(), (r) => r.id.desc()]).limit(10).all(),
    prisma.orm.public.Payment.orderBy([(r) => r.date.desc(), (r) => r.id.desc()]).limit(10).all()
  ]);

  ok(res, { journals, invoices, payments });
});

router.get('/dashboard/pending-tasks', async (_req: Request, res: Response) => {
  const [tasks, tickets, leaves] = await Promise.all([
    prisma.orm.public.UserTask.where((r) => qw(r, { status: { notIn: ['DONE', 'CLOSED', 'COMPLETED'] } })).orderBy((r) => r.id.desc()).limit(50).all(),
    prisma.orm.public.SupportTicket.where((r) => qw(r, { status: { notIn: ['CLOSED', 'RESOLVED'] } })).orderBy((r) => r.id.desc()).limit(50).all(),
    prisma.orm.public.LeaveRequest.where((r) => qw(r, { status: 'PENDING' })).orderBy((r) => r.id.desc()).limit(50).all()
  ]);

  ok(res, { tasks, tickets, leaves });
});

export default router;
