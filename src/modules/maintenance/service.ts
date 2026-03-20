import { prisma } from '../../config/database';
import { enqueueOutboxEvent } from '../../platform/events/outbox';
import { buildSequentialNumberFromLatest } from '../../utils/id-generator';
import { parseDateOrThrow } from '../../utils/date';
import { Errors } from '../../utils/response';

function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

function toAmount(value: unknown, fieldName: string, allowNull = false): number | null {
  if ((value === undefined || value === null || value === '') && allowNull) return null;
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw Errors.validation(`${fieldName} غير صالح`);
  return roundAmount(parsed);
}

function toPositiveInt(value: unknown, fieldName: string, allowNull = false): number | null {
  if ((value === undefined || value === null || value === '') && allowNull) return null;
  const parsed = Number(value ?? 0);
  if (!Number.isInteger(parsed) || parsed <= 0) throw Errors.validation(`${fieldName} غير صالح`);
  return parsed;
}

function toText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function buildPage(query: any) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
  return { page, limit, skip: (page - 1) * limit };
}

async function generateNumber(
  tx: any,
  modelName: 'maintenancePlan' | 'maintenanceOrder' | 'failureAnalysis',
  prefix: string,
  useCode = false
) {
  const year = new Date().getUTCFullYear();
  const field = useCode ? 'code' : 'number';
  const latest = await tx[modelName].findFirst({
    where: {
      [field]: {
        startsWith: `${prefix}-${year}-`
      }
    },
    select: { [field]: true },
    orderBy: { [field]: 'desc' }
  });
  return buildSequentialNumberFromLatest(prefix, latest?.[field], year);
}

async function ensureProject(tx: any, projectId: number | null) {
  if (!projectId) return null;
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { id: true, code: true, nameAr: true, branchId: true, isActive: true }
  });
  if (!project) throw Errors.notFound('المشروع غير موجود');
  if (!project.isActive) throw Errors.business('المشروع غير نشط');
  return project;
}

async function ensureAsset(tx: any, assetId: number | null) {
  if (!assetId) return null;
  const asset = await tx.fixedAsset.findUnique({
    where: { id: assetId },
    select: { id: true, code: true, nameAr: true, branchId: true, status: true }
  });
  if (!asset) throw Errors.notFound('الأصل أو المعدة غير موجود');
  return asset;
}

async function ensureEmployee(tx: any, employeeId: number | null) {
  if (!employeeId) return null;
  const employee = await tx.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, code: true, fullName: true, status: true }
  });
  if (!employee) throw Errors.notFound('الموظف غير موجود');
  if (String(employee.status).toUpperCase() !== 'ACTIVE') throw Errors.business('الموظف غير نشط');
  return employee;
}

async function ensureItem(tx: any, itemId: number | null) {
  if (!itemId) return null;
  const item = await tx.item.findUnique({
    where: { id: itemId },
    select: { id: true, code: true, nameAr: true, onHandQty: true, purchasePrice: true, inventoryValue: true }
  });
  if (!item) throw Errors.notFound('الصنف غير موجود');
  return item;
}

async function ensureWarehouse(tx: any, warehouseId: number | null) {
  if (!warehouseId) return null;
  const warehouse = await tx.warehouse.findUnique({
    where: { id: warehouseId },
    select: { id: true, code: true, nameAr: true, branchId: true, isActive: true }
  });
  if (!warehouse) throw Errors.notFound('المستودع غير موجود');
  if (!warehouse.isActive) throw Errors.business('المستودع غير نشط');
  return warehouse;
}

async function ensurePlan(tx: any, planId: number | null) {
  if (!planId) return null;
  const plan = await tx.maintenancePlan.findUnique({
    where: { id: planId },
    select: { id: true, code: true, title: true, assetId: true, projectId: true, branchId: true }
  });
  if (!plan) throw Errors.notFound('خطة الصيانة غير موجودة');
  return plan;
}

async function ensureOrder(tx: any, orderId: number | null) {
  if (!orderId) return null;
  const order = await tx.maintenanceOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      number: true,
      title: true,
      assetId: true,
      projectId: true,
      branchId: true,
      status: true,
      approvalStatus: true,
      actualCost: true
    }
  });
  if (!order) throw Errors.notFound('أمر الصيانة غير موجود');
  return order;
}

