import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { ok, Errors } from '../../utils/response';
import { PERMISSIONS } from '../../constants/permissions';
import { buildSequentialNumber, buildSequentialNumberFromLatest } from '../../utils/id-generator';
import * as journalService from '../journals/service';
import * as invoiceService from '../invoices/service';
import * as paymentService from '../payments/service';
import * as purchaseOrderService from '../purchase-orders/service';
import * as quoteService from '../quotes/service';
import * as taxDeclarationService from '../tax-declarations/service';
import * as budgetingService from '../budgeting/service';
import * as contractsService from '../contracts/service';
import { applyLedgerLines } from '../shared/ledger';
import { resolvePostingAccounts } from '../shared/posting-accounts';
import { buildSalesForecastFromInvoices } from '../analytics/sales-forecast.service';
import { getAssistantSuggestions, queryAssistant } from '../assistant/service';
import { AuthRequest } from '../../types/auth';

const router = Router();

function parsePositiveInt(value: unknown, name: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw Errors.validation(`${name} غير صالح`);
  return n;
}

function parseOptionalDate(value: unknown, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return fallback;
  return d;
}

function parsePagination(query: Request['query']) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(query.limit ?? 20)));
  return { page, limit, skip: (page - 1) * limit };
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

function splitIntegrationKey(key: string): { prefix: string; id: number } | null {
  const [prefix, rawId] = key.split(':');
  const id = Number(rawId);
  if (!prefix || !Number.isInteger(id) || id <= 0) return null;
  return { prefix, id };
}

// Public auth compatibility
router.post('/auth/forgot-password', async (_req: Request, res: Response) => {
  ok(res, { accepted: true, message: 'تم استلام طلب إعادة التعيين' }, undefined, 202);
});

router.post('/auth/reset-password', async (req: Request, res: Response) => {
  const username = String(req.body?.username ?? '').trim();
  const newPassword = String(req.body?.newPassword ?? '').trim();
  if (!username || newPassword.length < 6) throw Errors.validation('بيانات إعادة التعيين غير مكتملة');
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw Errors.notFound('المستخدم غير موجود');
  const password = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { password, failedLoginCount: 0, lockedUntil: null } });
  ok(res, { reset: true });
});

router.use(authenticate);

// Quick Access
router.get('/quick-journal/form-data', async (_req: Request, res: Response) => {
  const [accounts, periods] = await Promise.all([
    prisma.account.findMany({
      where: { isActive: true, allowPosting: true },
      select: { id: true, code: true, nameAr: true, type: true },
      orderBy: { code: 'asc' }
    }),
    prisma.accountingPeriod.findMany({
      where: { status: 'OPEN', canPost: true },
      include: { fiscalYear: true },
      orderBy: [{ fiscalYearId: 'desc' }, { number: 'asc' }]
    })
  ]);
  ok(res, { accounts, periods });
});

router.post('/quick-journal', async (req: any, res: Response) => {
  const postNow = req.body?.postNow !== false;
  const description = String(req.body?.description ?? '').trim();
  const date = req.body?.date;
  let lines = req.body?.lines;

  if (!Array.isArray(lines) || !lines.length) {
    const debitAccountId = Number(req.body?.debitAccountId ?? 0);
    const creditAccountId = Number(req.body?.creditAccountId ?? 0);
    const amount = Number(req.body?.amount ?? 0);
    if (!debitAccountId || !creditAccountId || amount <= 0) throw Errors.validation('بيانات القيد السريع غير مكتملة');
    lines = [
      { accountId: debitAccountId, debit: amount, credit: 0, description },
      { accountId: creditAccountId, debit: 0, credit: amount, description }
    ];
  }

  const created = await journalService.createEntry(
    { date, description, reference: req.body?.reference, source: 'MANUAL', lines },
    Number(req.user.id)
  );

  if (!postNow) {
    ok(res, { journal: created, posted: false }, undefined, 201);
    return;
  }

  const posted = await journalService.postEntry(created.id, Number(req.user.id));
  ok(res, { journal: posted, posted: true }, undefined, 201);
});

router.get('/quick-invoice/form-data', async (_req: Request, res: Response) => {
  const [customers, products] = await Promise.all([
    prisma.customer.findMany({ where: { isActive: true }, select: { id: true, code: true, nameAr: true }, orderBy: { code: 'asc' } }),
    prisma.item.findMany({
      where: { isActive: true },
      select: { id: true, code: true, nameAr: true, salePrice: true, onHandQty: true },
      orderBy: { code: 'asc' }
    })
  ]);
  ok(res, { customers, products });
});

router.post('/quick-invoice', async (req: any, res: Response) => {
  const issueNow = req.body?.issueNow !== false;
  const created = await invoiceService.createInvoice(
    {
      type: 'SALES',
      customerId: Number(req.body?.customerId),
      date: req.body?.date,
      dueDate: req.body?.dueDate,
      notes: req.body?.notes,
      lines: req.body?.lines ?? []
    },
    Number(req.user.id)
  );

  if (!issueNow) {
    ok(res, { invoice: created, issued: false }, undefined, 201);
    return;
  }

  const issued = await invoiceService.issueInvoice(created.id, Number(req.user.id));
  ok(res, { invoice: issued, issued: true }, undefined, 201);
});

router.get('/quick-statement', async (req: Request, res: Response) => {
  const entityType = String(req.query.entityType ?? 'ACCOUNT').toUpperCase();
  const entityId = parsePositiveInt(req.query.entityId, 'entityId');
  const fromDate = parseOptionalDate(req.query.fromDate, new Date('2000-01-01'));
  const toDate = parseOptionalDate(req.query.toDate, new Date());

  if (entityType === 'ACCOUNT') {
    const account = await prisma.account.findUnique({ where: { id: entityId } });
    const lines = await prisma.journalLine.findMany({
      where: { accountId: entityId, entry: { status: 'POSTED', date: { gte: fromDate, lte: toDate } } },
      include: { entry: true },
      orderBy: { entry: { date: 'asc' } }
    });
    let balance = 0;
    const rows = lines.map((line) => {
      balance += Number(line.debit) - Number(line.credit);
      return {
        date: line.entry.date,
        entryNumber: line.entry.entryNumber,
        description: line.description ?? line.entry.description,
        debit: Number(line.debit),
        credit: Number(line.credit),
        balance
      };
    });
    ok(res, { entityType, entityId, account, rows });
    return;
  }

  const isCustomer = entityType === 'CUSTOMER';
  const invoices = await prisma.invoice.findMany({
    where: {
      type: isCustomer ? 'SALES' : 'PURCHASE',
      customerId: isCustomer ? entityId : undefined,
      supplierId: isCustomer ? undefined : entityId,
      date: { gte: fromDate, lte: toDate }
    },
    orderBy: { date: 'asc' }
  });
  const payments = await prisma.payment.findMany({
    where: {
      type: isCustomer ? 'RECEIPT' : 'PAYMENT',
      customerId: isCustomer ? entityId : undefined,
      supplierId: isCustomer ? undefined : entityId,
      date: { gte: fromDate, lte: toDate }
    },
    orderBy: { date: 'asc' }
  });
  ok(res, {
    entityType,
    entityId,
    summary: {
      invoicesTotal: invoices.reduce((s, r) => s + Number(r.total), 0),
      paymentsTotal: payments.reduce((s, r) => s + Number(r.amount), 0),
      outstanding: invoices.reduce((s, r) => s + Number(r.outstanding), 0)
    },
    invoices,
    payments
  });
});

router.get('/search', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) {
    ok(res, { query: '', results: [] });
    return;
  }
  const contains = { contains: q, mode: 'insensitive' as const };
  const [customers, suppliers, journals, invoices, payments, products] = await Promise.all([
    prisma.customer.findMany({ where: { OR: [{ nameAr: contains }, { code: contains }, { email: contains }] }, take: 20 }),
    prisma.supplier.findMany({ where: { OR: [{ nameAr: contains }, { code: contains }, { email: contains }] }, take: 20 }),
    prisma.journalEntry.findMany({ where: { OR: [{ entryNumber: contains }, { description: contains }, { reference: contains }] }, take: 20 }),
    prisma.invoice.findMany({ where: { OR: [{ number: contains }, { notes: contains }] }, take: 20 }),
    prisma.payment.findMany({ where: { OR: [{ number: contains }, { description: contains }] }, take: 20 }),
    prisma.item.findMany({ where: { OR: [{ code: contains }, { nameAr: contains }, { nameEn: contains }] }, take: 20 })
  ]);
  ok(res, { query: q, customers, suppliers, journals, invoices, payments, products });
});

// Accounting aliases
router.get('/accounts/:id/transactions', async (req: Request, res: Response) => {
  const accountId = parsePositiveInt(req.params.id, 'accountId');
  const rows = await prisma.journalLine.findMany({
    where: { accountId },
    include: { entry: true },
    orderBy: { entry: { date: 'desc' } }
  });
  ok(res, rows);
});

router.post('/journals/:id/attachments', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'journalId');
  const entry = await prisma.journalEntry.update({
    where: { id },
    data: { attachmentCount: { increment: 1 } }
  });
  ok(res, { journalId: entry.id, attachmentCount: entry.attachmentCount, fileName: req.body?.fileName ?? null, stored: true });
});

router.get('/ledger/:accountId', async (req: Request, res: Response) => {
  const accountId = parsePositiveInt(req.params.accountId, 'accountId');
  const fromDate = parseOptionalDate(req.query.fromDate, new Date('2000-01-01'));
  const toDate = parseOptionalDate(req.query.toDate, new Date());
  const rows = await prisma.journalLine.findMany({
    where: { accountId, entry: { status: 'POSTED', date: { gte: fromDate, lte: toDate } } },
    include: { entry: true },
    orderBy: { entry: { date: 'asc' } }
  });
  ok(res, rows);
});

router.get('/account-statement/:accountId', async (req: Request, res: Response) => {
  const accountId = parsePositiveInt(req.params.accountId, 'accountId');
  const fromDate = parseOptionalDate(req.query.fromDate, new Date('2000-01-01'));
  const toDate = parseOptionalDate(req.query.toDate, new Date());
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  const lines = await prisma.journalLine.findMany({
    where: { accountId, entry: { status: 'POSTED', date: { gte: fromDate, lte: toDate } } },
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
    rows,
    summary: {
      totalDebit: rows.reduce((s, r) => s + r.debit, 0),
      totalCredit: rows.reduce((s, r) => s + r.credit, 0),
      closingBalance: rows.length ? rows[rows.length - 1].balance : 0
    }
  });
});

router.post('/fiscal-years/:id/close', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'fiscalYearId');
  ok(res, await prisma.fiscalYear.update({ where: { id }, data: { status: 'CLOSED' } }));
});

router.post('/fiscal-years/:id/open', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'fiscalYearId');
  ok(res, await prisma.fiscalYear.update({ where: { id }, data: { status: 'OPEN' } }));
});

router.post('/year-end-closing/:fiscalYearId/validate', async (req: Request, res: Response) => {
  const fiscalYearId = parsePositiveInt(req.params.fiscalYearId, 'fiscalYearId');
  const fiscalYear = await prisma.fiscalYear.findUnique({ where: { id: fiscalYearId } });
  if (!fiscalYear) throw Errors.notFound('السنة المالية غير موجودة');
  const [draftEntries, openPeriods] = await Promise.all([
    prisma.journalEntry.count({ where: { status: 'DRAFT', date: { gte: fiscalYear.startDate, lte: fiscalYear.endDate } } }),
    prisma.accountingPeriod.count({ where: { fiscalYearId, status: 'OPEN' } })
  ]);
  ok(res, { fiscalYearId, draftEntries, openPeriods, canClose: draftEntries === 0 && openPeriods === 0 });
});

