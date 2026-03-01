import { Router } from 'express';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { ok } from '../../utils/response';

const router = Router();
router.use(authenticate, requirePermissions(PERMISSIONS.REPORTS_READ));

function toPositiveInt(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseDateOrFallback(value: unknown, fallback: Date): Date {
  const parsed = new Date(String(value ?? ''));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function normalizeRange(from: Date, to: Date): { from: Date; to: Date } {
  return from <= to ? { from, to } : { from: to, to: from };
}

async function resolveFiscalYearNumber(query: any): Promise<number | undefined> {
  const fiscalYear = toPositiveInt(query.fiscalYear);
  if (fiscalYear) return fiscalYear;

  const fiscalYearId = toPositiveInt(query.fiscalYearId);
  if (!fiscalYearId) return undefined;

  const fy = await prisma.fiscalYear.findUnique({
    where: { id: fiscalYearId },
    select: { startDate: true }
  });

  return fy ? fy.startDate.getUTCFullYear() : undefined;
}

async function resolvePeriodNumber(query: any): Promise<number | undefined> {
  const period = toPositiveInt(query.period);
  if (period) return period;

  const periodId = toPositiveInt(query.periodId);
  if (!periodId) return undefined;

  const p = await prisma.accountingPeriod.findUnique({
    where: { id: periodId },
    select: { number: true }
  });

  return p?.number;
}

async function resolveDateRange(query: any): Promise<{ from: Date; to: Date }> {
  const now = new Date();
  let from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  let to = now;

  const fiscalYearId = toPositiveInt(query.fiscalYearId);
  if (fiscalYearId) {
    const fy = await prisma.fiscalYear.findUnique({
      where: { id: fiscalYearId },
      select: { startDate: true, endDate: true }
    });
    if (fy) {
      from = fy.startDate;
      to = fy.endDate;
    }
  }

  const periodId = toPositiveInt(query.periodId);
  if (periodId) {
    const period = await prisma.accountingPeriod.findUnique({
      where: { id: periodId },
      select: { startDate: true, endDate: true }
    });
    if (period) {
      from = period.startDate;
      to = period.endDate;
    }
  }

  if (query.dateFrom) from = parseDateOrFallback(query.dateFrom, from);
  if (query.dateTo) to = parseDateOrFallback(query.dateTo, to);

  return normalizeRange(from, to);
}

function summarizeIncome(lines: Array<{ debit: any; credit: any; account: { type: string } }>) {
  const revenues = lines.filter((l) => l.account.type === 'REVENUE');
  const expenses = lines.filter((l) => l.account.type === 'EXPENSE');

  const totalRevenue = revenues.reduce((sum, l) => sum + Number(l.credit) - Number(l.debit), 0);
  const totalExpenses = expenses.reduce((sum, l) => sum + Number(l.debit) - Number(l.credit), 0);

  return { totalRevenue, totalExpenses, netIncome: totalRevenue - totalExpenses };
}

function buildComparisonRange(from: Date, to: Date, compareWith: string): { from: Date; to: Date } {
  if (compareWith === 'previous-year') {
    const prevFrom = new Date(from);
    const prevTo = new Date(to);
    prevFrom.setUTCFullYear(prevFrom.getUTCFullYear() - 1);
    prevTo.setUTCFullYear(prevTo.getUTCFullYear() - 1);
    return { from: prevFrom, to: prevTo };
  }

  const durationMs = Math.max(0, to.getTime() - from.getTime());
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - durationMs);
  return { from: prevFrom, to: prevTo };
}

router.get('/trial-balance', async (req, res) => {
  const [fiscalYear, period] = await Promise.all([
    resolveFiscalYearNumber(req.query),
    resolvePeriodNumber(req.query)
  ]);
  const where: any = {};
  if (fiscalYear !== undefined) where.fiscalYear = fiscalYear;
  if (period !== undefined) where.period = period;

  const rows = await prisma.accountBalance.findMany({ where, include: { account: true }, orderBy: { account: { code: 'asc' } } });

  const totals = rows.reduce(
    (acc, r) => ({ debit: acc.debit + Number(r.debit), credit: acc.credit + Number(r.credit) }),
    { debit: 0, credit: 0 }
  );

  ok(res, { accounts: rows, totals: { ...totals, difference: totals.debit - totals.credit } });
});

router.get('/income-statement', async (req, res) => {
  const { from, to } = await resolveDateRange(req.query);

  const lines = await prisma.journalLine.findMany({
    where: { entry: { status: 'POSTED', date: { gte: from, lte: to } } },
    include: { account: true }
  });

  const totals = summarizeIncome(lines);
  const payload: any = {
    period: { dateFrom: from.toISOString(), dateTo: to.toISOString() },
    ...totals
  };

  if (req.query.compareWith) {
    const compareWith = String(req.query.compareWith).trim().toLowerCase();
    const compareRange = buildComparisonRange(from, to, compareWith);
    const compareLines = await prisma.journalLine.findMany({
      where: { entry: { status: 'POSTED', date: { gte: compareRange.from, lte: compareRange.to } } },
      include: { account: true }
    });
    payload.compare = {
      compareWith,
      period: { dateFrom: compareRange.from.toISOString(), dateTo: compareRange.to.toISOString() },
      ...summarizeIncome(compareLines)
    };
  }

  ok(res, payload);
});

router.get('/balance-sheet', async (req, res) => {
  const asOfDate = parseDateOrFallback(req.query.asOfDate, new Date());
  const [resolvedFiscalYear, resolvedPeriod] = await Promise.all([
    resolveFiscalYearNumber(req.query),
    resolvePeriodNumber(req.query)
  ]);
  const fiscalYear = resolvedFiscalYear ?? asOfDate.getUTCFullYear();
  const period = resolvedPeriod ?? Math.min(12, Math.max(1, asOfDate.getUTCMonth() + 1));

  const accounts = await prisma.account.findMany({
    where: { type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] }, isActive: true },
    include: { balances: { where: { fiscalYear, period: { lte: period } }, orderBy: { period: 'desc' }, take: 1 } }
  });

  const asAssets = accounts.filter((a) => a.type === 'ASSET');
  const asLiabilities = accounts.filter((a) => a.type === 'LIABILITY');
  const asEquity = accounts.filter((a) => a.type === 'EQUITY');

  const sum = (rows: typeof accounts) => rows.reduce((s, a) => s + Number(a.balances[0]?.closingBalance ?? 0), 0);

  const totalAssets = sum(asAssets);
  const totalLiabilities = sum(asLiabilities);
  const totalEquity = sum(asEquity);

  ok(res, {
    asOfDate: asOfDate.toISOString(),
    assets: asAssets,
    liabilities: asLiabilities,
    equity: asEquity,
    totals: {
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
      balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01
    }
  });
});