async function fetchLabelsByIds<T>(tx: any, modelName: string, ids: Array<number | null | undefined>, select: Record<string, boolean>): Promise<Map<number, T>> {
  const uniqueIds = Array.from(new Set(ids.filter((value): value is number => Number.isInteger(value) && Number(value) > 0)));
  if (!uniqueIds.length) return new Map<number, T>();
  const rows = await tx[modelName].findMany({ where: { id: { in: uniqueIds } }, select });
  return new Map<number, T>(rows.map((row: any) => [row.id, row]));
}

async function enrichPlanRows(tx: any, rows: any[]) {
  const [assetMap, projectMap] = await Promise.all([
    fetchLabelsByIds<any>(tx, 'fixedAsset', rows.map((row) => row.assetId), { id: true, code: true, nameAr: true }),
    fetchLabelsByIds<any>(tx, 'project', rows.map((row) => row.projectId), { id: true, code: true, nameAr: true })
  ]);
  return rows.map((row) => ({
    ...row,
    asset: row.assetId ? assetMap.get(row.assetId) ?? null : null,
    project: row.projectId ? projectMap.get(row.projectId) ?? null : null
  }));
}

async function enrichOrderRows(tx: any, rows: any[]) {
  const [planMap, assetMap, projectMap] = await Promise.all([
    fetchLabelsByIds<any>(tx, 'maintenancePlan', rows.map((row) => row.planId), { id: true, code: true, title: true }),
    fetchLabelsByIds<any>(tx, 'fixedAsset', rows.map((row) => row.assetId), { id: true, code: true, nameAr: true }),
    fetchLabelsByIds<any>(tx, 'project', rows.map((row) => row.projectId), { id: true, code: true, nameAr: true })
  ]);
  return rows.map((row) => ({
    ...row,
    plan: row.planId ? planMap.get(row.planId) ?? null : null,
    asset: row.assetId ? assetMap.get(row.assetId) ?? null : null,
    project: row.projectId ? projectMap.get(row.projectId) ?? null : null
  }));
}

async function enrichExecutionRows(tx: any, rows: any[]) {
  const [orderMap, assetMap, projectMap, employeeMap, itemMap, warehouseMap] = await Promise.all([
    fetchLabelsByIds<any>(tx, 'maintenanceOrder', rows.map((row) => row.orderId), { id: true, number: true, title: true }),
    fetchLabelsByIds<any>(tx, 'fixedAsset', rows.map((row) => row.assetId), { id: true, code: true, nameAr: true }),
    fetchLabelsByIds<any>(tx, 'project', rows.map((row) => row.projectId), { id: true, code: true, nameAr: true }),
    fetchLabelsByIds<any>(tx, 'employee', rows.map((row) => row.technicianEmployeeId), { id: true, code: true, fullName: true }),
    fetchLabelsByIds<any>(tx, 'item', rows.map((row) => row.spareItemId), { id: true, code: true, nameAr: true }),
    fetchLabelsByIds<any>(tx, 'warehouse', rows.map((row) => row.warehouseId), { id: true, code: true, nameAr: true })
  ]);

  return rows.map((row) => ({
    ...row,
    order: row.orderId ? orderMap.get(row.orderId) ?? null : null,
    asset: row.assetId ? assetMap.get(row.assetId) ?? null : null,
    project: row.projectId ? projectMap.get(row.projectId) ?? null : null,
    technician: row.technicianEmployeeId ? employeeMap.get(row.technicianEmployeeId) ?? null : null,
    spareItem: row.spareItemId ? itemMap.get(row.spareItemId) ?? null : null,
    warehouse: row.warehouseId ? warehouseMap.get(row.warehouseId) ?? null : null
  }));
}