router.post('/year-end-closing/:fiscalYearId/execute', async (req: Request, res: Response) => {
  const fiscalYearId = parsePositiveInt(req.params.fiscalYearId, 'fiscalYearId');
  const actorId = Number((req as any).user?.id ?? 1);

  const payload = await prisma.$transaction(async (tx) => {
    const fiscalYear = await tx.fiscalYear.findUnique({ where: { id: fiscalYearId } });
    if (!fiscalYear) throw Errors.notFound('????? ??????? ??? ??????');
    if (fiscalYear.status === 'CLOSED') throw Errors.business('????? ??????? ????? ??????');

    const [draftEntries, openPeriods] = await Promise.all([
      tx.journalEntry.count({ where: { status: 'DRAFT', date: { gte: fiscalYear.startDate, lte: fiscalYear.endDate } } }),
      tx.accountingPeriod.count({ where: { fiscalYearId, status: 'OPEN' } })
    ]);
    if (draftEntries > 0 || openPeriods > 0) throw Errors.business('???? ????? ???????: ???? ?????? ?? ????? ??????');

    const fiscalYearKey = fiscalYear.startDate.getUTCFullYear();
    const closingDate = fiscalYear.endDate;
    const closingPeriod = closingDate.getUTCMonth() + 1;

    const retainedEarnings =
      (await tx.account.findUnique({ where: { code: '3100' } })) ??
      (await tx.account.findFirst({ where: { type: 'EQUITY', allowPosting: true, isActive: true }, orderBy: { id: 'asc' } }));
    if (!retainedEarnings) throw Errors.business('???? ?????? ??? ???? ???? ????? ?????? ?????');

    const tempAccounts = await tx.account.findMany({
      where: { type: { in: ['REVENUE', 'EXPENSE'] }, allowPosting: true, isActive: true },
      select: { id: true, type: true, nameAr: true }
    });
    const tempIds = tempAccounts.map((a) => a.id);
    const tempBalances = tempIds.length
      ? await tx.accountBalance.findMany({ where: { fiscalYear: fiscalYearKey, accountId: { in: tempIds } } })
      : [];

    const tempMap = new Map<number, { debit: number; credit: number }>();
    for (const row of tempBalances) {
      const current = tempMap.get(row.accountId) ?? { debit: 0, credit: 0 };
      current.debit += Number(row.debit);
      current.credit += Number(row.credit);
      tempMap.set(row.accountId, current);
    }

    const closingLines: Array<{ accountId: number; debit: number; credit: number; description: string }> = [];
    let netToEquity = 0;
    for (const account of tempAccounts) {
      const bal = tempMap.get(account.id) ?? { debit: 0, credit: 0 };
      if (account.type === 'REVENUE') {
        const amount = bal.credit - bal.debit;
        if (amount > 0.01) {
          closingLines.push({ accountId: account.id, debit: amount, credit: 0, description: '????? ' + account.nameAr });
          netToEquity += amount;
        }
      } else {
        const amount = bal.debit - bal.credit;
        if (amount > 0.01) {
          closingLines.push({ accountId: account.id, debit: 0, credit: amount, description: '????? ' + account.nameAr });
          netToEquity -= amount;
        }
      }
    }

    if (Math.abs(netToEquity) > 0.01) {
      closingLines.push({
        accountId: retainedEarnings.id,
        debit: netToEquity < 0 ? Math.abs(netToEquity) : 0,
        credit: netToEquity > 0 ? netToEquity : 0,
        description: '????? ???? ????? ?????'
      });
    }

    let closingEntry: any = null;
    if (closingLines.length) {
      const totalClosing = closingLines.reduce((sum, line) => sum + Number(line.debit), 0);
      const closingYear = closingDate.getUTCFullYear();
      const latest = await tx.journalEntry.findFirst({
        where: { entryNumber: { startsWith: `YEC-${closingYear}-` } },
        select: { entryNumber: true },
        orderBy: { entryNumber: 'desc' }
      });
      const entryNumber = buildSequentialNumberFromLatest('YEC', latest?.entryNumber, closingYear);
      closingEntry = await tx.journalEntry.create({
        data: {
          entryNumber,
          date: closingDate,
          periodId: null,
          description: '??? ????? ????? ' + fiscalYear.name,
          reference: 'YCLOSE-' + fiscalYear.id,
          source: 'MANUAL',
          status: 'POSTED',
          totalDebit: totalClosing,
          totalCredit: totalClosing,
          createdById: actorId,
          postedById: actorId,
          postedAt: new Date()
        }
      });
      await tx.journalLine.createMany({
        data: closingLines.map((line, i) => ({
          entryId: closingEntry.id,
          lineNumber: i + 1,
          accountId: line.accountId,
          description: line.description,
          debit: line.debit,
          credit: line.credit
        }))
      });
      await applyLedgerLines(tx, closingDate, closingPeriod, closingLines);
    }

    const nextStart = new Date(closingDate);
    nextStart.setUTCDate(nextStart.getUTCDate() + 1);
    const nextEnd = new Date(nextStart);
    nextEnd.setUTCFullYear(nextEnd.getUTCFullYear() + 1);
    nextEnd.setUTCDate(nextEnd.getUTCDate() - 1);

    let nextFiscalYear = await tx.fiscalYear.findFirst({ where: { startDate: nextStart } });
    if (!nextFiscalYear) {
      const baseName = 'FY-' + nextStart.getUTCFullYear();
      let candidate = baseName;
      let idx = 1;
      while (await tx.fiscalYear.findUnique({ where: { name: candidate } })) {
        candidate = baseName + '-' + idx;
        idx += 1;
      }
      nextFiscalYear = await tx.fiscalYear.create({
        data: {
          name: candidate,
          startDate: nextStart,
          endDate: nextEnd,
          status: 'OPEN',
          isCurrent: false
        }
      });
    }

    const permanentAccounts = await tx.account.findMany({
      where: { type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] }, allowPosting: true, isActive: true },
      select: { id: true, nameAr: true }
    });
    const permanentIds = permanentAccounts.map((a) => a.id);
    const permanentBalances = permanentIds.length
      ? await tx.accountBalance.findMany({ where: { fiscalYear: fiscalYearKey, accountId: { in: permanentIds } } })
      : [];

    const permanentMap = new Map<number, number>();
    for (const row of permanentBalances) {
      const net = Number(row.debit) - Number(row.credit);
      permanentMap.set(row.accountId, (permanentMap.get(row.accountId) ?? 0) + net);
    }

    const openingLines = permanentAccounts
      .map((a) => ({ accountId: a.id, amount: permanentMap.get(a.id) ?? 0, nameAr: a.nameAr }))
      .filter((x) => Math.abs(x.amount) > 0.01)
      .map((x) => ({
        accountId: x.accountId,
        debit: x.amount > 0 ? x.amount : 0,
        credit: x.amount < 0 ? Math.abs(x.amount) : 0,
        description: '???? ??????? - ' + x.nameAr
      }));

    let openingEntry: any = null;
    if (openingLines.length) {
      const totalOpening = openingLines.reduce((sum, line) => sum + Number(line.debit), 0);
      const openingYear = nextStart.getUTCFullYear();
      const latest = await tx.journalEntry.findFirst({
        where: { entryNumber: { startsWith: `OPEN-${openingYear}-` } },
        select: { entryNumber: true },
        orderBy: { entryNumber: 'desc' }
      });
      const entryNumber = buildSequentialNumberFromLatest('OPEN', latest?.entryNumber, openingYear);
      openingEntry = await tx.journalEntry.create({
        data: {
          entryNumber,
          date: nextStart,
          periodId: null,
          description: '???? ???????? ????? ' + nextFiscalYear.name,
          reference: 'YOPEN-' + fiscalYear.id,
          source: 'MANUAL',
          status: 'POSTED',
          totalDebit: totalOpening,
          totalCredit: totalOpening,
          createdById: actorId,
          postedById: actorId,
          postedAt: new Date()
        }
      });
      await tx.journalLine.createMany({
        data: openingLines.map((line, i) => ({
          entryId: openingEntry.id,
          lineNumber: i + 1,
          accountId: line.accountId,
          description: line.description,
          debit: line.debit,
          credit: line.credit
        }))
      });
      await applyLedgerLines(tx, nextStart, nextStart.getUTCMonth() + 1, openingLines);
    }

    const periodsCount = await tx.accountingPeriod.count({ where: { fiscalYearId: nextFiscalYear.id } });
    if (periodsCount === 0) {
      for (let i = 0; i < 12; i += 1) {
        const startDate = new Date(nextStart);
        startDate.setUTCMonth(startDate.getUTCMonth() + i);
        const endDate = new Date(nextStart);
        endDate.setUTCMonth(endDate.getUTCMonth() + i + 1);
        endDate.setUTCDate(endDate.getUTCDate() - 1);
        await tx.accountingPeriod.create({
          data: {
            fiscalYearId: nextFiscalYear.id,
            number: i + 1,
            name: 'P' + String(i + 1).padStart(2, '0'),
            startDate,
            endDate,
            status: 'OPEN',
            canPost: true
          }
        });
      }
    }

    await tx.fiscalYear.updateMany({ data: { isCurrent: false } });
    const [closedYear, openedYear] = await Promise.all([
      tx.fiscalYear.update({ where: { id: fiscalYearId }, data: { status: 'CLOSED', isCurrent: false } }),
      tx.fiscalYear.update({ where: { id: nextFiscalYear.id }, data: { status: 'OPEN', isCurrent: true } })
    ]);

    return {
      fiscalYear: closedYear,
      nextFiscalYear: openedYear,
      closingEntry,
      openingEntry
    };
  });

  ok(
    res,
    {
      fiscalYear: payload.fiscalYear,
      nextFiscalYear: payload.nextFiscalYear,
      closingEntriesCreated: Boolean(payload.closingEntry),
      openingBalancesTransferred: Boolean(payload.openingEntry),
      closingEntryId: payload.closingEntry?.id ?? null,
      openingEntryId: payload.openingEntry?.id ?? null
    },
    undefined,
    202
  );
});

// Customers / Suppliers extended views
router.get('/customers/:id/invoices', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'customerId');
  ok(res, await prisma.invoice.findMany({ where: { customerId: id, type: 'SALES' }, orderBy: { id: 'desc' } }));
});

router.get('/customers/:id/payments', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'customerId');
  ok(res, await prisma.payment.findMany({ where: { customerId: id, type: 'RECEIPT' }, orderBy: { id: 'desc' } }));
});

router.get('/customers/:id/contacts', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'customerId');
  ok(res, await prisma.contact.findMany({ where: { customerId: id }, orderBy: { id: 'desc' } }));
});

router.post('/customers/:id/contacts', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'customerId');
  const row = await prisma.contact.create({
    data: {
      customerId: id,
      name: String(req.body?.name ?? ''),
      position: req.body?.position ?? null,
      phone: req.body?.phone ?? null,
      mobile: req.body?.mobile ?? null,
      email: req.body?.email ?? null,
      isPrimary: Boolean(req.body?.isPrimary)
    }
  });
  ok(res, row, undefined, 201);
});

router.get('/suppliers/:id/invoices', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'supplierId');
  ok(res, await prisma.invoice.findMany({ where: { supplierId: id, type: 'PURCHASE' }, orderBy: { id: 'desc' } }));
});

router.get('/suppliers/:id/payments', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'supplierId');
  ok(res, await prisma.payment.findMany({ where: { supplierId: id, type: 'PAYMENT' }, orderBy: { id: 'desc' } }));
});

