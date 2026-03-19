import { prisma } from '../../config/database';
import { buildSequentialNumber } from '../../utils/id-generator';
import { Errors } from '../../utils/response';
import * as invoiceService from '../invoices/service';

async function generateQuoteNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const count = await prisma.salesQuote.count({
    where: {
      date: {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1))
      }
    }
  });
  return buildSequentialNumber('QUOT', count, year);
}

function calcQuoteLines(lines: any[]) {
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

    subtotal += gross;
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
      total: net + tax
    };
  });

  const total = subtotal - discount + taxAmount;

  return { mapped, subtotal, discount, taxAmount, total };
}

async function attachCustomers(quotes: any[]) {
  const customerIds = Array.from(new Set(quotes.map((quote) => Number(quote.customerId)).filter((id) => Number.isInteger(id) && id > 0)));
  if (!customerIds.length) return quotes;

  const customers = await prisma.customer.findMany({
    where: { id: { in: customerIds } },
    select: { id: true, code: true, nameAr: true }
  });
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));

  return quotes.map((quote) => ({
    ...quote,
    customer: quote.customerId ? customerMap.get(Number(quote.customerId)) ?? null : null
  }));
}

export async function createQuote(data: any, userId: number) {
  if (!data.customerId) throw Errors.validation('يجب تحديد العميل لعرض السعر');

  const calc = calcQuoteLines(data.lines);
  const number = await generateQuoteNumber();

  return prisma.salesQuote.create({
    data: {
      number,
      customerId: data.customerId,
      date: new Date(),
      validUntil: data.validUntil ? new Date(data.validUntil) : null,
      subtotal: calc.subtotal,
      discount: calc.discount,
      taxAmount: calc.taxAmount,
      total: calc.total,
      notes: data.notes,
      lines: calc.mapped
    }
  });
}

export async function updateQuote(id: number, data: any) {
  const quote = await prisma.salesQuote.findUnique({
    where: { id }
    // include: { customer: true } as any // Removed due to Prisma client generation issues
  });
  if (!quote) throw Errors.notFound('عرض السعر غير موجود');
  if (quote.status !== 'DRAFT') throw Errors.business('يمكن تعديل المسودة فقط');

  const calc = calcQuoteLines(data.lines ?? quote.lines);

  return prisma.salesQuote.update({
    where: { id },
    data: {
      validUntil: data.validUntil ? new Date(data.validUntil) : quote.validUntil,
      subtotal: calc.subtotal,
      discount: calc.discount,
      taxAmount: calc.taxAmount,
      total: calc.total,
      notes: data.notes ?? quote.notes,
      lines: calc.mapped
    }
  });
}

export async function listQuotes(query: any) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  const skip = (page - 1) * limit;

  const where: any = {};
  if (query.customerId) where.customerId = Number(query.customerId);
  if (query.status) where.status = query.status;
  if (query.dateFrom || query.dateTo) {
    where.date = {};
    if (query.dateFrom) where.date.gte = new Date(query.dateFrom);
    if (query.dateTo) where.date.lte = new Date(query.dateTo);
  }

  const [rows, total] = await Promise.all([
    prisma.salesQuote.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ date: 'desc' }]
    }),
    prisma.salesQuote.count({ where })
  ]);

  const rowsWithCustomers = await attachCustomers(rows);

  return {
    rows: rowsWithCustomers,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit))
    }
  };
}

export async function getQuote(id: number) {
  const quote = await prisma.salesQuote.findUnique({
    where: { id }
  });
  if (!quote) throw Errors.notFound('عرض السعر غير موجود');

  const [quoteWithCustomer] = await attachCustomers([quote]);
  return quoteWithCustomer;
}

export async function sendQuote(id: number, userId: number) {
  const quote = await prisma.salesQuote.findUnique({
    where: { id }
  });
  if (!quote) throw Errors.notFound('عرض السعر غير موجود');
  if (quote.status !== 'DRAFT') throw Errors.business('يمكن إرسال المسودة فقط');

  return prisma.salesQuote.update({
    where: { id },
    data: {
      status: 'SENT'
    }
  });
}

export async function convertToInvoice(id: number, userId: number) {
  const quote = await prisma.salesQuote.findUnique({
    where: { id }
  });
  if (!quote) throw Errors.notFound('عرض السعر غير موجود');
  if (quote.status !== 'SENT' && quote.status !== 'ACCEPTED') throw Errors.business('يمكن تحويل العرض المرسل أو المقبول فقط');
  if (!quote.customerId) throw Errors.business('عرض السعر لا يحتوي على عميل صالح للتحويل');

  const lines = Array.isArray(quote.lines) ? quote.lines : [];
  if (!lines.length) throw Errors.business('لا يمكن تحويل عرض بدون بنود');

  const invoice = await invoiceService.createInvoice(
    {
      type: 'SALES',
      customerId: quote.customerId,
      date: new Date(quote.date).toISOString().slice(0, 10),
      dueDate: quote.validUntil ? new Date(quote.validUntil).toISOString().slice(0, 10) : undefined,
      notes: [quote.notes, `محول من عرض السعر ${quote.number}`].filter(Boolean).join('\n'),
      lines: lines.map((line: any) => ({
        description: line.description,
        quantity: Number(line.quantity || 0),
        unitPrice: Number(line.unitPrice || 0),
        discount: Number(line.discount || 0),
        taxRate: Number(line.taxRate || 15)
      }))
    },
    userId
  );

  const updatedQuote = await prisma.salesQuote.update({
    where: { id },
    data: {
      status: 'CONVERTED'
    }
  });

  return {
    ...updatedQuote,
    invoiceId: invoice.id,
    invoiceNumber: invoice.number
  };
}

export async function updateQuoteStatus(id: number, status: string) {
  const validStatuses = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED'];
  if (!validStatuses.includes(status)) throw Errors.validation('حالة غير صحيحة');

  const quote = await prisma.salesQuote.findUnique({ where: { id } });
  if (!quote) throw Errors.notFound('عرض السعر غير موجود');

  return prisma.salesQuote.update({
    where: { id },
    data: { status }
  });
}

export async function deleteQuote(id: number) {
  const quote = await prisma.salesQuote.findUnique({ where: { id } });
  if (!quote) throw Errors.notFound('عرض السعر غير موجود');
  if (quote.status !== 'DRAFT') throw Errors.business('يمكن حذف المسودة فقط');

  await prisma.salesQuote.delete({ where: { id } });
  return { deleted: true, id };
}
