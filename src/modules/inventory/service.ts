import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { parseDateOrThrow } from '../../utils/date';
import { buildSequentialNumber } from '../../utils/id-generator';
import { Errors } from '../../utils/response';
import { emitAccountingEvent } from '../accounting/events';
import { applyLedgerLines } from '../shared/ledger';
import { resolvePostingAccounts } from '../shared/posting-accounts';

type InventoryDb = Prisma.TransactionClient | typeof prisma;

function toNumber(value: Prisma.Decimal | string | number | null | undefined): number {
  return Number(value ?? 0);
}

function normalizeSignedTotalCost(quantity: number, unitCost?: number, totalCost?: number): number {
  const base = totalCost !== undefined ? Math.abs(Number(totalCost)) : Math.abs(quantity) * Math.abs(Number(unitCost ?? 0));
  if (quantity < 0) return -base;
  if (quantity > 0) return base;
  return 0;
}

function buildMovementEventPayload(movement: {
  id: number;
  itemId: number;
  branchId: number | null;
  projectId: number | null;
  warehouseId: number;
  locationId: number | null;
  quantity: Prisma.Decimal | string | number;
  totalCost: Prisma.Decimal | string | number;
  type: string;
  reference: string | null;
}) {
  return {
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
  };
}

async function ensureMovementRefs(
  db: InventoryDb,
  data: {
    itemId: number;
    warehouseId: number;
    locationId?: number | null;
    branchId?: number | null;
    projectId?: number | null;
  }
) {
  const [item, warehouse, location, branch, project] = await Promise.all([
    db.item.findUnique({ where: { id: data.itemId } }),
    db.warehouse.findUnique({ where: { id: data.warehouseId } }),
    data.locationId ? db.warehouseLocation.findUnique({ where: { id: Number(data.locationId) } }) : Promise.resolve(null),
    data.branchId ? db.branch.findUnique({ where: { id: data.branchId } }) : Promise.resolve(null),
    data.projectId ? db.project.findUnique({ where: { id: data.projectId } }) : Promise.resolve(null)
  ]);

  if (!item) throw Errors.validation('Item not found');
  if (!warehouse) throw Errors.validation('Warehouse not found');
  if (data.locationId && !location) throw Errors.validation('Warehouse location not found');
  if (data.locationId && location && Number(location.warehouseId) !== Number(data.warehouseId)) {
    throw Errors.validation('Location does not belong to warehouse');
  }
  if (data.branchId && !branch) throw Errors.validation('Branch not found');
  if (data.projectId && !project) throw Errors.validation('Project not found');
  if (data.branchId && warehouse.branchId && Number(warehouse.branchId) !== Number(data.branchId)) {
    throw Errors.validation('Warehouse does not belong to branch');
  }
  if (data.branchId && project?.branchId && Number(project.branchId) !== Number(data.branchId)) {
    throw Errors.validation('Project does not belong to branch');
  }
}

async function ensureReservationRefs(
  db: InventoryDb,
  data: {
    itemId: number;
    warehouseId: number;
    locationId?: number | null;
    branchId?: number | null;
    projectId?: number | null;
  }
) {
  const [item, warehouse, location, branch, project] = await Promise.all([
    db.item.findUnique({ where: { id: data.itemId } }),
    db.warehouse.findUnique({ where: { id: data.warehouseId } }),
    data.locationId ? db.warehouseLocation.findUnique({ where: { id: Number(data.locationId) } }) : Promise.resolve(null),
    data.branchId ? db.branch.findUnique({ where: { id: data.branchId } }) : Promise.resolve(null),
    data.projectId ? db.project.findUnique({ where: { id: data.projectId } }) : Promise.resolve(null)
  ]);

  if (!item) throw Errors.validation('Item not found');
  if (!warehouse) throw Errors.validation('Warehouse not found');
  if (data.locationId && !location) throw Errors.validation('Warehouse location not found');
  if (data.locationId && location && Number(location.warehouseId) !== Number(data.warehouseId)) {
    throw Errors.validation('Location does not belong to warehouse');
  }
  if (data.branchId && !branch) throw Errors.validation('Branch not found');
  if (data.projectId && !project) throw Errors.validation('Project not found');
  if (data.branchId && warehouse.branchId && Number(warehouse.branchId) !== Number(data.branchId)) {
    throw Errors.validation('Warehouse does not belong to branch');
  }
  if (data.branchId && project?.branchId && Number(project.branchId) !== Number(data.branchId)) {
    throw Errors.validation('Project does not belong to branch');
  }
}