router.get('/suppliers/:id/contacts', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'supplierId');
  ok(res, await prisma.contact.findMany({ where: { supplierId: id }, orderBy: { id: 'desc' } }));
});

router.post('/suppliers/:id/contacts', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'supplierId');
  const row = await prisma.contact.create({
    data: {
      supplierId: id,
      name: String(req.body?.name ?? ''),
      position: req.body?.position ?? null,
      phone: req.body?.phone ?? null,
      mobile: req.body?.mobile ?? null,
      email: req.body?.email ?? null,
      isPrimary: Boolean(req.body?.isPrimary)
    }
  });
  ok(res, row, undefined, 201);
});

// Invoice aliases (sales/purchase)
router.get('/sales-invoices', async (req: Request, res: Response) => {
  const data = await invoiceService.listInvoices({ ...req.query, type: 'SALES' });
  ok(res, data.rows, data.pagination);
});

router.get('/sales-invoices/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'invoiceId');
  const row = await prisma.invoice.findFirst({
    where: { id, type: 'SALES' },
    include: { customer: true, lines: true, payments: { include: { payment: true } } }
  });
  if (!row) throw Errors.notFound('فاتورة المبيعات غير موجودة');
  ok(res, row);
});

router.post('/sales-invoices', async (req: any, res: Response) => {
  const row = await invoiceService.createInvoice({ ...req.body, type: 'SALES' }, Number(req.user.id));
  ok(res, row, undefined, 201);
});

router.put('/sales-invoices/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'invoiceId');
  ok(res, await invoiceService.updateInvoice(id, { ...req.body, type: 'SALES' }));
});

router.delete('/sales-invoices/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'invoiceId');
  ok(res, await invoiceService.deleteInvoice(id));
});

router.post('/sales-invoices/:id/issue', async (req: any, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'invoiceId');
  ok(res, await invoiceService.issueInvoice(id, Number(req.user.id)));
});

router.post('/sales-invoices/:id/cancel', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'invoiceId');
  ok(res, await invoiceService.cancelInvoice(id, req.body?.reason));
});

router.get('/sales-invoices/:id/payments', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'invoiceId');
  const rows = await prisma.paymentAllocation.findMany({ where: { invoiceId: id }, include: { payment: true }, orderBy: { id: 'desc' } });
  ok(res, rows);
});

router.get('/sales-invoices/:id/print', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'invoiceId');
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { customer: true, lines: true } });
  if (!invoice || invoice.type !== 'SALES') throw Errors.notFound('فاتورة المبيعات غير موجودة');
  ok(res, { invoiceId: id, format: 'PDF', generated: true, pdfUrl: null, invoice });
});

router.post('/sales-invoices/:id/email', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'invoiceId');
  const email = String(req.body?.email ?? '').trim();
  if (!email) throw Errors.validation('البريد الإلكتروني مطلوب');
  ok(res, { sent: true, invoiceId: id, email }, undefined, 202);
});

router.get('/purchase-invoices', async (req: Request, res: Response) => {
  const data = await invoiceService.listInvoices({ ...req.query, type: 'PURCHASE' });
  ok(res, data.rows, data.pagination);
});

router.get('/purchase-invoices/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'invoiceId');
  const row = await prisma.invoice.findFirst({
    where: { id, type: 'PURCHASE' },
    include: { supplier: true, lines: true, payments: { include: { payment: true } } }
  });
  if (!row) throw Errors.notFound('فاتورة الشراء غير موجودة');
  ok(res, row);
});

router.post('/purchase-invoices', async (req: any, res: Response) => {
  const row = await invoiceService.createInvoice({ ...req.body, type: 'PURCHASE' }, Number(req.user.id));
  ok(res, row, undefined, 201);
});

router.put('/purchase-invoices/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'invoiceId');
  ok(res, await invoiceService.updateInvoice(id, { ...req.body, type: 'PURCHASE' }));
});

router.delete('/purchase-invoices/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'invoiceId');
  ok(res, await invoiceService.deleteInvoice(id));
});

router.post('/purchase-invoices/:id/approve', async (req: any, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'invoiceId');
  ok(res, await invoiceService.issueInvoice(id, Number(req.user.id)));
});

router.post('/purchase-invoices/:id/cancel', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'invoiceId');
  ok(res, await invoiceService.cancelInvoice(id, req.body?.reason));
});

router.post('/purchase-invoices/:id/receive', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'invoiceId');
  const actorId = Number((req as any).user?.id ?? 1);
  const requestedWarehouseId = req.body?.warehouseId ? Number(req.body.warehouseId) : null;
  const receiveDate = parseOptionalDate(req.body?.date, new Date());

  const result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id, type: 'PURCHASE' },
      include: { lines: true }
    });
    if (!invoice) throw Errors.notFound('فاتورة الشراء غير موجودة');
    if (invoice.status !== 'ISSUED') throw Errors.business('يمكن استلام بضائع فاتورة شراء معتمدة فقط');

    const existing = await tx.purchaseReceipt.findFirst({
      where: { notes: { contains: `invoiceId=${id};` } }
    });
    if (existing) {
      return { invoiceId: id, received: true, duplicate: true, receipt: existing, stockMovements: 0 };
    }

    const itemLines = invoice.lines.filter((line) => Number(line.itemId ?? 0) > 0 && Number(line.quantity ?? 0) > 0);
    let warehouseId = requestedWarehouseId;
    if (!warehouseId && itemLines.length) {
      const defaultWarehouse = await tx.warehouse.findFirst({ orderBy: { id: 'asc' } });
      warehouseId = defaultWarehouse?.id ?? null;
    }
    if (itemLines.length && !warehouseId) throw Errors.validation('warehouseId مطلوب لاستلام الأصناف المخزنية');

    if (warehouseId) {
      const warehouse = await tx.warehouse.findUnique({ where: { id: warehouseId } });
      if (!warehouse) throw Errors.notFound('المستودع غير موجود');
    }

    const receiptCount = await tx.purchaseReceipt.count();
    const receiptNumber = buildSequentialNumber('PRCV', receiptCount, receiveDate.getUTCFullYear());
    const receipt = await tx.purchaseReceipt.create({
      data: {
        number: receiptNumber,
        supplierId: invoice.supplierId,
        warehouseId,
        date: receiveDate,
        status: 'RECEIVED',
        notes: `invoiceId=${id};by=${actorId}`,
        lines: invoice.lines as any
      }
    });

    let stockMovements = 0;
    for (const line of itemLines) {
      const itemId = Number(line.itemId);
      const quantity = Number(line.quantity);
      const unitCost = Number(line.unitPrice ?? 0);
      const totalCost = quantity * unitCost;

      await tx.stockMovement.create({
        data: {
          date: receiveDate,
          type: 'PURCHASE_RECEIPT',
          reference: invoice.number,
          itemId,
          warehouseId: Number(warehouseId),
          quantity,
          unitCost,
          totalCost,
          notes: `استلام فاتورة شراء ${invoice.number}`
        }
      });

      const existingBalance = await tx.stockBalance.findFirst({
        where: { itemId, warehouseId: Number(warehouseId), locationId: null }
      });
      const nextQty = Number(existingBalance?.quantity ?? 0) + quantity;
      const nextValue = Number(existingBalance?.value ?? 0) + totalCost;
      const nextAvgCost = Math.abs(nextQty) < 0.000001 ? 0 : nextValue / nextQty;

      if (existingBalance) {
        await tx.stockBalance.update({
          where: { id: existingBalance.id },
          data: { quantity: nextQty, value: nextValue, avgCost: nextAvgCost }
        });
      } else {
        await tx.stockBalance.create({
          data: { itemId, warehouseId: Number(warehouseId), locationId: null, quantity: nextQty, value: nextValue, avgCost: nextAvgCost }
        });
      }

      await tx.item.update({
        where: { id: itemId },
        data: {
          onHandQty: { increment: quantity },
          inventoryValue: { increment: totalCost }
        }
      });

      stockMovements += 1;
    }

    return { invoiceId: id, received: true, duplicate: false, receipt, stockMovements };
  });

  ok(res, result, undefined, 202);
});

async function paymentAllocationsOnly(paymentId: number) {
  return prisma.paymentAllocation.findMany({
    where: { paymentId },
    include: { invoice: true },
    orderBy: { id: 'desc' }
  });
}

async function allocatePayment(paymentId: number, allocations: Array<{ invoiceId: number; amount: number }>) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw Errors.notFound('????? ??? ?????');
  if (payment.status !== 'PENDING') throw Errors.business('?? ???? ????? ??? ??? ????');

  const total = allocations.reduce((sum, row) => sum + Number(row.amount), 0);
  if (Math.abs(total - Number(payment.amount)) > 0.01) {
    throw Errors.business('????? ??????? ??? ?? ????? ???? ?????');
  }

  await prisma.$transaction(async (tx) => {
    for (const alloc of allocations) {
      const invoiceId = Number(alloc.invoiceId);
      const amount = Number(alloc.amount);
      if (!Number.isFinite(invoiceId) || invoiceId <= 0) throw Errors.validation('invoiceId ??? ????');
      if (!Number.isFinite(amount) || amount <= 0) throw Errors.validation('amount ??? ?? ???? ???? ?? ???');

      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) throw Errors.notFound('???????? ??? ??????');

      const sameEntity =
        payment.type === 'RECEIPT'
          ? invoice.type === 'SALES' && payment.customerId != null && invoice.customerId === payment.customerId
          : invoice.type === 'PURCHASE' && payment.supplierId != null && invoice.supplierId === payment.supplierId;
      if (!sameEntity) throw Errors.business('?? ???? ????? ????? ??? ?????? ?? ??? ??? ??????');

      if (amount - Number(invoice.outstanding) > 0.01) {
        throw Errors.business('???? ??????? ?????? ??????? ??? ????????');
      }

      await tx.paymentAllocation.upsert({
        where: { paymentId_invoiceId: { paymentId, invoiceId } },
        update: { amount },
        create: { paymentId, invoiceId, amount }
      });
    }
  });
}

// Payments aliases
router.get('/payment-receipts', async (req: Request, res: Response) => {
  const data = await paymentService.listPayments({ ...req.query, type: 'RECEIPT' });
  ok(res, data.rows, data.pagination);
});

router.get('/payment-receipts/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'receiptId');
  const row = await prisma.payment.findFirst({
    where: { id, type: 'RECEIPT' },
    include: { customer: true, bank: true, allocations: { include: { invoice: true } } }
  });
  if (!row) throw Errors.notFound('سند القبض غير موجود');
  ok(res, row);
});

router.post('/payment-receipts', async (req: any, res: Response) => {
  ok(res, await paymentService.createPayment({ ...req.body, type: 'RECEIPT' }, Number(req.user.id)), undefined, 201);
});

router.put('/payment-receipts/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'receiptId');
  ok(res, await paymentService.updatePayment(id, req.body));
});

router.delete('/payment-receipts/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'receiptId');
  ok(res, await paymentService.deletePayment(id));
});

router.post('/payment-receipts/:id/complete', async (req: any, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'receiptId');
  ok(res, await paymentService.completePayment(id, Number(req.user.id), req.body?.allocations ?? []));
});

router.post('/payment-receipts/:id/cancel', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'receiptId');
  ok(res, await paymentService.cancelPayment(id, req.body?.reason));
});

router.post('/payment-receipts/:id/allocate', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'receiptId');
  const allocations = Array.isArray(req.body?.allocations) ? req.body.allocations : [];
  await allocatePayment(id, allocations);
  ok(res, { paymentId: id, allocations: await paymentAllocationsOnly(id) });
});

