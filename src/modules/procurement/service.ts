import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { parseDateOrThrow } from '../../utils/date';
import { Errors } from '../../utils/response';
import { emitAccountingEvent } from '../accounting/events';
import { recordInventoryMovement } from '../inventory/service';
import { reserveNextSequenceInDb } from '../numbering/service';
import * as invoiceService from '../invoices/service';

type ReceiptLineInput = {
  itemId?: number | null;
  description?: string | null;
  quantity: number;
  warehouseId?: number | null;
  locationId?: number | null;
  unitCost?: number | null;
};

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? [])) as Prisma.InputJsonValue;
}

function toNumber(value: Prisma.Decimal | string | number | null | undefined): number {
  return Number(value ?? 0);
}

function normalizeReceiptLines(lines: ReceiptLineInput[], defaultWarehouseId?: number | null) {
  if (!Array.isArray(lines) || !lines.length) throw Errors.validation('يجب إدخال بنود سند الاستلام');

  return lines.map((line, index) => {
    const quantity = Number(line.quantity ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) throw Errors.validation(`كمية البند ${index + 1} غير صالحة`);

    const unitCost = Number(line.unitCost ?? 0);
    if (!Number.isFinite(unitCost) || unitCost < 0) throw Errors.validation(`تكلفة البند ${index + 1} غير صالحة`);

    return {
      itemId: line.itemId ? Number(line.itemId) : null,
      description: String(line.description ?? '').trim() || null,
      quantity,
      warehouseId: line.warehouseId ? Number(line.warehouseId) : defaultWarehouseId ?? null,
      locationId: line.locationId ? Number(line.locationId) : null,
      unitCost
    };
  });
}

async function ensureReceiptRefs(
  tx: Prisma.TransactionClient | typeof prisma,
  data: {
    branchId?: number | null;
    supplierId?: number | null;
    purchaseOrderId?: number | null;
    warehouseId?: number | null;
  }
) {
  const [branch, supplier, purchaseOrder, warehouse] = await Promise.all([
    data.branchId ? tx.branch.findUnique({ where: { id: Number(data.branchId) } }) : Promise.resolve(null),
    data.supplierId ? tx.supplier.findUnique({ where: { id: Number(data.supplierId) } }) : Promise.resolve(null),
    data.purchaseOrderId
      ? tx.purchaseOrder.findUnique({ where: { id: Number(data.purchaseOrderId) }, include: { lines: true } })
      : Promise.resolve(null),
    data.warehouseId ? tx.warehouse.findUnique({ where: { id: Number(data.warehouseId) } }) : Promise.resolve(null)
  ]);

  if (data.branchId && !branch) throw Errors.validation('الفرع غير موجود');
  if (data.supplierId && !supplier) throw Errors.validation('المورد غير موجود');
  if (data.purchaseOrderId && !purchaseOrder) throw Errors.validation('أمر الشراء غير موجود');
  if (data.warehouseId && !warehouse) throw Errors.validation('المستودع غير موجود');
  if (
    purchaseOrder &&
    !['APPROVED', 'SENT', 'PARTIAL_RECEIPT', 'RECEIVED'].includes(String(purchaseOrder.status).toUpperCase())
  ) {
    throw Errors.business('لا يمكن إنشاء سند استلام قبل اعتماد أمر الشراء');
  }
  if (data.branchId && warehouse?.branchId && Number(warehouse.branchId) !== Number(data.branchId)) {
    throw Errors.validation('المستودع لا يتبع الفرع المحدد');
  }

  return { branch, supplier, purchaseOrder, warehouse };
}

function extractReceiptLines(value: unknown, defaultWarehouseId?: number | null) {
  if (!Array.isArray(value)) throw Errors.validation('بنود سند الاستلام غير صالحة');
  return normalizeReceiptLines(value as ReceiptLineInput[], defaultWarehouseId);
}

function buildReceiptMovementsPayload(receipt: {
  id: number;
  number: string;
  date: Date;
  branchId: number | null;
  warehouseId: number | null;
  notes: string | null;
  lines: unknown;
}) {
  const lines = extractReceiptLines(receipt.lines, receipt.warehouseId);
  return lines.map((line) => {
    if (!line.itemId) throw Errors.validation('لا يمكن ترحيل المخزون لبند بدون صنف');
    if (!line.warehouseId) throw Errors.validation('يجب تحديد مستودع لكل بند استلام');
    return {
      date: receipt.date,
      type: 'PURCHASE_RECEIPT',
      reference: receipt.number,
      itemId: line.itemId,
      branchId: receipt.branchId ?? undefined,
      warehouseId: line.warehouseId,
      locationId: line.locationId ?? undefined,
      quantity: line.quantity,
      unitCost: line.unitCost ?? 0,
      totalCost: line.quantity * (line.unitCost ?? 0),
      notes: receipt.notes ?? undefined
    };
  });
}