function normalizeReservationQuantity(value: number) {
  const qty = Number(value);
  if (!Number.isFinite(qty) || qty <= 0) throw Errors.validation('Invalid quantity');
  return qty;
}

const RESERVATION_STATUSES = new Set(['RESERVED', 'RELEASED', 'CONSUMED']);

function normalizeReservationStatus(status?: string) {
  if (!status) return undefined;
  const normalized = String(status).trim().toUpperCase();
  if (!RESERVATION_STATUSES.has(normalized)) {
    throw Errors.validation('حالة الحجز غير صالحة');
  }
  return normalized;
}

async function getReservedQuantity(
  db: InventoryDb,
  data: { itemId: number; warehouseId: number; locationId?: number | null }
) {
  const base: Prisma.StockReservationWhereInput = {
    itemId: data.itemId,
    warehouseId: data.warehouseId,
    status: 'RESERVED'
  };
  const where: Prisma.StockReservationWhereInput =
    data.locationId !== undefined && data.locationId !== null
      ? {
          ...base,
          OR: [{ locationId: data.locationId }, { locationId: null }]
        }
      : base;

  const aggregate = await db.stockReservation.aggregate({
    where,
    _sum: { quantity: true }
  });

  return toNumber(aggregate._sum.quantity);
}

async function getOnHandQuantity(
  db: InventoryDb,
  data: { itemId: number; warehouseId: number; locationId?: number | null }
) {
  if (data.locationId !== undefined && data.locationId !== null) {
    const balance = await db.stockBalance.findFirst({
      where: {
        itemId: data.itemId,
        warehouseId: data.warehouseId,
        locationId: data.locationId
      }
    });
    return toNumber(balance?.quantity);
  }

  const aggregate = await db.stockBalance.aggregate({
    where: {
      itemId: data.itemId,
      warehouseId: data.warehouseId
    },
    _sum: { quantity: true }
  });

  return toNumber(aggregate._sum.quantity);
}

async function getAvailableQuantity(
  db: InventoryDb,
  data: { itemId: number; warehouseId: number; locationId?: number | null }
) {
  const [onHandQty, reservedQty] = await Promise.all([
    getOnHandQuantity(db, data),
    getReservedQuantity(db, data)
  ]);

  return {
    onHandQty,
    reservedQty,
    availableQty: onHandQty - reservedQty
  };
}

async function ensureReservationCapacity(
  db: InventoryDb,
  data: { itemId: number; warehouseId: number; locationId?: number | null; quantity: number }
) {
  const allowNegative = await isNegativeStockAllowed(db);
  if (allowNegative) return;

  const availability = await getAvailableQuantity(db, data);
  if (availability.availableQty + 0.000001 < data.quantity) {
    throw Errors.business('الكمية المطلوبة أكبر من المتاح بعد الحجوزات');
  }
}

async function ensureIssueCapacity(
  db: InventoryDb,
  data: { itemId: number; warehouseId: number; locationId?: number | null; quantityDelta: number }
) {
  if (data.quantityDelta >= 0) return;

  const allowNegative = await isNegativeStockAllowed(db);
  if (allowNegative) return;

  const availability = await getAvailableQuantity(db, data);
  if (availability.availableQty + data.quantityDelta < -0.000001) {
    throw Errors.business('الكمية المصروفة تتجاوز المتاح بعد الحجوزات');
  }
}


async function isNegativeStockAllowed(db: InventoryDb) {
  const settings = await db.systemSettings.findUnique({ where: { id: 1 }, select: { allowNegativeStock: true } });
  return Boolean(settings?.allowNegativeStock);
}

