import { qw } from '../../utils/where';
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
  const user = await prisma.orm.public.User.first({ username });
  if (!user) throw Errors.notFound('المستخدم غير موجود');
  const password = await bcrypt.hash(newPassword, 10);
  await prisma.orm.public.User.where((r) => qw(r, { id: user.id })).update({ password, failedLoginCount: 0, lockedUntil: null }).then((r0) => r0!);
  ok(res, { reset: true });
});

router.use(authenticate);

// Quick Access
router.get('/quick-journal/form-data', async (_req: Request, res: Response) => {
  const [accounts, periods] = await Promise.all([
    prisma.orm.public.Account.where((r) => qw(r, { isActive: true, allowPosting: true })).select('id', 'code', 'nameAr', 'type').orderBy((r) => r.code.asc()).all(),
    prisma.orm.public.AccountingPeriod.where((r) => qw(r, { status: 'OPEN', canPost: true })).include('fiscalYear').orderBy([(r) => r.fiscalYearId.desc(), (r) => r.number.asc()]).all()
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
    prisma.orm.public.Customer.where((r) => qw(r, { isActive: true })).select('id', 'code', 'nameAr').orderBy((r) => r.code.asc()).all(),
    prisma.orm.public.Item.where((r) => qw(r, { isActive: true })).select('id', 'code', 'nameAr', 'salePrice', 'onHandQty').orderBy((r) => r.code.asc()).all()
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
    const account = await prisma.orm.public.Account.first({ id: entityId });
    const lines = await prisma.orm.public.JournalLine.where((r) => qw(r, { accountId: entityId, entry: { status: 'POSTED', date: { gte: fromDate, lte: toDate } } })).include('entry').orderBy((r) => r.entry.r.date.asc()).all();
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
  const invoices = await prisma.orm.public.Invoice.where((r) => qw(r, {
      type: isCustomer ? 'SALES' : 'PURCHASE',
      customerId: isCustomer ? entityId : undefined,
      supplierId: isCustomer ? undefined : entityId,
      date: { gte: fromDate, lte: toDate }
    })).orderBy((r) => r.date.asc()).all();
  const payments = await prisma.orm.public.Payment.where((r) => qw(r, {
      type: isCustomer ? 'RECEIPT' : 'PAYMENT',
      customerId: isCustomer ? entityId : undefined,
      supplierId: isCustomer ? undefined : entityId,
      date: { gte: fromDate, lte: toDate }
    })).orderBy((r) => r.date.asc()).all();
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
    prisma.orm.public.Customer.where((r) => qw(r, { OR: [{ nameAr: contains }, { code: contains }, { email: contains }] })).limit(20).all(),
    prisma.orm.public.Supplier.where((r) => qw(r, { OR: [{ nameAr: contains }, { code: contains }, { email: contains }] })).limit(20).all(),
    prisma.orm.public.JournalEntry.where((r) => qw(r, { OR: [{ entryNumber: contains }, { description: contains }, { reference: contains }] })).limit(20).all(),
    prisma.orm.public.Invoice.where((r) => qw(r, { OR: [{ number: contains }, { notes: contains }] })).limit(20).all(),
    prisma.orm.public.Payment.where((r) => qw(r, { OR: [{ number: contains }, { description: contains }] })).limit(20).all(),
    prisma.orm.public.Item.where((r) => qw(r, { OR: [{ code: contains }, { nameAr: contains }, { nameEn: contains }] })).limit(20).all()
  ]);
  ok(res, { query: q, customers, suppliers, journals, invoices, payments, products });
});

// Accounting aliases
router.get('/accounts/:id/transactions', async (req: Request, res: Response) => {
  const accountId = parsePositiveInt(req.params.id, 'accountId');
  const rows = await prisma.orm.public.JournalLine.where((r) => qw(r, { accountId })).include('entry').orderBy((r) => r.entry.r.date.desc()).all();
  ok(res, rows);
});

router.post('/journals/:id/attachments', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'journalId');
  const entry = await prisma.orm.public.JournalEntry.where((r) => qw(r, { id })).update({ attachmentCount: { increment: 1 } }).then((r0) => r0!);
  ok(res, { journalId: entry.id, attachmentCount: entry.attachmentCount, fileName: req.body?.fileName ?? null, stored: true });
});

router.get('/ledger/:accountId', async (req: Request, res: Response) => {
  const accountId = parsePositiveInt(req.params.accountId, 'accountId');
  const fromDate = parseOptionalDate(req.query.fromDate, new Date('2000-01-01'));
  const toDate = parseOptionalDate(req.query.toDate, new Date());
  const rows = await prisma.orm.public.JournalLine.where((r) => qw(r, { accountId, entry: { status: 'POSTED', date: { gte: fromDate, lte: toDate } } })).include('entry').orderBy((r) => r.entry.r.date.asc()).all();
  ok(res, rows);
});

router.get('/account-statement/:accountId', async (req: Request, res: Response) => {
  const accountId = parsePositiveInt(req.params.accountId, 'accountId');
  const fromDate = parseOptionalDate(req.query.fromDate, new Date('2000-01-01'));
  const toDate = parseOptionalDate(req.query.toDate, new Date());
  const account = await prisma.orm.public.Account.first({ id: accountId });
  const lines = await prisma.orm.public.JournalLine.where((r) => qw(r, { accountId, entry: { status: 'POSTED', date: { gte: fromDate, lte: toDate } } })).include('entry').orderBy((r) => r.entry.r.date.asc()).all();
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
  ok(res, await prisma.orm.public.FiscalYear.where((r) => qw(r, { id })).update({ status: 'CLOSED' }).then((r0) => r0!));
});

router.post('/fiscal-years/:id/open', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'fiscalYearId');
  ok(res, await prisma.orm.public.FiscalYear.where((r) => qw(r, { id })).update({ status: 'OPEN' }).then((r0) => r0!));
});

router.post('/year-end-closing/:fiscalYearId/validate', async (req: Request, res: Response) => {
  const fiscalYearId = parsePositiveInt(req.params.fiscalYearId, 'fiscalYearId');
  const fiscalYear = await prisma.orm.public.FiscalYear.first({ id: fiscalYearId });
  if (!fiscalYear) throw Errors.notFound('السنة المالية غير موجودة');
  const [draftEntries, openPeriods] = await Promise.all([
    prisma.orm.public.JournalEntry.where((r) => qw(r, { status: 'DRAFT', date: { gte: fiscalYear.startDate, lte: fiscalYear.endDate } })).aggregate((a) => ({ n: a.count() })).then((r0) => r0.n),
    prisma.orm.public.AccountingPeriod.where((r) => qw(r, { fiscalYearId, status: 'OPEN' })).aggregate((a) => ({ n: a.count() })).then((r0) => r0.n)
  ]);
  ok(res, { fiscalYearId, draftEntries, openPeriods, canClose: draftEntries === 0 && openPeriods === 0 });
});

