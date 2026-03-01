import { prisma } from '../../config/database';
import { parseDateOrThrow } from '../../utils/date';
import { buildSequentialNumberFromLatest } from '../../utils/id-generator';
import { Errors } from '../../utils/response';
import { applyLedgerLines } from '../shared/ledger';
import { resolvePostingAccounts } from '../shared/posting-accounts';

async function generateNumber(type: 'SALES' | 'PURCHASE', docDate: Date): Promise<string> {
  const year = docDate.getUTCFullYear();
  const prefix = type === 'SALES' ? 'INV' : 'PINV';
  const latest = await prisma.invoice.findFirst({
    where: {
      type,
      date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
      number: { startsWith: `${prefix}-${year}-` }
    },
    select: { number: true },
    orderBy: { id: 'desc' }
  });
  return buildSequentialNumberFromLatest(prefix, latest?.number, year);
}

function calcLines(lines: any[]) {
  let subtotal = 0;
  let discount = 0;
  let taxableAmount = 0;
  let vatAmount = 0;

  const mapped = lines.map((line, index) => {
    const lineDiscount = Number(line.discount ?? 0);
    const taxRate = Number(line.taxRate ?? 15);
    const qty = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    const gross = qty * unitPrice;
    const net = gross - lineDiscount;
    const tax = (net * taxRate) / 100;

    subtotal += gross;
    discount += lineDiscount;
    taxableAmount += net;
    vatAmount += tax;

    return {
      lineNumber: index + 1,
      itemId: line.itemId ? Number(line.itemId) : null,
      description: line.description,
      quantity: qty,
      unitPrice,
      discount: lineDiscount,
      taxRate,
      taxAmount: tax,
      total: net + tax,
      accountId: line.accountId
    };
  });

  const total = taxableAmount + vatAmount;

  return { mapped, subtotal, discount, taxableAmount, vatAmount, total };
}

async function createJournalForInvoice(tx: any, invoice: any, userId: number) {
  const date = new Date(invoice.date);
  const period = await tx.accountingPeriod.findFirst({
    where: { startDate: { lte: date }, endDate: { gte: date }, status: 'OPEN', canPost: true },
    include: { fiscalYear: true }
  });
  if (!period || period.fiscalYear.status !== 'OPEN') throw Errors.business('لا توجد فترة محاسبية مفتوحة لإصدار الفاتورة');

  const year = date.getUTCFullYear();
  const latestEntry = await tx.journalEntry.findFirst({
    where: { entryNumber: { startsWith: `INVJ-${year}-` } },
    select: { entryNumber: true },
    orderBy: { id: 'desc' }
  });
  const entryNumber = buildSequentialNumberFromLatest('INVJ', latestEntry?.entryNumber, year);
  const accounts = await resolvePostingAccounts(tx);

  const lines = invoice.type === 'SALES'
    ? [
        { accountId: accounts.receivableAccountId, debit: Number(invoice.total), credit: 0, description: `من ح/ العملاء - ${invoice.number}` },
        {
          accountId: accounts.salesRevenueAccountId,
          debit: 0,
          credit: Number(invoice.taxableAmount),
          description: `إلى ح/ إيراد المبيعات - ${invoice.number}`
        },
        { accountId: accounts.vatLiabilityAccountId, debit: 0, credit: Number(invoice.vatAmount), description: `إلى ح/ ضريبة مستحقة - ${invoice.number}` }
      ]
    : [
        {
          accountId: accounts.purchaseExpenseAccountId,
          debit: Number(invoice.taxableAmount),
          credit: 0,
          description: `من ح/ مصروفات - ${invoice.number}`
        },
        {
          accountId: accounts.vatRecoverableAccountId,
          debit: Number(invoice.vatAmount),
          credit: 0,
          description: `من ح/ ضريبة قابلة للاسترداد - ${invoice.number}`
        },
        { accountId: accounts.payableAccountId, debit: 0, credit: Number(invoice.total), description: `إلى ح/ الموردين - ${invoice.number}` }
      ];

  const entry = await tx.journalEntry.create({
    data: {
      entryNumber,
      date,
      periodId: period.id,
      description: `قيد فاتورة ${invoice.number}`,
      reference: invoice.number,
      source: invoice.type === 'SALES' ? 'SALES' : 'PURCHASE',
      status: 'POSTED',
      totalDebit: Number(invoice.total),
      totalCredit: Number(invoice.total),
      createdById: userId,
      postedById: userId,
      postedAt: new Date()
    }
  });

  await tx.journalLine.createMany({
    data: lines.map((l: any, idx: number) => ({
      entryId: entry.id,
      lineNumber: idx + 1,
      accountId: l.accountId,
      description: l.description,
      debit: l.debit,
      credit: l.credit
    }))
  });

  await applyLedgerLines(tx, date, period.number, lines);

  return entry;
}

