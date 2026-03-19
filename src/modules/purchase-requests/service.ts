import { prisma } from '../../config/database';
import { parseDateOrThrow } from '../../utils/date';
import { Errors } from '../../utils/response';
import { emitAccountingEvent } from '../accounting/events';
import { reserveNextSequence, reserveNextSequenceInDb } from '../numbering/service';

function calcLines(lines: any[]) {
  let subtotal = 0;
  let taxAmount = 0;

  const mapped = lines.map((line, index) => {
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice ?? 0);
    const taxRate = Number(line.taxRate ?? 15);
    const gross = quantity * unitPrice;
    const tax = (gross * taxRate) / 100;
    const total = gross + tax;

    subtotal += gross;
    taxAmount += tax;

    return {
      lineNumber: index + 1,
      itemId: line.itemId ? Number(line.itemId) : null,
      description: line.description,
      quantity,
      unitPrice,
      taxRate,
      total
    };
  });

  return { mapped, subtotal, taxAmount, total: subtotal + taxAmount };
}

async function ensureOptionalRefs(data: any) {
  if (data.branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: Number(data.branchId) } });
    if (!branch) throw Errors.validation('الفرع غير موجود');
  }
  if (data.supplierId) {
    const supplier = await prisma.supplier.findUnique({ where: { id: Number(data.supplierId) } });
    if (!supplier) throw Errors.validation('المورد غير موجود');
  }
  if (data.projectId) {
    const project = await prisma.project.findUnique({ where: { id: Number(data.projectId) } });
    if (!project) throw Errors.validation('المشروع غير موجود');
    if (data.branchId && project.branchId && Number(project.branchId) !== Number(data.branchId)) {
      throw Errors.validation('المشروع لا يتبع الفرع المحدد');
    }
  }
}

async function generatePurchaseRequestNumber(branchId?: number | null, date?: string | Date): Promise<string> {
  const sequence = await reserveNextSequence({
    documentType: 'PR',
    branchId: branchId ?? null,
    date
  });
  return sequence.number;
}

export async function createPurchaseRequest(data: any) {
  await ensureOptionalRefs(data);
  const calc = calcLines(data.lines || []);
  const number = await generatePurchaseRequestNumber(data.branchId, data.date);

  return prisma.$transaction(async (tx) => {
    const request = await tx.purchaseRequest.create({
      data: {
        number,
        branchId: data.branchId ? Number(data.branchId) : null,
        requesterId: data.requesterId ? Number(data.requesterId) : null,
        projectId: data.projectId ? Number(data.projectId) : null,
        supplierId: data.supplierId ? Number(data.supplierId) : null,
        date: data.date ? parseDateOrThrow(data.date) : new Date(),
        requiredDate: data.requiredDate ? parseDateOrThrow(data.requiredDate, 'requiredDate') : null,
        subtotal: calc.subtotal,
        taxAmount: calc.taxAmount,
        total: calc.total,
        notes: data.notes
      }
    });

    await tx.purchaseRequestLine.createMany({
      data: calc.mapped.map((line) => ({
        purchaseRequestId: request.id,
        itemId: line.itemId,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxRate: line.taxRate,
        total: line.total
      }))
    });

    return request;
  });
}

export async function updatePurchaseRequest(id: number, data: any) {
  const current = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('طلب الشراء غير موجود');
  if (current.status === 'CONVERTED') throw Errors.business('لا يمكن تعديل طلب شراء محول');

  await ensureOptionalRefs(data);

  return prisma.$transaction(async (tx) => {
    const linesPayload = data.lines ?? (await tx.purchaseRequestLine.findMany({ where: { purchaseRequestId: id } }));
    const calc = calcLines(linesPayload);

    const request = await tx.purchaseRequest.update({
      where: { id },
      data: {
        branchId: data.branchId !== undefined ? (data.branchId ? Number(data.branchId) : null) : current.branchId,
        requesterId: data.requesterId !== undefined ? Number(data.requesterId) : current.requesterId,
        projectId: data.projectId !== undefined ? Number(data.projectId) : current.projectId,
        supplierId: data.supplierId !== undefined ? Number(data.supplierId) : current.supplierId,
        date: data.date ? parseDateOrThrow(data.date) : current.date,
        requiredDate: data.requiredDate ? parseDateOrThrow(data.requiredDate, 'requiredDate') : current.requiredDate,
        subtotal: calc.subtotal,
        taxAmount: calc.taxAmount,
        total: calc.total,
        notes: data.notes ?? current.notes
      }
    });

    if (data.lines) {
      await tx.purchaseRequestLine.deleteMany({ where: { purchaseRequestId: id } });
      await tx.purchaseRequestLine.createMany({
        data: calc.mapped.map((line) => ({
          purchaseRequestId: id,
          itemId: line.itemId,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxRate: line.taxRate,
          total: line.total
        }))
      });
    }

    return request;
  });
}