async function applyInventoryDelta(
  db: InventoryDb,
  input: { itemId: number; warehouseId: number; locationId?: number | null; quantityDelta: number; valueDelta: number }
) {
  const locationId = input.locationId ?? null;
  const allowNegativeStock = await isNegativeStockAllowed(db);
  const existing = await db.stockBalance.findFirst({
    where: {
      itemId: input.itemId,
      warehouseId: input.warehouseId,
      locationId
    }
  });

  const currentQty = toNumber(existing?.quantity);
  const currentValue = toNumber(existing?.value);
  const nextQty = currentQty + input.quantityDelta;
  const nextValueRaw = currentValue + input.valueDelta;
  const nextValue = Math.abs(nextQty) < 0.000001 ? 0 : nextValueRaw;
  const nextAvgCost = Math.abs(nextQty) < 0.000001 ? 0 : nextValue / nextQty;

  if (!allowNegativeStock && nextQty < -0.000001) {
    throw Errors.business('الحركة تؤدي إلى رصيد مخزني سالب');
  }

  if (existing) {
    await db.stockBalance.update({
      where: { id: existing.id },
      data: {
        quantity: nextQty,
        value: nextValue,
        avgCost: nextAvgCost
      }
    });
  } else {
    await db.stockBalance.create({
      data: {
        itemId: input.itemId,
        warehouseId: input.warehouseId,
        locationId,
        quantity: nextQty,
        value: nextValue,
        avgCost: nextAvgCost
      }
    });
  }

  await db.item.update({
    where: { id: input.itemId },
    data: {
      onHandQty: { increment: input.quantityDelta },
      inventoryValue: { increment: input.valueDelta }
    }
  });

  return {
    quantity: nextQty,
    value: nextValue,
    avgCost: nextAvgCost
  };
}

export async function recordInventoryMovement(
  db: InventoryDb,
  data: {
    date?: string | Date;
    type: string;
    reference?: string;
    itemId: number;
    branchId?: number;
    projectId?: number;
    warehouseId: number;
    locationId?: number | null;
    quantity: number;
    unitCost?: number;
    totalCost?: number;
    notes?: string;
  }
) {
  await ensureMovementRefs(db, data);

  const quantity = Number(data.quantity);
  await ensureIssueCapacity(db, {
    itemId: data.itemId,
    warehouseId: data.warehouseId,
    locationId: data.locationId,
    quantityDelta: quantity
  });
  if (Math.abs(quantity) < 0.000001) throw Errors.validation('quantity يجب ألا يساوي صفر');

  const normalizedTotalCost = normalizeSignedTotalCost(quantity, data.unitCost, data.totalCost);
  const movement = await db.stockMovement.create({
    data: {
      date: data.date ? parseDateOrThrow(data.date) : new Date(),
      type: data.type,
      reference: data.reference,
      itemId: data.itemId,
      branchId: data.branchId ?? null,
      projectId: data.projectId ?? null,
      warehouseId: data.warehouseId,
      locationId: data.locationId ?? null,
      quantity,
      unitCost: Number(data.unitCost ?? 0),
      totalCost: normalizedTotalCost,
      notes: data.notes
    }
  });

  const balance = await applyInventoryDelta(db, {
    itemId: data.itemId,
    warehouseId: data.warehouseId,
    locationId: data.locationId,
    quantityDelta: quantity,
    valueDelta: normalizedTotalCost
  });

  return { movement, balance };
}

export async function createInventoryMovement(data: {
  date?: string;
  type: string;
  reference?: string;
  itemId: number;
  branchId?: number;
  projectId?: number;
  warehouseId: number;
  locationId?: number;
  quantity: number;
  unitCost?: number;
  totalCost?: number;
  notes?: string;
}) {
  const movement = await prisma.$transaction(async (tx) => {
    const { movement } = await recordInventoryMovement(tx, data);
    return movement;
  });

  emitAccountingEvent('inventory.movement.recorded', buildMovementEventPayload(movement));
  return movement;
}