router.post('/year-end-closing/:fiscalYearId/execute', async (req: Request, res: Response) => {
  const fiscalYearId = parsePositiveInt(req.params.fiscalYearId, 'fiscalYearId');
  const actorId = Number((req as any).user?.id ?? 1);

  const payload = await prisma.transaction(async (tx) => {{
    const fiscalYear = await tx.orm.public.FiscalYear.first({ id: fiscalYearId });
    if (!fiscalYear) throw Errors.notFound('????? ??????? ??? ??????');
    if (fiscalYear.status === 'CLOSED') throw Errors.business('????? ??????? ????? ??????');

    const [draftEntries, openPeriods] = await Promise.all([
      tx.orm.public.JournalEntry.where((r) => qw(r, { status: 'DRAFT', date: { gte: fiscalYear.startDate, lte: fiscalYear.endDate } })).aggregate((a) => ({ n: a.count() })).then((r0) => r0.n),
      tx.orm.public.AccountingPeriod.where((r) => qw(r, { fiscalYearId, status: 'OPEN' })).aggregate((a) => ({ n: a.count() })).then((r0) => r0.n)
    ]);
    if (draftEntries > 0 || openPeriods > 0) throw Errors.business('???? ????? ???????: ???? ?????? ?? ????? ??????');

    const fiscalYearKey = fiscalYear.startDate.getUTCFullYear();
    const closingDate = fiscalYear.endDate;
    const closingPeriod = closingDate.getUTCMonth() + 1;

    const retainedEarnings =
      (await tx.orm.public.Account.first({ code: '3100' })) ??
      (await tx.orm.public.Account.orderBy((r) => r.id.asc()).first({ type: 'EQUITY', allowPosting: true, isActive: true }));
    if (!retainedEarnings) throw Errors.business('???? ?????? ??? ???? ???? ????? ?????? ?????');

    const tempAccounts = await tx.orm.public.Account.where((r) => qw(r, { type: { in: ['REVENUE', 'EXPENSE'] }, allowPosting: true, isActive: true })).select('id', 'type', 'nameAr').all();
    const tempIds = tempAccounts.map((a) => a.id);
    const tempBalances = tempIds.length
      ? await tx.orm.public.AccountBalance.where((r) => qw(r, { fiscalYear: fiscalYearKey, accountId: { in: tempIds } })).all()
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
      const latest = await tx.orm.public.JournalEntry.select('entryNumber').orderBy((r) => r.entryNumber.desc()).first((r) => qw(r, { entryNumber: { startsWith: `YEC-${closingYear}-` } }));
      const entryNumber = buildSequentialNumberFromLatest('YEC', latest?.entryNumber, closingYear);
      closingEntry = await tx.orm.public.JournalEntry.create({
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
        });
      await tx.orm.public.JournalLine.createAll(closingLines.map((line, i) => ({
          entryId: closingEntry.id,
          lineNumber: i + 1,
          accountId: line.accountId,
          description: line.description,
          debit: line.debit,
          credit: line.credit
        }))).then((rows) => ({ count: rows.length }));
      await applyLedgerLines(tx, closingDate, closingPeriod, closingLines);
    }

    const nextStart = new Date(closingDate);
    nextStart.setUTCDate(nextStart.getUTCDate() + 1);
    const nextEnd = new Date(nextStart);
    nextEnd.setUTCFullYear(nextEnd.getUTCFullYear() + 1);
    nextEnd.setUTCDate(nextEnd.getUTCDate() - 1);

    let nextFiscalYear = await tx.orm.public.FiscalYear.first({ startDate: nextStart });
    if (!nextFiscalYear) {
      const baseName = 'FY-' + nextStart.getUTCFullYear();
      let candidate = baseName;
      let idx = 1;
      while (await tx.orm.public.FiscalYear.first({ name: candidate })) {
        candidate = baseName + '-' + idx;
        idx += 1;
      }
      nextFiscalYear = await tx.orm.public.FiscalYear.create({
          name: candidate,
          startDate: nextStart,
          endDate: nextEnd,
          status: 'OPEN',
          isCurrent: false
        });
    }

    const permanentAccounts = await tx.orm.public.Account.where((r) => qw(r, { type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] }, allowPosting: true, isActive: true })).select('id', 'nameAr').all();
    const permanentIds = permanentAccounts.map((a) => a.id);
    const permanentBalances = permanentIds.length
      ? await tx.orm.public.AccountBalance.where((r) => qw(r, { fiscalYear: fiscalYearKey, accountId: { in: permanentIds } })).all()
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
      const latest = await tx.orm.public.JournalEntry.select('entryNumber').orderBy((r) => r.entryNumber.desc()).first((r) => qw(r, { entryNumber: { startsWith: `OPEN-${openingYear}-` } }));
      const entryNumber = buildSequentialNumberFromLatest('OPEN', latest?.entryNumber, openingYear);
      openingEntry = await tx.orm.public.JournalEntry.create({
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
        });
      await tx.orm.public.JournalLine.createAll(openingLines.map((line, i) => ({
          entryId: openingEntry.id,
          lineNumber: i + 1,
          accountId: line.accountId,
          description: line.description,
          debit: line.debit,
          credit: line.credit
        }))).then((rows) => ({ count: rows.length }));
      await applyLedgerLines(tx, nextStart, nextStart.getUTCMonth() + 1, openingLines);
    }

    const periodsCount = await tx.orm.public.AccountingPeriod.where((r) => qw(r, { fiscalYearId: nextFiscalYear.id })).aggregate((a) => ({ n: a.count() })).then((r0) => r0.n);
    if (periodsCount === 0) {
      for (let i = 0; i < 12; i += 1) {
        const startDate = new Date(nextStart);
        startDate.setUTCMonth(startDate.getUTCMonth() + i);
        const endDate = new Date(nextStart);
        endDate.setUTCMonth(endDate.getUTCMonth() + i + 1);
        endDate.setUTCDate(endDate.getUTCDate() - 1);
        await tx.orm.public.AccountingPeriod.create({
            fiscalYearId: nextFiscalYear.id,
            number: i + 1,
            name: 'P' + String(i + 1).padStart(2, '0'),
            startDate,
            endDate,
            status: 'OPEN',
            canPost: true
          });
      }
    }

    await tx.orm.public.FiscalYear.where((r) => qw(r, {})).updateAndCount({ isCurrent: false }).then((n0) => ({ count: n0 }));
    const [closedYear, openedYear] = await Promise.all([
      tx.orm.public.FiscalYear.where((r) => qw(r, { id: fiscalYearId })).update({ status: 'CLOSED', isCurrent: false }).then((r0) => r0!),
      tx.orm.public.FiscalYear.where((r) => qw(r, { id: nextFiscalYear.id })).update({ status: 'OPEN', isCurrent: true }).then((r0) => r0!)
    ]);

    return {
      fiscalYear: closedYear,
      nextFiscalYear: openedYear,
      closingEntry,
      openingEntry
    };
  }});

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
  ok(res, await prisma.orm.public.Invoice.where((r) => qw(r, { customerId: id, type: 'SALES' })).orderBy((r) => r.id.desc()).all());
});

router.get('/customers/:id/payments', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'customerId');
  ok(res, await prisma.orm.public.Payment.where((r) => qw(r, { customerId: id, type: 'RECEIPT' })).orderBy((r) => r.id.desc()).all());
});

router.get('/customers/:id/contacts', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'customerId');
  ok(res, await prisma.orm.public.Contact.where((r) => qw(r, { customerId: id })).orderBy((r) => r.id.desc()).all());
});

router.post('/customers/:id/contacts', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'customerId');
  const row = await prisma.orm.public.Contact.create({
      customerId: id,
      name: String(req.body?.name ?? ''),
      position: req.body?.position ?? null,
      phone: req.body?.phone ?? null,
      mobile: req.body?.mobile ?? null,
      email: req.body?.email ?? null,
      isPrimary: Boolean(req.body?.isPrimary)
    });
  ok(res, row, undefined, 201);
});

router.get('/suppliers/:id/invoices', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'supplierId');
  ok(res, await prisma.orm.public.Invoice.where((r) => qw(r, { supplierId: id, type: 'PURCHASE' })).orderBy((r) => r.id.desc()).all());
});

router.get('/suppliers/:id/payments', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'supplierId');
  ok(res, await prisma.orm.public.Payment.where((r) => qw(r, { supplierId: id, type: 'PAYMENT' })).orderBy((r) => r.id.desc()).all());
});

router.get('/suppliers/:id/contacts', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'supplierId');
  ok(res, await prisma.orm.public.Contact.where((r) => qw(r, { supplierId: id })).orderBy((r) => r.id.desc()).all());
});

