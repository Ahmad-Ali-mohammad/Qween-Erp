import { qw } from '../../utils/where';
import { prisma } from '../../config/database';
import { parseDateOrThrow } from '../../utils/date';
import { buildSequentialNumber } from '../../utils/id-generator';
import { Errors } from '../../utils/response';

function calcLines(lines: any[]) {
  let subtotal = 0;
  let discount = 0;
  let taxAmount = 0;

  const mapped = lines.map((line, index) => {
    const qty = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    const lineDiscount = Number(line.discount ?? 0);
    const taxRate = Number(line.taxRate ?? 15);
    const gross = qty * unitPrice;
    const net = gross - lineDiscount;
    const tax = (net * taxRate) / 100;
    const total = net + tax;

    subtotal += gross;
    discount += lineDiscount;
    taxAmount += tax;

    return {
      lineNumber: index + 1,
      itemId: line.itemId ? Number(line.itemId) : null,
      description: line.description,
      quantity: qty,
      unitPrice,
      discount: lineDiscount,
      taxRate,
      total
    };
  });

  return { mapped, subtotal, discount, taxAmount, total: subtotal - discount + taxAmount };
}

async function generatePurchaseOrderNumber(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const count = await prisma.orm.public.PurchaseOrder.where((r) => qw(r, {
      date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) }
    })).aggregate((a) => ({ n: a.count() })).then((r0) => r0.n);
  return buildSequentialNumber('PO', count, year);
}

export async function createPurchaseOrder(data: any) {
  const supplier = await prisma.orm.public.Supplier.first((r) => qw(r, { id: Number(data.supplierId) }));
  if (!supplier) throw Errors.validation('المورد غير موجود');
  const calc = calcLines(data.lines || []);
  const number = await generatePurchaseOrderNumber();

  return prisma.transaction(async (tx) => {{
    const order = await tx.orm.public.PurchaseOrder.create({
        number,
        supplierId: Number(data.supplierId),
        date: data.date ? parseDateOrThrow(data.date) : new Date(),
        expectedDate: data.expectedDate ? parseDateOrThrow(data.expectedDate, 'expectedDate') : null,
        subtotal: calc.subtotal,
        discount: calc.discount,
        taxAmount: calc.taxAmount,
        total: calc.total,
        notes: data.notes
      });

    await tx.orm.public.PurchaseOrderLine.createAll(calc.mapped.map((line) => ({
        purchaseOrderId: order.id,
        itemId: line.itemId,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        taxRate: line.taxRate,
        total: line.total
      }))).then((rows) => ({ count: rows.length }));

    return order;
  }});
}

export async function updatePurchaseOrder(id: number, data: any) {
  const current = await prisma.orm.public.PurchaseOrder.first({ id });
  if (!current) throw Errors.notFound('طلب الشراء غير موجود');
  if (current.status === 'CONVERTED') throw Errors.business('لا يمكن تعديل طلب شراء محول');

  return prisma.transaction(async (tx) => {{
    const linesPayload = data.lines ?? (await tx.orm.public.PurchaseOrderLine.where((r) => qw(r, { purchaseOrderId: id })).all());
    const calc = calcLines(linesPayload);

    const updated = await tx.orm.public.PurchaseOrder.where((r) => qw(r, { id })).update({
        supplierId: data.supplierId ? Number(data.supplierId) : current.supplierId,
        date: data.date ? parseDateOrThrow(data.date) : current.date,
        expectedDate: data.expectedDate ? parseDateOrThrow(data.expectedDate, 'expectedDate') : current.expectedDate,
        subtotal: calc.subtotal,
        discount: calc.discount,
        taxAmount: calc.taxAmount,
        total: calc.total,
        notes: data.notes ?? current.notes
      }).then((r0) => r0!);

    if (data.lines) {
      await tx.orm.public.PurchaseOrderLine.where((r) => qw(r, { purchaseOrderId: id })).deleteAndCount().then((n0) => ({ count: n0 }));
      await tx.orm.public.PurchaseOrderLine.createAll(calc.mapped.map((line) => ({
          purchaseOrderId: id,
          itemId: line.itemId,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discount: line.discount,
          taxRate: line.taxRate,
          total: line.total
        }))).then((rows) => ({ count: rows.length }));
    }

    return updated;
  }});
}

export async function deletePurchaseOrder(id: number) {
  const current = await prisma.orm.public.PurchaseOrder.first({ id });
  if (!current) throw Errors.notFound('طلب الشراء غير موجود');
  if (current.status === 'CONVERTED') throw Errors.business('لا يمكن حذف طلب شراء محول');
  if (current.status !== 'DRAFT') throw Errors.business('يمكن حذف المسودة فقط');

  await prisma.orm.public.PurchaseOrderLine.where((r) => qw(r, { purchaseOrderId: id })).deleteAndCount().then((n0) => ({ count: n0 }));
  await prisma.orm.public.PurchaseOrder.where((r) => qw(r, { id })).delete().then((r0) => r0!);
  return { deleted: true, id };
}

