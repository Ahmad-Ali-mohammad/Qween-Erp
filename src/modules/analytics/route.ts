import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { audit } from '../../middleware/audit';
import { PERMISSIONS } from '../../constants/permissions';
import { ok } from '../../utils/response';
import { AuthRequest } from '../../types/auth';
import * as biService from './bi-service';

const router = Router();
router.use(authenticate, requirePermissions(PERMISSIONS.ANALYTICS_READ));

const jobCreateSchema = z
  .object({
    jobType: z.string().trim().min(1).max(80),
    payload: z.unknown().optional(),
    status: z.string().trim().max(40).optional()
  })
  .strict();

const jobCompleteSchema = z
  .object({
    status: z.string().trim().max(40).optional(),
    result: z.unknown().optional(),
    completedAt: z.string().optional()
  })
  .strict();

router.get('/', async (_req: Request, res: Response) => {
  const [invoiceCount, customerCount, supplierCount] = await Promise.all([
    prisma.invoice.count(),
    prisma.customer.count(),
    prisma.supplier.count()
  ]);
  ok(res, { invoiceCount, customerCount, supplierCount });
});

router.get('/jobs', async (req: Request, res: Response) => {
  const where: any = {};
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.jobType) where.jobType = String(req.query.jobType);
  const rows = await prisma.analyticsJob.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 200
  });
  ok(res, rows);
});

router.post('/jobs', validateBody(jobCreateSchema), audit('analytics_jobs'), async (req: AuthRequest, res: Response) => {
  const row = await prisma.analyticsJob.create({
    data: {
      jobType: req.body.jobType,
      payload: req.body.payload ?? null,
      status: req.body.status ?? 'QUEUED',
      requestedBy: req.user?.id ?? null
    }
  });
  ok(res, row, undefined, 201);
});

router.post('/jobs/:id/complete', validateBody(jobCompleteSchema), audit('analytics_jobs'), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const row = await prisma.analyticsJob.update({
    where: { id },
    data: {
      status: req.body.status ?? 'COMPLETED',
      result: req.body.result ?? null,
      completedAt: req.body.completedAt ? new Date(String(req.body.completedAt)) : new Date()
    }
  });
  ok(res, row);
});

router.get('/abc', async (_req: Request, res: Response) => {
  const items: Array<{ id: number; code: string; nameAr: string; inventoryValue: unknown }> = await (prisma as any).item.findMany({
    orderBy: { inventoryValue: 'desc' },
    take: 200
  });
  const total = items.reduce((sum: number, i: { inventoryValue: unknown }) => sum + Number(i.inventoryValue), 0);
  const top = items.slice(0, Math.max(1, Math.ceil(items.length * 0.2)));
  const topValue = top.reduce((sum: number, i: { inventoryValue: unknown }) => sum + Number(i.inventoryValue), 0);
  ok(res, {
    totalItems: items.length,
    totalValue: total,
    classAItems: top.length,
    classAValue: topValue,
    classAPercentage: total === 0 ? 0 : (topValue / total) * 100,
    rows: items
  });
});

router.get('/clv', async (_req: Request, res: Response) => {
  const customers = await prisma.customer.findMany({ orderBy: { currentBalance: 'desc' }, take: 200 });
  const rows = customers.map((c) => ({
    id: c.id,
    code: c.code,
    nameAr: c.nameAr,
    currentBalance: Number(c.currentBalance),
    estimatedClv: Number(c.currentBalance) * 12
  }));
  ok(res, rows);
});

router.get('/sales-forecast', async (_req: Request, res: Response) => {
  const invoices = await prisma.invoice.findMany({
    where: { type: 'SALES', status: { in: ['ISSUED', 'PAID', 'PARTIAL'] } },
    orderBy: { date: 'asc' }
  });
  const monthly = new Map<string, number>();
  for (const inv of invoices) {
    const d = new Date(inv.date);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const current = monthly.get(key) ?? 0;
    monthly.set(key, current + Number(inv.total));
  }
  const rows = Array.from(monthly.entries()).map(([period, amount]) => ({ period, amount }));
  const avg = rows.length ? rows.reduce((s, r) => s + r.amount, 0) / rows.length : 0;
  ok(res, {
    history: rows,
    forecastNextMonth: avg,
    model: 'moving-average'
  });
});

router.get('/bsc', async (_req: Request, res: Response) => {
  const [invoiceCount, journalCount, paymentCount] = await Promise.all([
    prisma.invoice.count(),
    prisma.journalEntry.count(),
    prisma.payment.count()
  ]);

  ok(res, {
    financial: { target: 85, actual: 80 + Math.min(20, invoiceCount / 50) },
    customers: { target: 88, actual: 78 + Math.min(20, invoiceCount / 80) },
    internal: { target: 82, actual: 75 + Math.min(20, journalCount / 120) },
    learning: { target: 75, actual: 70 + Math.min(20, paymentCount / 100) }
  });
});

router.get('/dashboard', async (_req: Request, res: Response) => {
  ok(res, await biService.generateDashboardSummary());
});

router.get('/kpis/financial', async (_req: Request, res: Response) => {
  ok(res, await biService.getFinancialKPIs());
});

router.get('/kpis/inventory', async (_req: Request, res: Response) => {
  ok(res, await biService.getInventoryKPIs());
});

router.get('/kpis/projects', async (_req: Request, res: Response) => {
  ok(res, await biService.getProjectKPIs());
});

router.get('/reports/sales-trend', async (req: Request, res: Response) => {
  const periods = Number(req.query.periods ?? 12);
  ok(res, await biService.getSalesTrend(periods));
});

router.get('/reports/top-customers', async (req: Request, res: Response) => {
  const limit = Number(req.query.limit ?? 10);
  ok(res, await biService.getTopCustomers(limit));
});

router.get('/snapshots', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
  ok(res, await biService.listReportSnapshots(page, limit));
});

router.post('/snapshots', validateBody(z.object({ reportType: z.string().min(1), parameters: z.unknown().optional() })), audit('report_snapshots'), async (req: AuthRequest, res: Response) => {
  ok(
    res,
    await biService.createReportSnapshot(req.body.reportType, req.body.parameters ?? {}, req.user?.id ?? 0),
    undefined,
    201
  );
});

export default router;