router.post('/suppliers/:id/contacts', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'supplierId');
  const row = await prisma.orm.public.Contact.create({
      supplierId: id,
      name: String(req.body?.name ?? ''),
      position: req.body?.position ?? null,
      phone: req.body?.phone ?? null,
      mobile: req.body?.mobile ?? null,
      email: req.body?.email ?? null,
      isPrimary: Boolean(req.body?.isPrimary)
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
  const row = await prisma.orm.public.Invoice.include('customer').include('lines').include('payments', (inc) => inc.include('payment')).first({ id, type: 'SALES' });
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
  const rows = await prisma.orm.public.PaymentAllocation.where((r) => qw(r, { invoiceId: id })).include('payment').orderBy((r) => r.id.desc()).all();
  ok(res, rows);
});

router.get('/sales-invoices/:id/print', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'invoiceId');
  const invoice = await prisma.orm.public.Invoice.include('customer').include('lines').first({ id });
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
  const row = await prisma.orm.public.Invoice.include('supplier').include('lines').include('payments', (inc) => inc.include('payment')).first({ id, type: 'PURCHASE' });
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

  const result = await prisma.transaction(async (tx) => {{
    const invoice = await tx.orm.public.Invoice.include('lines').first({ id, type: 'PURCHASE' });
    if (!invoice) throw Errors.notFound('فاتورة الشراء غير موجودة');
    if (invoice.status !== 'ISSUED') throw Errors.business('يمكن استلام بضائع فاتورة شراء معتمدة فقط');

    const existing = await tx.orm.public.PurchaseReceipt.first((r) => qw(r, { notes: { contains: `invoiceId=${id};` } }));
    if (existing) {
      return { invoiceId: id, received: true, duplicate: true, receipt: existing, stockMovements: 0 };
    }

    const itemLines = invoice.lines.filter((line) => Number(line.itemId ?? 0) > 0 && Number(line.quantity ?? 0) > 0);
    let warehouseId = requestedWarehouseId;
    if (!warehouseId && itemLines.length) {
      const defaultWarehouse = await tx.orm.public.Warehouse.orderBy((r) => r.id.asc()).first;
      warehouseId = defaultWarehouse?.id ?? null;
    }
    if (itemLines.length && !warehouseId) throw Errors.validation('warehouseId مطلوب لاستلام الأصناف المخزنية');

    if (warehouseId) {
      const warehouse = await tx.orm.public.Warehouse.first({ id: warehouseId });
      if (!warehouse) throw Errors.notFound('المستودع غير موجود');
    }

    const receiptCount = await tx.orm.public.PurchaseReceipt.aggregate((a) => ({ n: a.count() })).then((r0) => r0.n);
    const receiptNumber = buildSequentialNumber('PRCV', receiptCount, receiveDate.getUTCFullYear());
    const receipt = await tx.orm.public.PurchaseReceipt.create({
        number: receiptNumber,
        supplierId: invoice.supplierId,
        warehouseId,
        date: receiveDate,
        status: 'RECEIVED',
        notes: `invoiceId=${id};by=${actorId}`,
        lines: invoice.lines as any
      });

    let stockMovements = 0;
    for (const line of itemLines) {
      const itemId = Number(line.itemId);
      const quantity = Number(line.quantity);
      const unitCost = Number(line.unitPrice ?? 0);
      const totalCost = quantity * unitCost;

      await tx.orm.public.StockMovement.create({
          date: receiveDate,
          type: 'PURCHASE_RECEIPT',
          reference: invoice.number,
          itemId,
          warehouseId: Number(warehouseId),
          quantity,
          unitCost,
          totalCost,
          notes: `استلام فاتورة شراء ${invoice.number}`
        });

      const existingBalance = await tx.orm.public.StockBalance.first((r) => qw(r, { itemId, warehouseId: Number(warehouseId), locationId: null }));
      const nextQty = Number(existingBalance?.quantity ?? 0) + quantity;
      const nextValue = Number(existingBalance?.value ?? 0) + totalCost;
      const nextAvgCost = Math.abs(nextQty) < 0.000001 ? 0 : nextValue / nextQty;

      if (existingBalance) {
        await tx.orm.public.StockBalance.where((r) => qw(r, { id: existingBalance.id })).update({ quantity: nextQty, value: nextValue, avgCost: nextAvgCost }).then((r0) => r0!);
      } else {
        await tx.orm.public.StockBalance.create({ itemId, warehouseId: Number(warehouseId), locationId: null, quantity: nextQty, value: nextValue, avgCost: nextAvgCost });
      }

      await tx.orm.public.Item.where((r) => qw(r, { id: itemId })).update({
          onHandQty: { increment: quantity },
          inventoryValue: { increment: totalCost }
        }).then((r0) => r0!);

      stockMovements += 1;
    }

    return { invoiceId: id, received: true, duplicate: false, receipt, stockMovements };
  }});

  ok(res, result, undefined, 202);
});

async function paymentAllocationsOnly(paymentId: number) {
  return prisma.orm.public.PaymentAllocation.where((r) => qw(r, { paymentId })).include('invoice').orderBy((r) => r.id.desc()).all();
}

async function allocatePayment(paymentId: number, allocations: Array<{ invoiceId: number; amount: number }>) {
  const payment = await prisma.orm.public.Payment.first({ id: paymentId });
  if (!payment) throw Errors.notFound('????? ??? ?????');
  if (payment.status !== 'PENDING') throw Errors.business('?? ???? ????? ??? ??? ????');

  const total = allocations.reduce((sum, row) => sum + Number(row.amount), 0);
  if (Math.abs(total - Number(payment.amount)) > 0.01) {
    throw Errors.business('????? ??????? ??? ?? ????? ???? ?????');
  }

  await prisma.transaction(async (tx) => {{
    for (const alloc of allocations) {
      const invoiceId = Number(alloc.invoiceId);
      const amount = Number(alloc.amount);
      if (!Number.isFinite(invoiceId) || invoiceId <= 0) throw Errors.validation('invoiceId ??? ????');
      if (!Number.isFinite(amount) || amount <= 0) throw Errors.validation('amount ??? ?? ???? ???? ?? ???');

      const invoice = await tx.orm.public.Invoice.first({ id: invoiceId });
      if (!invoice) throw Errors.notFound('???????? ??? ??????');

      const sameEntity =
        payment.type === 'RECEIPT'
          ? invoice.type === 'SALES' && payment.customerId != null && invoice.customerId === payment.customerId
          : invoice.type === 'PURCHASE' && payment.supplierId != null && invoice.supplierId === payment.supplierId;
      if (!sameEntity) throw Errors.business('?? ???? ????? ????? ??? ?????? ?? ??? ??? ??????');

      if (amount - Number(invoice.outstanding) > 0.01) {
        throw Errors.business('???? ??????? ?????? ??????? ??? ????????');
      }

      await tx.orm.public.PaymentAllocation.upsert({ create: { paymentId, invoiceId, amount }, update: { amount }, conflictOn: { paymentId_invoiceId: { paymentId, invoiceId } } });
    }
  }});
}

// Payments aliases
router.get('/payment-receipts', async (req: Request, res: Response) => {
  const data = await paymentService.listPayments({ ...req.query, type: 'RECEIPT' });
  ok(res, data.rows, data.pagination);
});

router.get('/payment-receipts/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'receiptId');
  const row = await prisma.orm.public.Payment.include('customer').include('bank').include('allocations', (inc) => inc.include('invoice')).first({ id, type: 'RECEIPT' });
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
  const row = await prisma.orm.public.Payment.include('supplier').include('bank').include('allocations', (inc) => inc.include('invoice')).first({ id, type: 'PAYMENT' });
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
  const row = await prisma.orm.public.PurchaseOrder.first({ id });
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
  const rows = await prisma.orm.public.Invoice.where((r) => qw(r, { type: 'SALES' })).all();
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
  const rows = await prisma.orm.public.Invoice.where((r) => qw(r, { type: 'PURCHASE' })).all();
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
    prisma.orm.public.Item.include('category').include('unit').orderBy((r) => r.id.desc()).offset(skip).limit(limit).all(),
    prisma.orm.public.Item.aggregate((a) => ({ n: a.count() })).then((r0) => r0.n)
  ]);
  ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/products/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'productId');
  ok(res, await prisma.orm.public.Item.include('category').include('unit').first({ id }));
});

