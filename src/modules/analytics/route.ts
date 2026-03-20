import { Router, Request, Response } from 'express';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { ok } from '../../utils/response';
import { buildSalesForecastFromInvoices } from './sales-forecast.service';
import { buildSystemDashboardRouter } from '../system-dashboards/route';

const router = Router();
router.use(authenticate, requirePermissions(PERMISSIONS.ANALYTICS_READ));
router.use('/dashboard', buildSystemDashboardRouter('analytics'));

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

router.get('/sales-forecast', async (req: Request, res: Response) => {
  const branchId = Number(req.query.branchId ?? 0);
  const invoices = await prisma.invoice.findMany({
    where: {
      type: 'SALES',
      status: { in: ['ISSUED', 'PAID', 'PARTIAL'] },
      ...(branchId > 0 ? { branchId } : {})
    },
    select: { date: true, total: true },
    orderBy: { date: 'asc' }
  });

  ok(res, buildSalesForecastFromInvoices(invoices));
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

export default router;