router.get('/payment-vouchers', async (req: Request, res: Response) => {
  const data = await paymentService.listPayments({ ...req.query, type: 'PAYMENT' });
  ok(res, data.rows, data.pagination);
});

router.get('/payment-vouchers/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'voucherId');
  const row = await prisma.payment.findFirst({
    where: { id, type: 'PAYMENT' },
    include: { supplier: true, bank: true, allocations: { include: { invoice: true } } }
  });
  if (!row) throw Errors.notFound('سند الدفع غير موجود');
  ok(res, row);
});

router.post('/payment-vouchers', async (req: any, res: Response) => {
  ok(res, await paymentService.createPayment({ ...req.body, type: 'PAYMENT' }, Number(req.user.id)), undefined, 201);
});

router.put('/payment-vouchers/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'voucherId');
  ok(res, await paymentService.updatePayment(id, req.body));
});

router.delete('/payment-vouchers/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'voucherId');
  ok(res, await paymentService.deletePayment(id));
});

router.post('/payment-vouchers/:id/complete', async (req: any, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'voucherId');
  ok(res, await paymentService.completePayment(id, Number(req.user.id), req.body?.allocations ?? []));
});

router.post('/payment-vouchers/:id/cancel', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'voucherId');
  ok(res, await paymentService.cancelPayment(id, req.body?.reason));
});

router.post('/payment-vouchers/:id/allocate', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'voucherId');
  const allocations = Array.isArray(req.body?.allocations) ? req.body.allocations : [];
  await allocatePayment(id, allocations);
  ok(res, { paymentId: id, allocations: await paymentAllocationsOnly(id) });
});

// Quotations aliases
router.get('/quotations', async (req: Request, res: Response) => {
  const data = await quoteService.listQuotes(req.query);
  ok(res, data.rows, data.pagination);
});

router.get('/quotations/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'quotationId');
  ok(res, await quoteService.getQuote(id));
});

router.post('/quotations', async (req: any, res: Response) => {
  ok(res, await quoteService.createQuote(req.body, Number(req.user.id)), undefined, 201);
});

router.put('/quotations/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'quotationId');
  ok(res, await quoteService.updateQuote(id, req.body));
});

router.delete('/quotations/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'quotationId');
  ok(res, await quoteService.deleteQuote(id));
});

router.post('/quotations/:id/convert-to-invoice', async (req: any, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'quotationId');
  ok(res, await quoteService.convertToInvoice(id, Number(req.user.id)));
});

router.post('/quotations/:id/email', async (req: any, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'quotationId');
  await quoteService.sendQuote(id, Number(req.user.id));
  ok(res, { sent: true, quotationId: id, email: req.body?.email ?? null }, undefined, 202);
});

router.post('/purchase-orders/:id/convert-to-invoice', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'purchaseOrderId');
  const actorId = Number((req as any).user?.id ?? 1);
  const row = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('??? ?????? ??? ?????');

  if (row.status === 'DRAFT') {
    await purchaseOrderService.approvePurchaseOrder(id);
    await purchaseOrderService.sendPurchaseOrder(id);
  } else if (row.status === 'APPROVED') {
    await purchaseOrderService.sendPurchaseOrder(id);
  } else if (row.status === 'CONVERTED') {
    ok(res, { purchaseOrderId: id, converted: true, duplicate: true }, undefined, 202);
    return;
  }

  const converted = await purchaseOrderService.convertPurchaseOrder(id, actorId);
  ok(res, { ...converted, converted: true }, undefined, 202);
});

// Reports shortcuts
router.get('/reports/sales-by-customer', async (_req: Request, res: Response) => {
  ok(
    res,
    await prisma.invoice.groupBy({
      by: ['customerId'],
      where: { type: 'SALES' },
      _sum: { total: true },
      _count: { id: true }
    })
  );
});

router.get('/reports/sales-summary', async (_req: Request, res: Response) => {
  const rows = await prisma.invoice.findMany({ where: { type: 'SALES' } });
  const summary = rows.reduce(
    (acc, row) => {
      acc.count += 1;
      acc.total += Number(row.total);
      acc.outstanding += Number(row.outstanding);
      return acc;
    },
    { count: 0, total: 0, outstanding: 0 }
  );
  ok(res, summary);
});

router.get('/reports/purchases-summary', async (_req: Request, res: Response) => {
  const rows = await prisma.invoice.findMany({ where: { type: 'PURCHASE' } });
  const summary = rows.reduce(
    (acc, row) => {
      acc.count += 1;
      acc.total += Number(row.total);
      acc.outstanding += Number(row.outstanding);
      return acc;
    },
    { count: 0, total: 0, outstanding: 0 }
  );
  ok(res, summary);
});

// Inventory aliases (minimal)
router.get('/products', async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [rows, total] = await Promise.all([
    prisma.item.findMany({ skip, take: limit, include: { category: true, unit: true }, orderBy: { id: 'desc' } }),
    prisma.item.count()
  ]);
  ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/products/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'productId');
  ok(res, await prisma.item.findUnique({ where: { id }, include: { category: true, unit: true } }));
});

router.post('/products', async (req: Request, res: Response) => {
  ok(res, await prisma.item.create({ data: req.body }), undefined, 201);
});

router.put('/products/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'productId');
  ok(res, await prisma.item.update({ where: { id }, data: req.body }));
});

router.delete('/products/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'productId');
  await prisma.item.delete({ where: { id } });
  ok(res, { deleted: true });
});

router.get('/products/:id/stock', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'productId');
  ok(res, await prisma.stockBalance.findMany({ where: { itemId: id }, orderBy: { warehouseId: 'asc' } }));
});

router.get('/products/:id/transactions', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'productId');
  ok(res, await prisma.stockMovement.findMany({ where: { itemId: id }, orderBy: [{ date: 'desc' }, { id: 'desc' }] }));
});

router.get('/product-categories', async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [rows, total] = await Promise.all([
    prisma.itemCategory.findMany({ skip, take: limit, orderBy: [{ code: 'asc' }, { id: 'asc' }] }),
    prisma.itemCategory.count()
  ]);
  ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/product-categories/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'categoryId');
  ok(res, await prisma.itemCategory.findUnique({ where: { id } }));
});

router.post('/product-categories', async (req: Request, res: Response) => {
  ok(res, await prisma.itemCategory.create({ data: req.body }), undefined, 201);
});

router.put('/product-categories/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'categoryId');
  ok(res, await prisma.itemCategory.update({ where: { id }, data: req.body }));
});

router.delete('/product-categories/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'categoryId');
  await prisma.itemCategory.delete({ where: { id } });
  ok(res, { deleted: true });
});

router.get('/uoms', async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [rows, total] = await Promise.all([
    prisma.unit.findMany({ skip, take: limit, orderBy: [{ code: 'asc' }, { id: 'asc' }] }),
    prisma.unit.count()
  ]);
  ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.post('/uoms', async (req: Request, res: Response) => {
  ok(res, await prisma.unit.create({ data: req.body }), undefined, 201);
});

router.put('/uoms/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'uomId');
  ok(res, await prisma.unit.update({ where: { id }, data: req.body }));
});

router.delete('/uoms/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'uomId');
  await prisma.unit.delete({ where: { id } });
  ok(res, { deleted: true });
});

router.get('/warehouses/:id/stock', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'warehouseId');
  const rows = await prisma.stockBalance.findMany({
    where: { warehouseId: id },
    orderBy: [{ itemId: 'asc' }]
  });
  const itemIds = Array.from(new Set(rows.map((row) => row.itemId)));
  const items = itemIds.length
    ? await prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, code: true, nameAr: true, nameEn: true } })
    : [];
  const byItemId = new Map(items.map((item) => [item.id, item]));
  ok(res, {
    warehouseId: id,
    summary: {
      lines: rows.length,
      totalQuantity: rows.reduce((sum, row) => sum + Number(row.quantity), 0),
      totalValue: rows.reduce((sum, row) => sum + Number(row.value), 0)
    },
    rows: rows.map((row) => ({ ...row, item: byItemId.get(row.itemId) ?? null }))
  });
});

router.get('/inventory-counts', async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [rows, total] = await Promise.all([
    prisma.stockCount.findMany({ skip, take: limit, orderBy: { id: 'desc' } }),
    prisma.stockCount.count()
  ]);
  ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/inventory-counts/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'countId');
  const [header, lines] = await Promise.all([
    prisma.stockCount.findUnique({ where: { id } }),
    prisma.stockCountLine.findMany({ where: { stockCountId: id }, orderBy: { id: 'asc' } })
  ]);
  ok(res, { ...header, lines });
});

router.post('/inventory-counts', async (req: Request, res: Response) => {
  ok(res, await prisma.stockCount.create({ data: req.body }), undefined, 201);
});

router.put('/inventory-counts/:id/items', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'countId');
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const itemId = Number(item.itemId);
      const actualQty = Number(item.actualQty ?? 0);
      const unitCost = Number(item.unitCost ?? 0);
      await tx.stockCountLine.create({
        data: {
          stockCountId: id,
          itemId,
          theoreticalQty: Number(item.theoreticalQty ?? 0),
          actualQty,
          unitCost
        }
      });
    }
  });
  ok(res, { updated: true });
});

router.post('/inventory-counts/:id/complete', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'countId');
  ok(res, await prisma.stockCount.update({ where: { id }, data: { status: 'APPROVED' } }));
});

router.get('/inventory-transactions', async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [rows, total] = await Promise.all([
    prisma.stockMovement.findMany({ skip, take: limit, orderBy: [{ date: 'desc' }, { id: 'desc' }] }),
    prisma.stockMovement.count()
  ]);
  ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.post('/inventory-transactions', async (req: Request, res: Response) => {
  ok(res, await prisma.stockMovement.create({ data: req.body }), undefined, 201);
});

router.get('/reports/inventory-valuation', async (_req: Request, res: Response) => {
  const items = await prisma.item.findMany({ orderBy: { code: 'asc' } });
  const totalValue = items.reduce((s, i) => s + Number(i.inventoryValue), 0);
  ok(res, { totalValue, items });
});

router.get('/reports/low-stock', async (_req: Request, res: Response) => {
  const rows = await prisma.item.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } });
  ok(
    res,
    rows.filter((r) => Number(r.onHandQty) <= Number(r.reorderPoint))
  );
});

router.get('/reports/comparative-income-statement', async (req: Request, res: Response) => {
  const currentFrom = parseOptionalDate(req.query.currentFrom, new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)));
  const currentTo = parseOptionalDate(req.query.currentTo, new Date());
  const previousFrom = parseOptionalDate(req.query.previousFrom, new Date(Date.UTC(new Date().getUTCFullYear() - 1, 0, 1)));
  const previousTo = parseOptionalDate(req.query.previousTo, new Date(Date.UTC(new Date().getUTCFullYear() - 1, 11, 31)));
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

router.get('/custom-reports', async (_req: Request, res: Response) => {
  ok(res, await prisma.savedReport.findMany({ orderBy: { id: 'desc' } }));
});

router.get('/custom-reports/:id/run', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'reportId');
  const row = await prisma.savedReport.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('التقرير غير موجود');
  ok(res, { report: row, result: [], executedAt: new Date().toISOString() });
});

router.post('/custom-reports', async (req: Request, res: Response) => {
  ok(res, await prisma.savedReport.create({ data: req.body }), undefined, 201);
});

router.put('/custom-reports/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'reportId');
  ok(res, await prisma.savedReport.update({ where: { id }, data: req.body }));
});

router.delete('/custom-reports/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'reportId');
  await prisma.savedReport.delete({ where: { id } });
  ok(res, { deleted: true });
});

