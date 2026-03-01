import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { buildSequentialNumber } from '../../utils/id-generator';
import { Errors } from '../../utils/response';

async function generateCustomerCode(): Promise<string> {
  const count = await prisma.customer.count();
  return buildSequentialNumber('CUST', count, new Date().getUTCFullYear());
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s === '' ? undefined : s;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['true', '1', 'on', 'yes'].includes(value.toLowerCase());
  return fallback;
}

export async function createCustomer(data: any) {
  const nameAr = toNullableString(data.nameAr) || toNullableString(data.name);
  if (!nameAr) throw Errors.validation('اسم العميل مطلوب');

  if (data.taxNumber) {
    const existing = await prisma.customer.findFirst({ where: { taxNumber: String(data.taxNumber) } });
    if (existing) throw Errors.business('رقم الضريبي موجود مسبقًا');
  }

  const code = toNullableString(data.code) || (await generateCustomerCode());
  return prisma.customer.create({
    data: {
      code,
      nameAr,
      nameEn: toNullableString(data.nameEn),
      taxNumber: toNullableString(data.taxNumber),
      phone: toNullableString(data.phone),
      mobile: toNullableString(data.mobile),
      email: toNullableString(data.email),
      address: toNullableString(data.address),
      city: toNullableString(data.city),
      creditLimit: toNumber(data.creditLimit, 0),
      paymentTerms: Math.max(0, Math.trunc(toNumber(data.paymentTerms, 30))),
      isActive: toBoolean(data.isActive, true)
    }
  });
}

export async function updateCustomer(id: number, data: any) {
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) throw Errors.notFound('العميل غير موجود');

  const nextTax = toNullableString(data.taxNumber);
  if (nextTax && nextTax !== customer.taxNumber) {
    const existing = await prisma.customer.findFirst({ where: { taxNumber: nextTax, id: { not: id } } });
    if (existing) throw Errors.business('رقم الضريبي موجود مسبقًا');
  }

  const updateData: any = {};
  if (data.code !== undefined) updateData.code = toNullableString(data.code);
  if (data.name !== undefined || data.nameAr !== undefined) {
    const nameAr = toNullableString(data.nameAr) || toNullableString(data.name);
    if (nameAr) updateData.nameAr = nameAr;
  }
  if (data.nameEn !== undefined) updateData.nameEn = toNullableString(data.nameEn);
  if (data.taxNumber !== undefined) updateData.taxNumber = nextTax;
  if (data.phone !== undefined) updateData.phone = toNullableString(data.phone);
  if (data.mobile !== undefined) updateData.mobile = toNullableString(data.mobile);
  if (data.email !== undefined) updateData.email = toNullableString(data.email);
  if (data.address !== undefined) updateData.address = toNullableString(data.address);
  if (data.city !== undefined) updateData.city = toNullableString(data.city);
  if (data.creditLimit !== undefined) updateData.creditLimit = toNumber(data.creditLimit, 0);
  if (data.paymentTerms !== undefined) updateData.paymentTerms = Math.max(0, Math.trunc(toNumber(data.paymentTerms, 30)));
  if (data.isActive !== undefined) updateData.isActive = toBoolean(data.isActive, customer.isActive);

  return prisma.customer.update({
    where: { id },
    data: updateData
  });
}

export async function listCustomers(query: any) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  const skip = (page - 1) * limit;

  const where: Prisma.CustomerWhereInput = {};
  if (query.search) {
    where.OR = [
      { nameAr: { contains: String(query.search), mode: 'insensitive' } },
      { nameEn: { contains: String(query.search), mode: 'insensitive' } },
      { code: { contains: String(query.search), mode: 'insensitive' } },
      { taxNumber: { contains: String(query.search) } },
      { phone: { contains: String(query.search) } },
      { email: { contains: String(query.search) } }
    ];
  }
  if (query.isActive !== undefined) where.isActive = String(query.isActive) === 'true';

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({ where, skip, take: limit, orderBy: [{ nameAr: 'asc' }] }),
    prisma.customer.count({ where })
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

export async function getCustomer(id: number) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      invoices: { where: { type: 'SALES' }, orderBy: { date: 'desc' }, take: 10 },
      payments: { orderBy: { date: 'desc' }, take: 10 }
    } as any
  });
  if (!customer) throw Errors.notFound('العميل غير موجود');

  const [totalInvoiced, totalPaid] = await Promise.all([
    prisma.invoice.aggregate({ where: { customerId: id, type: 'SALES' }, _sum: { total: true } }),
    prisma.payment.aggregate({ where: { customerId: id }, _sum: { amount: true } })
  ]);
  const balance = Number(totalInvoiced._sum.total || 0) - Number(totalPaid._sum.amount || 0);
  return { ...customer, balance };
}

export async function deleteCustomer(id: number) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { invoices: { where: { status: { not: 'CANCELLED' } } }, payments: true } as any
  });
  if (!customer) throw Errors.notFound('العميل غير موجود');
  if (customer.invoices.length > 0 || customer.payments.length > 0) {
    throw Errors.business('لا يمكن حذف العميل لوجود فواتير أو مدفوعات مرتبطة به');
  }
  await prisma.customer.delete({ where: { id } });
  return { deleted: true, id };
}

export async function getCustomerStatement(id: number, query: any) {
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) throw Errors.notFound('العميل غير موجود');

  const startDate = query.startDate ? new Date(String(query.startDate)) : new Date(customer.createdAt);
  const endDate = query.endDate ? new Date(String(query.endDate)) : new Date();
  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({
      where: { customerId: id, type: 'SALES', date: { gte: startDate, lte: endDate } },
      orderBy: { date: 'asc' }
    }),
    prisma.payment.findMany({
      where: { customerId: id, date: { gte: startDate, lte: endDate } },
      orderBy: { date: 'asc' }
    })
  ]);

  const transactions = [
    ...invoices.map((inv) => ({
      date: inv.date,
      type: 'INVOICE',
      number: inv.number,
      description: `فاتورة مبيعات ${inv.number}`,
      debit: Number(inv.total),
      credit: 0,
      balance: 0
    })),
    ...payments.map((pay) => ({
      date: pay.date,
      type: 'PAYMENT',
      number: pay.number,
      description: `سند قبض ${pay.number}`,
      debit: 0,
      credit: Number(pay.amount),
      balance: 0
    }))
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let runningBalance = 0;
  transactions.forEach((tx) => {
    runningBalance += tx.debit - tx.credit;
    tx.balance = runningBalance;
  });

  return { customer, startDate, endDate, transactions, finalBalance: runningBalance };
}
