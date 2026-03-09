import { prisma } from '../../config/database';
import { parseDateOrThrow } from '../../utils/date';
import { buildSequentialNumber, buildSequentialNumberFromLatest } from '../../utils/id-generator';
import { Errors } from '../../utils/response';
import { applyLedgerLines } from '../shared/ledger';
import { resolvePostingAccounts } from '../shared/posting-accounts';

async function generateNumber(type: 'RECEIPT' | 'PAYMENT') {
  const year = new Date().getUTCFullYear();
  const count = await prisma.payment.count({
    where: {
      type,
      date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) }
    }
  });
  return buildSequentialNumber(type === 'RECEIPT' ? 'RCV' : 'PAY', count, year);
}

function normalizeAllocations(raw: Array<{ invoiceId: number; amount: number }>) {
  const totals = new Map<number, number>();
  for (const row of raw) {
    const invoiceId = Number(row.invoiceId);
    const amount = Number(row.amount);
    if (!Number.isFinite(invoiceId) || invoiceId <= 0) throw Errors.validation('invoiceId غير صالح');
    if (!Number.isFinite(amount) || amount <= 0) throw Errors.validation('amount يجب أن يكون أكبر من صفر');
    totals.set(invoiceId, (totals.get(invoiceId) ?? 0) + amount);
  }
  return Array.from(totals.entries()).map(([invoiceId, amount]) => ({ invoiceId, amount }));
}

async function createJournalForPayment(tx: any, payment: any, userId: number) {
  const date = new Date(payment.date);
  const period = await tx.accountingPeriod.findFirst({
    where: { startDate: { lte: date }, endDate: { gte: date }, status: 'OPEN', canPost: true },
    include: { fiscalYear: true }
  });
  if (!period || period.fiscalYear.status !== 'OPEN') throw Errors.business('لا توجد فترة مفتوحة لإنهاء السند');
  const accounts = await resolvePostingAccounts(tx);

  let cashAccountId = accounts.cashAccountId;
  if (payment.bankId) {
    const bank = await tx.bankAccount.findUnique({ where: { id: payment.bankId } });
    if (bank?.glAccountId) cashAccountId = bank.glAccountId;
  }

  const lines = payment.type === 'RECEIPT'
    ? [
        { accountId: cashAccountId, debit: Number(payment.amount), credit: 0, description: `من ح/ النقدية - ${payment.number}` },
        { accountId: accounts.receivableAccountId, debit: 0, credit: Number(payment.amount), description: `إلى ح/ العملاء - ${payment.number}` }
      ]
    : [
        { accountId: accounts.payableAccountId, debit: Number(payment.amount), credit: 0, description: `من ح/ الموردين - ${payment.number}` },
        { accountId: cashAccountId, debit: 0, credit: Number(payment.amount), description: `إلى ح/ النقدية - ${payment.number}` }
      ];

  const year = date.getUTCFullYear();
  const latestEntry = await tx.journalEntry.findFirst({
    where: { entryNumber: { startsWith: `PAYJ-${year}-` } },
    select: { entryNumber: true },
    orderBy: { id: 'desc' }
  });
  const entryNumber = buildSequentialNumberFromLatest('PAYJ', latestEntry?.entryNumber, year);

  const entry = await tx.journalEntry.create({
    data: {
      entryNumber,
      date,
      periodId: period.id,
      description: `قيد سند ${payment.number}`,
      reference: payment.number,
      source: 'MANUAL',
      status: 'POSTED',
      totalDebit: Number(payment.amount),
      totalCredit: Number(payment.amount),
      createdById: userId,
      postedById: userId,
      postedAt: new Date()
    }
  });

  await tx.journalLine.createMany({
    data: lines.map((line: any, idx: number) => ({
      entryId: entry.id,
      lineNumber: idx + 1,
      accountId: line.accountId,
      description: line.description,
      debit: line.debit,
      credit: line.credit
    }))
  });

  await applyLedgerLines(tx, date, period.number, lines);

  return entry;
}