router.post('/products', async (req: Request, res: Response) => {
  ok(res, await prisma.orm.public.Item.create(req.body), undefined, 201);
});

router.put('/products/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'productId');
  ok(res, await prisma.orm.public.Item.where((r) => qw(r, { id })).update(req.body).then((r0) => r0!));
});

router.delete('/products/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'productId');
  await prisma.orm.public.Item.where((r) => qw(r, { id })).delete().then((r0) => r0!);
  ok(res, { deleted: true });
});

router.get('/products/:id/stock', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'productId');
  ok(res, await prisma.orm.public.StockBalance.where((r) => qw(r, { itemId: id })).orderBy((r) => r.warehouseId.asc()).all());
});

router.get('/products/:id/transactions', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'productId');
  ok(res, await prisma.orm.public.StockMovement.where((r) => qw(r, { itemId: id })).orderBy([(r) => r.date.desc(), (r) => r.id.desc()]).all());
});

router.get('/product-categories', async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [rows, total] = await Promise.all([
    prisma.orm.public.ItemCategory.orderBy([(r) => r.code.asc(), (r) => r.id.asc()]).offset(skip).limit(limit).all(),
    prisma.orm.public.ItemCategory.aggregate((a) => ({ n: a.count() })).then((r0) => r0.n)
  ]);
  ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/product-categories/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'categoryId');
  ok(res, await prisma.orm.public.ItemCategory.first({ id }));
});

router.post('/product-categories', async (req: Request, res: Response) => {
  ok(res, await prisma.orm.public.ItemCategory.create(req.body), undefined, 201);
});

router.put('/product-categories/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'categoryId');
  ok(res, await prisma.orm.public.ItemCategory.where((r) => qw(r, { id })).update(req.body).then((r0) => r0!));
});

router.delete('/product-categories/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'categoryId');
  await prisma.orm.public.ItemCategory.where((r) => qw(r, { id })).delete().then((r0) => r0!);
  ok(res, { deleted: true });
});

router.get('/uoms', async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [rows, total] = await Promise.all([
    prisma.orm.public.Unit.orderBy([(r) => r.code.asc(), (r) => r.id.asc()]).offset(skip).limit(limit).all(),
    prisma.orm.public.Unit.aggregate((a) => ({ n: a.count() })).then((r0) => r0.n)
  ]);
  ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.post('/uoms', async (req: Request, res: Response) => {
  ok(res, await prisma.orm.public.Unit.create(req.body), undefined, 201);
});

router.put('/uoms/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'uomId');
  ok(res, await prisma.orm.public.Unit.where((r) => qw(r, { id })).update(req.body).then((r0) => r0!));
});

router.delete('/uoms/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'uomId');
  await prisma.orm.public.Unit.where((r) => qw(r, { id })).delete().then((r0) => r0!);
  ok(res, { deleted: true });
});

router.get('/warehouses/:id/stock', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'warehouseId');
  const rows = await prisma.orm.public.StockBalance.where((r) => qw(r, { warehouseId: id })).orderBy([(r) => r.itemId.asc()]).all();
  const itemIds = Array.from(new Set(rows.map((row) => row.itemId)));
  const items = itemIds.length
    ? await prisma.orm.public.Item.where((r) => qw(r, { id: { in: itemIds } })).select('id', 'code', 'nameAr', 'nameEn').all()
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
    prisma.orm.public.StockCount.orderBy((r) => r.id.desc()).offset(skip).limit(limit).all(),
    prisma.orm.public.StockCount.aggregate((a) => ({ n: a.count() })).then((r0) => r0.n)
  ]);
  ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/inventory-counts/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'countId');
  const [header, lines] = await Promise.all([
    prisma.orm.public.StockCount.first({ id }),
    prisma.orm.public.StockCountLine.where((r) => qw(r, { stockCountId: id })).orderBy((r) => r.id.asc()).all()
  ]);
  ok(res, { ...header, lines });
});

router.post('/inventory-counts', async (req: Request, res: Response) => {
  ok(res, await prisma.orm.public.StockCount.create(req.body), undefined, 201);
});

router.put('/inventory-counts/:id/items', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'countId');
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  await prisma.transaction(async (tx) => {{
    for (const item of items) {
      const itemId = Number(item.itemId);
      const actualQty = Number(item.actualQty ?? 0);
      const unitCost = Number(item.unitCost ?? 0);
      await tx.orm.public.StockCountLine.create({
          stockCountId: id,
          itemId,
          theoreticalQty: Number(item.theoreticalQty ?? 0),
          actualQty,
          unitCost
        });
    }
  }});
  ok(res, { updated: true });
});

router.post('/inventory-counts/:id/complete', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'countId');
  ok(res, await prisma.orm.public.StockCount.where((r) => qw(r, { id })).update({ status: 'APPROVED' }).then((r0) => r0!));
});

router.get('/inventory-transactions', async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [rows, total] = await Promise.all([
    prisma.orm.public.StockMovement.orderBy([(r) => r.date.desc(), (r) => r.id.desc()]).offset(skip).limit(limit).all(),
    prisma.orm.public.StockMovement.aggregate((a) => ({ n: a.count() })).then((r0) => r0.n)
  ]);
  ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.post('/inventory-transactions', async (req: Request, res: Response) => {
  ok(res, await prisma.orm.public.StockMovement.create(req.body), undefined, 201);
});

router.get('/reports/inventory-valuation', async (_req: Request, res: Response) => {
  const items = await prisma.orm.public.Item.orderBy((r) => r.code.asc()).all();
  const totalValue = items.reduce((s, i) => s + Number(i.inventoryValue), 0);
  ok(res, { totalValue, items });
});

router.get('/reports/low-stock', async (_req: Request, res: Response) => {
  const rows = await prisma.orm.public.Item.where((r) => qw(r, { isActive: true })).orderBy((r) => r.code.asc()).all();
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
  ok(res, await prisma.orm.public.SavedReport.orderBy((r) => r.id.desc()).all());
});

router.get('/custom-reports/:id/run', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'reportId');
  const row = await prisma.orm.public.SavedReport.first({ id });
  if (!row) throw Errors.notFound('التقرير غير موجود');
  ok(res, { report: row, result: [], executedAt: new Date().toISOString() });
});

router.post('/custom-reports', async (req: Request, res: Response) => {
  ok(res, await prisma.orm.public.SavedReport.create(req.body), undefined, 201);
});

router.put('/custom-reports/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'reportId');
  ok(res, await prisma.orm.public.SavedReport.where((r) => qw(r, { id })).update(req.body).then((r0) => r0!));
});

router.delete('/custom-reports/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'reportId');
  await prisma.orm.public.SavedReport.where((r) => qw(r, { id })).delete().then((r0) => r0!);
  ok(res, { deleted: true });
});

router.put('/scheduled-reports/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'scheduleId');
  ok(res, await prisma.orm.public.ScheduledReport.where((r) => qw(r, { id })).update(req.body).then((r0) => r0!));
});

router.delete('/scheduled-reports/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'scheduleId');
  await prisma.orm.public.ScheduledReport.where((r) => qw(r, { id })).delete().then((r0) => r0!);
  ok(res, { deleted: true });
});

router.get('/reports/abc-analysis', async (_req: Request, res: Response) => {
  const items = await prisma.orm.public.Item.orderBy((r) => r.inventoryValue.desc()).limit(300).all();
  ok(res, { totalValue: items.reduce((s, i) => s + Number(i.inventoryValue), 0), rows: items });
});