export async function createInvoice(data: any, userId: number) {
  if (data.type === 'SALES' && !data.customerId) throw Errors.validation('يجب تحديد العميل لفاتورة المبيعات');
  if (data.type === 'PURCHASE' && !data.supplierId) throw Errors.validation('يجب تحديد المورد لفاتورة المشتريات');

  const invoiceDate = parseDateOrThrow(data.date);
  const calc = calcLines(data.lines);
  const number = await generateNumber(data.type, invoiceDate);

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        number,
        type: data.type,
        customerId: data.customerId,
        supplierId: data.supplierId,
        date: invoiceDate,
        dueDate: data.dueDate ? parseDateOrThrow(data.dueDate, 'dueDate') : null,
        projectId: data.projectId,
        notes: data.notes,
        subtotal: calc.subtotal,
        discount: calc.discount,
        taxableAmount: calc.taxableAmount,
        vatAmount: calc.vatAmount,
        total: calc.total,
        paidAmount: 0,
        outstanding: calc.total,
        status: 'DRAFT',
        paymentStatus: 'PENDING',
        createdById: userId
      }
    });

    await tx.invoiceLine.createMany({
      data: calc.mapped.map((line) => ({ ...line, invoiceId: invoice.id }))
    });

    return invoice;
  });
}

export async function issueInvoice(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id }, include: { lines: true } });
    if (!invoice) throw Errors.notFound('الفاتورة غير موجودة');
    if (invoice.status !== 'DRAFT') throw Errors.business('يمكن إصدار الفواتير المسودة فقط');

    const entry = await createJournalForInvoice(tx, invoice, userId);

    const updated = await tx.invoice.update({
      where: { id },
      data: {
        status: 'ISSUED',
        journalEntryId: entry.id
      }
    });

    return updated;
  });
}

export async function updateInvoice(id: number, data: any) {
  const current = await prisma.invoice.findUnique({ where: { id }, include: { lines: true } });
  if (!current) throw Errors.notFound('الفاتورة غير موجودة');
  if (current.status !== 'DRAFT') throw Errors.business('لا يمكن تعديل فاتورة بعد الإصدار');

  return prisma.$transaction(async (tx) => {
    const nextLines = data.lines ?? current.lines.map((l) => ({
      itemId: l.itemId,
      description: l.description,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      discount: Number(l.discount),
      taxRate: Number(l.taxRate),
      accountId: l.accountId
    }));

    const calc = calcLines(nextLines);

    const invoice = await tx.invoice.update({
      where: { id },
      data: {
        type: data.type ?? current.type,
        customerId: data.customerId ?? current.customerId,
        supplierId: data.supplierId ?? current.supplierId,
        date: data.date ? parseDateOrThrow(data.date) : current.date,
        dueDate: data.dueDate ? parseDateOrThrow(data.dueDate, 'dueDate') : current.dueDate,
        projectId: data.projectId ?? current.projectId,
        notes: data.notes ?? current.notes,
        subtotal: calc.subtotal,
        discount: calc.discount,
        taxableAmount: calc.taxableAmount,
        vatAmount: calc.vatAmount,
        total: calc.total,
        outstanding: calc.total
      }
    });

    if (data.lines) {
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceLine.createMany({
        data: calc.mapped.map((line) => ({ ...line, invoiceId: id }))
      });
    }

    return invoice;
  });
}

export async function cancelInvoice(id: number, reason?: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw Errors.notFound('الفاتورة غير موجودة');
  if (invoice.status === 'CANCELLED') throw Errors.business('الفاتورة ملغاة مسبقًا');
  if (Number(invoice.paidAmount) > 0) throw Errors.business('لا يمكن إلغاء فاتورة مدفوعة جزئيًا/كليًا');

  return prisma.invoice.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      notes: reason ? `${invoice.notes ?? ''}\nإلغاء: ${reason}`.trim() : invoice.notes
    }
  });
}

export async function deleteInvoice(id: number) {
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw Errors.notFound('الفاتورة غير موجودة');
  if (invoice.status !== 'DRAFT') throw Errors.business('يمكن حذف الفاتورة المسودة فقط');
  await prisma.invoice.delete({ where: { id } });
  return { deleted: true, id };
}

export async function listInvoices(query: any) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  const skip = (page - 1) * limit;

  const where: any = {};
  if (query.type) where.type = query.type;
  if (query.status) where.status = query.status;
  if (query.customerId) where.customerId = Number(query.customerId);
  if (query.supplierId) where.supplierId = Number(query.supplierId);

  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      skip,
      take: limit,
      include: { customer: true, supplier: true, lines: true, createdBy: true },
      orderBy: [{ date: 'desc' }, { id: 'desc' }]
    }),
    prisma.invoice.count({ where })
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