async function enrichFailureRows(tx: any, rows: any[]) {
  const [orderMap, assetMap, projectMap] = await Promise.all([
    fetchLabelsByIds<any>(tx, 'maintenanceOrder', rows.map((row) => row.orderId), { id: true, number: true, title: true }),
    fetchLabelsByIds<any>(tx, 'fixedAsset', rows.map((row) => row.assetId), { id: true, code: true, nameAr: true }),
    fetchLabelsByIds<any>(tx, 'project', rows.map((row) => row.projectId), { id: true, code: true, nameAr: true })
  ]);
  return rows.map((row) => ({
    ...row,
    order: row.orderId ? orderMap.get(row.orderId) ?? null : null,
    asset: row.assetId ? assetMap.get(row.assetId) ?? null : null,
    project: row.projectId ? projectMap.get(row.projectId) ?? null : null
  }));
}

async function fetchPlan(tx: any, id: number) {
  const row = await tx.maintenancePlan.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('خطة الصيانة غير موجودة');
  return (await enrichPlanRows(tx, [row]))[0];
}

async function fetchOrder(tx: any, id: number) {
  const row = await tx.maintenanceOrder.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('أمر الصيانة غير موجود');
  return (await enrichOrderRows(tx, [row]))[0];
}

async function fetchExecution(tx: any, id: number) {
  const row = await tx.maintenanceExecution.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('تنفيذ الصيانة غير موجود');
  return (await enrichExecutionRows(tx, [row]))[0];
}

async function fetchFailure(tx: any, id: number) {
  const row = await tx.failureAnalysis.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('تحليل العطل غير موجود');
  return (await enrichFailureRows(tx, [row]))[0];
}

function buildDateRange(query: any, field: string) {
  if (!query.dateFrom && !query.dateTo) return undefined;
  const range: Record<string, Date> = {};
  if (query.dateFrom) range.gte = parseDateOrThrow(String(query.dateFrom), 'dateFrom');
  if (query.dateTo) range.lte = parseDateOrThrow(String(query.dateTo), 'dateTo');
  return { [field]: range };
}

export async function listPlans(query: any) {
  const page = buildPage(query);
  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.assetId) where.assetId = Number(query.assetId);
  if (query.status) where.status = String(query.status);

  const [rows, total] = await Promise.all([
    prisma.maintenancePlan.findMany({ where, skip: page.skip, take: page.limit, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] }),
    prisma.maintenancePlan.count({ where })
  ]);

  return {
    rows: await prisma.$transaction((tx) => enrichPlanRows(tx, rows)),
    meta: { page: page.page, limit: page.limit, total, pages: Math.max(1, Math.ceil(total / page.limit)) }
  };
}

export async function createPlan(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const assetId = toPositiveInt(data.assetId, 'assetId', true);
    const projectId = toPositiveInt(data.projectId, 'projectId', true);
    const asset = await ensureAsset(tx, assetId);
    const project = await ensureProject(tx, projectId);
    const branchId = toPositiveInt(data.branchId ?? asset?.branchId ?? project?.branchId, 'branchId', true);

    const row = await tx.maintenancePlan.create({
      data: {
        code: data.code ?? (await generateNumber(tx, 'maintenancePlan', 'MNP', true)),
        branchId,
        assetId,
        projectId,
        title: String(data.title).trim(),
        frequencyType: String(data.frequencyType ?? 'TIME').toUpperCase(),
        intervalValue: Number(data.intervalValue ?? 1),
        nextDueDate: data.nextDueDate ? parseDateOrThrow(data.nextDueDate, 'nextDueDate') : null,
        nextDueHours: toAmount(data.nextDueHours, 'nextDueHours', true) ?? null,
        status: 'ACTIVE',
        approvalStatus: 'DRAFT',
        postingStatus: 'NOT_APPLICABLE',
        notes: toText(data.notes),
        createdById: userId,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'maintenance.plan.created',
      aggregateType: 'MaintenancePlan',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: row.branchId ?? null,
      payload: { code: row.code, title: row.title, assetId: row.assetId ?? null }
    });

    return fetchPlan(tx, row.id);
  });
}