export async function updateInventoryMovement(
  id: number,
  data: {
    date?: string;
    type?: string;
    reference?: string;
    itemId?: number;
    branchId?: number | null;
    projectId?: number | null;
    warehouseId?: number;
    locationId?: number | null;
    quantity?: number;
    unitCost?: number;
    totalCost?: number;
    notes?: string;
  }
) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.stockMovement.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('حركة المخزون غير موجودة');

    await applyInventoryDelta(tx, {
      itemId: current.itemId,
      warehouseId: current.warehouseId,
      locationId: current.locationId,
      quantityDelta: -toNumber(current.quantity),
      valueDelta: -toNumber(current.totalCost)
    });

    const next = {
      date: data.date ? parseDateOrThrow(data.date) : current.date,
      type: data.type ?? current.type,
      reference: data.reference ?? current.reference,
      itemId: data.itemId ?? current.itemId,
      branchId: data.branchId === undefined ? current.branchId : data.branchId,
      projectId: data.projectId === undefined ? current.projectId : data.projectId,
      warehouseId: data.warehouseId ?? current.warehouseId,
      locationId: data.locationId === undefined ? current.locationId : data.locationId,
      quantity: data.quantity ?? toNumber(current.quantity),
      unitCost: data.unitCost ?? toNumber(current.unitCost),
      totalCost: normalizeSignedTotalCost(
        data.quantity ?? toNumber(current.quantity),
        data.unitCost ?? toNumber(current.unitCost),
        data.totalCost ?? toNumber(current.totalCost)
      ),
      notes: data.notes ?? current.notes
    };

    await ensureMovementRefs(tx, next);
    await ensureIssueCapacity(tx, {
      itemId: next.itemId,
      warehouseId: next.warehouseId,
      locationId: next.locationId,
      quantityDelta: next.quantity
    });

    const movement = await tx.stockMovement.update({
      where: { id },
      data: next
    });

    await applyInventoryDelta(tx, {
      itemId: next.itemId,
      warehouseId: next.warehouseId,
      locationId: next.locationId,
      quantityDelta: next.quantity,
      valueDelta: next.totalCost
    });

    return { previous: current, movement };
  });

  emitAccountingEvent('inventory.movement.updated', {
    ...buildMovementEventPayload(result.movement),
    previousQuantity: toNumber(result.previous.quantity),
    previousTotalCost: toNumber(result.previous.totalCost)
  });

  return result.movement;
}

export async function deleteInventoryMovement(id: number) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.stockMovement.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('حركة المخزون غير موجودة');

    await applyInventoryDelta(tx, {
      itemId: current.itemId,
      warehouseId: current.warehouseId,
      locationId: current.locationId,
      quantityDelta: -toNumber(current.quantity),
      valueDelta: -toNumber(current.totalCost)
    });

    await tx.stockMovement.delete({ where: { id } });
    return { deleted: true, id, movement: current };
  });

  emitAccountingEvent('inventory.movement.deleted', buildMovementEventPayload(result.movement));
  return { deleted: true, id: result.id };
}


export async function listStockReservations(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(query.limit ?? 20)));
  const skip = (page - 1) * limit;

  const where: Prisma.StockReservationWhereInput = {
    ...(query.itemId ? { itemId: Number(query.itemId) } : {}),
    ...(query.warehouseId ? { warehouseId: Number(query.warehouseId) } : {}),
    ...(query.locationId ? { locationId: Number(query.locationId) } : {}),
    ...(query.branchId ? { branchId: Number(query.branchId) } : {}),
    ...(query.projectId ? { projectId: Number(query.projectId) } : {}),
    ...(query.sourceType ? { sourceType: String(query.sourceType) } : {}),
    ...(query.sourceId ? { sourceId: Number(query.sourceId) } : {}),
    ...(query.status ? { status: String(query.status) } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.stockReservation.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ reservedAt: 'desc' }, { id: 'desc' }],
      include: {
        item: true,
        warehouse: true,
        location: true,
        branch: true,
        project: true
      }
    }),
    prisma.stockReservation.count({ where })
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

export async function getStockReservation(id: number) {
  const reservation = await prisma.stockReservation.findUnique({
    where: { id },
    include: {
      item: true,
      warehouse: true,
      location: true,
      branch: true,
      project: true
    }
  });
  if (!reservation) throw Errors.notFound('Stock reservation not found');
  return reservation;
}

