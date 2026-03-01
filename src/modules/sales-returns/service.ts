import { prisma } from '../../config/database';
import { buildSequentialNumber, buildSequentialNumberFromLatest } from '../../utils/id-generator';
import { Errors } from '../../utils/response';
import { applyLedgerLines } from '../shared/ledger';
import { resolvePostingAccounts } from '../shared/posting-accounts';

async function generateReturnNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const count = await prisma.salesReturn.count({
    where: {
      date: {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1))
      }
    }
  });
  return buildSequentialNumber('RTN', count, year);
}

function calcReturnLines(lines: any[]) {
  let subtotal = 0;
  let discount = 0;
  let taxAmount = 0;

  const mapped = lines.map((line, index) => {
    const lineDiscount = Number(line.discount ?? 0);
    const taxRate = Number(line.taxRate ?? 15);
    const qty = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    const gross = qty * unitPrice;
    const net = gross - lineDiscount;
    const tax = (net * taxRate) / 100;

    subtotal += net;
    discount += lineDiscount;
    taxAmount += tax;

    return {
      lineNumber: index + 1,
      description: line.description,
      quantity: qty,
      unitPrice,
      discount: lineDiscount,
      taxRate,
      taxAmount: tax,
      total: net + tax,
      invoiceLineId: line.invoiceLineId
    };
  });

  const total = subtotal + taxAmount;
  return { mapped, subtotal, discount, taxAmount, total };
}

async function createJournalForReturn(tx: any, returnDoc: any, userId: number) {
  const date = new Date(returnDoc.date);
  const period = await tx.accountingPeriod.findFirst({
    where: { startDate: { lte: date }, endDate: { gte: date }, status: 'OPEN', canPost: true },
    include: { fiscalYear: true }
  });
  if (!period || period.fiscalYear.status !== 'OPEN') throw Errors.business('لا توجد فترة محاسبية مفتوحة');
  const accounts = await resolvePostingAccounts(tx);

  const lines = [
    { accountId: accounts.receivableAccountId, debit: Number(returnDoc.total), credit: 0, description: `من ح/ العملاء - مرتجع ${returnDoc.number}` },
    {
      accountId: accounts.salesRevenueAccountId,
      debit: 0,
      credit: Number(returnDoc.subtotal),
      description: `إلى ح/ إيراد المبيعات - مرتجع ${returnDoc.number}`
    },
    {
      accountId: accounts.vatLiabilityAccountId,
      debit: 0,
      credit: Number(returnDoc.taxAmount),
      description: `إلى ح/ ضريبة مستحقة - مرتجع ${returnDoc.number}`
    }
  ];

  const year = date.getUTCFullYear();
  const latestEntry = await tx.journalEntry.findFirst({
    where: { entryNumber: { startsWith: `RETJ-${year}-` } },
    select: { entryNumber: true },
    orderBy: { id: 'desc' }
  });
  const entryNumber = buildSequentialNumberFromLatest('RETJ', latestEntry?.entryNumber, year);

  const entry = await tx.journalEntry.create({
    data: {
      entryNumber,
      date,
      periodId: period.id,
      description: `قيد مرتجع ${returnDoc.number}`,
      reference: returnDoc.number,
      source: 'SALES',
      status: 'POSTED',
      totalDebit: Number(returnDoc.total),
      totalCredit: Number(returnDoc.total),
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

export async function createSalesReturn(data: any, userId: number) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: Number(data.invoiceId) },
    include: { customer: true }
  });
  if (!invoice) throw Errors.notFound('الفاتورة غير موجودة');
  if (invoice.type !== 'SALES') throw Errors.business('يمكن إرجاع فواتير المبيعات فقط');
  if (invoice.status !== 'ISSUED') throw Errors.business('لا يمكن إرجاع فاتورة غير صادرة');

  const calc = calcReturnLines(data.lines || []);
  if (calc.total > Number(invoice.outstanding)) {
    throw Errors.business('مبلغ المرتجع يتجاوز المبلغ المستحق في الفاتورة');
  }

  const number = await generateReturnNumber();
  return prisma.salesReturn.create({
    data: {
      number,
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      date: data.date ? new Date(data.date) : new Date(),
      subtotal: calc.subtotal,
      taxAmount: calc.taxAmount,
      total: calc.total,
      reason: data.reason,
      lines: calc.mapped
    }
  });
}

export async function approveSalesReturn(id: number, userId: number) {
  const returnDoc = await prisma.salesReturn.findUnique({ where: { id } });
  if (!returnDoc) throw Errors.notFound('المرتجع غير موجود');
  if (returnDoc.status !== 'DRAFT') throw Errors.business('يمكن اعتماد المسودة فقط');

  return prisma.$transaction(async (tx) => {
    const approved = await tx.salesReturn.update({
      where: { id },
      data: { status: 'APPROVED' }
    });

    await createJournalForReturn(tx, approved, userId);

    if (approved.invoiceId) {
      const invoice = await tx.invoice.findUnique({ where: { id: approved.invoiceId } });
      if (invoice) {
        const paidAmount = Number(invoice.paidAmount) + Number(approved.total);
        const outstanding = Math.max(0, Number(invoice.outstanding) - Number(approved.total));
        const status = outstanding <= 0.01 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : invoice.status;
        const paymentStatus = outstanding <= 0.01 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'PENDING';
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { paidAmount, outstanding, status, paymentStatus }
        });
      }
    }

    return approved;
  });
}

export async function listSalesReturns(query: any) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  const skip = (page - 1) * limit;

  const where: any = {};
  if (query.customerId) where.customerId = Number(query.customerId);
  if (query.invoiceId) where.invoiceId = Number(query.invoiceId);
  if (query.status) where.status = query.status;

  const [rows, total] = await Promise.all([
    prisma.salesReturn.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ date: 'desc' }]
    }),
    prisma.salesReturn.count({ where })
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

export async function getSalesReturn(id: number) {
  const returnDoc = await prisma.salesReturn.findUnique({ where: { id } });
  if (!returnDoc) throw Errors.notFound('المرتجع غير موجود');
  return returnDoc;
}

export async function deleteSalesReturn(id: number) {
  const returnDoc = await prisma.salesReturn.findUnique({ where: { id } });
  if (!returnDoc) throw Errors.notFound('المرتجع غير موجود');
  if (returnDoc.status !== 'DRAFT') throw Errors.business('يمكن حذف المسودة فقط');

  await prisma.salesReturn.delete({ where: { id } });
  return { deleted: true, id };
}