export async function listOrders(query: any) {
  const page = buildPage(query);
  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.assetId) where.assetId = Number(query.assetId);
  if (query.status) where.status = String(query.status);
  if (query.approvalStatus) where.approvalStatus = String(query.approvalStatus);
  Object.assign(where, buildDateRange(query, 'dueDate'));

  const [rows, total] = await Promise.all([
    prisma.maintenanceOrder.findMany({ where, skip: page.skip, take: page.limit, orderBy: [{ dueDate: 'asc' }, { id: 'desc' }] }),
    prisma.maintenanceOrder.count({ where })
  ]);

  return {
    rows: await prisma.$transaction((tx) => enrichOrderRows(tx, rows)),
    meta: { page: page.page, limit: page.limit, total, pages: Math.max(1, Math.ceil(total / page.limit)) }
  };
}

export async function createOrder(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const planId = toPositiveInt(data.planId, 'planId', true);
    const plan = await ensurePlan(tx, planId);
    const assetId = toPositiveInt(data.assetId ?? plan?.assetId, 'assetId', true);
    const projectId = toPositiveInt(data.projectId ?? plan?.projectId, 'projectId', true);
    const asset = await ensureAsset(tx, assetId);
    const project = await ensureProject(tx, projectId);
    const branchId = toPositiveInt(data.branchId ?? plan?.branchId ?? asset?.branchId ?? project?.branchId, 'branchId', true);

    const row = await tx.maintenanceOrder.create({
      data: {
        number: data.number ?? (await generateNumber(tx, 'maintenanceOrder', 'MNO')),
        branchId,
        planId,
        assetId,
        projectId,
        title: String(data.title).trim(),
        description: toText(data.description),
        priority: String(data.priority ?? 'MEDIUM').toUpperCase(),
        scheduledDate: data.scheduledDate ? parseDateOrThrow(data.scheduledDate, 'scheduledDate') : null,
        dueDate: data.dueDate ? parseDateOrThrow(data.dueDate, 'dueDate') : null,
        estimatedCost: toAmount(data.estimatedCost, 'estimatedCost', true) ?? 0,
        actualCost: 0,
        status: 'DRAFT',
        approvalStatus: 'DRAFT',
        postingStatus: 'NOT_APPLICABLE',
        attachmentsCount: Number(data.attachmentsCount ?? 0),
        createdById: userId,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'maintenance.order.created',
      aggregateType: 'MaintenanceOrder',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: row.branchId ?? null,
      payload: { number: row.number, title: row.title, assetId: row.assetId ?? null }
    });

    return fetchOrder(tx, row.id);
  });
}

export async function submitOrder(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.maintenanceOrder.findUnique({ where: { id } });
    if (!row) throw Errors.notFound('أمر الصيانة غير موجود');
    if (row.approvalStatus === 'APPROVED') throw Errors.business('تم اعتماد أمر الصيانة بالفعل');

    await tx.maintenanceOrder.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        approvalStatus: 'PENDING',
        submittedAt: new Date(),
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'maintenance.order.submitted',
      aggregateType: 'MaintenanceOrder',
      aggregateId: String(id),
      actorId: userId,
      branchId: row.branchId ?? null,
      payload: { number: row.number, title: row.title }
    });

    return fetchOrder(tx, id);
  });
}

export async function approveOrder(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.maintenanceOrder.findUnique({ where: { id } });
    if (!row) throw Errors.notFound('أمر الصيانة غير موجود');
    if (row.approvalStatus !== 'PENDING') throw Errors.business('أمر الصيانة غير جاهز للاعتماد');

    await tx.maintenanceOrder.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'maintenance.order.approved',
      aggregateType: 'MaintenanceOrder',
      aggregateId: String(id),
      actorId: userId,
      branchId: row.branchId ?? null,
      payload: { number: row.number, title: row.title }
    });

    return fetchOrder(tx, id);
  });
}

export async function listExecutions(query: any) {
  const page = buildPage(query);
  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.orderId) where.orderId = Number(query.orderId);
  if (query.projectId) where.projectId = Number(query.projectId);
  Object.assign(where, buildDateRange(query, 'executionDate'));

  const [rows, total] = await Promise.all([
    prisma.maintenanceExecution.findMany({ where, skip: page.skip, take: page.limit, orderBy: [{ executionDate: 'desc' }, { id: 'desc' }] }),
    prisma.maintenanceExecution.count({ where })
  ]);

  return {
    rows: await prisma.$transaction((tx) => enrichExecutionRows(tx, rows)),
    meta: { page: page.page, limit: page.limit, total, pages: Math.max(1, Math.ceil(total / page.limit)) }
  };
}