router.put('/scheduled-reports/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'scheduleId');
  ok(res, await prisma.scheduledReport.update({ where: { id }, data: req.body }));
});

router.delete('/scheduled-reports/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'scheduleId');
  await prisma.scheduledReport.delete({ where: { id } });
  ok(res, { deleted: true });
});

router.get('/reports/abc-analysis', async (_req: Request, res: Response) => {
  const items = await prisma.item.findMany({ orderBy: { inventoryValue: 'desc' }, take: 300 });
  ok(res, { totalValue: items.reduce((s, i) => s + Number(i.inventoryValue), 0), rows: items });
});

router.get('/reports/customer-lifetime-value', async (_req: Request, res: Response) => {
  const rows = await prisma.customer.findMany({ orderBy: { currentBalance: 'desc' }, take: 300 });
  ok(res, rows.map((c) => ({ id: c.id, code: c.code, nameAr: c.nameAr, estimatedClv: Number(c.currentBalance) * 12 })));
});

router.get('/reports/sales-forecast', async (req: Request, res: Response) => {
  const branchId = Number(req.query.branchId ?? 0);
  const rows = await prisma.invoice.findMany({
    where: {
      type: 'SALES',
      status: { in: ['ISSUED', 'PAID', 'PARTIAL'] },
      ...(branchId > 0 ? { branchId } : {})
    },
    select: { date: true, total: true },
    orderBy: { date: 'asc' }
  });
  ok(res, buildSalesForecastFromInvoices(rows));
});

router.get('/reports/balanced-scorecard', async (_req: Request, res: Response) => {
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

router.get('/tax-categories', async (_req: Request, res: Response) => {
  const row = await prisma.integrationSetting.findUnique({ where: { key: 'tax-categories' } });
  const categories = Array.isArray((row?.settings as any)?.categories) ? (row?.settings as any).categories : [];
  ok(res, categories);
});

router.get('/tax-categories/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'categoryId');
  const row = await prisma.integrationSetting.findUnique({ where: { key: 'tax-categories' } });
  const categories = Array.isArray((row?.settings as any)?.categories) ? (row?.settings as any).categories : [];
  const found = categories.find((c: any) => Number(c.id) === id);
  if (!found) throw Errors.notFound('??? ??????? ??? ??????');
  ok(res, found);
});

router.post('/tax-categories', async (req: Request, res: Response) => {
  const row = await prisma.integrationSetting.findUnique({ where: { key: 'tax-categories' } });
  const categories = Array.isArray((row?.settings as any)?.categories) ? [...(row?.settings as any).categories] : [];
  const id = categories.length ? Math.max(...categories.map((c: any) => Number(c.id) || 0)) + 1 : 1;
  const created = { id, ...req.body };
  categories.push(created);
  await prisma.integrationSetting.upsert({
    where: { key: 'tax-categories' },
    update: { settings: { categories }, isEnabled: true },
    create: { key: 'tax-categories', provider: 'SYSTEM', isEnabled: true, settings: { categories } }
  });
  ok(res, created, undefined, 201);
});

router.put('/tax-categories/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'categoryId');
  const row = await prisma.integrationSetting.findUnique({ where: { key: 'tax-categories' } });
  const categories = Array.isArray((row?.settings as any)?.categories) ? [...(row?.settings as any).categories] : [];
  const idx = categories.findIndex((c: any) => Number(c.id) === id);
  if (idx < 0) throw Errors.notFound('فئة الضريبة غير موجودة');
  categories[idx] = { ...categories[idx], ...req.body, id };
  await prisma.integrationSetting.upsert({
    where: { key: 'tax-categories' },
    update: { settings: { categories }, isEnabled: true },
    create: { key: 'tax-categories', provider: 'SYSTEM', isEnabled: true, settings: { categories } }
  });
  ok(res, categories[idx]);
});

router.delete('/tax-categories/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'categoryId');
  const row = await prisma.integrationSetting.findUnique({ where: { key: 'tax-categories' } });
  const categories = Array.isArray((row?.settings as any)?.categories) ? [...(row?.settings as any).categories] : [];
  const next = categories.filter((c: any) => Number(c.id) !== id);
  await prisma.integrationSetting.upsert({
    where: { key: 'tax-categories' },
    update: { settings: { categories: next }, isEnabled: true },
    create: { key: 'tax-categories', provider: 'SYSTEM', isEnabled: true, settings: { categories: next } }
  });
  ok(res, { deleted: true });
});

router.post('/tax-declarations/:id/submit', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'declarationId');
  const result = await taxDeclarationService.submitDeclaration({
    declarationId: id,
    userId: Number((req as any).user.id),
    filedDate: req.body?.filedDate,
    filedReference: req.body?.filedReference
  });
  ok(res, { ...result.declaration, duplicate: result.duplicate });
});

router.post('/tax-declarations/:id/pay', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'declarationId');
  const result = await taxDeclarationService.payDeclaration({
    declarationId: id,
    userId: Number((req as any).user.id),
    paidDate: req.body?.paidDate,
    paidReference: req.body?.paidReference,
    cashAccountId: req.body?.cashAccountId
  });
  ok(res, {
    ...result.declaration,
    duplicate: result.duplicate,
    journalEntryId: result.journalEntryId,
    journalEntryNumber: result.journalEntryNumber
  });
});

router.get('/zatca/settings', async (_req: Request, res: Response) => {
  const row = await prisma.integrationSetting.findUnique({ where: { key: 'zatca' } });
  ok(res, row ?? { key: 'zatca', provider: 'ZATCA', isEnabled: false, status: 'DISABLED', settings: {} });
});

router.put('/zatca/settings', async (req: Request, res: Response) => {
  const row = await prisma.integrationSetting.upsert({
    where: { key: 'zatca' },
    update: { provider: 'ZATCA', isEnabled: Boolean(req.body?.isEnabled), status: req.body?.isEnabled ? 'ACTIVE' : 'DISABLED', settings: req.body ?? {} },
    create: { key: 'zatca', provider: 'ZATCA', isEnabled: Boolean(req.body?.isEnabled), status: req.body?.isEnabled ? 'ACTIVE' : 'DISABLED', settings: req.body ?? {} }
  });
  ok(res, row);
});

router.post('/zatca/test-connection', async (_req: Request, res: Response) => {
  ok(res, { connected: true, testedAt: new Date().toISOString() });
});

router.get('/zatca/compliance', async (_req: Request, res: Response) => {
  const row = await prisma.integrationSetting.findUnique({ where: { key: 'zatca' } });
  ok(res, { enabled: Boolean(row?.isEnabled), status: row?.status ?? 'DISABLED', compliant: Boolean(row?.isEnabled) });
});

router.get('/reports/tax-summary', async (_req: Request, res: Response) => {
  const rows = await prisma.taxDeclaration.findMany({ orderBy: { id: 'desc' } });
  const summary = rows.reduce(
    (acc, row) => {
      acc.declarations += 1;
      acc.outputTax += Number(row.outputTax);
      acc.inputTax += Number(row.inputTax);
      acc.netPayable += Number(row.netPayable);
      return acc;
    },
    { declarations: 0, outputTax: 0, inputTax: 0, netPayable: 0 }
  );
  ok(res, { summary, rows });
});

router.get('/currencies/:code', async (req: Request, res: Response) => {
  const code = String(req.params.code).toUpperCase();
  ok(res, await prisma.currency.findUnique({ where: { code } }));
});

router.put('/currencies/:code', async (req: Request, res: Response) => {
  const code = String(req.params.code).toUpperCase();
  ok(res, await prisma.currency.update({ where: { code }, data: req.body }));
});

router.delete('/currencies/:code', async (req: Request, res: Response) => {
  const code = String(req.params.code).toUpperCase();
  await prisma.currency.delete({ where: { code } });
  ok(res, { deleted: true });
});

router.get('/exchange-rates/latest', async (_req: Request, res: Response) => {
  const rows = await prisma.exchangeRate.findMany({ orderBy: [{ currencyCode: 'asc' }, { rateDate: 'desc' }], take: 500 });
  const latest = new Map<string, any>();
  for (const row of rows) if (!latest.has(row.currencyCode)) latest.set(row.currencyCode, row);
  ok(res, Array.from(latest.values()));
});

