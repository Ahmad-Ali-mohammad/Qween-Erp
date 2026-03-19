import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { parseDateOrThrow } from '../../utils/date';
import { Errors } from '../../utils/response';
import { consumeStockReservationInDb, createStockReservationInDb, recordInventoryMovement, releaseStockReservationInDb } from '../inventory/service';

type MaintenanceScope = {
  branchIds?: number[];
  projectIds?: number[];
};

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  return Number(value ?? 0);
}

function buildPagination(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit))
  };
}

function addInterval(base: Date, unit: string, value: number) {
  const amount = Math.max(1, Number(value || 1));
  const next = new Date(base);

  switch (unit) {
    case 'DAY':
      next.setUTCDate(next.getUTCDate() + amount);
      break;
    case 'WEEK':
      next.setUTCDate(next.getUTCDate() + amount * 7);
      break;
    case 'YEAR':
      next.setUTCFullYear(next.getUTCFullYear() + amount);
      break;
    case 'MONTH':
    default:
      next.setUTCMonth(next.getUTCMonth() + amount);
      break;
  }

  return next;
}

async function ensureScheduleRefs(
  tx: Prisma.TransactionClient | typeof prisma,
  data: { assetId: number; branchId?: number | null; projectId?: number | null; supplierId?: number | null }
) {
  const [asset, branch, project, supplier] = await Promise.all([
    tx.fixedAsset.findUnique({ where: { id: data.assetId } }),
    data.branchId ? tx.branch.findUnique({ where: { id: Number(data.branchId) } }) : Promise.resolve(null),
    data.projectId ? tx.project.findUnique({ where: { id: Number(data.projectId) } }) : Promise.resolve(null),
    data.supplierId ? tx.supplier.findUnique({ where: { id: Number(data.supplierId) } }) : Promise.resolve(null)
  ]);

  if (!asset) throw Errors.validation('المعدة غير موجودة');
  if (data.branchId && !branch) throw Errors.validation('الفرع غير موجود');
  if (data.projectId && !project) throw Errors.validation('المشروع غير موجود');
  if (data.supplierId && !supplier) throw Errors.validation('المورد غير موجود');

  return { asset, branch, project, supplier };
}

async function ensureWorkOrderRefs(
  tx: Prisma.TransactionClient | typeof prisma,
  data: { assetId: number; branchId?: number | null; projectId?: number | null; supplierId?: number | null; scheduleId?: number | null }
) {
  const refs = await ensureScheduleRefs(tx, data);
  const schedule = data.scheduleId
    ? await tx.maintenanceSchedule.findUnique({ where: { id: Number(data.scheduleId) } })
    : null;

  if (data.scheduleId && !schedule) throw Errors.validation('جدول الصيانة غير موجود');

  return { ...refs, schedule };
}

function resolveNextDueDate(schedule: { frequencyUnit: string; frequencyValue: number }, baseDate: Date) {
  return addInterval(baseDate, schedule.frequencyUnit, schedule.frequencyValue);
}

export async function listSchedules(query: Record<string, unknown>, scope?: MaintenanceScope) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(query.limit ?? 20)));
  const skip = (page - 1) * limit;

  const where: Prisma.MaintenanceScheduleWhereInput = {
    ...(query.assetId ? { assetId: Number(query.assetId) } : {}),
    ...(query.branchId ? { branchId: Number(query.branchId) } : {}),
    ...(query.projectId ? { projectId: Number(query.projectId) } : {}),
    ...(query.supplierId ? { supplierId: Number(query.supplierId) } : {}),
    ...(query.status ? { status: String(query.status) } : {}),
    ...(!query.branchId && scope?.branchIds?.length ? { branchId: { in: scope.branchIds.map(Number) } } : {}),
    ...(!query.projectId && scope?.projectIds?.length ? { projectId: { in: scope.projectIds.map(Number) } } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.maintenanceSchedule.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ nextDueDate: 'asc' }, { id: 'desc' }],
      include: {
        asset: true,
        project: true,
        supplier: true
      }
    }),
    prisma.maintenanceSchedule.count({ where })
  ]);

  return { rows, pagination: buildPagination(page, limit, total) };
}

export async function getSchedule(id: number) {
  const schedule = await prisma.maintenanceSchedule.findUnique({
    where: { id },
    include: {
      asset: true,
      project: true,
      supplier: true
    }
  });
  if (!schedule) throw Errors.notFound('جدول الصيانة غير موجود');
  return schedule;
}