export async function createExecution(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const orderId = toPositiveInt(data.orderId, 'orderId')!;
    const order = await ensureOrder(tx, orderId);
    if (!order) throw Errors.notFound('أمر الصيانة غير موجود');
    const assetId = toPositiveInt(data.assetId ?? order.assetId, 'assetId', true);
    const projectId = toPositiveInt(data.projectId ?? order.projectId, 'projectId', true);
    const technicianEmployeeId = toPositiveInt(data.technicianEmployeeId, 'technicianEmployeeId', true);
    const spareItemId = toPositiveInt(data.spareItemId, 'spareItemId', true);
    const warehouseId = toPositiveInt(data.warehouseId, 'warehouseId', true);
    const asset = await ensureAsset(tx, assetId);
    const project = await ensureProject(tx, projectId);
    await ensureEmployee(tx, technicianEmployeeId);
    const item = await ensureItem(tx, spareItemId);
    const warehouse = await ensureWarehouse(tx, warehouseId);
    const branchId = toPositiveInt(data.branchId ?? order.branchId ?? asset?.branchId ?? project?.branchId ?? warehouse?.branchId, 'branchId', true);
    const hoursWorked = toAmount(data.hoursWorked, 'hoursWorked', true) ?? 0;
    const laborCost = toAmount(data.laborCost, 'laborCost', true) ?? 0;
    const spareQuantity = toAmount(data.spareQuantity, 'spareQuantity', true) ?? 0;
    const derivedUnitCost = item ? Number(item.purchasePrice ?? 0) : 0;
    const spareCost = toAmount(data.spareCost, 'spareCost', true) ?? roundAmount(spareQuantity * derivedUnitCost);

    if (item && warehouse && spareQuantity > Number(item.onHandQty ?? 0)) {
      throw Errors.business('كمية قطع الغيار المطلوبة أكبر من المتاح بالمخزون');
    }

    const execution = await tx.maintenanceExecution.create({
      data: {
        branchId,
        orderId,
        assetId,
        projectId,
        executionDate: data.executionDate ? parseDateOrThrow(data.executionDate, 'executionDate') : new Date(),
        technicianEmployeeId,
        hoursWorked,
        laborCost,
        spareItemId,
        warehouseId,
        spareQuantity,
        spareCost,
        status: 'LOGGED',
        approvalStatus: 'DRAFT',
        postingStatus: 'NOT_APPLICABLE',
        notes: toText(data.notes),
        createdById: userId,
        updatedById: userId
      }
    });

    if (spareItemId && spareQuantity > 0) {
      await tx.spareReservation.create({
        data: {
          branchId,
          orderId,
          assetId,
          itemId: spareItemId,
          warehouseId,
          quantity: spareQuantity,
          unitCost: spareQuantity > 0 ? roundAmount(spareCost / spareQuantity) : 0,
          totalCost: spareCost,
          status: warehouseId ? 'ISSUED' : 'RESERVED',
          approvalStatus: 'APPROVED',
          postingStatus: 'NOT_APPLICABLE',
          createdById: userId,
          updatedById: userId
        }
      });

      if (item && warehouse) {
        const unitCost = spareQuantity > 0 ? roundAmount(spareCost / spareQuantity) : 0;
        await tx.stockMovement.create({
          data: {
            type: 'ISSUE_MAINTENANCE',
            reference: order.number,
            itemId: item.id,
            warehouseId: warehouse.id,
            quantity: spareQuantity,
            unitCost,
            totalCost: spareCost,
            notes: `Maintenance execution ${order.number}`
          }
        });
        await tx.item.update({
          where: { id: item.id },
          data: {
            onHandQty: { decrement: spareQuantity },
            inventoryValue: { decrement: spareCost }
          }
        });
      }
    }

    const totalExecutionCost = roundAmount(laborCost + spareCost);
    await tx.maintenanceOrder.update({
      where: { id: orderId },
      data: {
        actualCost: { increment: totalExecutionCost },
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'maintenance.execution.logged',
      aggregateType: 'MaintenanceExecution',
      aggregateId: String(execution.id),
      actorId: userId,
      branchId: branchId ?? null,
      payload: { orderNumber: order.number, totalExecutionCost, spareQuantity, spareItemId }
    });

    return fetchExecution(tx, execution.id);
  });
}