export async function approvePurchaseOrder(id: number) {
  const current = await prisma.orm.public.PurchaseOrder.first({ id });
  if (!current) throw Errors.notFound('طلب الشراء غير موجود');
  if (current.status !== 'DRAFT') throw Errors.business('يمكن اعتماد مسودة طلب الشراء فقط');
  return prisma.orm.public.PurchaseOrder.where((r) => qw(r, { id })).update({ status: 'APPROVED' }).then((r0) => r0!);
}

export async function sendPurchaseOrder(id: number) {
  const current = await prisma.orm.public.PurchaseOrder.first({ id });
  if (!current) throw Errors.notFound('طلب الشراء غير موجود');
  if (current.status !== 'APPROVED') throw Errors.business('يمكن إرسال طلب الشراء المعتمد فقط');
  return prisma.orm.public.PurchaseOrder.where((r) => qw(r, { id })).update({ status: 'SENT' }).then((r0) => r0!);
}

export async function convertPurchaseOrder(id: number, userId: number) {
  const current = await prisma.orm.public.PurchaseOrder.first({ id });
  if (!current) throw Errors.notFound('طلب الشراء غير موجود');
  if (current.status !== 'SENT') throw Errors.business('يمكن تحويل طلب شراء مرسل فقط');

  return prisma.transaction(async (tx) => {{
    const lines = await tx.orm.public.PurchaseOrderLine.where((r) => qw(r, { purchaseOrderId: id })).orderBy((r) => r.id.asc()).all();
    if (!lines.length) throw Errors.business('لا يمكن تحويل طلب شراء بدون بنود');

    const invoiceDate = new Date();
    const year = invoiceDate.getUTCFullYear();
    const month = String(invoiceDate.getUTCMonth() + 1).padStart(2, '0');
    const sequencePrefix = `PINV-${year}-${month}-`;

    await tx.$executeRawUnsafe('LOCK TABLE "Invoice" IN EXCLUSIVE MODE');
    const existingInvoices = await tx.orm.public.Invoice.where((r) => qw(r, {
        type: 'PURCHASE',
        number: { startsWith: sequencePrefix }
      })).select('number').all();

    let maxSequence = 0;
    for (const row of existingInvoices) {
      const sequence = Number.parseInt(String(row.number).slice(sequencePrefix.length), 10);
      if (Number.isInteger(sequence) && sequence > maxSequence) {
        maxSequence = sequence;
      }
    }

    const invoiceNumber = `${sequencePrefix}${String(maxSequence + 1).padStart(5, '0')}`;

    const taxableAmount = Number(current.subtotal) - Number(current.discount);
    const invoice = await tx.orm.public.Invoice.create({
        number: invoiceNumber,
        type: 'PURCHASE',
        date: invoiceDate,
        dueDate: current.expectedDate,
        supplierId: current.supplierId,
        subtotal: current.subtotal,
        discount: current.discount,
        taxableAmount,
        vatAmount: current.taxAmount,
        total: current.total,
        paidAmount: 0,
        outstanding: current.total,
        status: 'DRAFT',
        paymentStatus: 'PENDING',
        notes: `تحويل من طلب شراء ${current.number}`,
        createdById: userId
      });

    await tx.orm.public.InvoiceLine.createAll(lines.map((line, index) => ({
        invoiceId: invoice.id,
        lineNumber: index + 1,
        itemId: line.itemId,
        description: line.description || `بند ${index + 1}`,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        taxRate: line.taxRate,
        taxAmount: (Number(line.total) - (Number(line.quantity) * Number(line.unitPrice) - Number(line.discount))),
        total: line.total
      }))).then((rows) => ({ count: rows.length }));

    await tx.orm.public.PurchaseOrder.where((r) => qw(r, { id })).update({ status: 'CONVERTED' }).then((r0) => r0!);

    return { purchaseOrderId: id, invoiceId: invoice.id, invoiceNumber: invoice.number };
  }});
}

export async function listPurchaseOrders(query: any) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  const skip = (page - 1) * limit;
  const where: any = {};
  if (query.supplierId) where.supplierId = Number(query.supplierId);
  if (query.status) where.status = query.status;

  const [rows, total] = await Promise.all([
    prisma.orm.public.PurchaseOrder.where((r) => qw(r, where)).orderBy([(r) => r.date.desc(), (r) => r.id.desc()]).offset(skip).limit(limit).all(),
    prisma.orm.public.PurchaseOrder.where((r) => qw(r, where)).aggregate((a) => ({ n: a.count() })).then((r0) => r0.n)
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

export async function getPurchaseOrder(id: number) {
  const row = await prisma.orm.public.PurchaseOrder.first({ id });
  if (!row) throw Errors.notFound('طلب الشراء غير موجود');
  const lines = await prisma.orm.public.PurchaseOrderLine.where((r) => qw(r, { purchaseOrderId: id })).orderBy((r) => r.id.asc()).all();
  return { ...row, lines };
}