function buildVendorInvoiceLinesFromReceipt(receipt: { lines: unknown; warehouseId: number | null }) {
  return extractReceiptLines(receipt.lines, receipt.warehouseId).map((line, index) => ({
    itemId: line.itemId ?? undefined,
    description: line.description ?? `بند استلام ${index + 1}`,
    quantity: line.quantity,
    unitPrice: line.unitCost ?? 0,
    discount: 0,
    taxRate: 15
  }));
}

function buildVendorInvoiceLinesFromOrder(lines: Array<{ itemId: number | null; description: string | null; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; discount: Prisma.Decimal; taxRate: Prisma.Decimal }>) {
  return lines.map((line, index) => ({
    itemId: line.itemId ?? undefined,
    description: line.description ?? `بند أمر شراء ${index + 1}`,
    quantity: toNumber(line.quantity),
    unitPrice: toNumber(line.unitPrice),
    discount: toNumber(line.discount),
    taxRate: toNumber(line.taxRate)
  }));
}

export async function listReceipts(
  query: Record<string, unknown>,
  scope?: { branchIds?: number[]; warehouseIds?: number[] }
) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(query.limit ?? 20)));
  const skip = (page - 1) * limit;

  const where: Prisma.PurchaseReceiptWhereInput = {
    ...(query.branchId ? { branchId: Number(query.branchId) } : {}),
    ...(!query.branchId && scope?.branchIds?.length ? { branchId: { in: scope.branchIds.map(Number) } } : {}),
    ...(query.purchaseOrderId ? { purchaseOrderId: Number(query.purchaseOrderId) } : {}),
    ...(query.supplierId ? { supplierId: Number(query.supplierId) } : {}),
    ...(!query.warehouseId && scope?.warehouseIds?.length ? { warehouseId: { in: scope.warehouseIds.map(Number) } } : {}),
    ...(query.warehouseId ? { warehouseId: Number(query.warehouseId) } : {}),
    ...(query.status ? { status: String(query.status) } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.purchaseReceipt.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ date: 'desc' }, { id: 'desc' }]
    }),
    prisma.purchaseReceipt.count({ where })
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

export async function getReceipt(id: number) {
  const receipt = await prisma.purchaseReceipt.findUnique({ where: { id } });
  if (!receipt) throw Errors.notFound('سند الاستلام غير موجود');

  const [purchaseOrder, supplier, warehouse, branch] = await Promise.all([
    receipt.purchaseOrderId ? prisma.purchaseOrder.findUnique({ where: { id: receipt.purchaseOrderId } }) : Promise.resolve(null),
    receipt.supplierId ? prisma.supplier.findUnique({ where: { id: receipt.supplierId } }) : Promise.resolve(null),
    receipt.warehouseId ? prisma.warehouse.findUnique({ where: { id: receipt.warehouseId } }) : Promise.resolve(null),
    receipt.branchId ? prisma.branch.findUnique({ where: { id: receipt.branchId } }) : Promise.resolve(null)
  ]);

  return {
    ...receipt,
    lines: extractReceiptLines(receipt.lines, receipt.warehouseId),
    purchaseOrder,
    supplier,
    warehouse,
    branch
  };
}