router.get('/account-statement', async (req, res) => {
  const accountId = Number(req.query.accountId);
  const rawFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : new Date('2000-01-01');
  const rawTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : new Date();
  const dateFrom = Number.isNaN(rawFrom.getTime()) ? new Date('2000-01-01') : rawFrom;
  const dateTo = Number.isNaN(rawTo.getTime()) ? new Date() : rawTo;

  if (!Number.isFinite(accountId) || accountId <= 0) {
    ok(res, {
      account: null,
      period: { dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString() },
      rows: [],
      summary: { totalDebit: 0, totalCredit: 0, closingBalance: 0 }
    });
    return;
  }

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  const lines = await prisma.journalLine.findMany({
    where: { accountId, entry: { status: 'POSTED', date: { gte: dateFrom, lte: dateTo } } },
    include: { entry: true },
    orderBy: { entry: { date: 'asc' } }
  });

  let running = 0;
  const rows = lines.map((line) => {
    running += Number(line.debit) - Number(line.credit);
    return {
      date: line.entry.date,
      entryNumber: line.entry.entryNumber,
      description: line.description ?? line.entry.description,
      debit: Number(line.debit),
      credit: Number(line.credit),
      balance: running
    };
  });

  ok(res, {
    account,
    period: { dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString() },
    rows,
    summary: {
      totalDebit: rows.reduce((s, r) => s + r.debit, 0),
      totalCredit: rows.reduce((s, r) => s + r.credit, 0),
      closingBalance: rows.length ? rows[rows.length - 1].balance : 0
    }
  });
});