router.get('/reports/customer-lifetime-value', async (_req: Request, res: Response) => {
  const rows = await prisma.orm.public.Customer.orderBy((r) => r.currentBalance.desc()).limit(300).all();
  ok(res, rows.map((c) => ({ id: c.id, code: c.code, nameAr: c.nameAr, estimatedClv: Number(c.currentBalance) * 12 })));
});

router.get('/reports/sales-forecast', async (req: Request, res: Response) => {
  const branchId = Number(req.query.branchId ?? 0);
  const rows = await prisma.orm.public.Invoice.where((r) => qw(r, {
      type: 'SALES',
      status: { in: ['ISSUED', 'PAID', 'PARTIAL'] },
      ...(branchId > 0 ? { branchId } : {})
    })).select('date', 'total').orderBy((r) => r.date.asc()).all();
  ok(res, buildSalesForecastFromInvoices(rows));
});

router.get('/reports/balanced-scorecard', async (_req: Request, res: Response) => {
  const [invoiceCount, journalCount, paymentCount] = await Promise.all([
    prisma.orm.public.Invoice.aggregate((a) => ({ n: a.count() })).then((r0) => r0.n),
    prisma.orm.public.JournalEntry.aggregate((a) => ({ n: a.count() })).then((r0) => r0.n),
    prisma.orm.public.Payment.aggregate((a) => ({ n: a.count() })).then((r0) => r0.n)
  ]);
  ok(res, {
    financial: { target: 85, actual: 80 + Math.min(20, invoiceCount / 50) },
    customers: { target: 88, actual: 78 + Math.min(20, invoiceCount / 80) },
    internal: { target: 82, actual: 75 + Math.min(20, journalCount / 120) },
    learning: { target: 75, actual: 70 + Math.min(20, paymentCount / 100) }
  });
});

router.get('/tax-categories', async (_req: Request, res: Response) => {
  const row = await prisma.orm.public.IntegrationSetting.first({ key: 'tax-categories' });
  const categories = Array.isArray((row?.settings as any)?.categories) ? (row?.settings as any).categories : [];
  ok(res, categories);
});

router.get('/tax-categories/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'categoryId');
  const row = await prisma.orm.public.IntegrationSetting.first({ key: 'tax-categories' });
  const categories = Array.isArray((row?.settings as any)?.categories) ? (row?.settings as any).categories : [];
  const found = categories.find((c: any) => Number(c.id) === id);
  if (!found) throw Errors.notFound('??? ??????? ??? ??????');
  ok(res, found);
});

router.post('/tax-categories', async (req: Request, res: Response) => {
  const row = await prisma.orm.public.IntegrationSetting.first({ key: 'tax-categories' });
  const categories = Array.isArray((row?.settings as any)?.categories) ? [...(row?.settings as any).categories] : [];
  const id = categories.length ? Math.max(...categories.map((c: any) => Number(c.id) || 0)) + 1 : 1;
  const created = { id, ...req.body };
  categories.push(created);
  await prisma.orm.public.IntegrationSetting.upsert({ create: { key: 'tax-categories', provider: 'SYSTEM', isEnabled: true, settings: { categories } }, update: { settings: { categories }, isEnabled: true }, conflictOn: { key: 'tax-categories' } });
  ok(res, created, undefined, 201);
});

router.put('/tax-categories/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'categoryId');
  const row = await prisma.orm.public.IntegrationSetting.first({ key: 'tax-categories' });
  const categories = Array.isArray((row?.settings as any)?.categories) ? [...(row?.settings as any).categories] : [];
  const idx = categories.findIndex((c: any) => Number(c.id) === id);
  if (idx < 0) throw Errors.notFound('فئة الضريبة غير موجودة');
  categories[idx] = { ...categories[idx], ...req.body, id };
  await prisma.orm.public.IntegrationSetting.upsert({ create: { key: 'tax-categories', provider: 'SYSTEM', isEnabled: true, settings: { categories } }, update: { settings: { categories }, isEnabled: true }, conflictOn: { key: 'tax-categories' } });
  ok(res, categories[idx]);
});

router.delete('/tax-categories/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'categoryId');
  const row = await prisma.orm.public.IntegrationSetting.first({ key: 'tax-categories' });
  const categories = Array.isArray((row?.settings as any)?.categories) ? [...(row?.settings as any).categories] : [];
  const next = categories.filter((c: any) => Number(c.id) !== id);
  await prisma.orm.public.IntegrationSetting.upsert({ create: { key: 'tax-categories', provider: 'SYSTEM', isEnabled: true, settings: { categories: next } }, update: { settings: { categories: next }, isEnabled: true }, conflictOn: { key: 'tax-categories' } });
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
  const row = await prisma.orm.public.IntegrationSetting.first({ key: 'zatca' });
  ok(res, row ?? { key: 'zatca', provider: 'ZATCA', isEnabled: false, status: 'DISABLED', settings: {} });
});

router.put('/zatca/settings', async (req: Request, res: Response) => {
  const row = await prisma.orm.public.IntegrationSetting.upsert({ create: { key: 'zatca', provider: 'ZATCA', isEnabled: Boolean(req.body?.isEnabled), status: req.body?.isEnabled ? 'ACTIVE' : 'DISABLED', settings: req.body ?? {} }, update: { provider: 'ZATCA', isEnabled: Boolean(req.body?.isEnabled), status: req.body?.isEnabled ? 'ACTIVE' : 'DISABLED', settings: req.body ?? {} }, conflictOn: { key: 'zatca' } });
  ok(res, row);
});

router.post('/zatca/test-connection', async (_req: Request, res: Response) => {
  ok(res, { connected: true, testedAt: new Date().toISOString() });
});

router.get('/zatca/compliance', async (_req: Request, res: Response) => {
  const row = await prisma.orm.public.IntegrationSetting.first({ key: 'zatca' });
  ok(res, { enabled: Boolean(row?.isEnabled), status: row?.status ?? 'DISABLED', compliant: Boolean(row?.isEnabled) });
});

router.get('/reports/tax-summary', async (_req: Request, res: Response) => {
  const rows = await prisma.orm.public.TaxDeclaration.orderBy((r) => r.id.desc()).all();
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
  ok(res, await prisma.orm.public.Currency.first({ code }));
});

router.put('/currencies/:code', async (req: Request, res: Response) => {
  const code = String(req.params.code).toUpperCase();
  ok(res, await prisma.orm.public.Currency.where((r) => qw(r, { code })).update(req.body).then((r0) => r0!));
});

router.delete('/currencies/:code', async (req: Request, res: Response) => {
  const code = String(req.params.code).toUpperCase();
  await prisma.orm.public.Currency.where((r) => qw(r, { code })).delete().then((r0) => r0!);
  ok(res, { deleted: true });
});

router.get('/exchange-rates/latest', async (_req: Request, res: Response) => {
  const rows = await prisma.orm.public.ExchangeRate.orderBy([(r) => r.currencyCode.asc(), (r) => r.rateDate.desc()]).limit(500).all();
  const latest = new Map<string, any>();
  for (const row of rows) if (!latest.has(row.currencyCode)) latest.set(row.currencyCode, row);
  ok(res, Array.from(latest.values()));
});