export async function createStockReservationInDb(
  db: InventoryDb,
  data: {
    reference?: string;
    sourceType?: string;
    sourceId?: number | null;
    itemId: number;
    warehouseId: number;
    locationId?: number | null;
    branchId?: number | null;
    projectId?: number | null;
    quantity: number;
    status?: string;
    reservedAt?: string;
    notes?: string | null;
  }
) {
  await ensureReservationRefs(db, data);

  const quantity = normalizeReservationQuantity(data.quantity);
  await ensureReservationCapacity(db, {
    itemId: data.itemId,
    warehouseId: data.warehouseId,
    locationId: data.locationId ?? null,
    quantity
  });
  const status = normalizeReservationStatus(data.status) ?? 'RESERVED';
  const reservedAt = data.reservedAt ? parseDateOrThrow(data.reservedAt, 'reservedAt') : new Date();
  const allowNegativeStock = await isNegativeStockAllowed(db);
  if (!allowNegativeStock) {
    const { availableQty } = await getAvailableQuantity(db, {
      itemId: data.itemId,
      warehouseId: data.warehouseId,
      locationId: data.locationId ?? null
    });
    if (availableQty - quantity < -0.000001) {
      throw Errors.business('الكمية المطلوبة غير متاحة للحجز');
    }
  }

  return db.stockReservation.create({
    data: {
      reference: data.reference ?? null,
      sourceType: data.sourceType ?? null,
      sourceId: data.sourceId ?? null,
      itemId: data.itemId,
      warehouseId: data.warehouseId,
      locationId: data.locationId ?? null,
      branchId: data.branchId ?? null,
      projectId: data.projectId ?? null,
      quantity,
      status,
      reservedAt,
      notes: data.notes ?? null
    }
  });
}

export async function createStockReservation(data: {
  reference?: string;
  sourceType?: string;
  sourceId?: number | null;
  itemId: number;
  warehouseId: number;
  locationId?: number | null;
  branchId?: number | null;
  projectId?: number | null;
  quantity: number;
  status?: string;
  reservedAt?: string;
  notes?: string | null;
}) {
  return prisma.$transaction((tx) => createStockReservationInDb(tx, data));
}

async function updateStockReservationStatus(
  db: InventoryDb,
  id: number,
  status: string,
  payload?: { releasedAt?: string; notes?: string | null }
) {
  const current = await db.stockReservation.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('Stock reservation not found');
  const normalizedStatus = normalizeReservationStatus(status) ?? status;
  const currentStatus = String(current.status ?? '').toUpperCase();
  if (currentStatus === normalizedStatus) return current;
  if (currentStatus !== 'RESERVED') {
    throw Errors.business('لا يمكن تعديل حجز غير نشط');
  }

  const releasedAt = payload?.releasedAt
    ? parseDateOrThrow(payload.releasedAt, 'releasedAt')
    : normalizedStatus === 'RESERVED'
      ? null
      : new Date();

  return db.stockReservation.update({
    where: { id },
    data: {
      status: normalizedStatus,
      releasedAt,
      notes: payload?.notes === undefined ? current.notes : payload.notes
    }
  });
}

export async function releaseStockReservationInDb(db: InventoryDb, id: number, payload?: { releasedAt?: string; notes?: string | null }) {
  return updateStockReservationStatus(db, id, 'RELEASED', payload);
}

export async function consumeStockReservationInDb(db: InventoryDb, id: number, payload?: { releasedAt?: string; notes?: string | null }) {
  return updateStockReservationStatus(db, id, 'CONSUMED', payload);
}

export async function releaseStockReservation(id: number, payload?: { releasedAt?: string; notes?: string | null }) {
  return prisma.$transaction((tx) => releaseStockReservationInDb(tx, id, payload));
}

export async function consumeStockReservation(id: number, payload?: { releasedAt?: string; notes?: string | null }) {
  return prisma.$transaction((tx) => consumeStockReservationInDb(tx, id, payload));
}