async function applyAllocations(tx: any, paymentId: number, allocations: Array<{ invoiceId: number; amount: number }>) {
  const payment = await tx.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw Errors.notFound('السند غير موجود');

  for (const alloc of allocations) {
    const invoice = await tx.invoice.findUnique({ where: { id: alloc.invoiceId } });
    if (!invoice) throw Errors.notFound('الفاتورة غير موجودة');

    const sameEntity =
      payment.type === 'RECEIPT'
        ? invoice.type === 'SALES' && payment.customerId != null && invoice.customerId === payment.customerId
        : invoice.type === 'PURCHASE' && payment.supplierId != null && invoice.supplierId === payment.supplierId;
    if (!sameEntity) throw Errors.business('لا يمكن توزيع السند على فاتورة لا تخص نفس الكيان');

    if (Number(alloc.amount) - Number(invoice.outstanding) > 0.01) {
      throw Errors.business('مبلغ التوزيع يتجاوز المستحق على الفاتورة');
    }

    await tx.paymentAllocation.upsert({
      where: {
        paymentId_invoiceId: {
          paymentId,
          invoiceId: alloc.invoiceId
        }
      },
      update: { amount: alloc.amount },
      create: { paymentId, invoiceId: alloc.invoiceId, amount: alloc.amount }
    });

    const paidAmount = Number(invoice.paidAmount) + alloc.amount;
    const outstanding = Math.max(0, Number(invoice.total) - paidAmount);
    const status = outstanding <= 0.01 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : invoice.status;
    const paymentStatus = outstanding <= 0.01 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'PENDING';

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { paidAmount, outstanding, status, paymentStatus }
    });
  }
}

export async function createPayment(data: any, userId: number) {
  if (data.type === 'RECEIPT' && !data.customerId) throw Errors.validation('سند القبض يتطلب عميلًا');
  if (data.type === 'PAYMENT' && !data.supplierId) throw Errors.validation('سند الصرف يتطلب موردًا');

  const number = await generateNumber(data.type);

  return prisma.payment.create({
    data: {
      number,
      date: parseDateOrThrow(data.date),
      type: data.type,
      method: data.method,
      amount: data.amount,
      customerId: data.customerId,
      supplierId: data.supplierId,
      bankId: data.bankId,
      checkNumber: data.checkNumber,
      checkDate: data.checkDate ? parseDateOrThrow(data.checkDate, 'checkDate') : null,
      checkBank: data.checkBank,
      description: data.description,
      notes: data.notes,
      status: 'PENDING',
      createdById: userId
    }
  });
}

export async function completePayment(id: number, userId: number, allocations: Array<{ invoiceId: number; amount: number }> = []) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id } });
    if (!payment) throw Errors.notFound('السند غير موجود');
    if (payment.status !== 'PENDING') throw Errors.business('يمكن إكمال السند المعلق فقط');

    let effectiveAllocations = allocations;
    if (!effectiveAllocations.length) {
      const saved = await tx.paymentAllocation.findMany({ where: { paymentId: payment.id } });
      effectiveAllocations = saved.map((row: any) => ({ invoiceId: row.invoiceId, amount: Number(row.amount) }));
    }

    const normalizedAllocations = normalizeAllocations(effectiveAllocations);
    const allocatedTotal = normalizedAllocations.reduce((sum, row) => sum + Number(row.amount), 0);
    if (allocatedTotal - Number(payment.amount) > 0.01) {
      throw Errors.business('إجمالي التوزيع يتجاوز مبلغ السند');
    }

    await applyAllocations(tx, payment.id, normalizedAllocations);
    const entry = await createJournalForPayment(tx, payment, userId);

    return tx.payment.update({
      where: { id },
      data: { status: 'COMPLETED', journalEntryId: entry.id },
      include: { allocations: true }
    });
  }, { maxWait: 10000, timeout: 60000 });
}

export async function cancelPayment(id: number, reason?: string) {
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw Errors.notFound('السند غير موجود');
  if (payment.status === 'COMPLETED') throw Errors.business('لا يمكن إلغاء سند مكتمل');

  return prisma.payment.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      notes: reason ? `${payment.notes ?? ''}\nإلغاء: ${reason}`.trim() : payment.notes
    }
  });
}

export async function updatePayment(id: number, data: any) {
  const current = await prisma.payment.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('السند غير موجود');
  if (current.status !== 'PENDING') throw Errors.business('يمكن تعديل السند المعلق فقط');

  return prisma.payment.update({
    where: { id },
    data: {
      ...data,
      date: data.date ? parseDateOrThrow(data.date) : current.date,
      checkDate: data.checkDate ? parseDateOrThrow(data.checkDate, 'checkDate') : current.checkDate
    }
  });
}

export async function deletePayment(id: number) {
  const current = await prisma.payment.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('السند غير موجود');
  if (current.status !== 'PENDING') throw Errors.business('يمكن حذف السند المعلق فقط');
  await prisma.payment.delete({ where: { id } });
  return { deleted: true, id };
}

export async function listPayments(query: any) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  const skip = (page - 1) * limit;

  const where: any = {};
  if (query.type) where.type = query.type;
  if (query.status) where.status = query.status;

  const [rows, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      skip,
      take: limit,
      include: { customer: true, supplier: true, bank: true, allocations: { include: { invoice: true } }, createdBy: true },
      orderBy: [{ date: 'desc' }, { id: 'desc' }]
    }),
    prisma.payment.count({ where })
  ]);

  return {
    rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit))
    }
  };
}
