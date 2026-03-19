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
    prisma.journalEntry.count({ where: { status: 'DRAFT' } }),
    prisma.invoice.count({ where: { status: { in: ['DRAFT', 'ISSUED', 'PARTIAL'] } } }),
    prisma.payment.count({ where: { status: 'PENDING' } }),
    prisma.fixedAsset.count({ where: { status: 'ACTIVE' } }),
    prisma.userTask.count({ where: { status: { notIn: ['DONE', 'CLOSED', 'COMPLETED'] } } })
  ]);

  ok(res, { draftEntries, pendingInvoices, pendingPayments, activeAssets, openTasks });
});

router.get('/dashboard/charts/sales', async (req: Request, res: Response) => {
  const dateFrom = parseOptionalDate(req.query.fromDate, new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)));
  const dateTo = parseOptionalDate(req.query.toDate, new Date());
  const invoices = await prisma.invoice.findMany({
    where: { type: 'SALES', status: { in: ['ISSUED', 'PAID', 'PARTIAL'] }, date: { gte: dateFrom, lte: dateTo } },
    orderBy: { date: 'asc' }
  });

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
  const invoices = await prisma.invoice.findMany({
    where: { type: 'PURCHASE', status: { in: ['ISSUED', 'PAID', 'PARTIAL'] }, date: { gte: dateFrom, lte: dateTo } },
    orderBy: { date: 'asc' }
  });

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
    prisma.journalEntry.findMany({ take: 10, orderBy: [{ date: 'desc' }, { id: 'desc' }] }),
    prisma.invoice.findMany({
      take: 10,
      include: {
        customer: { select: { id: true, nameAr: true } },
        supplier: { select: { id: true, nameAr: true } }
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }]
    }),
    prisma.payment.findMany({ take: 10, orderBy: [{ date: 'desc' }, { id: 'desc' }] })
  ]);

  ok(res, { journals, invoices, payments });
});

router.get('/dashboard/pending-tasks', async (_req: Request, res: Response) => {
  const [tasks, tickets, leaves] = await Promise.all([
    prisma.userTask.findMany({ where: { status: { notIn: ['DONE', 'CLOSED', 'COMPLETED'] } }, take: 50, orderBy: { id: 'desc' } }),
    prisma.supportTicket.findMany({ where: { status: { notIn: ['CLOSED', 'RESOLVED'] } }, take: 50, orderBy: { id: 'desc' } }),
    prisma.leaveRequest.findMany({ where: { status: 'PENDING' }, take: 50, orderBy: { id: 'desc' } })
  ]);

  ok(res, { tasks, tickets, leaves });
});

export default router;