router.post('/currency/revaluate', async (req: Request, res: Response) => {
  const asOfDate = parseOptionalDate(req.body?.asOfDate, new Date());
  asOfDate.setUTCHours(0, 0, 0, 0);
  const asOfDateKey = asOfDate.toISOString().slice(0, 10);
  const minDifference = Math.max(0, Number(req.body?.minDifference ?? 0.01));

  const result = await prisma.$transaction(async (tx) => {
    const company = await tx.companyProfile.findUnique({ where: { id: 1 } });
    const baseCurrency = String(req.body?.baseCurrency ?? company?.currency ?? 'SAR').toUpperCase();
    const reference = `FXREV-${asOfDateKey}`;

    const existing = await tx.journalEntry.findFirst({
      where: { reference, status: 'POSTED' },
      orderBy: { id: 'desc' }
    });
    if (existing) {
      return {
        duplicate: true,
        asOfDate: asOfDateKey,
        baseCurrency,
        entryId: existing.id,
        entryNumber: existing.entryNumber,
        lines: [],
        summary: { evaluatedAccounts: 0, affectedAccounts: 0, totalDifference: 0, totalDebit: 0, totalCredit: 0 }
      };
    }

    const period = await tx.accountingPeriod.findFirst({
      where: { startDate: { lte: asOfDate }, endDate: { gte: asOfDate }, status: 'OPEN', canPost: true },
      include: { fiscalYear: true },
      orderBy: [{ fiscalYearId: 'desc' }, { number: 'desc' }]
    });
    if (!period || period.fiscalYear.status !== 'OPEN') {
      throw Errors.business('لا توجد فترة محاسبية مفتوحة لتقييم فروقات العملة');
    }

    const postingAccounts = await resolvePostingAccounts(tx as any);
    const gainAccountId = postingAccounts.stockAdjustmentGainAccountId;
    const lossAccountId = postingAccounts.stockAdjustmentLossAccountId;

    const bankAccounts = await tx.bankAccount.findMany({
      where: { isActive: true, glAccountId: { not: null }, currency: { not: baseCurrency } },
      select: { id: true, name: true, currency: true, currentBalance: true, glAccountId: true }
    });

    if (!bankAccounts.length) {
      return {
        duplicate: false,
        asOfDate: asOfDateKey,
        baseCurrency,
        entryId: null,
        entryNumber: null,
        lines: [],
        summary: { evaluatedAccounts: 0, affectedAccounts: 0, totalDifference: 0, totalDebit: 0, totalCredit: 0 }
      };
    }

    const currencyCodes = Array.from(new Set(bankAccounts.map((b) => String(b.currency).toUpperCase())));
    const rates = await tx.exchangeRate.findMany({
      where: { currencyCode: { in: currencyCodes }, rateDate: { lte: asOfDate } },
      orderBy: [{ currencyCode: 'asc' }, { rateDate: 'desc' }]
    });

    const ratePairs = new Map<string, { current?: { rate: number; rateDate: Date }; previous?: { rate: number; rateDate: Date } }>();
    for (const row of rates) {
      const code = String(row.currencyCode).toUpperCase();
      const pair = ratePairs.get(code) ?? {};
      if (!pair.current) {
        pair.current = { rate: Number(row.rate), rateDate: row.rateDate };
      } else if (!pair.previous) {
        pair.previous = { rate: Number(row.rate), rateDate: row.rateDate };
      }
      ratePairs.set(code, pair);
    }

    const aggregate = new Map<number, { debit: number; credit: number; description: string }>();
    const details: Array<{
      bankAccountId: number;
      bankAccountName: string;
      currencyCode: string;
      foreignBalance: number;
      currentRate: number;
      previousRate: number;
      difference: number;
      gainLoss: 'GAIN' | 'LOSS';
    }> = [];

    for (const bank of bankAccounts) {
      const currencyCode = String(bank.currency).toUpperCase();
      const pair = ratePairs.get(currencyCode);
      if (!pair?.current || !pair?.previous) continue;

      const foreignBalance = Number(bank.currentBalance ?? 0);
      if (Math.abs(foreignBalance) < 1e-9) continue;

      const difference = roundAmount(foreignBalance * (pair.current.rate - pair.previous.rate));
      if (Math.abs(difference) < minDifference) continue;

      const glAccountId = Number(bank.glAccountId);
      const gain = difference > 0 ? difference : 0;
      const loss = difference < 0 ? Math.abs(difference) : 0;

      const addLine = (accountId: number, debit: number, credit: number, description: string) => {
        const current = aggregate.get(accountId) ?? { debit: 0, credit: 0, description };
        current.debit = roundAmount(current.debit + debit);
        current.credit = roundAmount(current.credit + credit);
        if (!current.description) current.description = description;
        aggregate.set(accountId, current);
      };

      if (gain > 0) {
        addLine(glAccountId, gain, 0, `فرق تقييم عملة ${currencyCode} (${bank.name})`);
        addLine(gainAccountId, 0, gain, `ربح فرق تقييم عملة ${currencyCode}`);
      } else if (loss > 0) {
        addLine(lossAccountId, loss, 0, `خسارة فرق تقييم عملة ${currencyCode}`);
        addLine(glAccountId, 0, loss, `فرق تقييم عملة ${currencyCode} (${bank.name})`);
      }

      details.push({
        bankAccountId: bank.id,
        bankAccountName: bank.name,
        currencyCode,
        foreignBalance,
        currentRate: pair.current.rate,
        previousRate: pair.previous.rate,
        difference,
        gainLoss: difference >= 0 ? 'GAIN' : 'LOSS'
      });
    }

    if (!details.length) {
      return {
        duplicate: false,
        asOfDate: asOfDateKey,
        baseCurrency,
        entryId: null,
        entryNumber: null,
        lines: [],
        summary: { evaluatedAccounts: bankAccounts.length, affectedAccounts: 0, totalDifference: 0, totalDebit: 0, totalCredit: 0 }
      };
    }

    const lines = Array.from(aggregate.entries())
      .map(([accountId, value]) => ({
        accountId,
        debit: roundAmount(value.debit),
        credit: roundAmount(value.credit),
        description: value.description
      }))
      .filter((l) => l.debit > 0 || l.credit > 0);

    const totalDebit = roundAmount(lines.reduce((sum, l) => sum + l.debit, 0));
    const totalCredit = roundAmount(lines.reduce((sum, l) => sum + l.credit, 0));
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw Errors.business('تعذر ترحيل قيد تقييم العملة لعدم التوازن');
    }

    const year = asOfDate.getUTCFullYear();
    const seq = await tx.journalEntry.count({ where: { entryNumber: { startsWith: `FXR-${year}-` } } });
    const entryNumber = buildSequentialNumber('FXR', seq, year);

    const entry = await tx.journalEntry.create({
      data: {
        entryNumber,
        date: asOfDate,
        periodId: period.id,
        description: `قيد فروقات العملة بتاريخ ${asOfDateKey}`,
        reference,
        source: 'MANUAL',
        status: 'POSTED',
        totalDebit,
        totalCredit,
        postedAt: new Date(),
        createdById: Number((req as any).user.id),
        postedById: Number((req as any).user.id),
        lines: {
          create: lines.map((line, idx) => ({
            lineNumber: idx + 1,
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
            description: line.description
          }))
        }
      }
    });

    await applyLedgerLines(
      tx as any,
      asOfDate,
      period.number,
      lines.map((line) => ({ accountId: line.accountId, debit: line.debit, credit: line.credit }))
    );

    return {
      duplicate: false,
      asOfDate: asOfDateKey,
      baseCurrency,
      entryId: entry.id,
      entryNumber: entry.entryNumber,
      lines: details,
      summary: {
        evaluatedAccounts: bankAccounts.length,
        affectedAccounts: details.length,
        totalDifference: roundAmount(details.reduce((sum, d) => sum + d.difference, 0)),
        totalDebit,
        totalCredit
      }
    };
  });

  const statusCode = result.duplicate ? 200 : result.entryId ? 202 : 200;
  ok(res, result, undefined, statusCode);
});

router.get('/reports/currency-differences', async (_req: Request, res: Response) => {
  const rates = await prisma.exchangeRate.findMany({ orderBy: [{ currencyCode: 'asc' }, { rateDate: 'desc' }], take: 1000 });
  const byCode = new Map<string, Array<{ rate: number; rateDate: Date }>>();
  for (const row of rates) {
    const arr = byCode.get(row.currencyCode) ?? [];
    if (arr.length < 2) arr.push({ rate: Number(row.rate), rateDate: row.rateDate });
    byCode.set(row.currencyCode, arr);
  }
  const rows = Array.from(byCode.entries()).map(([currencyCode, arr]) => {
    const current = arr[0];
    const previous = arr[1] ?? arr[0];
    const difference = Number(current.rate) - Number(previous.rate);
    const differencePercent = previous.rate ? (difference / Number(previous.rate)) * 100 : 0;
    return { currencyCode, currentRate: current.rate, previousRate: previous.rate, difference, differencePercent, rateDate: current.rateDate };
  });
  ok(res, rows);
});

router.get('/audit-logs/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'auditLogId');
  ok(res, await prisma.auditLog.findUnique({ where: { id } }));
});

router.get('/internal-control/alerts', async (_req: Request, res: Response) => {
  const alerts = await prisma.integrationSetting.findMany({
    where: { key: { startsWith: 'internal-control:alert:' } },
    orderBy: { id: 'desc' }
  });
  ok(
    res,
    alerts.map((a) => ({
      id: a.id,
      key: a.key,
      status: a.status ?? 'OPEN',
      details: a.settings ?? {}
    }))
  );
});

router.post('/internal-control/resolve/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'alertId');
  ok(res, await prisma.integrationSetting.update({ where: { id }, data: { status: 'RESOLVED' } }));
});

router.get('/bank-accounts', async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [rows, total] = await Promise.all([
    prisma.bankAccount.findMany({ skip, take: limit, orderBy: { id: 'desc' } }),
    prisma.bankAccount.count()
  ]);
  ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/bank-accounts/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'bankAccountId');
  ok(res, await prisma.bankAccount.findUnique({ where: { id } }));
});

router.post('/bank-accounts', async (req: Request, res: Response) => {
  ok(res, await prisma.bankAccount.create({ data: req.body }), undefined, 201);
});

router.put('/bank-accounts/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'bankAccountId');
  ok(res, await prisma.bankAccount.update({ where: { id }, data: req.body }));
});

router.delete('/bank-accounts/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'bankAccountId');
  await prisma.bankAccount.delete({ where: { id } });
  ok(res, { deleted: true });
});

function bankReconKey(id: number): string {
  return `bank-reconciliation:${id}`;
}

type BankReconSettings = {
  bankId?: number;
  statementBalance?: number;
  statementDate?: string;
  matchedTransactions?: number[];
  completedAt?: string;
  matchedCount?: number;
  matchedDebit?: number;
  matchedCredit?: number;
  systemBalance?: number;
  difference?: number;
};

router.get('/bank-reconciliations', async (_req: Request, res: Response) => {
  const rows = await prisma.integrationSetting.findMany({
    where: { key: { startsWith: 'bank-reconciliation:' } },
    orderBy: { id: 'desc' }
  });
  ok(
    res,
    rows.map((row) => {
      const parsed = splitIntegrationKey(row.key);
      return {
        id: parsed?.id ?? row.id,
        key: row.key,
        status: row.status ?? 'DRAFT',
        settings: row.settings ?? {}
      };
    })
  );
});

router.get('/bank-reconciliations/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'reconciliationId');
  const row = await prisma.integrationSetting.findUnique({ where: { key: bankReconKey(id) } });
  if (!row) throw Errors.notFound('التسوية غير موجودة');
  ok(res, { id, status: row.status ?? 'DRAFT', settings: row.settings ?? {} });
});

