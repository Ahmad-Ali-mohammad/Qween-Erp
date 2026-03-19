import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { Prisma } from '@prisma/client';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { audit } from '../../middleware/audit';
import { PERMISSIONS } from '../../constants/permissions';
import { ok } from '../../utils/response';
import { AuthRequest } from '../../types/auth';

const router = Router();
router.use(authenticate, requirePermissions(PERMISSIONS.REPORTS_READ));

const snapshotCreateSchema = z
  .object({
    reportType: z.string().trim().min(1).max(80),
    parameters: z.unknown().optional(),
    status: z.string().trim().max(40).optional()
  })
  .strict();

const snapshotCompleteSchema = z
  .object({
    status: z.string().trim().max(40).optional(),
    fileUrl: z.string().trim().optional(),
    generatedAt: z.string().optional()
  })
  .strict();

router.get('/', async (_req, res) => {
  const [saved, scheduled] = await Promise.all([
    (prisma as any).savedReport.findMany({ orderBy: { id: 'desc' }, take: 50 }),
    (prisma as any).scheduledReport.findMany({ orderBy: { id: 'desc' }, take: 50 })
  ]);
  ok(res, { saved, scheduled });
});

router.get('/snapshots', async (req, res) => {
  const where: any = {};
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.reportType) where.reportType = String(req.query.reportType);
  const rows = await prisma.reportSnapshot.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 200
  });
  ok(res, rows);
});

router.post('/snapshots', validateBody(snapshotCreateSchema), audit('report_snapshots'), async (req: AuthRequest, res) => {
  const row = await prisma.reportSnapshot.create({
    data: {
      reportType: req.body.reportType,
      parameters: req.body.parameters ?? null,
      status: req.body.status ?? 'QUEUED',
      createdBy: req.user?.id ?? null
    }
  });
  ok(res, row, undefined, 201);
});

router.post('/snapshots/:id/complete', validateBody(snapshotCompleteSchema), audit('report_snapshots'), async (req, res) => {
  const id = Number(req.params.id);
  const row = await prisma.reportSnapshot.update({
    where: { id },
    data: {
      status: req.body.status ?? 'COMPLETED',
      fileUrl: req.body.fileUrl ?? null,
      generatedAt: req.body.generatedAt ? new Date(String(req.body.generatedAt)) : new Date()
    }
  });
  ok(res, row);
});

router.get('/financial-summary', async (_req, res) => {
  const [journalCount, invoiceCount, paymentCount] = await Promise.all([
    prisma.journalEntry.count(),
    prisma.invoice.count(),
    prisma.payment.count()
  ]);
  ok(res, { journalCount, invoiceCount, paymentCount });
});

router.get('/operational-summary', async (_req, res) => {
  const [projectCount, purchaseRequestCount, stockMovementCount] = await Promise.all([
    prisma.project.count(),
    prisma.purchaseRequest.count(),
    prisma.stockMovement.count()
  ]);
  ok(res, { projectCount, purchaseRequestCount, stockMovementCount });
});

router.get('/hr-summary', async (_req, res) => {
  const [employeeCount, leaveCount, attendanceCount] = await Promise.all([
    prisma.employee.count(),
    prisma.leaveRequest.count(),
    prisma.attendance.count()
  ]);
  ok(res, { employeeCount, leaveCount, attendanceCount });
});

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

function buildDimensionLineWhere(query: any): Prisma.JournalLineWhereInput {
  const where: Prisma.JournalLineWhereInput = {};

  const projectId = toPositiveInt(query.projectId);
  const departmentId = toPositiveInt(query.departmentId);
  const costCenterId = toPositiveInt(query.costCenterId);

  if (projectId) where.projectId = projectId;
  if (departmentId) where.departmentId = departmentId;
  if (costCenterId) where.costCenterId = costCenterId;

  return where;
}

function hasDimensionFilters(where: Prisma.JournalLineWhereInput): boolean {
  return where.projectId !== undefined || where.departmentId !== undefined || where.costCenterId !== undefined;
}

function buildFiscalYearRelationFilter(fiscalYear?: number): Prisma.FiscalYearWhereInput | undefined {
  if (fiscalYear === undefined) return undefined;

  return {
    startDate: {
      gte: new Date(Date.UTC(fiscalYear, 0, 1)),
      lt: new Date(Date.UTC(fiscalYear + 1, 0, 1))
    }
  };
}

async function buildPostedLineWhere(
  query: any,
  options?: {
    dateFrom?: Date;
    dateTo?: Date;
    asOfDate?: Date;
    accountTypes?: string[];
    accountIds?: number[];
    requireClosedRange?: boolean;
  }
): Promise<Prisma.JournalLineWhereInput> {
  const [fiscalYear, period] = await Promise.all([resolveFiscalYearNumber(query), resolvePeriodNumber(query)]);
  const entryWhere: Prisma.JournalEntryWhereInput = { status: 'POSTED' };

  if (options?.asOfDate) {
    entryWhere.date = { lte: options.asOfDate };
  } else if (options?.dateFrom || options?.dateTo || options?.requireClosedRange) {
    entryWhere.date = {};
    if (options?.dateFrom) entryWhere.date.gte = options.dateFrom;
    if (options?.dateTo) entryWhere.date.lte = options.dateTo;
  }

  if (fiscalYear !== undefined || period !== undefined) {
    entryWhere.period = {
      is: {
        ...(period !== undefined ? { number: period } : {}),
        ...(fiscalYear !== undefined
          ? {
              fiscalYear: {
                is: buildFiscalYearRelationFilter(fiscalYear)
              }
            }
          : {})
      }
    };
  }

  const where: Prisma.JournalLineWhereInput = {
    ...buildDimensionLineWhere(query),
    entry: entryWhere
  };

  if (options?.accountTypes?.length) {
    where.account = { is: { type: { in: options.accountTypes as any[] } } };
  }

  if (options?.accountIds?.length) {
    where.accountId = { in: options.accountIds };
  }

  return where;
}