export async function createSchedule(data: {
  assetId: number;
  branchId?: number | null;
  projectId?: number | null;
  supplierId?: number | null;
  title?: string | null;
  frequencyUnit?: string;
  frequencyValue?: number;
  startDate?: string;
  nextDueDate?: string;
  status?: string;
  notes?: string | null;
}) {
  await ensureScheduleRefs(prisma, data);

  const startDate = data.startDate ? parseDateOrThrow(data.startDate, 'startDate') : null;
  const nextDueDate = data.nextDueDate
    ? parseDateOrThrow(data.nextDueDate, 'nextDueDate')
    : startDate ?? null;

  return prisma.maintenanceSchedule.create({
    data: {
      assetId: data.assetId,
      branchId: data.branchId ?? null,
      projectId: data.projectId ?? null,
      supplierId: data.supplierId ?? null,
      title: data.title ?? null,
      frequencyUnit: data.frequencyUnit ?? 'MONTH',
      frequencyValue: data.frequencyValue ?? 1,
      startDate,
      nextDueDate,
      status: data.status ?? 'ACTIVE',
      notes: data.notes ?? null
    }
  });
}

export async function updateSchedule(id: number, data: Partial<{
  assetId: number;
  branchId: number | null;
  projectId: number | null;
  supplierId: number | null;
  title: string | null;
  frequencyUnit: string;
  frequencyValue: number;
  startDate: string | null;
  nextDueDate: string | null;
  status: string;
  notes: string | null;
}>) {
  const current = await prisma.maintenanceSchedule.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('جدول الصيانة غير موجود');

  const assetId = data.assetId ?? current.assetId;
  await ensureScheduleRefs(prisma, {
    assetId,
    branchId: data.branchId ?? current.branchId,
    projectId: data.projectId ?? current.projectId,
    supplierId: data.supplierId ?? current.supplierId
  });

  return prisma.maintenanceSchedule.update({
    where: { id },
    data: {
      assetId,
      branchId: data.branchId === undefined ? current.branchId : data.branchId,
      projectId: data.projectId === undefined ? current.projectId : data.projectId,
      supplierId: data.supplierId === undefined ? current.supplierId : data.supplierId,
      title: data.title === undefined ? current.title : data.title,
      frequencyUnit: data.frequencyUnit ?? current.frequencyUnit,
      frequencyValue: data.frequencyValue ?? current.frequencyValue,
      startDate: data.startDate ? parseDateOrThrow(data.startDate, 'startDate') : data.startDate === null ? null : current.startDate,
      nextDueDate: data.nextDueDate ? parseDateOrThrow(data.nextDueDate, 'nextDueDate') : data.nextDueDate === null ? null : current.nextDueDate,
      status: data.status ?? current.status,
      notes: data.notes === undefined ? current.notes : data.notes
    }
  });
}

export async function listWorkOrders(query: Record<string, unknown>, scope?: MaintenanceScope) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(query.limit ?? 20)));
  const skip = (page - 1) * limit;

  const where: Prisma.MaintenanceWorkOrderWhereInput = {
    ...(query.assetId ? { assetId: Number(query.assetId) } : {}),
    ...(query.branchId ? { branchId: Number(query.branchId) } : {}),
    ...(query.projectId ? { projectId: Number(query.projectId) } : {}),
    ...(query.supplierId ? { supplierId: Number(query.supplierId) } : {}),
    ...(query.scheduleId ? { scheduleId: Number(query.scheduleId) } : {}),
    ...(query.status ? { status: String(query.status) } : {}),
    ...(query.priority ? { priority: String(query.priority) } : {}),
    ...(!query.branchId && scope?.branchIds?.length ? { branchId: { in: scope.branchIds.map(Number) } } : {}),
    ...(!query.projectId && scope?.projectIds?.length ? { projectId: { in: scope.projectIds.map(Number) } } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.maintenanceWorkOrder.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      include: {
        asset: true,
        project: true,
        supplier: true,
        schedule: true
      }
    }),
    prisma.maintenanceWorkOrder.count({ where })
  ]);

  return { rows, pagination: buildPagination(page, limit, total) };
}

export async function getWorkOrder(id: number) {
  const workOrder = await prisma.maintenanceWorkOrder.findUnique({
    where: { id },
    include: {
      asset: true,
      project: true,
      supplier: true,
      schedule: true,
      spareParts: {
        include: {
          item: true,
          warehouse: true
        }
      }
    }
  });
  if (!workOrder) throw Errors.notFound('أمر العمل غير موجود');
  return workOrder;
}