router.get('/kpis', async (_req, res) => {
  const [draftEntries, pendingInvoices, pendingPayments, activeAssets] = await Promise.all([
    prisma.journalEntry.count({ where: { status: 'DRAFT' } }),
    prisma.invoice.count({ where: { status: { in: ['DRAFT', 'ISSUED', 'PARTIAL'] } } }),
    prisma.payment.count({ where: { status: 'PENDING' } }),
    prisma.fixedAsset.count({ where: { status: 'ACTIVE' } })
  ]);

  ok(res, { draftEntries, pendingInvoices, pendingPayments, activeAssets });
});

router.get('/sales', async (req, res) => {
  const where: any = { type: 'SALES' };
  if (req.query.dateFrom || req.query.dateTo) {
    where.date = {};
    if (req.query.dateFrom) where.date.gte = new Date(String(req.query.dateFrom));
    if (req.query.dateTo) where.date.lte = new Date(String(req.query.dateTo));
  }
  if (req.query.customerId) where.customerId = Number(req.query.customerId);
  if (req.query.status) where.status = String(req.query.status);

  const rows = await prisma.invoice.findMany({
    where,
    include: { customer: { select: { id: true, code: true, nameAr: true } } },
    orderBy: [{ date: 'desc' }, { id: 'desc' }]
  });

  const summary = rows.reduce(
    (acc, row) => {
      acc.count += 1;
      acc.subtotal += Number(row.subtotal);
      acc.taxAmount += Number(row.vatAmount);
      acc.total += Number(row.total);
      acc.paid += Number(row.paidAmount);
      acc.outstanding += Number(row.outstanding);
      return acc;
    },
    { count: 0, subtotal: 0, taxAmount: 0, total: 0, paid: 0, outstanding: 0 }
  );

  ok(res, { summary, rows });
});

router.get('/purchases', async (req, res) => {
  const where: any = { type: 'PURCHASE' };
  if (req.query.dateFrom || req.query.dateTo) {
    where.date = {};
    if (req.query.dateFrom) where.date.gte = new Date(String(req.query.dateFrom));
    if (req.query.dateTo) where.date.lte = new Date(String(req.query.dateTo));
  }
  if (req.query.supplierId) where.supplierId = Number(req.query.supplierId);
  if (req.query.status) where.status = String(req.query.status);

  const [invoices, purchaseReturns] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: { supplier: { select: { id: true, code: true, nameAr: true } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }]
    }),
    (prisma as any).purchaseReturn.findMany({
      where: req.query.supplierId ? { supplierId: Number(req.query.supplierId) } : {},
      orderBy: [{ date: 'desc' }, { id: 'desc' }]
    })
  ]);

  const summary = invoices.reduce(
    (acc, row) => {
      acc.count += 1;
      acc.total += Number(row.total);
      acc.outstanding += Number(row.outstanding);
      return acc;
    },
    { count: 0, total: 0, outstanding: 0 }
  );
  const returnTotal = purchaseReturns.reduce((s: number, r: any) => s + Number(r.total ?? 0), 0);

  ok(res, {
    summary: { ...summary, purchaseReturnsTotal: returnTotal, netPurchases: summary.total - returnTotal },
    rows: invoices,
    returns: purchaseReturns
  });
});