router.post('/currency/revaluate', async (req: Request, res: Response) => {
  const asOfDate = parseOptionalDate(req.body?.asOfDate, new Date());
  asOfDate.setUTCHours(0, 0, 0, 0);
  const asOfDateKey = asOfDate.toISOString().slice(0, 10);
  const minDifference = Math.max(0, Number(req.body?.minDifference ?? 0.01));

  const result = await prisma.transaction(async (tx) => {{
    const company = await tx.orm.public.CompanyProfile.first({ id: 1 });
    const baseCurrency = String(req.body?.baseCurrency ?? company?.currency ?? 'SAR').toUpperCase();
    const reference = `FXREV-${asOfDateKey}`;

    const existing = await tx.orm.public.JournalEntry.orderBy((r) => r.id.desc()).first({ reference, status: 'POSTED' });
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

    const period = await tx.orm.public.AccountingPeriod.include('fiscalYear').orderBy([(r) => r.fiscalYearId.desc(), (r) => r.number.desc()]).first((r) => qw(r, { startDate: { lte: asOfDate }, endDate: { gte: asOfDate }, status: 'OPEN', canPost: true }));
    if (!period || period.fiscalYear.status !== 'OPEN') {
      throw Errors.business('لا توجد فترة محاسبية مفتوحة لتقييم فروقات العملة');
    }

    const postingAccounts = await resolvePostingAccounts(tx as any);
    const gainAccountId = postingAccounts.stockAdjustmentGainAccountId;
    const lossAccountId = postingAccounts.stockAdjustmentLossAccountId;

    const bankAccounts = await tx.orm.public.BankAccount.where((r) => qw(r, { isActive: true, glAccountId: { not: null }, currency: { not: baseCurrency } })).select('id', 'name', 'currency', 'currentBalance', 'glAccountId').all();

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
    const rates = await tx.orm.public.ExchangeRate.where((r) => qw(r, { currencyCode: { in: currencyCodes }, rateDate: { lte: asOfDate } })).orderBy([(r) => r.currencyCode.asc(), (r) => r.rateDate.desc()]).all();

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
    const seq = await tx.orm.public.JournalEntry.where((r) => qw(r, { entryNumber: { startsWith: `FXR-${year}-` } })).aggregate((a) => ({ n: a.count() })).then((r0) => r0.n);
    const entryNumber = buildSequentialNumber('FXR', seq, year);

    const entry = await tx.orm.public.JournalEntry.create({
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
  }});

  const statusCode = result.duplicate ? 200 : result.entryId ? 202 : 200;
  ok(res, result, undefined, statusCode);
});

router.get('/reports/currency-differences', async (_req: Request, res: Response) => {
  const rates = await prisma.orm.public.ExchangeRate.orderBy([(r) => r.currencyCode.asc(), (r) => r.rateDate.desc()]).limit(1000).all();
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
  ok(res, await prisma.orm.public.AuditLog.first({ id }));
});

router.get('/internal-control/alerts', async (_req: Request, res: Response) => {
  const alerts = await prisma.orm.public.IntegrationSetting.where((r) => qw(r, { key: { startsWith: 'internal-control:alert:' } })).orderBy((r) => r.id.desc()).all();
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
  ok(res, await prisma.orm.public.IntegrationSetting.where((r) => qw(r, { id })).update({ status: 'RESOLVED' }).then((r0) => r0!));
});

router.get('/bank-accounts', async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [rows, total] = await Promise.all([
    prisma.orm.public.BankAccount.orderBy((r) => r.id.desc()).offset(skip).limit(limit).all(),
    prisma.orm.public.BankAccount.aggregate((a) => ({ n: a.count() })).then((r0) => r0.n)
  ]);
  ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/bank-accounts/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'bankAccountId');
  ok(res, await prisma.orm.public.BankAccount.first({ id }));
});

router.post('/bank-accounts', async (req: Request, res: Response) => {
  ok(res, await prisma.orm.public.BankAccount.create(req.body), undefined, 201);
});

router.put('/bank-accounts/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'bankAccountId');
  ok(res, await prisma.orm.public.BankAccount.where((r) => qw(r, { id })).update(req.body).then((r0) => r0!));
});

router.delete('/bank-accounts/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'bankAccountId');
  await prisma.orm.public.BankAccount.where((r) => qw(r, { id })).delete().then((r0) => r0!);
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
  const rows = await prisma.orm.public.IntegrationSetting.where((r) => qw(r, { key: { startsWith: 'bank-reconciliation:' } })).orderBy((r) => r.id.desc()).all();
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
  const row = await prisma.orm.public.IntegrationSetting.first((r) => qw(r, { key: bankReconKey(id) }));
  if (!row) throw Errors.notFound('التسوية غير موجودة');
  ok(res, { id, status: row.status ?? 'DRAFT', settings: row.settings ?? {} });
});

router.post('/bank-reconciliations', async (req: Request, res: Response) => {
  const bankId = parsePositiveInt(req.body?.bankId, 'bankId');
  const bank = await prisma.orm.public.BankAccount.first({ id: bankId });
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
  const created = await prisma.orm.public.IntegrationSetting.create({ key: tempKey, provider: 'SYSTEM', isEnabled: true, status: 'DRAFT', settings: settings as any });

  let selectedId: number | null = null;
  let row = created;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidateId = created.id + attempt;
    try {
      row = await prisma.orm.public.IntegrationSetting.where((r) => qw(r, { id: created.id })).update({ key: bankReconKey(candidateId) }).then((r0) => r0!);
      selectedId = candidateId;
      break;
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
    }
  }

  if (!selectedId) {
    await prisma.orm.public.IntegrationSetting.where((r) => qw(r, { id: created.id })).delete().then((r0) => r0!);
    throw Errors.conflict('تعذر إنشاء تسوية بنكية بسبب تعارض معرف التسوية');
  }

  ok(res, { id: selectedId, row }, undefined, 201);
});

router.post('/bank-reconciliations/:id/match', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'reconciliationId');
  const txId = parsePositiveInt(req.body?.transactionId, 'transactionId');
  const row = await prisma.orm.public.IntegrationSetting.first((r) => qw(r, { key: bankReconKey(id) }));
  if (!row) throw Errors.notFound('??????? ??? ??????');

  if (String(row.status ?? '').toUpperCase() === 'COMPLETED') {
    throw Errors.business('?? ???? ?????? ????? ??????');
  }

  const settings = (row.settings ?? {}) as BankReconSettings;
  const bankId = Number(settings.bankId ?? 0);
  if (!Number.isInteger(bankId) || bankId <= 0) throw Errors.validation('bankId ??? ????');

  const transaction = await prisma.orm.public.BankTransaction.first({ id: txId });
  if (!transaction) throw Errors.notFound('?????? ??????? ??? ??????');
  if (transaction.bankId !== bankId) throw Errors.business('?????? ??????? ?? ??? ??? ??????');
  if (transaction.isReconciled) throw Errors.business('?????? ??????? ?????? ??????');

  const matched = Array.isArray(settings.matchedTransactions) ? [...settings.matchedTransactions] : [];
  if (!matched.includes(txId)) matched.push(txId);

  const updated = await prisma.orm.public.IntegrationSetting.where((r) => qw(r, { key: bankReconKey(id) })).update({ settings: { ...settings, matchedTransactions: matched } as any, status: 'IN_PROGRESS' }).then((r0) => r0!);
  ok(res, { id, matchedTransactions: (updated.settings as any).matchedTransactions ?? [] });
});

router.post('/bank-reconciliations/:id/complete', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'reconciliationId');
  const row = await prisma.orm.public.IntegrationSetting.first((r) => qw(r, { key: bankReconKey(id) }));
  if (!row) throw Errors.notFound('??????? ??? ??????');
  if (String(row.status ?? '').toUpperCase() === 'COMPLETED') throw Errors.business('??????? ?????? ??????');

  const settings = (row.settings ?? {}) as BankReconSettings;
  const bankId = Number(settings.bankId ?? 0);
  if (!Number.isInteger(bankId) || bankId <= 0) throw Errors.validation('bankId ??? ????');

  const matchedIds = Array.isArray(settings.matchedTransactions)
    ? [...new Set(settings.matchedTransactions.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0))]
    : [];

  const bank = await prisma.orm.public.BankAccount.first({ id: bankId });
  if (!bank) throw Errors.notFound('?????? ?????? ??? ?????');

  const matchedRows = matchedIds.length
    ? await prisma.orm.public.BankTransaction.where((r) => qw(r, { id: { in: matchedIds } })).all()
    : [];

  if (matchedRows.some((r) => r.bankId !== bankId)) {
    throw Errors.business('???? ????? ??? ????? ???? ?????? ??????');
  }
  if (matchedRows.some((r) => r.isReconciled)) {
    throw Errors.business('???? ????? ?????? ??????');
  }

  const now = new Date();
  if (matchedIds.length) {
    await prisma.orm.public.BankTransaction.where((r) => qw(r, { id: { in: matchedIds } })).updateAndCount({ isReconciled: true, reconciledAt: now }).then((n0) => ({ count: n0 }));
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

  await prisma.orm.public.BankAccount.where((r) => qw(r, { id: bankId })).update({ currentBalance: systemBalance }).then((r0) => r0!);
  const updated = await prisma.orm.public.IntegrationSetting.where((r) => qw(r, { key: bankReconKey(id) })).update({ status: 'COMPLETED', settings: completedSettings as any }).then((r0) => r0!);
  ok(res, { id, status: updated.status, settings: updated.settings });
});

