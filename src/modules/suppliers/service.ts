import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { buildSequentialNumber } from '../../utils/id-generator';
import { Errors } from '../../utils/response';

async function generateSupplierCode(): Promise<string> {
  const count = await prisma.supplier.count();
  return buildSequentialNumber('SUPP', count, new Date().getUTCFullYear());
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

export async function createSupplier(data: any) {
  const nameAr = toNullableString(data.nameAr) || toNullableString(data.name);
  if (!nameAr) throw Errors.validation('اسم المورد مطلوب');

  const nextTax = toNullableString(data.taxNumber);
  if (nextTax) {
    const existing = await prisma.supplier.findFirst({ where: { taxNumber: nextTax } });
    if (existing) throw Errors.business('رقم الضريبي موجود مسبقًا');
  }

  const code = toNullableString(data.code) || (await generateSupplierCode());
  return prisma.supplier.create({
    data: {
      code,
      nameAr,
      nameEn: toNullableString(data.nameEn),
      type: toNullableString(data.type) || 'Local',
      nationalId: toNullableString(data.nationalId),
      taxNumber: nextTax,
      vatNumber: toNullableString(data.vatNumber),
      address: toNullableString(data.address),
      city: toNullableString(data.city),
      phone: toNullableString(data.phone),
      mobile: toNullableString(data.mobile),
      email: toNullableString(data.email),
      creditLimit: toNumber(data.creditLimit, 0),
      paymentTerms: Math.max(0, Math.trunc(toNumber(data.paymentTerms, 30))),
      bankName: toNullableString(data.bankName),
      bankAccount: toNullableString(data.bankAccount),
      iban: toNullableString(data.iban),
      isActive: toBoolean(data.isActive, true)
    }
  });
}

export async function updateSupplier(id: number, data: any) {
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) throw Errors.notFound('المورد غير موجود');

  const nextTax = toNullableString(data.taxNumber);
  if (nextTax && nextTax !== supplier.taxNumber) {
    const existing = await prisma.supplier.findFirst({ where: { taxNumber: nextTax, id: { not: id } } });
    if (existing) throw Errors.business('رقم الضريبي موجود مسبقًا');
  }

  const updateData: any = {};
  if (data.code !== undefined) updateData.code = toNullableString(data.code);
  if (data.name !== undefined || data.nameAr !== undefined) {
    const nameAr = toNullableString(data.nameAr) || toNullableString(data.name);
    if (nameAr) updateData.nameAr = nameAr;
  }
  if (data.nameEn !== undefined) updateData.nameEn = toNullableString(data.nameEn);
  if (data.type !== undefined) updateData.type = toNullableString(data.type);
  if (data.nationalId !== undefined) updateData.nationalId = toNullableString(data.nationalId);
  if (data.taxNumber !== undefined) updateData.taxNumber = nextTax;
  if (data.vatNumber !== undefined) updateData.vatNumber = toNullableString(data.vatNumber);
  if (data.address !== undefined) updateData.address = toNullableString(data.address);
  if (data.city !== undefined) updateData.city = toNullableString(data.city);
  if (data.phone !== undefined) updateData.phone = toNullableString(data.phone);
  if (data.mobile !== undefined) updateData.mobile = toNullableString(data.mobile);
  if (data.email !== undefined) updateData.email = toNullableString(data.email);
  if (data.creditLimit !== undefined) updateData.creditLimit = toNumber(data.creditLimit, 0);
  if (data.paymentTerms !== undefined) updateData.paymentTerms = Math.max(0, Math.trunc(toNumber(data.paymentTerms, 30)));
  if (data.bankName !== undefined) updateData.bankName = toNullableString(data.bankName);
  if (data.bankAccount !== undefined) updateData.bankAccount = toNullableString(data.bankAccount);
  if (data.iban !== undefined) updateData.iban = toNullableString(data.iban);
  if (data.isActive !== undefined) updateData.isActive = toBoolean(data.isActive, supplier.isActive);

  return prisma.supplier.update({
    where: { id },
    data: updateData
  });
}

export async function listSuppliers(query: any) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  const skip = (page - 1) * limit;

  const where: Prisma.SupplierWhereInput = {};
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
    prisma.supplier.findMany({ where, skip, take: limit, orderBy: [{ nameAr: 'asc' }] }),
    prisma.supplier.count({ where })
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

export async function getSupplier(id: number) {
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      invoices: { where: { type: 'PURCHASE' }, orderBy: { date: 'desc' }, take: 10 },
      payments: { orderBy: { date: 'desc' }, take: 10 }
    } as any
  });
  if (!supplier) throw Errors.notFound('المورد غير موجود');

  const [totalInvoiced, totalPaid] = await Promise.all([
    prisma.invoice.aggregate({ where: { supplierId: id, type: 'PURCHASE' }, _sum: { total: true } }),
    prisma.payment.aggregate({ where: { supplierId: id }, _sum: { amount: true } })
  ]);
  const balance = Number(totalInvoiced._sum.total || 0) - Number(totalPaid._sum.amount || 0);
  return { ...supplier, balance };
}

export async function deleteSupplier(id: number) {
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      invoices: { where: { status: { not: 'CANCELLED' } } },
      payments: true
    } as any
  });
  if (!supplier) throw Errors.notFound('المورد غير موجود');
  if (supplier.invoices.length > 0 || supplier.payments.length > 0) {
    throw Errors.business('لا يمكن حذف المورد لوجود فواتير أو مدفوعات مرتبطة به');
  }

  await prisma.supplier.delete({ where: { id } });
  return { deleted: true, id };
}

export async function getSupplierStatement(id: number, query: any) {
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) throw Errors.notFound('المورد غير موجود');

  const startDate = query.startDate ? new Date(String(query.startDate)) : new Date(supplier.createdAt);
  const endDate = query.endDate ? new Date(String(query.endDate)) : new Date();

  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({
      where: { supplierId: id, type: 'PURCHASE', date: { gte: startDate, lte: endDate } },
      orderBy: { date: 'asc' }
    }),
    prisma.payment.findMany({
      where: { supplierId: id, date: { gte: startDate, lte: endDate } },
      orderBy: { date: 'asc' }
    })
  ]);

  const transactions = [
    ...invoices.map((inv) => ({
      date: inv.date,
      type: 'INVOICE',
      number: inv.number,
      description: `فاتورة شراء ${inv.number}`,
      debit: Number(inv.total),
      credit: 0,
      balance: 0
    })),
    ...payments.map((pay) => ({
      date: pay.date,
      type: 'PAYMENT',
      number: pay.number,
      description: `سند دفع ${pay.number}`,
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

  return { supplier, startDate, endDate, transactions, finalBalance: runningBalance };
}