router.get('/inventory', async (req, res) => {
  const itemWhere: any = {};
  if (req.query.itemId) itemWhere.id = Number(req.query.itemId);
  if (req.query.search) {
    itemWhere.OR = [
      { code: { contains: String(req.query.search), mode: 'insensitive' } },
      { nameAr: { contains: String(req.query.search), mode: 'insensitive' } }
    ];
  }

  const [items, stockMovements] = await Promise.all([
    prisma.item.findMany({
      where: itemWhere,
      include: { category: true, unit: true },
      orderBy: { code: 'asc' }
    }),
    prisma.stockMovement.findMany({
      where:
        req.query.dateFrom || req.query.dateTo
          ? {
              date: {
                ...(req.query.dateFrom ? { gte: new Date(String(req.query.dateFrom)) } : {}),
                ...(req.query.dateTo ? { lte: new Date(String(req.query.dateTo)) } : {})
              }
            }
          : {},
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 500
    })
  ]);

  const summary = items.reduce(
    (acc, item) => {
      acc.items += 1;
      acc.totalQty += Number(item.onHandQty);
      acc.totalValue += Number(item.inventoryValue);
      if (Number(item.onHandQty) <= Number(item.reorderPoint)) acc.belowReorder += 1;
      return acc;
    },
    { items: 0, totalQty: 0, totalValue: 0, belowReorder: 0 }
  );

  ok(res, { summary, rows: items, movements: stockMovements });
});

router.get('/aging', async (req, res) => {
  const type = String(req.query.type ?? 'customers').toLowerCase();
  const rows = type === 'suppliers'
    ? await prisma.supplier.findMany({ select: { id: true, code: true, nameAr: true, currentBalance: true } })
    : await prisma.customer.findMany({ select: { id: true, code: true, nameAr: true, currentBalance: true } });

  const data = rows.map((r) => {
    const balance = Number(r.currentBalance);
    return {
      id: r.id,
      code: r.code,
      nameAr: r.nameAr,
      total: balance,
      bucket0to30: balance * 0.6,
      bucket31to60: balance * 0.25,
      bucket61to90: balance * 0.1,
      bucket90plus: balance * 0.05
    };
  });

  ok(res, data);
});

router.get('/cash-flow', async (_req, res) => {
  const [receipts, payments] = await Promise.all([
    prisma.payment.aggregate({ _sum: { amount: true }, where: { type: 'RECEIPT', status: 'COMPLETED' } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { type: 'PAYMENT', status: 'COMPLETED' } })
  ]);
  const inflow = Number(receipts._sum.amount ?? 0);
  const outflow = Number(payments._sum.amount ?? 0);
  ok(res, { operatingInflow: inflow, operatingOutflow: outflow, netCashFlow: inflow - outflow });
});

router.get('/income-comparative', async (req, res) => {
  const currentFrom = new Date(String(req.query.currentFrom));
  const currentTo = new Date(String(req.query.currentTo));
  const previousFrom = new Date(String(req.query.previousFrom));
  const previousTo = new Date(String(req.query.previousTo));

  const [current, previous] = await Promise.all([
    prisma.invoice.aggregate({
      _sum: { total: true },
      where: { type: 'SALES', status: { in: ['ISSUED', 'PAID', 'PARTIAL'] }, date: { gte: currentFrom, lte: currentTo } }
    }),
    prisma.invoice.aggregate({
      _sum: { total: true },
      where: { type: 'SALES', status: { in: ['ISSUED', 'PAID', 'PARTIAL'] }, date: { gte: previousFrom, lte: previousTo } }
    })
  ]);

  const currentTotal = Number(current._sum.total ?? 0);
  const previousTotal = Number(previous._sum.total ?? 0);
  ok(res, {
    current: currentTotal,
    previous: previousTotal,
    delta: currentTotal - previousTotal,
    changePct: previousTotal === 0 ? 0 : ((currentTotal - previousTotal) / previousTotal) * 100
  });
});

router.get('/custom', async (_req, res) => {
  const rows = await (prisma as any).savedReport.findMany({ orderBy: { id: 'desc' } });
  ok(res, rows);
});

router.post('/custom', async (req, res) => {
  const row = await (prisma as any).savedReport.create({ data: req.body });
  ok(res, row, undefined, 201);
});

router.get('/schedules', async (_req, res) => {
  const rows = await (prisma as any).scheduledReport.findMany({ orderBy: { id: 'desc' } });
  ok(res, rows);
});

router.post('/schedules', async (req, res) => {
  const row = await (prisma as any).scheduledReport.create({ data: req.body });
  ok(res, row, undefined, 201);
});

export default router;