export async function createReceipt(data: {
  branchId?: number;
  purchaseOrderId?: number;
  supplierId?: number;
  warehouseId?: number;
  date?: string;
  notes?: string;
  lines?: ReceiptLineInput[];
}) {
  return prisma.$transaction(async (tx) => {
    const refs = await ensureReceiptRefs(tx, data);
    const docDate = data.date ? parseDateOrThrow(data.date) : new Date();

    const sourceLines =
      data.lines && data.lines.length
        ? data.lines
        : refs.purchaseOrder
          ? refs.purchaseOrder.lines.map((line) => ({
              itemId: line.itemId,
              description: line.description,
              quantity: toNumber(line.quantity),
              unitCost: toNumber(line.unitPrice),
              warehouseId: data.warehouseId ?? null
            }))
          : [];

    const lines = normalizeReceiptLines(sourceLines, data.warehouseId ?? null);
    if (!lines.length) throw Errors.validation('يجب إدخال بنود سند الاستلام أو تحديد أمر شراء');

    const sequence = await reserveNextSequenceInDb(tx, {
      documentType: 'GRN',
      branchId: data.branchId ?? refs.purchaseOrder?.branchId ?? null,
      date: docDate
    });

    return tx.purchaseReceipt.create({
      data: {
        number: sequence.number,
        branchId: data.branchId ?? refs.purchaseOrder?.branchId ?? null,
        purchaseOrderId: data.purchaseOrderId ? Number(data.purchaseOrderId) : null,
        supplierId: data.supplierId ?? refs.purchaseOrder?.supplierId ?? null,
        warehouseId: data.warehouseId ? Number(data.warehouseId) : null,
        date: docDate,
        status: 'DRAFT',
        notes: data.notes,
        lines: toJsonValue(lines)
      }
    });
  });
}

export async function updateReceipt(
  id: number,
  data: {
    branchId?: number | null;
    purchaseOrderId?: number | null;
    supplierId?: number | null;
    warehouseId?: number | null;
    date?: string;
    notes?: string | null;
    lines?: ReceiptLineInput[];
  }
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.purchaseReceipt.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('سند الاستلام غير موجود');
    if (current.status !== 'DRAFT') throw Errors.business('يمكن تعديل سند الاستلام المسودة فقط');

    const nextData = {
      branchId: data.branchId === undefined ? current.branchId : data.branchId,
      purchaseOrderId: data.purchaseOrderId === undefined ? current.purchaseOrderId : data.purchaseOrderId,
      supplierId: data.supplierId === undefined ? current.supplierId : data.supplierId,
      warehouseId: data.warehouseId === undefined ? current.warehouseId : data.warehouseId
    };

    const refs = await ensureReceiptRefs(tx, nextData);
    const sourceLines =
      data.lines && data.lines.length
        ? data.lines
        : extractReceiptLines(current.lines, nextData.warehouseId ?? null);

    const lines = normalizeReceiptLines(sourceLines, nextData.warehouseId ?? null);

    return tx.purchaseReceipt.update({
      where: { id },
      data: {
        branchId: nextData.branchId ?? null,
        purchaseOrderId: nextData.purchaseOrderId ?? null,
        supplierId: nextData.supplierId ?? refs.purchaseOrder?.supplierId ?? null,
        warehouseId: nextData.warehouseId ?? null,
        date: data.date ? parseDateOrThrow(data.date) : current.date,
        notes: data.notes ?? current.notes,
        lines: toJsonValue(lines)
      }
    });
  });
}

export async function deleteReceipt(id: number) {
  const current = await prisma.purchaseReceipt.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('سند الاستلام غير موجود');
  if (current.status !== 'DRAFT') throw Errors.business('يمكن حذف سند الاستلام المسودة فقط');
  await prisma.purchaseReceipt.delete({ where: { id } });
  return { deleted: true, id };
}

export async function approveReceipt(id: number) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.purchaseReceipt.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('سند الاستلام غير موجود');
    if (current.status !== 'DRAFT') throw Errors.business('تم ترحيل سند الاستلام مسبقاً');

    const movementsPayload = buildReceiptMovementsPayload(current);
    const createdMovements = [] as Array<Awaited<ReturnType<typeof recordInventoryMovement>>['movement']>;
    for (const movement of movementsPayload) {
      const result = await recordInventoryMovement(tx, movement);
      createdMovements.push(result.movement);
    }

    if (current.purchaseOrderId) {
      const [order, orderLines] = await Promise.all([
        tx.purchaseOrder.findUnique({ where: { id: current.purchaseOrderId } }),
        tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: current.purchaseOrderId } })
      ]);

      if (order) {
        const orderedQty = orderLines.reduce((sum, line) => sum + toNumber(line.quantity), 0);
        const receivedQty = movementsPayload.reduce((sum, line) => sum + toNumber(line.quantity), 0);
        await tx.purchaseOrder.update({
          where: { id: order.id },
          data: {
            status: receivedQty + 0.000001 >= orderedQty ? 'RECEIVED' : 'PARTIAL_RECEIPT'
          }
        });
      }
    }

    const receipt = await tx.purchaseReceipt.update({
      where: { id },
      data: { status: 'RECEIVED' }
    });

    return { receipt, createdMovements };
  });

  for (const movement of result.createdMovements) {
    emitAccountingEvent('inventory.movement.recorded', {
      recordId: movement.id,
      itemId: movement.itemId,
      branchId: movement.branchId,
      projectId: movement.projectId,
      warehouseId: movement.warehouseId,
      locationId: movement.locationId,
      quantity: toNumber(movement.quantity),
      totalCost: toNumber(movement.totalCost),
      type: movement.type,
      reference: movement.reference
    });
  }

  return result.receipt;
}