export async function approveStockCount(id: number, userId: number) {
  const approved = await prisma.$transaction(async (tx) => {
    const countDoc = await tx.stockCount.findUnique({ where: { id } });
    if (!countDoc) throw Errors.notFound('Ø¬Ø±Ø¯ Ø§Ù„Ù…Ø®Ø²ÙˆÙ† ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯');
    if (countDoc.status !== 'DRAFT') throw Errors.business('ÙŠÙ…ÙƒÙ† Ø§Ø¹ØªÙ…Ø§Ø¯ Ø¬Ø±Ø¯ Ù…Ø³ÙˆØ¯Ø© ÙÙ‚Ø·');

    const lines = await tx.stockCountLine.findMany({ where: { stockCountId: id } });
    const adjustmentLines: Array<{ accountId: number; debit: number; credit: number; description: string }> = [];
    const postingAccounts = await resolvePostingAccounts(tx);

    for (const line of lines) {
      const theoreticalQty = Number(line.theoreticalQty ?? 0);
      const actualQty = Number(line.actualQty ?? 0);
      const differenceQty = actualQty - theoreticalQty;
      const unitCost = Number(line.unitCost ?? 0);
      const differenceValue = differenceQty * unitCost;

      await tx.stockCountLine.update({
        where: { id: line.id },
        data: {
          differenceQty,
          differenceValue
        }
      });

      if (differenceQty === 0) continue;

      await recordInventoryMovement(tx, {
        date: countDoc.date,
        type: 'ADJUSTMENT',
        reference: countDoc.number,
        itemId: line.itemId,
        warehouseId: countDoc.warehouseId,
        quantity: differenceQty,
        unitCost,
        totalCost: differenceValue,
        notes: `Ø§Ø¹ØªÙ…Ø§Ø¯ Ø¬Ø±Ø¯ ${countDoc.number}`
      });

      if (differenceValue > 0) {
        adjustmentLines.push({
          accountId: postingAccounts.inventoryAccountId,
          debit: differenceValue,
          credit: 0,
          description: `ØªØ³ÙˆÙŠØ© Ø¬Ø±Ø¯ ${countDoc.number} - Ø²ÙŠØ§Ø¯Ø©`
        });
        adjustmentLines.push({
          accountId: postingAccounts.stockAdjustmentGainAccountId,
          debit: 0,
          credit: differenceValue,
          description: `ØªØ³ÙˆÙŠØ© Ø¬Ø±Ø¯ ${countDoc.number} - Ø²ÙŠØ§Ø¯Ø©`
        });
      } else if (differenceValue < 0) {
        const amount = Math.abs(differenceValue);
        adjustmentLines.push({
          accountId: postingAccounts.stockAdjustmentLossAccountId,
          debit: amount,
          credit: 0,
          description: `ØªØ³ÙˆÙŠØ© Ø¬Ø±Ø¯ ${countDoc.number} - Ø¹Ø¬Ø²`
        });
        adjustmentLines.push({
          accountId: postingAccounts.inventoryAccountId,
          debit: 0,
          credit: amount,
          description: `ØªØ³ÙˆÙŠØ© Ø¬Ø±Ø¯ ${countDoc.number} - Ø¹Ø¬Ø²`
        });
      }
    }

    if (adjustmentLines.length) {
      const period = await tx.accountingPeriod.findFirst({
        where: { startDate: { lte: countDoc.date }, endDate: { gte: countDoc.date }, status: 'OPEN', canPost: true },
        include: { fiscalYear: true }
      });
      if (!period || period.fiscalYear.status !== 'OPEN') throw Errors.business('Ù„Ø§ ØªÙˆØ¬Ø¯ ÙØªØ±Ø© Ù…Ø­Ø§Ø³Ø¨ÙŠØ© Ù…ÙØªÙˆØ­Ø©');

      const debit = adjustmentLines.reduce((s, l) => s + Number(l.debit), 0);
      const credit = adjustmentLines.reduce((s, l) => s + Number(l.credit), 0);
      const seq = await tx.journalEntry.count();
      const entryNumber = buildSequentialNumber('STKJ', seq, new Date(countDoc.date).getUTCFullYear());

      const entry = await tx.journalEntry.create({
        data: {
          entryNumber,
          date: countDoc.date,
          periodId: period.id,
          description: `Ù‚ÙŠØ¯ ØªØ³ÙˆÙŠØ© Ø¬Ø±Ø¯ ${countDoc.number}`,
          reference: countDoc.number,
          source: 'MANUAL',
          status: 'POSTED',
          totalDebit: debit,
          totalCredit: credit,
          createdById: userId,
          postedById: userId,
          postedAt: new Date()
        }
      });

      await tx.journalLine.createMany({
        data: adjustmentLines.map((line, idx) => ({
          entryId: entry.id,
          lineNumber: idx + 1,
          accountId: line.accountId,
          description: line.description,
          debit: line.debit,
          credit: line.credit
        }))
      });

      await applyLedgerLines(tx, countDoc.date, period.number, adjustmentLines);
    }

    return tx.stockCount.update({
      where: { id },
      data: { status: 'APPROVED' }
    });
  });

  return approved;
}