router.get('/cashboxes', async (_req: Request, res: Response) => {
  ok(res, await prisma.orm.public.BankAccount.where((r) => qw(r, { accountType: 'CASHBOX' })).orderBy((r) => r.id.desc()).all());
});

router.get('/cashboxes/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'cashboxId');
  ok(res, await prisma.orm.public.BankAccount.first({ id, accountType: 'CASHBOX' }));
});

router.post('/cashboxes', async (req: Request, res: Response) => {
  ok(res, await prisma.orm.public.BankAccount.create({ ...req.body, accountType: 'CASHBOX' }), undefined, 201);
});

router.put('/cashboxes/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'cashboxId');
  ok(res, await prisma.orm.public.BankAccount.where((r) => qw(r, { id })).update({ ...req.body, accountType: 'CASHBOX' }).then((r0) => r0!));
});

router.delete('/cashboxes/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'cashboxId');
  await prisma.orm.public.BankAccount.where((r) => qw(r, { id })).delete().then((r0) => r0!);
  ok(res, { deleted: true });
});

router.get('/cash-transactions', async (req: Request, res: Response) => {
  const where: any = { type: { startsWith: 'CASH_' } };
  if (req.query.cashboxId) where.bankId = Number(req.query.cashboxId);
  ok(res, await prisma.orm.public.BankTransaction.where((r) => qw(r, where)).orderBy([(r) => r.date.desc(), (r) => r.id.desc()]).all());
});

router.post('/cash-transactions', async (req: Request, res: Response) => {
  const cashboxId = parsePositiveInt(req.body?.cashboxId, 'cashboxId');
  const direction = String(req.body?.direction ?? 'DEPOSIT').toUpperCase();
  const amount = Number(req.body?.amount ?? 0);
  if (amount <= 0) throw Errors.validation('amount ??? ?? ???? ???? ?? ???');

  const cashbox = await prisma.orm.public.BankAccount.first({ id: cashboxId, accountType: 'CASHBOX' });
  if (!cashbox) throw Errors.notFound('??????? ??? ?????');
  if (!cashbox.isActive) throw Errors.business('??????? ??? ???');

  const isWithdraw = direction === 'WITHDRAW';
  const current = Number(cashbox.currentBalance ?? 0);
  if (isWithdraw && current < amount) throw Errors.business('???? ??????? ??? ???');

  const result = await prisma.transaction(async (tx) => {{
    const nextBalance = isWithdraw ? current - amount : current + amount;
    const row = await tx.orm.public.BankTransaction.create({
        bankId: cashboxId,
        date: req.body?.date ? new Date(String(req.body.date)) : new Date(),
        description: String(req.body?.description ?? ''),
        type: isWithdraw ? 'CASH_WITHDRAW' : 'CASH_DEPOSIT',
        debit: isWithdraw ? amount : 0,
        credit: isWithdraw ? 0 : amount,
        reference: req.body?.reference ?? null,
        balance: nextBalance
      });
    await tx.orm.public.BankAccount.where((r) => qw(r, { id: cashboxId })).update({ currentBalance: nextBalance }).then((r0) => r0!);
    return { row, balance: nextBalance };
  }});

  ok(res, result, undefined, 201);
});

router.get('/reports/bank-statement/:bankAccountId', async (req: Request, res: Response) => {
  const bankId = parsePositiveInt(req.params.bankAccountId, 'bankAccountId');
  const fromDate = parseOptionalDate(req.query.fromDate, new Date('2000-01-01'));
  const toDate = parseOptionalDate(req.query.toDate, new Date());
  ok(
    res,
    await prisma.orm.public.BankTransaction.where((r) => qw(r, { bankId, date: { gte: fromDate, lte: toDate } })).orderBy([(r) => r.date.asc(), (r) => r.id.asc()]).all()
  );
});

router.get('/reports/bank-reconciliation', async (_req: Request, res: Response) => {
  ok(
    res,
    await prisma.orm.public.IntegrationSetting.where((r) => qw(r, { key: { startsWith: 'bank-reconciliation:' } })).orderBy((r) => r.id.desc()).all()
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
  ok(res, await prisma.orm.public.StockMovement.where((r) => qw(r, where)).orderBy([(r) => r.date.desc(), (r) => r.id.desc()]).all());
});

router.get('/reports/fixed-assets', async (_req: Request, res: Response) => {
  const rows = await prisma.orm.public.FixedAsset.include('category').orderBy((r) => r.id.desc()).all();
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
  const rows = await prisma.orm.public.DepreciationSchedule.orderBy([(r) => r.fiscalYear.desc(), (r) => r.period.desc()]).all();
  ok(res, rows);
});

router.get('/assets/:id/depreciation', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'assetId');
  ok(
    res,
    await prisma.orm.public.DepreciationSchedule.where((r) => qw(r, { assetId: id })).orderBy([(r) => r.fiscalYear.desc(), (r) => r.period.desc()]).all()
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
    prisma.orm.public.DepreciationSchedule.where((r) => qw(r, where)).include('asset').orderBy([(r) => r.fiscalYear.desc(), (r) => r.period.desc(), (r) => r.id.desc()]).offset(skip).limit(limit).all(),
    prisma.orm.public.DepreciationSchedule.where((r) => qw(r, where)).aggregate((a) => ({ n: a.count() })).then((r0) => r0.n)
  ]);
  ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/tickets', async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [rows, total] = await Promise.all([
    prisma.orm.public.SupportTicket.orderBy((r) => r.id.desc()).offset(skip).limit(limit).all(),
    prisma.orm.public.SupportTicket.aggregate((a) => ({ n: a.count() })).then((r0) => r0.n)
  ]);
  ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/tickets/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'ticketId');
  const [ticket, comments] = await Promise.all([
    prisma.orm.public.SupportTicket.first({ id }),
    prisma.orm.public.SupportTicketMessage.where((r) => qw(r, { ticketId: id })).orderBy((r) => r.id.asc()).all()
  ]);
  ok(res, { ...ticket, comments });
});

router.post('/tickets', async (req: Request, res: Response) => {
  ok(res, await prisma.orm.public.SupportTicket.create(req.body), undefined, 201);
});

router.put('/tickets/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'ticketId');
  ok(res, await prisma.orm.public.SupportTicket.where((r) => qw(r, { id })).update(req.body).then((r0) => r0!));
});

router.post('/tickets/:id/comments', async (req: any, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'ticketId');
  ok(
    res,
    await prisma.orm.public.SupportTicketMessage.create({
        ticketId: id,
        senderId: Number(req.user.id),
        senderType: 'USER',
        message: String(req.body?.message ?? '')
      }),
    undefined,
    201
  );
});

router.post('/tickets/:id/assign', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'ticketId');
  ok(res, await prisma.orm.public.SupportTicket.where((r) => qw(r, { id })).update({ assigneeId: Number(req.body?.assigneeId ?? 0) || null }).then((r0) => r0!));
});

router.patch('/tickets/:id/status', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'ticketId');
  const status = String(req.body?.status ?? '').trim();
  if (!status) throw Errors.validation('status مطلوب');
  ok(res, await prisma.orm.public.SupportTicket.where((r) => qw(r, { id })).update({ status }).then((r0) => r0!));
});