export async function createWorkOrder(data: {
  scheduleId?: number | null;
  assetId?: number;
  branchId?: number | null;
  projectId?: number | null;
  supplierId?: number | null;
  priority?: string;
  requestedAt?: string;
  dueDate?: string;
  cost?: number;
  description?: string | null;
  notes?: string | null;
  createdById?: number | null;
}) {
  return prisma.$transaction(async (tx) => {
    const schedule = data.scheduleId ? await tx.maintenanceSchedule.findUnique({ where: { id: Number(data.scheduleId) } }) : null;
    if (data.scheduleId && !schedule) throw Errors.validation('جدول الصيانة غير موجود');

    const assetId = data.assetId ?? schedule?.assetId;
    if (!assetId) throw Errors.validation('يجب تحديد المعدة');
    if (schedule && data.assetId && Number(data.assetId) !== Number(schedule.assetId)) {
      throw Errors.validation('المعدة لا تطابق جدول الصيانة المرتبط');
    }

    await ensureWorkOrderRefs(tx, {
      assetId,
      branchId: data.branchId ?? schedule?.branchId ?? null,
      projectId: data.projectId ?? schedule?.projectId ?? null,
      supplierId: data.supplierId ?? schedule?.supplierId ?? null,
      scheduleId: data.scheduleId ?? null
    });

    const requestedAt = data.requestedAt ? parseDateOrThrow(data.requestedAt, 'requestedAt') : new Date();

    return tx.maintenanceWorkOrder.create({
      data: {
        scheduleId: schedule?.id ?? null,
        assetId,
        branchId: data.branchId ?? schedule?.branchId ?? null,
        projectId: data.projectId ?? schedule?.projectId ?? null,
        supplierId: data.supplierId ?? schedule?.supplierId ?? null,
        priority: data.priority ?? 'MEDIUM',
        status: 'OPEN',
        requestedAt,
        dueDate: data.dueDate ? parseDateOrThrow(data.dueDate, 'dueDate') : null,
        cost: Number(data.cost ?? 0),
        description: data.description ?? null,
        notes: data.notes ?? null,
        createdById: data.createdById ?? null
      }
    });
  });
}

export async function updateWorkOrder(id: number, data: Partial<{
  scheduleId: number | null;
  assetId: number;
  branchId: number | null;
  projectId: number | null;
  supplierId: number | null;
  priority: string;
  status: string;
  requestedAt: string;
  dueDate: string | null;
  cost: number;
  description: string | null;
  notes: string | null;
}>) {
  const current = await prisma.maintenanceWorkOrder.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('أمر العمل غير موجود');

  await ensureWorkOrderRefs(prisma, {
    assetId: data.assetId ?? current.assetId,
    branchId: data.branchId ?? current.branchId,
    projectId: data.projectId ?? current.projectId,
    supplierId: data.supplierId ?? current.supplierId,
    scheduleId: data.scheduleId ?? current.scheduleId
  });

  return prisma.maintenanceWorkOrder.update({
    where: { id },
    data: {
      scheduleId: data.scheduleId === undefined ? current.scheduleId : data.scheduleId,
      assetId: data.assetId ?? current.assetId,
      branchId: data.branchId === undefined ? current.branchId : data.branchId,
      projectId: data.projectId === undefined ? current.projectId : data.projectId,
      supplierId: data.supplierId === undefined ? current.supplierId : data.supplierId,
      priority: data.priority ?? current.priority,
      status: data.status ?? current.status,
      requestedAt: data.requestedAt ? parseDateOrThrow(data.requestedAt, 'requestedAt') : current.requestedAt,
      dueDate: data.dueDate ? parseDateOrThrow(data.dueDate, 'dueDate') : data.dueDate === null ? null : current.dueDate,
      cost: data.cost === undefined ? current.cost : data.cost,
      description: data.description === undefined ? current.description : data.description,
      notes: data.notes === undefined ? current.notes : data.notes
    }
  });
}