export async function completeOrder(id: number, userId: number, data?: any) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.maintenanceOrder.findUnique({ where: { id } });
    if (!row) throw Errors.notFound('أمر الصيانة غير موجود');
    if (row.status === 'COMPLETED') throw Errors.business('تم إغلاق أمر الصيانة مسبقًا');
    if (row.approvalStatus !== 'APPROVED') throw Errors.business('يجب اعتماد أمر الصيانة قبل إكماله');

    const executions = await tx.maintenanceExecution.findMany({ where: { orderId: id } });
    const actualCost = roundAmount(executions.reduce((sum: number, item: any) => sum + Number(item.laborCost ?? 0) + Number(item.spareCost ?? 0), 0));

    await tx.maintenanceOrder.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        actualCost,
        updatedById: userId,
        description: toText(data?.notes) ?? row.description
      }
    });

    if (row.projectId) {
      await tx.project.update({
        where: { id: row.projectId },
        data: {
          actualCost: { increment: actualCost }
        }
      });
    }

    await enqueueOutboxEvent(tx, {
      eventType: 'maintenance.order.completed',
      aggregateType: 'MaintenanceOrder',
      aggregateId: String(id),
      actorId: userId,
      branchId: row.branchId ?? null,
      payload: { number: row.number, actualCost, projectId: row.projectId ?? null }
    });

    return fetchOrder(tx, id);
  });
}

export async function listFailures(query: any) {
  const page = buildPage(query);
  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.assetId) where.assetId = Number(query.assetId);
  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.status) where.status = String(query.status);
  if (query.severity) where.severity = String(query.severity).toUpperCase();
  Object.assign(where, buildDateRange(query, 'incidentDate'));

  const [rows, total] = await Promise.all([
    prisma.failureAnalysis.findMany({ where, skip: page.skip, take: page.limit, orderBy: [{ incidentDate: 'desc' }, { id: 'desc' }] }),
    prisma.failureAnalysis.count({ where })
  ]);

  return {
    rows: await prisma.$transaction((tx) => enrichFailureRows(tx, rows)),
    meta: { page: page.page, limit: page.limit, total, pages: Math.max(1, Math.ceil(total / page.limit)) }
  };
}

export async function createFailure(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const orderId = toPositiveInt(data.orderId, 'orderId', true);
    const order = await ensureOrder(tx, orderId);
    const assetId = toPositiveInt(data.assetId ?? order?.assetId, 'assetId', true);
    const projectId = toPositiveInt(data.projectId ?? order?.projectId, 'projectId', true);
    const asset = await ensureAsset(tx, assetId);
    const project = await ensureProject(tx, projectId);
    const branchId = toPositiveInt(data.branchId ?? order?.branchId ?? asset?.branchId ?? project?.branchId, 'branchId', true);

    const row = await tx.failureAnalysis.create({
      data: {
        number: data.number ?? (await generateNumber(tx, 'failureAnalysis', 'MNF')),
        branchId,
        orderId,
        assetId,
        projectId,
        incidentDate: data.incidentDate ? parseDateOrThrow(data.incidentDate, 'incidentDate') : new Date(),
        title: String(data.title).trim(),
        failureMode: String(data.failureMode).trim(),
        rootCause: toText(data.rootCause),
        mtbfHours: toAmount(data.mtbfHours, 'mtbfHours', true) ?? null,
        severity: String(data.severity ?? 'MEDIUM').toUpperCase(),
        repeatCount: Number(data.repeatCount ?? 0),
        status: 'OPEN',
        approvalStatus: 'DRAFT',
        postingStatus: 'NOT_APPLICABLE',
        createdById: userId,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'maintenance.failure.detected',
      aggregateType: 'FailureAnalysis',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: row.branchId ?? null,
      payload: { number: row.number, title: row.title, severity: row.severity, assetId: row.assetId ?? null }
    });

    return fetchFailure(tx, row.id);
  });
}
