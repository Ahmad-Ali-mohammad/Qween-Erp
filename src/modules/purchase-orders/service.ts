import { prisma } from '../../config/database';
import { parseDateOrThrow } from '../../utils/date';
import { Errors } from '../../utils/response';
import { reserveNextSequence, reserveNextSequenceInDb } from '../numbering/service';

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

async function ensureOptionalRefs(data: any) {
  if (data.branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: Number(data.branchId) } });
    if (!branch) throw Errors.validation('الفرع غير موجود');
  }

  const supplier = await prisma.supplier.findUnique({ where: { id: Number(data.supplierId) } });
  if (!supplier) throw Errors.validation('المورد غير موجود');

  if (data.projectId) {
    const project = await prisma.project.findUnique({ where: { id: Number(data.projectId) } });
    if (!project) throw Errors.validation('المشروع غير موجود');
    if (data.branchId && project.branchId && Number(project.branchId) !== Number(data.branchId)) {
      throw Errors.validation('المشروع لا يتبع الفرع المحدد');
    }
  }
}

async function generatePurchaseOrderNumber(branchId?: number | null, date?: string | Date): Promise<string> {
  const sequence = await reserveNextSequence({
    documentType: 'PO',
    branchId: branchId ?? null,
    date
  });
  return sequence.number;
}

export async function createPurchaseOrder(data: any) {
  await ensureOptionalRefs(data);
  const calc = calcLines(data.lines || []);
  const number = await generatePurchaseOrderNumber(data.branchId, data.date);

  return prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.create({
      data: {
        number,
        branchId: data.branchId ? Number(data.branchId) : null,
        projectId: data.projectId ? Number(data.projectId) : null,
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
  await ensureOptionalRefs({ ...current, ...data, supplierId: data.supplierId ?? current.supplierId });

  return prisma.$transaction(async (tx) => {
    const linesPayload = data.lines ?? (await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: id } }));
    const calc = calcLines(linesPayload);

    const updated = await tx.purchaseOrder.update({
      where: { id },
      data: {
        branchId: data.branchId !== undefined ? (data.branchId ? Number(data.branchId) : null) : current.branchId,
        projectId: data.projectId !== undefined ? (data.projectId ? Number(data.projectId) : null) : current.projectId,
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

    const invoiceNumber = (
      await reserveNextSequenceInDb(tx, {
        documentType: 'PINV',
        branchId: current.branchId,
        date: current.date
      })
    ).number;

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
  if (query.branchId) where.branchId = Number(query.branchId);
  else if (Array.isArray(query.branchIds) && query.branchIds.length) where.branchId = { in: query.branchIds.map(Number) };
  if (query.projectId) where.projectId = Number(query.projectId);
  else if (Array.isArray(query.projectIds) && query.projectIds.length) where.projectId = { in: query.projectIds.map(Number) };
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
