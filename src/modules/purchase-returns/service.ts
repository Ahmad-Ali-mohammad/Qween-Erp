import { prisma } from '../../config/database';
import { buildSequentialNumber, buildSequentialNumberFromLatest } from '../../utils/id-generator';
import { Errors } from '../../utils/response';
import { applyLedgerLines } from '../shared/ledger';
import { resolvePostingAccounts } from '../shared/posting-accounts';

function calcReturnLines(lines: any[]) {
  let subtotal = 0;
  let taxAmount = 0;

  const mapped = lines.map((line, index) => {
    const qty = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    const discount = Number(line.discount ?? 0);
    const taxRate = Number(line.taxRate ?? 15);
    const gross = qty * unitPrice;
    const net = gross - discount;
    const tax = (net * taxRate) / 100;
    subtotal += net;
    taxAmount += tax;

    return {
      lineNumber: index + 1,
      description: line.description,
      quantity: qty,
      unitPrice,
      discount,
      taxRate,
      taxAmount: tax,
      total: net + tax,
      invoiceLineId: line.invoiceLineId
    };
  });

  return { mapped, subtotal, taxAmount, total: subtotal + taxAmount };
}

async function generatePurchaseReturnNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const count = await (prisma as any).purchaseReturn.count({
    where: { date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } }
  });
  return buildSequentialNumber('PRTN', count, year);
}

async function createJournalForPurchaseReturn(tx: any, purchaseReturn: any, userId: number) {
  const date = new Date(purchaseReturn.date);
  const period = await tx.accountingPeriod.findFirst({
    where: { startDate: { lte: date }, endDate: { gte: date }, status: 'OPEN', canPost: true },
    include: { fiscalYear: true }
  });
  if (!period || period.fiscalYear.status !== 'OPEN') throw Errors.business('لا توجد فترة محاسبية مفتوحة');
  const accounts = await resolvePostingAccounts(tx);

  const lines = [
    { accountId: accounts.payableAccountId, debit: Number(purchaseReturn.total), credit: 0, description: `من ح/ الموردين - مرتجع ${purchaseReturn.number}` },
    {
      accountId: accounts.purchaseExpenseAccountId,
      debit: 0,
      credit: Number(purchaseReturn.subtotal),
      description: `إلى ح/ مصروفات المشتريات - مرتجع ${purchaseReturn.number}`
    },
    {
      accountId: accounts.vatRecoverableAccountId,
      debit: 0,
      credit: Number(purchaseReturn.taxAmount),
      description: `إلى ح/ ضريبة مدخلات - مرتجع ${purchaseReturn.number}`
    }
  ];

  const year = date.getUTCFullYear();
  const latestEntry = await tx.journalEntry.findFirst({
    where: { entryNumber: { startsWith: `PRTJ-${year}-` } },
    select: { entryNumber: true },
    orderBy: { id: 'desc' }
  });
  const entryNumber = buildSequentialNumberFromLatest('PRTJ', latestEntry?.entryNumber, year);
  const entry = await tx.journalEntry.create({
    data: {
      entryNumber,
      date,
      periodId: period.id,
      description: `قيد مرتجع مشتريات ${purchaseReturn.number}`,
      reference: purchaseReturn.number,
      source: 'PURCHASE',
      status: 'POSTED',
      totalDebit: Number(purchaseReturn.total),
      totalCredit: Number(purchaseReturn.total),
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

export async function createPurchaseReturn(data: any) {
  const invoice = await prisma.invoice.findUnique({ where: { id: Number(data.invoiceId) } });
  if (!invoice) throw Errors.notFound('الفاتورة غير موجودة');
  if (invoice.type !== 'PURCHASE') throw Errors.business('يمكن إرجاع فواتير الشراء فقط');
  if (invoice.status !== 'ISSUED') throw Errors.business('يمكن إرجاع فواتير شراء صادرة فقط');

  const calc = calcReturnLines(data.lines || []);
  if (calc.total > Number(invoice.outstanding)) {
    throw Errors.business('مبلغ مرتجع الشراء يتجاوز المبلغ المستحق في الفاتورة');
  }

  const number = await generatePurchaseReturnNumber();
  return (prisma as any).purchaseReturn.create({
    data: {
      number,
      date: data.date ? new Date(data.date) : new Date(),
      supplierId: invoice.supplierId,
      invoiceId: invoice.id,
      status: 'DRAFT',
      subtotal: calc.subtotal,
      taxAmount: calc.taxAmount,
      total: calc.total,
      reason: data.reason,
      lines: calc.mapped
    }
  });
}

export async function approvePurchaseReturn(id: number, userId: number) {
  const current = await (prisma as any).purchaseReturn.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('مرتجع الشراء غير موجود');
  if (current.status !== 'DRAFT') throw Errors.business('يمكن اعتماد مسودة مرتجع الشراء فقط');

  return prisma.$transaction(async (tx) => {
    const approved = await (tx as any).purchaseReturn.update({
      where: { id },
      data: { status: 'APPROVED' }
    });
    const entry = await createJournalForPurchaseReturn(tx, approved, userId);

    if (approved.invoiceId) {
      const invoice = await tx.invoice.findUnique({ where: { id: approved.invoiceId } });
      if (invoice) {
        const paidAmount = Number(invoice.paidAmount) + Number(approved.total);
        const outstanding = Math.max(0, Number(invoice.outstanding) - Number(approved.total));
        const status = outstanding <= 0.01 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : invoice.status;
        const paymentStatus = outstanding <= 0.01 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'PENDING';
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount,
            outstanding,
            status,
            paymentStatus
          }
        });
      }
    }

    await (tx as any).purchaseReturn.update({
      where: { id },
      data: { journalEntryId: entry.id }
    });

    return approved;
  });
}

export async function listPurchaseReturns(query: any) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  const skip = (page - 1) * limit;
  const where: any = {};
  if (query.supplierId) where.supplierId = Number(query.supplierId);
  if (query.invoiceId) where.invoiceId = Number(query.invoiceId);
  if (query.status) where.status = query.status;

  const [rows, total] = await Promise.all([
    (prisma as any).purchaseReturn.findMany({ where, skip, take: limit, orderBy: [{ date: 'desc' }, { id: 'desc' }] }),
    (prisma as any).purchaseReturn.count({ where })
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

export async function getPurchaseReturn(id: number) {
  const row = await (prisma as any).purchaseReturn.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('مرتجع الشراء غير موجود');
  return row;
}

export async function deletePurchaseReturn(id: number) {
  const row = await (prisma as any).purchaseReturn.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('مرتجع الشراء غير موجود');
  if (row.status !== 'DRAFT') throw Errors.business('يمكن حذف المسودة فقط');
  await (prisma as any).purchaseReturn.delete({ where: { id } });
  return { deleted: true, id };
}