export async function completeWorkOrder(id: number, data: { completedAt?: string; cost?: number; notes?: string | null }) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.maintenanceWorkOrder.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('Work order not found');
    if (current.status === 'COMPLETED') throw Errors.business('Work order already completed');

    const completedAt = data.completedAt ? parseDateOrThrow(data.completedAt, 'completedAt') : new Date();

    const updated = await tx.maintenanceWorkOrder.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt,
        cost: data.cost === undefined ? current.cost : data.cost,
        notes: data.notes === undefined ? current.notes : data.notes
      }
    });

    const spareParts = await tx.maintenanceSparePart.findMany({ where: { workOrderId: id } });

    for (const part of spareParts) {
      const reservedQty = Number(part.reservedQty ?? 0);
      const baseQty = Number(part.quantity ?? 0);
      const quantity = reservedQty > 0 ? reservedQty : baseQty;
      if (!Number.isFinite(quantity) || quantity <= 0) continue;

      if (part.warehouseId) {
        await recordInventoryMovement(tx, {
          date: completedAt,
          type: 'ISSUE',
          reference: `WO-${id}`,
          itemId: part.itemId,
          branchId: updated.branchId ?? undefined,
          projectId: updated.projectId ?? undefined,
          warehouseId: part.warehouseId,
          quantity: -quantity,
          unitCost: Number(part.unitCost ?? 0),
          notes: `Maintenance work order ${id}`
        });
      }

      if (part.stockReservationId) {
        await consumeStockReservationInDb(tx, part.stockReservationId, { releasedAt: completedAt.toISOString() });
      }

      await tx.maintenanceSparePart.update({
        where: { id: part.id },
        data: {
          status: 'ISSUED',
          reservedQty: 0,
          issuedQty: quantity
        }
      });
    }

    if (updated.scheduleId) {
      const schedule = await tx.maintenanceSchedule.findUnique({ where: { id: updated.scheduleId } });
      if (schedule) {
        const nextDueDate = resolveNextDueDate(schedule, completedAt);
        await tx.maintenanceSchedule.update({
          where: { id: schedule.id },
          data: {
            lastExecutedAt: completedAt,
            nextDueDate
          }
        });
      }
    }

    return updated;
  });
}

export async function cancelWorkOrder(id: number, notes?: string | null) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.maintenanceWorkOrder.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('Work order not found');
    if (current.status === 'COMPLETED') throw Errors.business('Cannot cancel completed work order');

    const releasedAt = new Date().toISOString();
    const spareParts = await tx.maintenanceSparePart.findMany({ where: { workOrderId: id } });

    for (const part of spareParts) {
      if (part.stockReservationId) {
        await releaseStockReservationInDb(tx, part.stockReservationId, { releasedAt });
      }
      if (part.status !== 'CANCELLED') {
        await tx.maintenanceSparePart.update({
          where: { id: part.id },
          data: {
            status: 'CANCELLED',
            reservedQty: 0
          }
        });
      }
    }

    return tx.maintenanceWorkOrder.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        notes: notes ?? current.notes
      }
    });
  });
}

export async function listSpareParts(workOrderId: number) {
  return prisma.maintenanceSparePart.findMany({
    where: { workOrderId },
    include: { item: true, warehouse: true },
    orderBy: [{ id: 'asc' }]
  });
}

export async function addSparePart(workOrderId: number, data: {
  itemId: number;
  warehouseId?: number | null;
  quantity: number;
  unitCost?: number;
  notes?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const workOrder = await tx.maintenanceWorkOrder.findUnique({ where: { id: workOrderId } });
    if (!workOrder) throw Errors.notFound('أمر العمل غير موجود');

    const item = await tx.item.findUnique({ where: { id: data.itemId } });
    if (!item) throw Errors.validation('الصنف غير موجود');

    const warehouse = data.warehouseId ? await tx.warehouse.findUnique({ where: { id: data.warehouseId } }) : null;
    if (data.warehouseId && !warehouse) throw Errors.validation('المستودع غير موجود');

    const quantity = Number(data.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw Errors.validation('الكمية غير صالحة');

    const unitCost = Number(data.unitCost ?? item.purchasePrice ?? 0);
    const totalCost = quantity * unitCost;

    const reservation = data.warehouseId
      ? await createStockReservationInDb(tx, {
          reference: `WO-${workOrderId}`,
          sourceType: 'MAINTENANCE',
          sourceId: workOrderId,
          itemId: data.itemId,
          warehouseId: data.warehouseId,
          branchId: workOrder.branchId ?? null,
          projectId: workOrder.projectId ?? null,
          quantity,
          notes: data.notes ?? null
        })
      : null;

    return tx.maintenanceSparePart.create({
      data: {
        workOrderId,
        itemId: data.itemId,
        warehouseId: data.warehouseId ?? null,
        stockReservationId: reservation?.id ?? null,
        quantity,
        reservedQty: reservation ? quantity : 0,
        issuedQty: 0,
        unitCost,
        totalCost,
        status: reservation ? 'RESERVED' : 'REQUESTED',
        notes: data.notes ?? null
      },
      include: { item: true, warehouse: true }
    });
  });
}

export async function removeSparePart(id: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.maintenanceSparePart.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('Spare part not found');

    if (current.stockReservationId) {
      await releaseStockReservationInDb(tx, current.stockReservationId);
    }

    return tx.maintenanceSparePart.delete({ where: { id } });
  });
}
