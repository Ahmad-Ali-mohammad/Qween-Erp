import { prisma } from '../../config/database';
import { parseDateOrThrow } from '../../utils/date';
import { buildSequentialNumber, buildSequentialNumberFromLatest } from '../../utils/id-generator';
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
  const count = await prisma.purchaseOrder.count({
    where: {
      date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) }
    }
  });
  return buildSequentialNumber('PO', count, year);
}

export async function createPurchaseOrder(data: any) {
  const supplier = await prisma.supplier.findUnique({ where: { id: Number(data.supplierId) } });
  if (!supplier) throw Errors.validation('المورد غير موجود');
  const calc = calcLines(data.lines || []);
  const number = await generatePurchaseOrderNumber();

  return prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.create({
      data: {
        number,
        supplierId: Number(data.supplierId),
        date: data.date ? parseDateOrThrow(data.date) : new Date(),
        expectedDate: data.expectedDate ? parseDateOrThrow(data.expectedDate, 'expectedDate') : null,
        subtotal: calc.subtotal,
        discount: calc.discount,
        taxAmount: calc.taxAmount,
        total: calc.total,
        notes: data.notes
      }
    });

    await tx.purchaseOrderLine.createMany({
      data: calc.mapped.map((line) => ({
        purchaseOrderId: order.id,
        itemId: line.itemId,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        taxRate: line.taxRate,
        total: line.total
      }))
    });

    return order;
  });
}

export async function updatePurchaseOrder(id: number, data: any) {
  const current = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('طلب الشراء غير موجود');
  if (current.status === 'CONVERTED') throw Errors.business('لا يمكن تعديل طلب شراء محول');

  return prisma.$transaction(async (tx) => {
    const linesPayload = data.lines ?? (await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: id } }));
    const calc = calcLines(linesPayload);

    const updated = await tx.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: data.supplierId ? Number(data.supplierId) : current.supplierId,
        date: data.date ? parseDateOrThrow(data.date) : current.date,
        expectedDate: data.expectedDate ? parseDateOrThrow(data.expectedDate, 'expectedDate') : current.expectedDate,
        subtotal: calc.subtotal,
        discount: calc.discount,
        taxAmount: calc.taxAmount,
        total: calc.total,
        notes: data.notes ?? current.notes
      }
    });

    if (data.lines) {
      await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      await tx.purchaseOrderLine.createMany({
        data: calc.mapped.map((line) => ({
          purchaseOrderId: id,
          itemId: line.itemId,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discount: line.discount,
          taxRate: line.taxRate,
          total: line.total
        }))
      });
    }

    return updated;
  });
}

export async function deletePurchaseOrder(id: number) {
  const current = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('طلب الشراء غير موجود');
  if (current.status === 'CONVERTED') throw Errors.business('لا يمكن حذف طلب شراء محول');
  if (current.status !== 'DRAFT') throw Errors.business('يمكن حذف المسودة فقط');

  await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
  await prisma.purchaseOrder.delete({ where: { id } });
  return { deleted: true, id };
}

export async function approvePurchaseOrder(id: number) {
  const current = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('طلب الشراء غير موجود');
  if (current.status !== 'DRAFT') throw Errors.business('يمكن اعتماد مسودة طلب الشراء فقط');
  return prisma.purchaseOrder.update({ where: { id }, data: { status: 'APPROVED' } });
}

export async function sendPurchaseOrder(id: number) {
  const current = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('طلب الشراء غير موجود');
  if (current.status !== 'APPROVED') throw Errors.business('يمكن إرسال طلب الشراء المعتمد فقط');
  return prisma.purchaseOrder.update({ where: { id }, data: { status: 'SENT' } });
}

export async function convertPurchaseOrder(id: number, userId: number) {
  const current = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('طلب الشراء غير موجود');
  if (current.status !== 'SENT') throw Errors.business('يمكن تحويل طلب شراء مرسل فقط');

  return prisma.$transaction(async (tx) => {
    const lines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: id }, orderBy: { id: 'asc' } });
    if (!lines.length) throw Errors.business('لا يمكن تحويل طلب شراء بدون بنود');

    await tx.$executeRawUnsafe('LOCK TABLE "Invoice" IN EXCLUSIVE MODE');
    const year = new Date().getUTCFullYear();
    const sequencePrefix = `PINV-${year}-`;
    const existingInvoices = await tx.invoice.findMany({
      where: {
        type: 'PURCHASE',
        date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
        number: { startsWith: sequencePrefix }
      },
      select: { number: true }
    });

    let latestInvoiceNumber: string | undefined;
    let maxSequence = 0;
    for (const row of existingInvoices) {
      const sequence = Number.parseInt(String(row.number).slice(sequencePrefix.length), 10);
      if (Number.isFinite(sequence) && sequence > maxSequence) {
        maxSequence = sequence;
        latestInvoiceNumber = row.number;
      }
    }

    const invoiceNumber = buildSequentialNumberFromLatest('PINV', latestInvoiceNumber, year);

    const taxableAmount = Number(current.subtotal) - Number(current.discount);
    const invoice = await tx.invoice.create({
      data: {
        number: invoiceNumber,
        type: 'PURCHASE',
        date: new Date(),
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
      }
    });

    await tx.invoiceLine.createMany({
      data: lines.map((line, index) => ({
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
      }))
    });

    await tx.purchaseOrder.update({ where: { id }, data: { status: 'CONVERTED' } });

    return { purchaseOrderId: id, invoiceId: invoice.id, invoiceNumber: invoice.number };
  });
}

export async function listPurchaseOrders(query: any) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  const skip = (page - 1) * limit;
  const where: any = {};
  if (query.supplierId) where.supplierId = Number(query.supplierId);
  if (query.status) where.status = query.status;

  const [rows, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ date: 'desc' }, { id: 'desc' }]
    }),
    prisma.purchaseOrder.count({ where })
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
  const row = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('طلب الشراء غير موجود');
  const lines = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: id }, orderBy: { id: 'asc' } });
  return { ...row, lines };
}