export async function deletePurchaseRequest(id: number) {
  const current = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('طلب الشراء غير موجود');
  if (current.status !== 'DRAFT') throw Errors.business('يمكن حذف مسودة طلب الشراء فقط');

  await prisma.purchaseRequestLine.deleteMany({ where: { purchaseRequestId: id } });
  await prisma.purchaseRequest.delete({ where: { id } });
  return { deleted: true, id };
}

export async function approvePurchaseRequest(id: number) {
  const current = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('طلب الشراء غير موجود');
  if (current.status !== 'DRAFT') throw Errors.business('يمكن اعتماد مسودة طلب الشراء فقط');
  return prisma.purchaseRequest.update({ where: { id }, data: { status: 'APPROVED' } });
}

export async function convertPurchaseRequest(id: number, userId: number, payload: { supplierId?: number; expectedDate?: string; notes?: string }) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.purchaseRequest.findUnique({
      where: { id },
      include: { lines: true, purchaseOrder: true }
    });
    if (!current) throw Errors.notFound('طلب الشراء غير موجود');

    if (current.purchaseOrder) {
      return {
        duplicate: true,
        purchaseRequestId: id,
        purchaseOrderId: current.purchaseOrder.id,
        purchaseOrderNumber: current.purchaseOrder.number
      };
    }

    if (current.status !== 'APPROVED') throw Errors.business('يمكن تحويل طلب شراء معتمد فقط');
    if (!current.lines.length) throw Errors.business('لا يمكن تحويل طلب شراء بدون بنود');

    const supplierId = payload.supplierId ?? current.supplierId;
    if (!supplierId) throw Errors.validation('يجب تحديد المورد قبل التحويل إلى أمر شراء');

    const supplier = await tx.supplier.findUnique({ where: { id: Number(supplierId) } });
    if (!supplier) throw Errors.validation('المورد غير موجود');

    const orderNumber = (
      await reserveNextSequenceInDb(tx, {
        documentType: 'PO',
        branchId: current.branchId,
        date: current.date
      })
    ).number;

    const order = await tx.purchaseOrder.create({
      data: {
        number: orderNumber,
        branchId: current.branchId,
        projectId: current.projectId,
        purchaseRequestId: id,
        supplierId: Number(supplierId),
        date: new Date(),
        expectedDate: payload.expectedDate ? parseDateOrThrow(payload.expectedDate, 'expectedDate') : current.requiredDate,
        status: 'DRAFT',
        subtotal: current.subtotal,
        taxAmount: current.taxAmount,
        total: current.total,
        notes: payload.notes ?? `محول من طلب شراء ${current.number}`
      }
    });

    await tx.purchaseOrderLine.createMany({
      data: current.lines.map((line) => ({
        purchaseOrderId: order.id,
        itemId: line.itemId,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: 0,
        taxRate: line.taxRate,
        total: line.total
      }))
    });

    await tx.purchaseRequest.update({
      where: { id },
      data: {
        supplierId: Number(supplierId),
        status: 'CONVERTED',
        notes: current.notes ?? `تم التحويل بواسطة المستخدم ${userId}`
      }
    });

    return {
      duplicate: false,
      purchaseRequestId: id,
      purchaseOrderId: order.id,
      purchaseOrderNumber: order.number
    };
  });

  if (!result.duplicate) {
    emitAccountingEvent('procurement.purchase_request.converted', {
      recordId: result.purchaseOrderId,
      purchaseRequestId: result.purchaseRequestId,
      purchaseOrderId: result.purchaseOrderId,
      purchaseOrderNumber: result.purchaseOrderNumber,
      userId
    });
  }

  return result;
}

export async function listPurchaseRequests(query: any) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  const skip = (page - 1) * limit;
  const where: any = {};
  if (query.projectId) where.projectId = Number(query.projectId);
  else if (Array.isArray(query.projectIds) && query.projectIds.length) where.projectId = { in: query.projectIds.map(Number) };
  if (query.branchId) where.branchId = Number(query.branchId);
  else if (Array.isArray(query.branchIds) && query.branchIds.length) where.branchId = { in: query.branchIds.map(Number) };
  if (query.status) where.status = String(query.status);

  const [rows, total] = await Promise.all([
    prisma.purchaseRequest.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ date: 'desc' }, { id: 'desc' }]
    }),
    prisma.purchaseRequest.count({ where })
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

export async function getPurchaseRequest(id: number) {
  const row = await prisma.purchaseRequest.findUnique({
    where: { id },
    include: { lines: true, purchaseOrder: true }
  });
  if (!row) throw Errors.notFound('طلب الشراء غير موجود');
  return row;
}