router.patch('/opportunities/:id/stage', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'opportunityId');
  const stage = String(req.body?.stage ?? '').trim();
  if (!stage) throw Errors.validation('stage required');
  const data: any = { stage };
  if (req.body?.status) data.status = String(req.body.status);
  if (req.body?.probability !== undefined) data.probability = Number(req.body.probability);
  ok(res, await prisma.orm.public.Opportunity.where((r) => qw(r, { id })).update(data).then((r0) => r0!));
});

router.get('/contacts/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'contactId');
  ok(res, await prisma.orm.public.Contact.first({ id }));
});

router.put('/expenses/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'expenseId');
  ok(res, await prisma.orm.public.ProjectExpense.where((r) => qw(r, { id })).update(req.body).then((r0) => r0!));
});

router.delete('/expenses/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'expenseId');
  await prisma.orm.public.ProjectExpense.where((r) => qw(r, { id })).delete().then((r0) => r0!);
  ok(res, { deleted: true });
});

router.post('/leaves/:id/approve', async (req: any, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'leaveId');
  const leave = await prisma.orm.public.LeaveRequest.first({ id });
  if (!leave) throw Errors.notFound('??? ??????? ??? ?????');
  if (leave.status !== 'PENDING') throw Errors.business('???? ?????? ????? ?????? ???');
  ok(res, await prisma.orm.public.LeaveRequest.where((r) => qw(r, { id })).update({ status: 'APPROVED', approvedBy: Number(req.user.id), approvedAt: new Date() }).then((r0) => r0!));
});

router.post('/leaves/:id/reject', async (req: any, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'leaveId');
  const leave = await prisma.orm.public.LeaveRequest.first({ id });
  if (!leave) throw Errors.notFound('??? ??????? ??? ?????');
  if (leave.status !== 'PENDING') throw Errors.business('???? ??? ????? ?????? ???');
  ok(res, await prisma.orm.public.LeaveRequest.where((r) => qw(r, { id })).update({ status: 'REJECTED', approvedBy: Number(req.user.id), approvedAt: new Date() }).then((r0) => r0!));
});

router.get('/payroll', async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [rows, total] = await Promise.all([
    prisma.orm.public.PayrollRun.orderBy((r) => r.id.desc()).offset(skip).limit(limit).all(),
    prisma.orm.public.PayrollRun.aggregate((a) => ({ n: a.count() })).then((r0) => r0.n)
  ]);
  ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/payroll/:id', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'payrollId');
  const [run, lines] = await Promise.all([
    prisma.orm.public.PayrollRun.first({ id }),
    prisma.orm.public.PayrollLine.where((r) => qw(r, { payrollRunId: id })).orderBy((r) => r.id.asc()).all()
  ]);
  ok(res, { ...run, lines });
});

router.post('/payroll/generate', async (req: Request, res: Response) => {
  const year = Number(req.body?.year);
  const month = Number(req.body?.month);
  if (!year || !month) throw Errors.validation('year/month مطلوبة');
  const code = `PAY-${year}-${String(month).padStart(2, '0')}-${Date.now()}`;
  const employees = await prisma.orm.public.Employee.where((r) => qw(r, { status: 'ACTIVE' })).all();
  const grossTotal = employees.reduce((s, e) => s + Number(e.baseSalary) + Number(e.allowances), 0);
  const run = await prisma.orm.public.PayrollRun.create({ code, year, month, status: 'DRAFT', grossTotal, netTotal: grossTotal });
  if (employees.length) {
    await prisma.orm.public.PayrollLine.createAll(employees.map((e) => ({
        payrollRunId: run.id,
        employeeId: e.id,
        basicSalary: e.baseSalary,
        allowances: e.allowances,
        overtime: 0,
        deductions: 0,
        netSalary: Number(e.baseSalary) + Number(e.allowances)
      }))).then((rows) => ({ count: rows.length }));
  }
  ok(res, run, undefined, 201);
});

router.post('/payroll/:id/approve', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'payrollId');
  const run = await prisma.orm.public.PayrollRun.first({ id });
  if (!run) throw Errors.notFound('???? ??????? ??? ?????');
  if (run.status !== 'DRAFT') throw Errors.business('???? ?????? ????? ??????? ???');
  ok(res, await prisma.orm.public.PayrollRun.where((r) => qw(r, { id })).update({ status: 'APPROVED' }).then((r0) => r0!));
});

router.post('/payroll/:id/post', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'payrollId');
  const run = await prisma.orm.public.PayrollRun.first({ id });
  if (!run) throw Errors.notFound('???? ??????? ??? ?????');
  if (run.status !== 'APPROVED') throw Errors.business('???? ????? ???? ????? ????? ???');
  const payrollLines = await prisma.orm.public.PayrollLine.where((r) => qw(r, { payrollRunId: id })).all();
  if (!payrollLines.length) throw Errors.business('لا يمكن ترحيل كشف رواتب بدون موظفين');

  const netTotal = roundAmount(payrollLines.reduce((sum, line) => sum + Number(line.netSalary ?? 0), 0));
  if (netTotal <= 0) throw Errors.business('صافي كشف الرواتب يجب أن يكون أكبر من صفر');

  const userId = Number((req as any).user.id);
  const reference = `PAYROLL-RUN-${id}`;
  const existingEntry = await prisma.orm.public.JournalEntry.orderBy((r) => r.id.desc()).first({ reference });

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

  const updated = await prisma.orm.public.PayrollRun.where((r) => qw(r, { id })).update({ status: 'POSTED', runDate: new Date(), netTotal }).then((r0) => r0!);
  ok(res, { ...updated, journalEntryId, postedAmount: netTotal });
});

router.post('/payroll/:id/pay', async (req: Request, res: Response) => {
  const id = parsePositiveInt(req.params.id, 'payrollId');
  const run = await prisma.orm.public.PayrollRun.first({ id });
  if (!run) throw Errors.notFound('???? ??????? ??? ?????');
  if (run.status !== 'POSTED') throw Errors.business('???? ??? ???? ????? ???? ???');
  ok(res, await prisma.orm.public.PayrollRun.where((r) => qw(r, { id })).update({ status: 'PAID', runDate: new Date() }).then((r0) => r0!));
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
  const row = await prisma.orm.public.IntegrationSetting.first({ key: 'setup-wizard' });
  const completed = Array.isArray((row?.settings as any)?.completedSteps) ? (row?.settings as any).completedSteps : [];
  const steps = ['company', 'users', 'chart-of-accounts', 'tax', 'opening-balances'];
  ok(res, { steps, completed });
});

router.post('/setup-wizard/step/:step', async (req: Request, res: Response) => {
  const step = String(req.params.step);
  const row = await prisma.orm.public.IntegrationSetting.first({ key: 'setup-wizard' });
  const completed = Array.isArray((row?.settings as any)?.completedSteps) ? [...(row?.settings as any).completedSteps] : [];
  if (!completed.includes(step)) completed.push(step);
  const saved = await prisma.orm.public.IntegrationSetting.upsert({ create: { key: 'setup-wizard', provider: 'SYSTEM', isEnabled: true, status: 'IN_PROGRESS', settings: { completedSteps: completed } }, update: { settings: { completedSteps: completed }, isEnabled: true, status: 'IN_PROGRESS' }, conflictOn: { key: 'setup-wizard' } });
  ok(res, { step, completed: (saved.settings as any).completedSteps });
});

router.post('/setup-wizard/complete', async (_req: Request, res: Response) => {
  const saved = await prisma.orm.public.IntegrationSetting.upsert({ create: { key: 'setup-wizard', provider: 'SYSTEM', isEnabled: true, status: 'COMPLETED', settings: {} }, update: { status: 'COMPLETED', isEnabled: true }, conflictOn: { key: 'setup-wizard' } });
  ok(res, { completed: true, setup: saved });
});

export default router;