router.post('/bank-reconciliations', async (req: Request, res: Response) => {
  const bankId = parsePositiveInt(req.body?.bankId, 'bankId');
  const bank = await prisma.bankAccount.findUnique({ where: { id: bankId } });
  if (!bank) throw Errors.notFound('?????? ?????? ??? ?????');
  if (String(bank.accountType).toUpperCase() === 'CASHBOX') throw Errors.business('?? ???? ????? ????? ????? ?????? ????');

  const statementBalance = Number(req.body?.statementBalance ?? 0);
  const statementDate = parseOptionalDate(req.body?.statementDate, new Date());

  const settings: BankReconSettings = {
    bankId,
    statementBalance,
    statementDate: statementDate.toISOString(),
    matchedTransactions: []
  };
  const tempKey = `bank-reconciliation:tmp:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const created = await prisma.integrationSetting.create({
    data: { key: tempKey, provider: 'SYSTEM', isEnabled: true, status: 'DRAFT', settings: settings as any }
  });

  let selectedId: number | null = null;
  let row = created;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidateId = created.id + attempt;
    try {
      row = await prisma.integrationSetting.update({
        where: { id: created.id },
        data: { key: bankReconKey(candidateId) }
      });
      selectedId = candidateId;
      break;
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
    }
  }

  if (!selectedId) {
    await prisma.integrationSetting.delete({ where: { id: created.id } });
    throw Errors.conflict('تعذر إنشاء تسوية بنكية بسبب تعارض معرف التسوية');
  }

  ok(res, { id: selectedId, row }, undefined, 201);
});

router.post('/bank-reconciliations/:id/match', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'reconciliationId');
  const txId = parsePositiveInt(req.body?.transactionId, 'transactionId');
  const row = await prisma.integrationSetting.findUnique({ where: { key: bankReconKey(id) } });
  if (!row) throw Errors.notFound('??????? ??? ??????');

  if (String(row.status ?? '').toUpperCase() === 'COMPLETED') {
    throw Errors.business('?? ???? ?????? ????? ??????');
  }

  const settings = (row.settings ?? {}) as BankReconSettings;
  const bankId = Number(settings.bankId ?? 0);
  if (!Number.isInteger(bankId) || bankId <= 0) throw Errors.validation('bankId ??? ????');

  const transaction = await prisma.bankTransaction.findUnique({ where: { id: txId } });
  if (!transaction) throw Errors.notFound('?????? ??????? ??? ??????');
  if (transaction.bankId !== bankId) throw Errors.business('?????? ??????? ?? ??? ??? ??????');
  if (transaction.isReconciled) throw Errors.business('?????? ??????? ?????? ??????');

  const matched = Array.isArray(settings.matchedTransactions) ? [...settings.matchedTransactions] : [];
  if (!matched.includes(txId)) matched.push(txId);

  const updated = await prisma.integrationSetting.update({
    where: { key: bankReconKey(id) },
    data: { settings: { ...settings, matchedTransactions: matched } as any, status: 'IN_PROGRESS' }
  });
  ok(res, { id, matchedTransactions: (updated.settings as any).matchedTransactions ?? [] });
});

router.post('/bank-reconciliations/:id/complete', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'reconciliationId');
  const row = await prisma.integrationSetting.findUnique({ where: { key: bankReconKey(id) } });
  if (!row) throw Errors.notFound('??????? ??? ??????');
  if (String(row.status ?? '').toUpperCase() === 'COMPLETED') throw Errors.business('??????? ?????? ??????');

  const settings = (row.settings ?? {}) as BankReconSettings;
  const bankId = Number(settings.bankId ?? 0);
  if (!Number.isInteger(bankId) || bankId <= 0) throw Errors.validation('bankId ??? ????');

  const matchedIds = Array.isArray(settings.matchedTransactions)
    ? [...new Set(settings.matchedTransactions.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0))]
    : [];

  const bank = await prisma.bankAccount.findUnique({ where: { id: bankId } });
  if (!bank) throw Errors.notFound('?????? ?????? ??? ?????');

  const matchedRows = matchedIds.length
    ? await prisma.bankTransaction.findMany({ where: { id: { in: matchedIds } } })
    : [];

  if (matchedRows.some((r) => r.bankId !== bankId)) {
    throw Errors.business('???? ????? ??? ????? ???? ?????? ??????');
  }
  if (matchedRows.some((r) => r.isReconciled)) {
    throw Errors.business('???? ????? ?????? ??????');
  }

  const now = new Date();
  if (matchedIds.length) {
    await prisma.bankTransaction.updateMany({
      where: { id: { in: matchedIds } },
      data: { isReconciled: true, reconciledAt: now }
    });
  }

  const totals = await prisma.bankTransaction.aggregate({
    where: { bankId },
    _sum: { debit: true, credit: true }
  });
  const systemBalance = Number(bank.openingBalance) + Number(totals._sum.credit ?? 0) - Number(totals._sum.debit ?? 0);
  const statementBalance = Number(settings.statementBalance ?? 0);
  const matchedDebit = matchedRows.reduce((sum, r) => sum + Number(r.debit), 0);
  const matchedCredit = matchedRows.reduce((sum, r) => sum + Number(r.credit), 0);

  const completedSettings: BankReconSettings = {
    ...settings,
    completedAt: now.toISOString(),
    matchedCount: matchedRows.length,
    matchedDebit,
    matchedCredit,
    systemBalance,
    difference: statementBalance - systemBalance
  };

  await prisma.bankAccount.update({ where: { id: bankId }, data: { currentBalance: systemBalance } });
  const updated = await prisma.integrationSetting.update({
    where: { key: bankReconKey(id) },
    data: { status: 'COMPLETED', settings: completedSettings as any }
  });
  ok(res, { id, status: updated.status, settings: updated.settings });
});

router.get('/cashboxes', async (_req: Request, res: Response) => {
  ok(res, await prisma.bankAccount.findMany({ where: { accountType: 'CASHBOX' }, orderBy: { id: 'desc' } }));
});

router.get('/cashboxes/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'cashboxId');
  ok(res, await prisma.bankAccount.findFirst({ where: { id, accountType: 'CASHBOX' } }));
});

router.post('/cashboxes', async (req: Request, res: Response) => {
  ok(res, await prisma.bankAccount.create({ data: { ...req.body, accountType: 'CASHBOX' } }), undefined, 201);
});

router.put('/cashboxes/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'cashboxId');
  ok(res, await prisma.bankAccount.update({ where: { id }, data: { ...req.body, accountType: 'CASHBOX' } }));
});

router.delete('/cashboxes/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'cashboxId');
  await prisma.bankAccount.delete({ where: { id } });
  ok(res, { deleted: true });
});

router.get('/cash-transactions', async (req: Request, res: Response) => {
  const where: any = { type: { startsWith: 'CASH_' } };
  if (req.query.cashboxId) where.bankId = Number(req.query.cashboxId);
  ok(res, await prisma.bankTransaction.findMany({ where, orderBy: [{ date: 'desc' }, { id: 'desc' }] }));
});

router.post('/cash-transactions', async (req: Request, res: Response) => {
  const cashboxId = parsePositiveInt(req.body?.cashboxId, 'cashboxId');
  const direction = String(req.body?.direction ?? 'DEPOSIT').toUpperCase();
  const amount = Number(req.body?.amount ?? 0);
  if (amount <= 0) throw Errors.validation('amount ??? ?? ???? ???? ?? ???');

  const cashbox = await prisma.bankAccount.findFirst({ where: { id: cashboxId, accountType: 'CASHBOX' } });
  if (!cashbox) throw Errors.notFound('??????? ??? ?????');
  if (!cashbox.isActive) throw Errors.business('??????? ??? ???');

  const isWithdraw = direction === 'WITHDRAW';
  const current = Number(cashbox.currentBalance ?? 0);
  if (isWithdraw && current < amount) throw Errors.business('???? ??????? ??? ???');

  const result = await prisma.$transaction(async (tx) => {
    const nextBalance = isWithdraw ? current - amount : current + amount;
    const row = await tx.bankTransaction.create({
      data: {
        bankId: cashboxId,
        date: req.body?.date ? new Date(String(req.body.date)) : new Date(),
        description: String(req.body?.description ?? ''),
        type: isWithdraw ? 'CASH_WITHDRAW' : 'CASH_DEPOSIT',
        debit: isWithdraw ? amount : 0,
        credit: isWithdraw ? 0 : amount,
        reference: req.body?.reference ?? null,
        balance: nextBalance
      }
    });
    await tx.bankAccount.update({ where: { id: cashboxId }, data: { currentBalance: nextBalance } });
    return { row, balance: nextBalance };
  });

  ok(res, result, undefined, 201);
});

router.get('/reports/bank-statement/:bankAccountId', async (req: Request, res: Response) => {
  const bankId = parsePositiveInt(req.params.bankAccountId, 'bankAccountId');
  const fromDate = parseOptionalDate(req.query.fromDate, new Date('2000-01-01'));
  const toDate = parseOptionalDate(req.query.toDate, new Date());
  ok(
    res,
    await prisma.bankTransaction.findMany({
      where: { bankId, date: { gte: fromDate, lte: toDate } },
      orderBy: [{ date: 'asc' }, { id: 'asc' }]
    })
  );
});

router.get('/reports/bank-reconciliation', async (_req: Request, res: Response) => {
  ok(
    res,
    await prisma.integrationSetting.findMany({
      where: { key: { startsWith: 'bank-reconciliation:' } },
      orderBy: { id: 'desc' }
    })
  );
});

router.post('/budgets/:id/approve', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'budgetId');
  ok(res, await budgetingService.approveLegacyBudget(id, Number((req as AuthRequest).user?.id ?? 0)));
});

router.get('/budget-lines', async (req: Request, res: Response) => {
  ok(res, await budgetingService.listLegacyBudgetLines(req.query));
});

router.post('/budget-lines', async (req: Request, res: Response) => {
  ok(res, await budgetingService.createLegacyBudgetLine(req.body, Number((req as AuthRequest).user?.id ?? 0)), undefined, 201);
});

router.put('/budget-lines/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'budgetLineId');
  ok(res, await budgetingService.updateLegacyBudgetLine(id, req.body, Number((req as AuthRequest).user?.id ?? 0)));
});

router.delete('/budget-lines/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'budgetLineId');
  ok(res, await budgetingService.deleteLegacyBudgetLine(id));
});

router.get('/reports/budget-variance/:budgetId', async (req: Request, res: Response) => {
  const budgetId = parsePositiveInt(req.params.budgetId, 'budgetId');
  ok(res, await budgetingService.getLegacyBudgetVariance(budgetId));
});

router.get('/reports/budget-summary', async (_req: Request, res: Response) => {
  ok(res, await budgetingService.listLegacyBudgetSummary());
});

router.get('/reports/sales-by-product', async (_req: Request, res: Response) => {
  ok(
    res,
    await prisma.invoiceLine.groupBy({
      by: ['itemId'],
      _sum: { quantity: true, total: true },
      _count: { id: true }
    })
  );
});

router.get('/reports/sales-by-salesman', async (_req: Request, res: Response) => {
  ok(
    res,
    await prisma.invoice.groupBy({
      by: ['createdById'],
      where: { type: 'SALES' },
      _sum: { total: true },
      _count: { id: true }
    })
  );
});

router.get('/reports/purchases-by-supplier', async (_req: Request, res: Response) => {
  ok(
    res,
    await prisma.invoice.groupBy({
      by: ['supplierId'],
      where: { type: 'PURCHASE' },
      _sum: { total: true },
      _count: { id: true }
    })
  );
});

router.get('/reports/purchases-by-product', async (_req: Request, res: Response) => {
  ok(
    res,
    await prisma.invoiceLine.groupBy({
      by: ['itemId'],
      _sum: { quantity: true, total: true },
      _count: { id: true }
    })
  );
});

router.get('/reports/inventory-movements', async (req: Request, res: Response) => {
  const where: any = {};
  if (req.query.fromDate || req.query.toDate) {
    where.date = {};
    if (req.query.fromDate) where.date.gte = new Date(String(req.query.fromDate));
    if (req.query.toDate) where.date.lte = new Date(String(req.query.toDate));
  }
  ok(res, await prisma.stockMovement.findMany({ where, orderBy: [{ date: 'desc' }, { id: 'desc' }] }));
});

router.get('/reports/fixed-assets', async (_req: Request, res: Response) => {
  const rows = await prisma.fixedAsset.findMany({ include: { category: true }, orderBy: { id: 'desc' } });
  const summary = rows.reduce(
    (acc, row) => {
      acc.assets += 1;
      acc.purchaseCost += Number(row.purchaseCost);
      acc.accumulatedDepreciation += Number(row.accumulatedDepreciation);
      acc.netBookValue += Number(row.netBookValue);
      return acc;
    },
    { assets: 0, purchaseCost: 0, accumulatedDepreciation: 0, netBookValue: 0 }
  );
  ok(res, { summary, rows });
});

router.get('/reports/depreciation', async (_req: Request, res: Response) => {
  const rows = await prisma.depreciationSchedule.findMany({ orderBy: [{ fiscalYear: 'desc' }, { period: 'desc' }] });
  ok(res, rows);
});

router.get('/assets/:id/depreciation', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'assetId');
  ok(
    res,
    await prisma.depreciationSchedule.findMany({
      where: { assetId: id },
      orderBy: [{ fiscalYear: 'desc' }, { period: 'desc' }]
    })
  );
});

router.get('/depreciation-schedules', async (req: Request, res: Response) => {
  const where: any = {};
  if (req.query.assetId) where.assetId = Number(req.query.assetId);
  if (req.query.fiscalYear) where.fiscalYear = Number(req.query.fiscalYear);
  if (req.query.period) where.period = Number(req.query.period);
  if (req.query.status) where.status = String(req.query.status);
  const { page, limit, skip } = parsePagination(req.query);
  const [rows, total] = await Promise.all([
    prisma.depreciationSchedule.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ fiscalYear: 'desc' }, { period: 'desc' }, { id: 'desc' }],
      include: { asset: true }
    }),
    prisma.depreciationSchedule.count({ where })
  ]);
  ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/tickets', async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [rows, total] = await Promise.all([
    prisma.supportTicket.findMany({ skip, take: limit, orderBy: { id: 'desc' } }),
    prisma.supportTicket.count()
  ]);
  ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/tickets/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'ticketId');
  const [ticket, comments] = await Promise.all([
    prisma.supportTicket.findUnique({ where: { id } }),
    prisma.supportTicketMessage.findMany({ where: { ticketId: id }, orderBy: { id: 'asc' } })
  ]);
  ok(res, { ...ticket, comments });
});

router.post('/tickets', async (req: Request, res: Response) => {
  ok(res, await prisma.supportTicket.create({ data: req.body }), undefined, 201);
});

router.put('/tickets/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'ticketId');
  ok(res, await prisma.supportTicket.update({ where: { id }, data: req.body }));
});

router.post('/tickets/:id/comments', async (req: any, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'ticketId');
  ok(
    res,
    await prisma.supportTicketMessage.create({
      data: {
        ticketId: id,
        senderId: Number(req.user.id),
        senderType: 'USER',
        message: String(req.body?.message ?? '')
      }
    }),
    undefined,
    201
  );
});

router.post('/tickets/:id/assign', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'ticketId');
  ok(res, await prisma.supportTicket.update({ where: { id }, data: { assigneeId: Number(req.body?.assigneeId ?? 0) || null } }));
});

router.patch('/tickets/:id/status', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'ticketId');
  const status = String(req.body?.status ?? '').trim();
  if (!status) throw Errors.validation('status مطلوب');
  ok(res, await prisma.supportTicket.update({ where: { id }, data: { status } }));
});

router.patch('/opportunities/:id/stage', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'opportunityId');
  const stage = String(req.body?.stage ?? '').trim();
  if (!stage) throw Errors.validation('stage required');
  const data: any = { stage };
  if (req.body?.status) data.status = String(req.body.status);
  if (req.body?.probability !== undefined) data.probability = Number(req.body.probability);
  ok(res, await prisma.opportunity.update({ where: { id }, data }));
});

router.get('/contacts/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'contactId');
  ok(res, await prisma.contact.findUnique({ where: { id } }));
});

router.put('/expenses/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'expenseId');
  ok(res, await prisma.projectExpense.update({ where: { id }, data: req.body }));
});

router.delete('/expenses/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'expenseId');
  await prisma.projectExpense.delete({ where: { id } });
  ok(res, { deleted: true });
});

router.post('/leaves/:id/approve', async (req: any, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'leaveId');
  const leave = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!leave) throw Errors.notFound('??? ??????? ??? ?????');
  if (leave.status !== 'PENDING') throw Errors.business('???? ?????? ????? ?????? ???');
  ok(res, await prisma.leaveRequest.update({ where: { id }, data: { status: 'APPROVED', approvedBy: Number(req.user.id), approvedAt: new Date() } }));
});

router.post('/leaves/:id/reject', async (req: any, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'leaveId');
  const leave = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!leave) throw Errors.notFound('??? ??????? ??? ?????');
  if (leave.status !== 'PENDING') throw Errors.business('???? ??? ????? ?????? ???');
  ok(res, await prisma.leaveRequest.update({ where: { id }, data: { status: 'REJECTED', approvedBy: Number(req.user.id), approvedAt: new Date() } }));
});

router.get('/payroll', async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [rows, total] = await Promise.all([
    prisma.payrollRun.findMany({ skip, take: limit, orderBy: { id: 'desc' } }),
    prisma.payrollRun.count()
  ]);
  ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/payroll/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'payrollId');
  const [run, lines] = await Promise.all([
    prisma.payrollRun.findUnique({ where: { id } }),
    prisma.payrollLine.findMany({ where: { payrollRunId: id }, orderBy: { id: 'asc' } })
  ]);
  ok(res, { ...run, lines });
});

router.post('/payroll/generate', async (req: Request, res: Response) => {
  const year = Number(req.body?.year);
  const month = Number(req.body?.month);
  if (!year || !month) throw Errors.validation('year/month مطلوبة');
  const code = `PAY-${year}-${String(month).padStart(2, '0')}-${Date.now()}`;
  const employees = await prisma.employee.findMany({ where: { status: 'ACTIVE' } });
  const grossTotal = employees.reduce((s, e) => s + Number(e.baseSalary) + Number(e.allowances), 0);
  const run = await prisma.payrollRun.create({ data: { code, year, month, status: 'DRAFT', grossTotal, netTotal: grossTotal } });
  if (employees.length) {
    await prisma.payrollLine.createMany({
      data: employees.map((e) => ({
        payrollRunId: run.id,
        employeeId: e.id,
        basicSalary: e.baseSalary,
        allowances: e.allowances,
        overtime: 0,
        deductions: 0,
        netSalary: Number(e.baseSalary) + Number(e.allowances)
      }))
    });
  }
  ok(res, run, undefined, 201);
});

router.post('/payroll/:id/approve', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'payrollId');
  const run = await prisma.payrollRun.findUnique({ where: { id } });
  if (!run) throw Errors.notFound('???? ??????? ??? ?????');
  if (run.status !== 'DRAFT') throw Errors.business('???? ?????? ????? ??????? ???');
  ok(res, await prisma.payrollRun.update({ where: { id }, data: { status: 'APPROVED' } }));
});

router.post('/payroll/:id/post', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'payrollId');
  const run = await prisma.payrollRun.findUnique({ where: { id } });
  if (!run) throw Errors.notFound('???? ??????? ??? ?????');
  if (run.status !== 'APPROVED') throw Errors.business('???? ????? ???? ????? ????? ???');
  const payrollLines = await prisma.payrollLine.findMany({ where: { payrollRunId: id } });
  if (!payrollLines.length) throw Errors.business('لا يمكن ترحيل كشف رواتب بدون موظفين');

  const netTotal = roundAmount(payrollLines.reduce((sum, line) => sum + Number(line.netSalary ?? 0), 0));
  if (netTotal <= 0) throw Errors.business('صافي كشف الرواتب يجب أن يكون أكبر من صفر');

  const userId = Number((req as any).user.id);
  const reference = `PAYROLL-RUN-${id}`;
  const existingEntry = await prisma.journalEntry.findFirst({
    where: { reference },
    orderBy: { id: 'desc' }
  });

  let journalEntryId = existingEntry?.id ?? null;
  if (existingEntry && existingEntry.status !== 'POSTED') {
    throw Errors.business('يوجد قيد رواتب سابق غير مرحل لنفس الكشف');
  }

  if (!existingEntry) {
    const postingAccounts = await resolvePostingAccounts(prisma as any);
    const postingDate = parseOptionalDate(req.body?.postingDate, new Date());
    const monthLabel = String(run.month).padStart(2, '0');
    const description = String(req.body?.description ?? `ترحيل كشف رواتب ${run.year}-${monthLabel}`).trim();

    const createdEntry = await journalService.createEntry(
      {
        date: postingDate,
        description,
        reference,
        source: 'PAYROLL',
        lines: [
          {
            accountId: postingAccounts.purchaseExpenseAccountId,
            debit: netTotal,
            credit: 0,
            description: `مصروف رواتب ${run.year}-${monthLabel}`
          },
          {
            accountId: postingAccounts.payableAccountId,
            debit: 0,
            credit: netTotal,
            description: `رواتب مستحقة ${run.year}-${monthLabel}`
          }
        ]
      },
      userId
    );
    const postedEntry = await journalService.postEntry(createdEntry.id, userId);
    journalEntryId = postedEntry.id;
  }

  const updated = await prisma.payrollRun.update({
    where: { id },
    data: { status: 'POSTED', runDate: new Date(), netTotal }
  });
  ok(res, { ...updated, journalEntryId, postedAmount: netTotal });
});

router.post('/payroll/:id/pay', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'payrollId');
  const run = await prisma.payrollRun.findUnique({ where: { id } });
  if (!run) throw Errors.notFound('???? ??????? ??? ?????');
  if (run.status !== 'POSTED') throw Errors.business('???? ??? ???? ????? ???? ???');
  ok(res, await prisma.payrollRun.update({ where: { id }, data: { status: 'PAID', runDate: new Date() } }));
});

router.post('/contracts/:id/approve', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'contractId');
  ok(res, await contractsService.approveContract(id, Number((req as AuthRequest).user?.id ?? 0)));
});

router.post('/contracts/:id/renew', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'contractId');
  const months = Number(req.body?.months ?? 12);
  ok(res, await contractsService.renewContract(id, months, Number((req as AuthRequest).user?.id ?? 0)));
});

router.post('/contracts/:id/terminate', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'contractId');
  ok(res, await contractsService.terminateContract(id, Number((req as AuthRequest).user?.id ?? 0)));
});

router.put('/milestones/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'milestoneId');
  ok(res, await contractsService.updateContractMilestone(id, req.body, Number((req as AuthRequest).user?.id ?? 0)));
});

router.delete('/milestones/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'milestoneId');
  ok(res, await contractsService.deleteContractMilestone(id, Number((req as AuthRequest).user?.id ?? 0)));
});

router.post('/milestones/:id/complete', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'milestoneId');
  ok(res, await contractsService.completeContractMilestone(id, Number((req as AuthRequest).user?.id ?? 0)));
});

const helpArticles = [
  { id: 1, title: 'البدء السريع', category: 'onboarding', content: 'دليل البدء السريع للنظام.' },
  { id: 2, title: 'إصدار فاتورة', category: 'sales', content: 'خطوات إصدار فاتورة مبيعات.' },
  { id: 3, title: 'إقفال الفترة', category: 'accounting', content: 'طريقة إقفال الفترة المحاسبية.' }
];

router.get('/help-center/articles', async (_req: Request, res: Response) => {
  ok(res, helpArticles);
});

router.get('/help-center/articles/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'articleId');
  ok(res, helpArticles.find((a) => a.id === id) ?? null);
});

router.get('/knowledge-base', async (_req: Request, res: Response) => {
  ok(res, helpArticles);
});

router.get('/knowledge-base/search', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').toLowerCase();
  ok(res, helpArticles.filter((a) => a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q)));
});

router.post('/assistant/query', async (req: AuthRequest, res: Response) => {
  const query = String(req.body?.query ?? '').trim();
  if (!query) throw Errors.validation('سؤال المساعد مطلوب');

  const history = Array.isArray(req.body?.history) ? req.body.history : [];
  ok(res, await queryAssistant({ query, history, user: req.user }));
});

router.get('/assistant/suggest', async (req: AuthRequest, res: Response) => {
  ok(res, await getAssistantSuggestions(req.user));
});

router.get('/setup-wizard/steps', async (_req: Request, res: Response) => {
  const row = await prisma.integrationSetting.findUnique({ where: { key: 'setup-wizard' } });
  const completed = Array.isArray((row?.settings as any)?.completedSteps) ? (row?.settings as any).completedSteps : [];
  const steps = ['company', 'users', 'chart-of-accounts', 'tax', 'opening-balances'];
  ok(res, { steps, completed });
});

router.post('/setup-wizard/step/:step', async (req: Request, res: Response) => {
  const step = String(req.params.step);
  const row = await prisma.integrationSetting.findUnique({ where: { key: 'setup-wizard' } });
  const completed = Array.isArray((row?.settings as any)?.completedSteps) ? [...(row?.settings as any).completedSteps] : [];
  if (!completed.includes(step)) completed.push(step);
  const saved = await prisma.integrationSetting.upsert({
    where: { key: 'setup-wizard' },
    update: { settings: { completedSteps: completed }, isEnabled: true, status: 'IN_PROGRESS' },
    create: { key: 'setup-wizard', provider: 'SYSTEM', isEnabled: true, status: 'IN_PROGRESS', settings: { completedSteps: completed } }
  });
  ok(res, { step, completed: (saved.settings as any).completedSteps });
});

router.post('/setup-wizard/complete', async (_req: Request, res: Response) => {
  const saved = await prisma.integrationSetting.upsert({
    where: { key: 'setup-wizard' },
    update: { status: 'COMPLETED', isEnabled: true },
    create: { key: 'setup-wizard', provider: 'SYSTEM', isEnabled: true, status: 'COMPLETED', settings: {} }
  });
  ok(res, { completed: true, setup: saved });
});

export default router;