export async function listVendorInvoices(query: Record<string, unknown>, scope?: { projectIds?: number[] }) {
  return invoiceService.listInvoices({ ...query, type: 'PURCHASE', projectIds: scope?.projectIds });
}

export async function getVendorInvoice(id: number) {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      supplier: true,
      lines: true,
      payments: { include: { payment: true } },
      createdBy: true,
      journalEntry: true
    }
  });

  if (!invoice || invoice.type !== 'PURCHASE') throw Errors.notFound('فاتورة المورد غير موجودة');
  return invoice;
}

export async function createVendorInvoice(
  data: {
    supplierId?: number;
    purchaseOrderId?: number;
    purchaseReceiptId?: number;
    date?: string;
    dueDate?: string;
    projectId?: number;
    notes?: string;
    lines?: Array<{
      itemId?: number;
      description: string;
      quantity: number;
      unitPrice: number;
      discount?: number;
      taxRate?: number;
      accountId?: number;
    }>;
  },
  userId: number
) {
  let sourceSupplierId = data.supplierId;
  let sourceProjectId = data.projectId;
  let sourceLines = data.lines;

  if ((!sourceLines || !sourceLines.length) && data.purchaseReceiptId) {
    const receipt = await prisma.purchaseReceipt.findUnique({ where: { id: Number(data.purchaseReceiptId) } });
    if (!receipt) throw Errors.notFound('سند الاستلام غير موجود');
    if (String(receipt.status).toUpperCase() !== 'RECEIVED') {
      throw Errors.business('يجب ترحيل سند الاستلام قبل إنشاء فاتورة المورد');
    }
    sourceSupplierId = sourceSupplierId ?? receipt.supplierId ?? undefined;
    sourceLines = buildVendorInvoiceLinesFromReceipt(receipt);
  }

  if ((!sourceLines || !sourceLines.length) && data.purchaseOrderId) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: Number(data.purchaseOrderId) },
      include: { lines: true }
    });
    if (!order) throw Errors.notFound('أمر الشراء غير موجود');
    sourceSupplierId = sourceSupplierId ?? order.supplierId ?? undefined;
    sourceProjectId = sourceProjectId ?? order.projectId ?? undefined;
    sourceLines = buildVendorInvoiceLinesFromOrder(order.lines);
  }

  if (!sourceSupplierId) throw Errors.validation('يجب تحديد المورد');
  if (!sourceLines || !sourceLines.length) throw Errors.validation('يجب إدخال بنود فاتورة المورد أو تحديد مستند مصدر');

  return invoiceService.createInvoice(
    {
      type: 'PURCHASE',
      supplierId: sourceSupplierId,
      projectId: sourceProjectId,
      date: data.date ?? new Date().toISOString(),
      dueDate: data.dueDate,
      notes: data.notes,
      lines: sourceLines
    },
    userId
  );
}

export async function updateVendorInvoice(id: number, data: Record<string, unknown>) {
  const current = await prisma.invoice.findUnique({ where: { id } });
  if (!current || current.type !== 'PURCHASE') throw Errors.notFound('فاتورة المورد غير موجودة');
  return invoiceService.updateInvoice(id, { ...data, type: 'PURCHASE' });
}

export async function issueVendorInvoice(id: number, userId: number) {
  const current = await prisma.invoice.findUnique({ where: { id } });
  if (!current || current.type !== 'PURCHASE') throw Errors.notFound('فاتورة المورد غير موجودة');
  return invoiceService.issueInvoice(id, userId);
}

export async function cancelVendorInvoice(id: number, reason?: string) {
  const current = await prisma.invoice.findUnique({ where: { id } });
  if (!current || current.type !== 'PURCHASE') throw Errors.notFound('فاتورة المورد غير موجودة');
  return invoiceService.cancelInvoice(id, reason);
}

export async function deleteVendorInvoice(id: number) {
  const current = await prisma.invoice.findUnique({ where: { id } });
  if (!current || current.type !== 'PURCHASE') throw Errors.notFound('فاتورة المورد غير موجودة');
  return invoiceService.deleteInvoice(id);
}