function aggregateLinesByAccount(
  lines: Array<{
    accountId: number;
    debit: Prisma.Decimal | number;
    credit: Prisma.Decimal | number;
    account: { id: number; code: string; nameAr: string; type: string; normalBalance: string };
  }>
) {
  const byAccount = new Map<
    number,
    {
      accountId: number;
      account: { id: number; code: string; nameAr: string; type: string; normalBalance: string };
      debit: number;
      credit: number;
      closingBalance: number;
    }
  >();

  for (const line of lines) {
    const current = byAccount.get(line.accountId) ?? {
      accountId: line.accountId,
      account: line.account,
      debit: 0,
      credit: 0,
      closingBalance: 0
    };

    current.debit += Number(line.debit);
    current.credit += Number(line.credit);
    byAccount.set(line.accountId, current);
  }

  return [...byAccount.values()]
    .map((row) => ({
      ...row,
      closingBalance: row.account.normalBalance === 'Credit' ? row.credit - row.debit : row.debit - row.credit
    }))
    .sort((a, b) => a.account.code.localeCompare(b.account.code));
}

router.get('/trial-balance', async (req, res) => {
  const [fiscalYear, period] = await Promise.all([
    resolveFiscalYearNumber(req.query),
    resolvePeriodNumber(req.query)
  ]);
  const dimensionWhere = buildDimensionLineWhere(req.query);

  if (hasDimensionFilters(dimensionWhere)) {
    const lines = await prisma.journalLine.findMany({
      where: await buildPostedLineWhere(req.query, {
        dateFrom: req.query.dateFrom ? parseDateOrFallback(req.query.dateFrom, new Date('2000-01-01')) : undefined,
        dateTo: req.query.dateTo ? parseDateOrFallback(req.query.dateTo, new Date()) : undefined
      }),
      include: { account: true },
      orderBy: [{ account: { code: 'asc' } }, { lineNumber: 'asc' }]
    });

    const accounts = aggregateLinesByAccount(lines);
    const totals = accounts.reduce(
      (acc, row) => ({ debit: acc.debit + row.debit, credit: acc.credit + row.credit }),
      { debit: 0, credit: 0 }
    );

    ok(res, { accounts, totals: { ...totals, difference: totals.debit - totals.credit } });
    return;
  }

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
    where: await buildPostedLineWhere(req.query, { dateFrom: from, dateTo: to, requireClosedRange: true }),
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
      where: await buildPostedLineWhere(req.query, {
        dateFrom: compareRange.from,
        dateTo: compareRange.to,
        requireClosedRange: true
      }),
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
  const dimensionWhere = buildDimensionLineWhere(req.query);

  if (hasDimensionFilters(dimensionWhere)) {
    const lines = await prisma.journalLine.findMany({
      where: await buildPostedLineWhere(req.query, {
        asOfDate,
        accountTypes: ['ASSET', 'LIABILITY', 'EQUITY']
      }),
      include: { account: true }
    });

    const accounts = aggregateLinesByAccount(lines);
    const assets = accounts.filter((row) => row.account.type === 'ASSET');
    const liabilities = accounts.filter((row) => row.account.type === 'LIABILITY');
    const equity = accounts.filter((row) => row.account.type === 'EQUITY');
    const sum = (rows: typeof accounts) => rows.reduce((total, row) => total + row.closingBalance, 0);
    const totalAssets = sum(assets);
    const totalLiabilities = sum(liabilities);
    const totalEquity = sum(equity);

    ok(res, {
      asOfDate: asOfDate.toISOString(),
      assets,
      liabilities,
      equity,
      totals: {
        totalAssets,
        totalLiabilities,
        totalEquity,
        totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
        balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01
      }
    });
    return;
  }

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
    where: {
      ...(await buildPostedLineWhere(req.query, { dateFrom, dateTo, requireClosedRange: true })),
      accountId
    },
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

router.get('/cash-flow', async (req, res) => {
  const dimensionWhere = buildDimensionLineWhere(req.query);

  if (hasDimensionFilters(dimensionWhere) || req.query.dateFrom || req.query.dateTo || req.query.periodId || req.query.fiscalYearId) {
    const { from, to } = await resolveDateRange(req.query);
    const cashAccounts = await prisma.account.findMany({
      where: {
        isActive: true,
        OR: [{ bankAccounts: { some: {} } }, { code: '1100' }]
      },
      select: { id: true }
    });

    if (!cashAccounts.length) {
      ok(res, {
        period: { dateFrom: from.toISOString(), dateTo: to.toISOString() },
        operatingInflow: 0,
        operatingOutflow: 0,
        netCashFlow: 0
      });
      return;
    }

    const lines = await prisma.journalLine.findMany({
      where: await buildPostedLineWhere(req.query, {
        dateFrom: from,
        dateTo: to,
        accountIds: cashAccounts.map((row) => row.id),
        requireClosedRange: true
      }),
      select: { debit: true, credit: true }
    });

    const inflow = lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const outflow = lines.reduce((sum, line) => sum + Number(line.credit), 0);

    ok(res, {
      period: { dateFrom: from.toISOString(), dateTo: to.toISOString() },
      operatingInflow: inflow,
      operatingOutflow: outflow,
      netCashFlow: inflow - outflow
    });
    return;
  }

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
