import { prisma } from '../../config/database';
import { enqueueOutboxEvent } from '../../platform/events/outbox';
import { parseDateOrThrow } from '../../utils/date';
import { buildSequentialNumberFromLatest } from '../../utils/id-generator';
import { Errors } from '../../utils/response';

function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

function toNumber(value: unknown, fieldName: string, allowNull = false): number | null {
  if ((value === null || value === undefined || value === '') && allowNull) return null;
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) throw Errors.validation(`${fieldName} غير صالح`);
  return roundAmount(number);
}

function toPositiveNumber(value: unknown, fieldName: string): number {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number <= 0) throw Errors.validation(`${fieldName} يجب أن يكون أكبر من صفر`);
  return roundAmount(number);
}

function toText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function normalizeDateOnly(value: string | Date, fieldName: string): Date {
  const parsed = parseDateOrThrow(value, fieldName);
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function startAndEndOfDay(value: Date): { start: Date; endExclusive: Date } {
  const start = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const endExclusive = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, endExclusive };
}

function minDate(left: Date | null, right: Date | null): Date | null {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() <= right.getTime() ? left : right;
}

function maxDate(left: Date | null, right: Date | null): Date | null {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() >= right.getTime() ? left : right;
}

function buildPage(query: any) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
  return {
    page,
    limit,
    skip: (page - 1) * limit
  };
}

async function generateNumber(tx: any, modelName: 'siteDailyLog' | 'siteMaterialRequest' | 'siteIssue', prefix: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const latest = await tx[modelName].findFirst({
    where: {
      number: {
        startsWith: `${prefix}-${year}-`
      }
    },
    select: { number: true },
    orderBy: { number: 'desc' }
  });
  return buildSequentialNumberFromLatest(prefix, latest?.number, year);
}

async function ensureProject(tx: any, projectId: number) {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { id: true, code: true, nameAr: true, branchId: true, isActive: true, status: true }
  });
  if (!project) throw Errors.notFound('المشروع غير موجود');
  if (!project.isActive) throw Errors.business('المشروع غير نشط');
  return project;
}

async function ensureEmployee(tx: any, employeeId: number) {
  const employee = await tx.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, code: true, fullName: true, branchId: true, status: true }
  });
  if (!employee) throw Errors.notFound('الموظف غير موجود');
  if (String(employee.status).toUpperCase() !== 'ACTIVE') throw Errors.business('الموظف غير نشط');
  return employee;
}

async function ensureItem(tx: any, itemId: number) {
  const item = await tx.item.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      code: true,
      nameAr: true,
      purchasePrice: true,
      onHandQty: true,
      inventoryValue: true
    }
  });
  if (!item) throw Errors.notFound('الصنف غير موجود');
  return item;
}

async function ensureWarehouse(tx: any, warehouseId: number) {
  const warehouse = await tx.warehouse.findUnique({
    where: { id: warehouseId },
    select: { id: true, code: true, nameAr: true, branchId: true, isActive: true }
  });
  if (!warehouse) throw Errors.notFound('المستودع غير موجود');
  if (!warehouse.isActive) throw Errors.business('المستودع غير نشط');
  return warehouse;
}

async function syncAttendanceFromSite(tx: any, employeeId: number, date: Date, preferredBranchId: number | null) {
  const { start, endExclusive } = startAndEndOfDay(date);
  const rows = await tx.siteAttendance.findMany({
    where: {
      employeeId,
      date: { gte: start, lt: endExclusive }
    },
    orderBy: [{ date: 'asc' }, { id: 'asc' }]
  });
  if (!rows.length) return null;

  const totalHours = roundAmount(rows.reduce((sum: number, row: any) => sum + Number(row.hoursWorked ?? 0), 0));
  const checkIn = rows.reduce((current: Date | null, row: any) => minDate(current, row.checkIn ?? null), null);
  const checkOut = rows.reduce((current: Date | null, row: any) => maxDate(current, row.checkOut ?? null), null);
  const status = rows.some((row: any) => String(row.status).toUpperCase() !== 'ABSENT') ? 'PRESENT' : 'ABSENT';
  const branchId = preferredBranchId ?? rows[0].branchId ?? null;

  return tx.attendance.upsert({
    where: {
      employeeId_date: {
        employeeId,
        date: start
      }
    },
    update: {
      branchId,
      checkIn,
      checkOut,
      hoursWorked: totalHours,
      status,
      notes: 'Synced from site operations'
    },
    create: {
      employeeId,
      branchId,
      date: start,
      checkIn,
      checkOut,
      hoursWorked: totalHours,
      status,
      notes: 'Synced from site operations'
    }
  });
}

async function fetchDailyLog(tx: any, id: number) {
  const row = await tx.siteDailyLog.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, code: true, nameAr: true } },
      project: { select: { id: true, code: true, nameAr: true } },
      _count: {
        select: {
          materialRequests: true,
          progressReports: true,
          issues: true,
          photos: true
        }
      }
    }
  });
  if (!row) throw Errors.notFound('اليومية الميدانية غير موجودة');
  return row;
}

async function fetchMaterialRequest(tx: any, id: number) {
  const row = await tx.siteMaterialRequest.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, code: true, nameAr: true } },
      project: { select: { id: true, code: true, nameAr: true } },
      dailyLog: { select: { id: true, number: true, logDate: true } },
      item: { select: { id: true, code: true, nameAr: true, onHandQty: true, purchasePrice: true } },
      warehouse: { select: { id: true, code: true, nameAr: true } }
    }
  });
  if (!row) throw Errors.notFound('طلب المواد غير موجود');
  return row;
}

async function fetchProgress(tx: any, id: number) {
  const row = await tx.siteProgress.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, code: true, nameAr: true } },
      project: { select: { id: true, code: true, nameAr: true } },
      dailyLog: { select: { id: true, number: true, logDate: true } }
    }
  });
  if (!row) throw Errors.notFound('تقرير التقدم غير موجود');
  return row;
}

async function fetchIssue(tx: any, id: number) {
  const row = await tx.siteIssue.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, code: true, nameAr: true } },
      project: { select: { id: true, code: true, nameAr: true } },
      dailyLog: { select: { id: true, number: true, logDate: true } }
    }
  });
  if (!row) throw Errors.notFound('المشكلة الميدانية غير موجودة');
  return row;
}

async function fetchAttendance(tx: any, id: number) {
  const row = await tx.siteAttendance.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, code: true, nameAr: true } },
      project: { select: { id: true, code: true, nameAr: true } },
      employee: { select: { id: true, code: true, fullName: true } }
    }
  });
  if (!row) throw Errors.notFound('سجل الحضور الميداني غير موجود');
  return row;
}

export async function listDailyLogs(query: any) {
  const pageState = buildPage(query);
  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.status) where.status = String(query.status);
  if (query.approvalStatus) where.approvalStatus = String(query.approvalStatus);
  if (query.dateFrom || query.dateTo) {
    where.logDate = {};
    if (query.dateFrom) where.logDate.gte = normalizeDateOnly(String(query.dateFrom), 'dateFrom');
    if (query.dateTo) where.logDate.lte = normalizeDateOnly(String(query.dateTo), 'dateTo');
  }
  if (query.search) {
    const search = String(query.search).trim();
    if (search) {
      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { weather: { contains: search, mode: 'insensitive' } },
        { workExecuted: { contains: search, mode: 'insensitive' } },
        { blockers: { contains: search, mode: 'insensitive' } }
      ];
    }
  }

  const [rows, total] = await Promise.all([
    prisma.siteDailyLog.findMany({
      where,
      skip: pageState.skip,
      take: pageState.limit,
      include: {
        branch: { select: { id: true, code: true, nameAr: true } },
        project: { select: { id: true, code: true, nameAr: true } },
        _count: {
          select: {
            materialRequests: true,
            progressReports: true,
            issues: true,
            photos: true
          }
        }
      },
      orderBy: [{ logDate: 'desc' }, { id: 'desc' }]
    }),
    prisma.siteDailyLog.count({ where })
  ]);

  return {
    rows,
    meta: {
      page: pageState.page,
      limit: pageState.limit,
      total,
      pages: Math.max(1, Math.ceil(total / pageState.limit))
    }
  };
}

export async function getDailyLog(id: number) {
  return prisma.$transaction((tx) => fetchDailyLog(tx, id));
}

export async function createDailyLog(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const projectId = Number(data.projectId);
    if (!projectId) throw Errors.validation('يجب تحديد المشروع');
    const project = await ensureProject(tx, projectId);
    const branchId = Number(data.branchId ?? project.branchId ?? 0) || null;
    if (branchId && project.branchId && Number(project.branchId) !== branchId) {
      throw Errors.business('الفرع المختار لا يطابق فرع المشروع');
    }

    const row = await tx.siteDailyLog.create({
      data: {
        number: data.number ?? (await generateNumber(tx, 'siteDailyLog', 'SDL')),
        branchId,
        projectId,
        logDate: normalizeDateOnly(data.logDate, 'logDate'),
        weather: toText(data.weather),
        workforceCount: Number(data.workforceCount ?? 0),
        equipmentSummary: toText(data.equipmentSummary),
        workExecuted: toText(data.workExecuted),
        blockers: toText(data.blockers),
        status: 'DRAFT',
        approvalStatus: 'DRAFT',
        postingStatus: 'NOT_APPLICABLE',
        createdById: userId,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'site-ops.daily-log.created',
      aggregateType: 'SiteDailyLog',
      aggregateId: String(row.id),
      actorId: userId,
      branchId,
      correlationId: `site-daily-log:${row.id}:created`,
      payload: {
        dailyLogId: row.id,
        number: row.number,
        projectId: row.projectId,
        logDate: row.logDate
      }
    });

    return fetchDailyLog(tx, row.id);
  });
}

export async function updateDailyLog(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.siteDailyLog.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('اليومية الميدانية غير موجودة');
    if (current.approvalStatus === 'APPROVED') throw Errors.business('لا يمكن تعديل يومية معتمدة');

    const targetProjectId = Number(data.projectId ?? current.projectId);
    const project = await ensureProject(tx, targetProjectId);
    const branchId = Number(data.branchId ?? current.branchId ?? project.branchId ?? 0) || null;

    await tx.siteDailyLog.update({
      where: { id },
      data: {
        branchId,
        projectId: targetProjectId,
        logDate: data.logDate ? normalizeDateOnly(data.logDate, 'logDate') : current.logDate,
        weather: data.weather !== undefined ? toText(data.weather) : current.weather,
        workforceCount: data.workforceCount !== undefined ? Number(data.workforceCount) : current.workforceCount,
        equipmentSummary: data.equipmentSummary !== undefined ? toText(data.equipmentSummary) : current.equipmentSummary,
        workExecuted: data.workExecuted !== undefined ? toText(data.workExecuted) : current.workExecuted,
        blockers: data.blockers !== undefined ? toText(data.blockers) : current.blockers,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'site-ops.daily-log.updated',
      aggregateType: 'SiteDailyLog',
      aggregateId: String(id),
      actorId: userId,
      branchId,
      correlationId: `site-daily-log:${id}:updated`,
      payload: {
        dailyLogId: id,
        projectId: targetProjectId
      }
    });

    return fetchDailyLog(tx, id);
  });
}

export async function submitDailyLog(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.siteDailyLog.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('اليومية الميدانية غير موجودة');
    if (current.status === 'SUBMITTED' || current.approvalStatus === 'PENDING') return fetchDailyLog(tx, id);

    await tx.siteDailyLog.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        approvalStatus: 'PENDING',
        submittedAt: new Date(),
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'site-ops.daily-log.submitted',
      aggregateType: 'SiteDailyLog',
      aggregateId: String(id),
      actorId: userId,
      branchId: current.branchId,
      correlationId: `site-daily-log:${id}:submitted`,
      payload: {
        dailyLogId: id,
        number: current.number,
        projectId: current.projectId
      }
    });

    return fetchDailyLog(tx, id);
  });
}

export async function approveDailyLog(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.siteDailyLog.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('اليومية الميدانية غير موجودة');
    if (current.approvalStatus === 'APPROVED') return fetchDailyLog(tx, id);
    if (current.status !== 'SUBMITTED' && current.approvalStatus !== 'PENDING') {
      throw Errors.business('يجب إرسال اليومية قبل الاعتماد');
    }

    await tx.siteDailyLog.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'site-ops.daily-log.approved',
      aggregateType: 'SiteDailyLog',
      aggregateId: String(id),
      actorId: userId,
      branchId: current.branchId,
      correlationId: `site-daily-log:${id}:approved`,
      payload: {
        dailyLogId: id,
        number: current.number,
        projectId: current.projectId
      }
    });

    return fetchDailyLog(tx, id);
  });
}

export async function listMaterialRequests(query: any) {
  const pageState = buildPage(query);
  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.itemId) where.itemId = Number(query.itemId);
  if (query.warehouseId) where.warehouseId = Number(query.warehouseId);
  if (query.status) where.status = String(query.status);
  if (query.approvalStatus) where.approvalStatus = String(query.approvalStatus);
  if (query.dateFrom || query.dateTo) {
    where.requestDate = {};
    if (query.dateFrom) where.requestDate.gte = normalizeDateOnly(String(query.dateFrom), 'dateFrom');
    if (query.dateTo) where.requestDate.lte = normalizeDateOnly(String(query.dateTo), 'dateTo');
  }
  if (query.search) {
    const search = String(query.search).trim();
    if (search) {
      where.OR = [{ number: { contains: search, mode: 'insensitive' } }, { purpose: { contains: search, mode: 'insensitive' } }, { notes: { contains: search, mode: 'insensitive' } }];
    }
  }

  const [rows, total] = await Promise.all([
    prisma.siteMaterialRequest.findMany({
      where,
      skip: pageState.skip,
      take: pageState.limit,
      include: {
        branch: { select: { id: true, code: true, nameAr: true } },
        project: { select: { id: true, code: true, nameAr: true } },
        dailyLog: { select: { id: true, number: true, logDate: true } },
        item: { select: { id: true, code: true, nameAr: true, onHandQty: true, purchasePrice: true } },
        warehouse: { select: { id: true, code: true, nameAr: true } }
      },
      orderBy: [{ requestDate: 'desc' }, { id: 'desc' }]
    }),
    prisma.siteMaterialRequest.count({ where })
  ]);

  return {
    rows,
    meta: {
      page: pageState.page,
      limit: pageState.limit,
      total,
      pages: Math.max(1, Math.ceil(total / pageState.limit))
    }
  };
}

export async function getMaterialRequest(id: number) {
  return prisma.$transaction((tx) => fetchMaterialRequest(tx, id));
}

export async function createMaterialRequest(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const projectId = Number(data.projectId);
    if (!projectId) throw Errors.validation('يجب تحديد المشروع');
    const project = await ensureProject(tx, projectId);
    const branchId = Number(data.branchId ?? project.branchId ?? 0) || null;
    const quantity = toPositiveNumber(data.quantity, 'الكمية المطلوبة');

    const dailyLogId = Number(data.dailyLogId ?? 0) || null;
    if (dailyLogId) {
      const dailyLog = await tx.siteDailyLog.findUnique({ where: { id: dailyLogId }, select: { id: true, projectId: true } });
      if (!dailyLog) throw Errors.notFound('اليومية المرتبطة غير موجودة');
      if (Number(dailyLog.projectId) !== projectId) throw Errors.business('اليومية لا تنتمي لنفس المشروع');
    }

    const itemId = Number(data.itemId ?? 0) || null;
    const warehouseId = Number(data.warehouseId ?? 0) || null;
    if (itemId) await ensureItem(tx, itemId);
    if (warehouseId) await ensureWarehouse(tx, warehouseId);

    const sourceMode = String(data.sourceMode ?? (itemId && warehouseId ? 'STOCK' : 'PROCUREMENT')).toUpperCase();

    const row = await tx.siteMaterialRequest.create({
      data: {
        number: data.number ?? (await generateNumber(tx, 'siteMaterialRequest', 'SMR')),
        branchId,
        projectId,
        dailyLogId,
        itemId,
        warehouseId,
        requestDate: data.requestDate ? normalizeDateOnly(data.requestDate, 'requestDate') : new Date(),
        requiredBy: data.requiredBy ? normalizeDateOnly(data.requiredBy, 'requiredBy') : null,
        quantity,
        issuedQuantity: 0,
        unit: toText(data.unit),
        purpose: toText(data.purpose),
        sourceMode,
        status: 'DRAFT',
        approvalStatus: 'DRAFT',
        postingStatus: 'UNPOSTED',
        notes: toText(data.notes),
        createdById: userId,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'site-ops.material-request.created',
      aggregateType: 'SiteMaterialRequest',
      aggregateId: String(row.id),
      actorId: userId,
      branchId,
      correlationId: `site-material-request:${row.id}:created`,
      payload: {
        materialRequestId: row.id,
        number: row.number,
        projectId: row.projectId,
        itemId: row.itemId,
        warehouseId: row.warehouseId,
        quantity: row.quantity
      }
    });

    return fetchMaterialRequest(tx, row.id);
  });
}

export async function updateMaterialRequest(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.siteMaterialRequest.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('طلب المواد غير موجود');
    if (current.status === 'FULFILLED' || Number(current.issuedQuantity ?? 0) > 0) {
      throw Errors.business('لا يمكن تعديل طلب مواد بعد بدء الصرف');
    }

    const projectId = Number(data.projectId ?? current.projectId);
    const project = await ensureProject(tx, projectId);
    const branchId = Number(data.branchId ?? current.branchId ?? project.branchId ?? 0) || null;

    const itemId = data.itemId !== undefined ? Number(data.itemId || 0) || null : current.itemId;
    const warehouseId = data.warehouseId !== undefined ? Number(data.warehouseId || 0) || null : current.warehouseId;
    if (itemId) await ensureItem(tx, itemId);
    if (warehouseId) await ensureWarehouse(tx, warehouseId);

    const quantity = data.quantity !== undefined ? toPositiveNumber(data.quantity, 'الكمية المطلوبة') : Number(current.quantity);
    const dailyLogId = data.dailyLogId !== undefined ? Number(data.dailyLogId || 0) || null : current.dailyLogId;
    if (dailyLogId) {
      const dailyLog = await tx.siteDailyLog.findUnique({ where: { id: dailyLogId }, select: { id: true, projectId: true } });
      if (!dailyLog) throw Errors.notFound('اليومية المرتبطة غير موجودة');
      if (Number(dailyLog.projectId) !== projectId) throw Errors.business('اليومية لا تنتمي لنفس المشروع');
    }

    await tx.siteMaterialRequest.update({
      where: { id },
      data: {
        branchId,
        projectId,
        dailyLogId,
        itemId,
        warehouseId,
        requestDate: data.requestDate ? normalizeDateOnly(data.requestDate, 'requestDate') : current.requestDate,
        requiredBy: data.requiredBy !== undefined ? (data.requiredBy ? normalizeDateOnly(data.requiredBy, 'requiredBy') : null) : current.requiredBy,
        quantity,
        unit: data.unit !== undefined ? toText(data.unit) : current.unit,
        purpose: data.purpose !== undefined ? toText(data.purpose) : current.purpose,
        sourceMode: data.sourceMode !== undefined ? String(data.sourceMode).toUpperCase() : current.sourceMode,
        notes: data.notes !== undefined ? toText(data.notes) : current.notes,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'site-ops.material-request.updated',
      aggregateType: 'SiteMaterialRequest',
      aggregateId: String(id),
      actorId: userId,
      branchId,
      correlationId: `site-material-request:${id}:updated`,
      payload: {
        materialRequestId: id,
        projectId,
        itemId,
        warehouseId,
        quantity
      }
    });

    return fetchMaterialRequest(tx, id);
  });
}

export async function submitMaterialRequest(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.siteMaterialRequest.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('طلب المواد غير موجود');
    if (current.status === 'SUBMITTED' || current.approvalStatus === 'PENDING') return fetchMaterialRequest(tx, id);

    await tx.siteMaterialRequest.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        approvalStatus: 'PENDING',
        submittedAt: new Date(),
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'site-ops.material-request.submitted',
      aggregateType: 'SiteMaterialRequest',
      aggregateId: String(id),
      actorId: userId,
      branchId: current.branchId,
      correlationId: `site-material-request:${id}:submitted`,
      payload: {
        materialRequestId: id,
        number: current.number,
        projectId: current.projectId,
        itemId: current.itemId,
        warehouseId: current.warehouseId,
        quantity: current.quantity
      }
    });

    return fetchMaterialRequest(tx, id);
  });
}

export async function approveMaterialRequest(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.siteMaterialRequest.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('طلب المواد غير موجود');
    if (current.approvalStatus === 'APPROVED') return fetchMaterialRequest(tx, id);
    if (current.status !== 'SUBMITTED' && current.approvalStatus !== 'PENDING') {
      throw Errors.business('يجب إرسال الطلب قبل الاعتماد');
    }

    const updated = await tx.siteMaterialRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'site-ops.material-request.approved',
      aggregateType: 'SiteMaterialRequest',
      aggregateId: String(id),
      actorId: userId,
      branchId: current.branchId,
      correlationId: `site-material-request:${id}:approved`,
      payload: {
        materialRequestId: id,
        number: current.number,
        projectId: current.projectId,
        itemId: current.itemId,
        warehouseId: current.warehouseId,
        quantity: current.quantity
      }
    });

    if (updated.itemId && updated.warehouseId) {
      const item = await ensureItem(tx, updated.itemId);
      const remaining = Math.max(0, Number(updated.quantity) - Number(updated.issuedQuantity));
      if (Number(item.onHandQty ?? 0) < remaining) {
        await tx.siteMaterialRequest.update({
          where: { id },
          data: {
            sourceMode: updated.sourceMode === 'STOCK' ? 'MIXED' : updated.sourceMode,
            notes: [updated.notes, 'Auto: stock shortage detected, procurement escalation required'].filter(Boolean).join('\n')
          }
        });
        await enqueueOutboxEvent(tx, {
          eventType: 'site-ops.material-request.procurement-needed',
          aggregateType: 'SiteMaterialRequest',
          aggregateId: String(id),
          actorId: userId,
          branchId: updated.branchId,
          correlationId: `site-material-request:${id}:procurement-needed`,
          payload: {
            materialRequestId: id,
            projectId: updated.projectId,
            itemId: updated.itemId,
            requiredQty: remaining,
            availableQty: item.onHandQty
          }
        });
      }
    }

    return fetchMaterialRequest(tx, id);
  });
}

export async function fulfillMaterialRequest(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.siteMaterialRequest.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('طلب المواد غير موجود');
    if (current.approvalStatus !== 'APPROVED') throw Errors.business('يجب اعتماد الطلب قبل الصرف');
    if (!current.itemId || !current.warehouseId) throw Errors.business('لا يمكن صرف مواد بدون تحديد الصنف والمستودع');

    const requestedQty = Number(current.quantity ?? 0);
    const alreadyIssued = Number(current.issuedQuantity ?? 0);
    const remaining = roundAmount(requestedQty - alreadyIssued);
    if (remaining <= 0) return fetchMaterialRequest(tx, id);

    const issuedQuantity = data.issuedQuantity !== undefined ? toPositiveNumber(data.issuedQuantity, 'الكمية المصروفة') : remaining;
    if (issuedQuantity > remaining) throw Errors.validation('الكمية المصروفة تتجاوز الكمية المتبقية');

    const item = await ensureItem(tx, current.itemId);
    const warehouse = await ensureWarehouse(tx, current.warehouseId);
    const available = Number(item.onHandQty ?? 0);

    if (available < issuedQuantity) {
      await enqueueOutboxEvent(tx, {
        eventType: 'site-ops.material-request.stock-shortage',
        aggregateType: 'SiteMaterialRequest',
        aggregateId: String(id),
        actorId: userId,
        branchId: current.branchId,
        correlationId: `site-material-request:${id}:stock-shortage`,
        payload: {
          materialRequestId: id,
          itemId: current.itemId,
          warehouseId: current.warehouseId,
          requiredQty: issuedQuantity,
          availableQty: available
        }
      });
      throw Errors.business('الكمية المتاحة في المخزون غير كافية للصرف');
    }

    const unitCost = data.unitCost !== undefined ? toPositiveNumber(data.unitCost, 'تكلفة الوحدة') : roundAmount(Number(item.purchasePrice ?? 0));
    const totalCost = roundAmount(issuedQuantity * unitCost);
    const issueDate = data.issueDate ? normalizeDateOnly(data.issueDate, 'issueDate') : new Date();

    await tx.stockMovement.create({
      data: {
        date: issueDate,
        type: 'ISSUE_SITE',
        reference: current.number,
        itemId: current.itemId,
        warehouseId: current.warehouseId,
        quantity: issuedQuantity,
        unitCost,
        totalCost,
        notes: toText(data.notes) ?? 'Issue from site operations material request'
      }
    });

    const nextIssuedQuantity = roundAmount(alreadyIssued + issuedQuantity);
    const isFullyFulfilled = nextIssuedQuantity >= requestedQty - 0.0001;
    const nextOnHand = roundAmount(available - issuedQuantity);
    const nextInventoryValue = roundAmount(Math.max(0, Number(item.inventoryValue ?? 0) - totalCost));

    await tx.item.update({
      where: { id: item.id },
      data: {
        onHandQty: nextOnHand,
        inventoryValue: nextInventoryValue
      }
    });

    await tx.siteMaterialRequest.update({
      where: { id },
      data: {
        issuedQuantity: nextIssuedQuantity,
        status: isFullyFulfilled ? 'FULFILLED' : 'PARTIAL',
        postingStatus: isFullyFulfilled ? 'POSTED' : 'UNPOSTED',
        fulfilledAt: isFullyFulfilled ? new Date() : null,
        notes: [current.notes, toText(data.notes)].filter(Boolean).join('\n'),
        updatedById: userId
      }
    });

    await tx.project.update({
      where: { id: current.projectId },
      data: {
        actualCost: {
          increment: totalCost
        }
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'site-ops.material-request.fulfilled',
      aggregateType: 'SiteMaterialRequest',
      aggregateId: String(id),
      actorId: userId,
      branchId: current.branchId,
      correlationId: `site-material-request:${id}:fulfilled`,
      payload: {
        materialRequestId: id,
        number: current.number,
        projectId: current.projectId,
        itemId: current.itemId,
        warehouseId: warehouse.id,
        issuedQuantity,
        issuedCost: totalCost,
        remainingQuantity: roundAmount(requestedQty - nextIssuedQuantity),
        fulfilled: isFullyFulfilled
      }
    });

    return fetchMaterialRequest(tx, id);
  });
}

export async function listProgress(query: any) {
  const pageState = buildPage(query);
  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.status) where.status = String(query.status);
  if (query.dateFrom || query.dateTo) {
    where.reportDate = {};
    if (query.dateFrom) where.reportDate.gte = normalizeDateOnly(String(query.dateFrom), 'dateFrom');
    if (query.dateTo) where.reportDate.lte = normalizeDateOnly(String(query.dateTo), 'dateTo');
  }

  const [rows, total] = await Promise.all([
    prisma.siteProgress.findMany({
      where,
      skip: pageState.skip,
      take: pageState.limit,
      include: {
        branch: { select: { id: true, code: true, nameAr: true } },
        project: { select: { id: true, code: true, nameAr: true } },
        dailyLog: { select: { id: true, number: true, logDate: true } }
      },
      orderBy: [{ reportDate: 'desc' }, { id: 'desc' }]
    }),
    prisma.siteProgress.count({ where })
  ]);

  return {
    rows,
    meta: {
      page: pageState.page,
      limit: pageState.limit,
      total,
      pages: Math.max(1, Math.ceil(total / pageState.limit))
    }
  };
}

export async function getProgress(id: number) {
  return prisma.$transaction((tx) => fetchProgress(tx, id));
}

export async function createProgress(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const projectId = Number(data.projectId);
    if (!projectId) throw Errors.validation('يجب تحديد المشروع');
    const project = await ensureProject(tx, projectId);
    const branchId = Number(data.branchId ?? project.branchId ?? 0) || null;

    const dailyLogId = Number(data.dailyLogId ?? 0) || null;
    if (dailyLogId) {
      const dailyLog = await tx.siteDailyLog.findUnique({ where: { id: dailyLogId }, select: { id: true, projectId: true } });
      if (!dailyLog) throw Errors.notFound('اليومية المرتبطة غير موجودة');
      if (Number(dailyLog.projectId) !== projectId) throw Errors.business('اليومية لا تنتمي لنفس المشروع');
    }

    const row = await tx.siteProgress.create({
      data: {
        branchId,
        projectId,
        dailyLogId,
        reportDate: data.reportDate ? normalizeDateOnly(data.reportDate, 'reportDate') : new Date(),
        wbsCode: toText(data.wbsCode),
        taskName: String(data.taskName ?? '').trim(),
        plannedPercent: toNumber(data.plannedPercent ?? 0, 'نسبة الخطة') ?? 0,
        actualPercent: toNumber(data.actualPercent ?? 0, 'نسبة الإنجاز الفعلي') ?? 0,
        executedQty: toNumber(data.executedQty ?? 0, 'الكمية المنفذة') ?? 0,
        unit: toText(data.unit),
        status: String(data.status ?? 'OPEN').toUpperCase(),
        approvalStatus: 'DRAFT',
        postingStatus: 'NOT_APPLICABLE',
        notes: toText(data.notes),
        createdById: userId,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'site-ops.progress.created',
      aggregateType: 'SiteProgress',
      aggregateId: String(row.id),
      actorId: userId,
      branchId,
      correlationId: `site-progress:${row.id}:created`,
      payload: {
        progressId: row.id,
        projectId: row.projectId,
        dailyLogId: row.dailyLogId,
        reportDate: row.reportDate,
        plannedPercent: row.plannedPercent,
        actualPercent: row.actualPercent
      }
    });

    return fetchProgress(tx, row.id);
  });
}

export async function updateProgress(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.siteProgress.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('تقرير التقدم غير موجود');

    const projectId = Number(data.projectId ?? current.projectId);
    const project = await ensureProject(tx, projectId);
    const branchId = Number(data.branchId ?? current.branchId ?? project.branchId ?? 0) || null;

    const dailyLogId = data.dailyLogId !== undefined ? Number(data.dailyLogId || 0) || null : current.dailyLogId;
    if (dailyLogId) {
      const dailyLog = await tx.siteDailyLog.findUnique({ where: { id: dailyLogId }, select: { id: true, projectId: true } });
      if (!dailyLog) throw Errors.notFound('اليومية المرتبطة غير موجودة');
      if (Number(dailyLog.projectId) !== projectId) throw Errors.business('اليومية لا تنتمي لنفس المشروع');
    }

    await tx.siteProgress.update({
      where: { id },
      data: {
        branchId,
        projectId,
        dailyLogId,
        reportDate: data.reportDate ? normalizeDateOnly(data.reportDate, 'reportDate') : current.reportDate,
        wbsCode: data.wbsCode !== undefined ? toText(data.wbsCode) : current.wbsCode,
        taskName: data.taskName !== undefined ? String(data.taskName).trim() : current.taskName,
        plannedPercent: data.plannedPercent !== undefined ? toNumber(data.plannedPercent, 'نسبة الخطة') ?? 0 : current.plannedPercent,
        actualPercent: data.actualPercent !== undefined ? toNumber(data.actualPercent, 'نسبة الإنجاز الفعلي') ?? 0 : current.actualPercent,
        executedQty: data.executedQty !== undefined ? toNumber(data.executedQty, 'الكمية المنفذة') ?? 0 : current.executedQty,
        unit: data.unit !== undefined ? toText(data.unit) : current.unit,
        status: data.status !== undefined ? String(data.status).toUpperCase() : current.status,
        notes: data.notes !== undefined ? toText(data.notes) : current.notes,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'site-ops.progress.updated',
      aggregateType: 'SiteProgress',
      aggregateId: String(id),
      actorId: userId,
      branchId,
      correlationId: `site-progress:${id}:updated`,
      payload: {
        progressId: id,
        projectId,
        dailyLogId
      }
    });

    return fetchProgress(tx, id);
  });
}

export async function listIssues(query: any) {
  const pageState = buildPage(query);
  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.status) where.status = String(query.status);
  if (query.severity) where.severity = String(query.severity).toUpperCase();
  if (query.dateFrom || query.dateTo) {
    where.issueDate = {};
    if (query.dateFrom) where.issueDate.gte = normalizeDateOnly(String(query.dateFrom), 'dateFrom');
    if (query.dateTo) where.issueDate.lte = normalizeDateOnly(String(query.dateTo), 'dateTo');
  }
  if (query.search) {
    const search = String(query.search).trim();
    if (search) {
      where.OR = [{ number: { contains: search, mode: 'insensitive' } }, { title: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }];
    }
  }

  const [rows, total] = await Promise.all([
    prisma.siteIssue.findMany({
      where,
      skip: pageState.skip,
      take: pageState.limit,
      include: {
        branch: { select: { id: true, code: true, nameAr: true } },
        project: { select: { id: true, code: true, nameAr: true } },
        dailyLog: { select: { id: true, number: true, logDate: true } }
      },
      orderBy: [{ issueDate: 'desc' }, { id: 'desc' }]
    }),
    prisma.siteIssue.count({ where })
  ]);

  return {
    rows,
    meta: {
      page: pageState.page,
      limit: pageState.limit,
      total,
      pages: Math.max(1, Math.ceil(total / pageState.limit))
    }
  };
}

export async function getIssue(id: number) {
  return prisma.$transaction((tx) => fetchIssue(tx, id));
}

export async function createIssue(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const projectId = Number(data.projectId);
    if (!projectId) throw Errors.validation('يجب تحديد المشروع');
    const project = await ensureProject(tx, projectId);
    const branchId = Number(data.branchId ?? project.branchId ?? 0) || null;

    const dailyLogId = Number(data.dailyLogId ?? 0) || null;
    if (dailyLogId) {
      const dailyLog = await tx.siteDailyLog.findUnique({ where: { id: dailyLogId }, select: { id: true, projectId: true } });
      if (!dailyLog) throw Errors.notFound('اليومية المرتبطة غير موجودة');
      if (Number(dailyLog.projectId) !== projectId) throw Errors.business('اليومية لا تنتمي لنفس المشروع');
    }

    if (data.reportedByEmployeeId) {
      await ensureEmployee(tx, Number(data.reportedByEmployeeId));
    }

    const row = await tx.siteIssue.create({
      data: {
        number: data.number ?? (await generateNumber(tx, 'siteIssue', 'SIS')),
        branchId,
        projectId,
        dailyLogId,
        issueDate: data.issueDate ? normalizeDateOnly(data.issueDate, 'issueDate') : new Date(),
        category: String(data.category ?? 'GENERAL').toUpperCase(),
        severity: String(data.severity ?? 'MEDIUM').toUpperCase(),
        title: String(data.title ?? '').trim(),
        description: toText(data.description),
        status: 'OPEN',
        approvalStatus: 'DRAFT',
        postingStatus: 'NOT_APPLICABLE',
        reportedByEmployeeId: Number(data.reportedByEmployeeId ?? 0) || null,
        dueDate: data.dueDate ? normalizeDateOnly(data.dueDate, 'dueDate') : null,
        notes: toText(data.notes),
        createdById: userId,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'site-ops.issue.created',
      aggregateType: 'SiteIssue',
      aggregateId: String(row.id),
      actorId: userId,
      branchId,
      correlationId: `site-issue:${row.id}:created`,
      payload: {
        issueId: row.id,
        number: row.number,
        projectId: row.projectId,
        severity: row.severity,
        status: row.status
      }
    });

    return fetchIssue(tx, row.id);
  });
}

export async function updateIssue(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.siteIssue.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('المشكلة الميدانية غير موجودة');
    if (current.status === 'RESOLVED') throw Errors.business('لا يمكن تعديل مشكلة تم حلها');

    const projectId = Number(data.projectId ?? current.projectId);
    const project = await ensureProject(tx, projectId);
    const branchId = Number(data.branchId ?? current.branchId ?? project.branchId ?? 0) || null;

    const dailyLogId = data.dailyLogId !== undefined ? Number(data.dailyLogId || 0) || null : current.dailyLogId;
    if (dailyLogId) {
      const dailyLog = await tx.siteDailyLog.findUnique({ where: { id: dailyLogId }, select: { id: true, projectId: true } });
      if (!dailyLog) throw Errors.notFound('اليومية المرتبطة غير موجودة');
      if (Number(dailyLog.projectId) !== projectId) throw Errors.business('اليومية لا تنتمي لنفس المشروع');
    }

    if (data.reportedByEmployeeId) await ensureEmployee(tx, Number(data.reportedByEmployeeId));

    await tx.siteIssue.update({
      where: { id },
      data: {
        branchId,
        projectId,
        dailyLogId,
        issueDate: data.issueDate ? normalizeDateOnly(data.issueDate, 'issueDate') : current.issueDate,
        category: data.category !== undefined ? String(data.category).toUpperCase() : current.category,
        severity: data.severity !== undefined ? String(data.severity).toUpperCase() : current.severity,
        title: data.title !== undefined ? String(data.title).trim() : current.title,
        description: data.description !== undefined ? toText(data.description) : current.description,
        dueDate: data.dueDate !== undefined ? (data.dueDate ? normalizeDateOnly(data.dueDate, 'dueDate') : null) : current.dueDate,
        reportedByEmployeeId: data.reportedByEmployeeId !== undefined ? Number(data.reportedByEmployeeId || 0) || null : current.reportedByEmployeeId,
        notes: data.notes !== undefined ? toText(data.notes) : current.notes,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'site-ops.issue.updated',
      aggregateType: 'SiteIssue',
      aggregateId: String(id),
      actorId: userId,
      branchId,
      correlationId: `site-issue:${id}:updated`,
      payload: {
        issueId: id,
        projectId,
        severity: data.severity ?? current.severity
      }
    });

    return fetchIssue(tx, id);
  });
}

export async function resolveIssue(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.siteIssue.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('المشكلة الميدانية غير موجودة');
    if (current.status === 'RESOLVED') return fetchIssue(tx, id);

    if (data.resolvedByEmployeeId) await ensureEmployee(tx, Number(data.resolvedByEmployeeId));

    await tx.siteIssue.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        approvalStatus: 'APPROVED',
        resolvedAt: data.resolvedAt ? normalizeDateOnly(data.resolvedAt, 'resolvedAt') : new Date(),
        resolvedByEmployeeId: Number(data.resolvedByEmployeeId ?? 0) || current.resolvedByEmployeeId,
        notes: [current.notes, toText(data.notes)].filter(Boolean).join('\n'),
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'site-ops.issue.resolved',
      aggregateType: 'SiteIssue',
      aggregateId: String(id),
      actorId: userId,
      branchId: current.branchId,
      correlationId: `site-issue:${id}:resolved`,
      payload: {
        issueId: id,
        number: current.number,
        projectId: current.projectId,
        resolvedByEmployeeId: Number(data.resolvedByEmployeeId ?? 0) || null
      }
    });

    return fetchIssue(tx, id);
  });
}

export async function listAttendance(query: any) {
  const pageState = buildPage(query);
  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.employeeId) where.employeeId = Number(query.employeeId);
  if (query.status) where.status = String(query.status).toUpperCase();
  if (query.approvalStatus) where.approvalStatus = String(query.approvalStatus).toUpperCase();
  if (query.dateFrom || query.dateTo) {
    where.date = {};
    if (query.dateFrom) where.date.gte = normalizeDateOnly(String(query.dateFrom), 'dateFrom');
    if (query.dateTo) where.date.lte = normalizeDateOnly(String(query.dateTo), 'dateTo');
  }

  const [rows, total] = await Promise.all([
    prisma.siteAttendance.findMany({
      where,
      skip: pageState.skip,
      take: pageState.limit,
      include: {
        branch: { select: { id: true, code: true, nameAr: true } },
        project: { select: { id: true, code: true, nameAr: true } },
        employee: { select: { id: true, code: true, fullName: true } }
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }]
    }),
    prisma.siteAttendance.count({ where })
  ]);

  return {
    rows,
    meta: {
      page: pageState.page,
      limit: pageState.limit,
      total,
      pages: Math.max(1, Math.ceil(total / pageState.limit))
    }
  };
}

export async function getAttendance(id: number) {
  return prisma.$transaction((tx) => fetchAttendance(tx, id));
}

export async function createAttendance(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const projectId = Number(data.projectId);
    const employeeId = Number(data.employeeId);
    if (!projectId) throw Errors.validation('يجب تحديد المشروع');
    if (!employeeId) throw Errors.validation('يجب تحديد الموظف');

    const [project, employee] = await Promise.all([ensureProject(tx, projectId), ensureEmployee(tx, employeeId)]);

    const date = normalizeDateOnly(data.date, 'date');
    const branchId = Number(data.branchId ?? project.branchId ?? employee.branchId ?? 0) || null;
    const checkIn = data.checkIn ? parseDateOrThrow(data.checkIn, 'checkIn') : null;
    const checkOut = data.checkOut ? parseDateOrThrow(data.checkOut, 'checkOut') : null;
    const inferredHours = checkIn && checkOut ? Math.max(0, (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60)) : 0;
    const hoursWorked = data.hoursWorked !== undefined ? toNumber(data.hoursWorked, 'ساعات العمل') ?? 0 : roundAmount(inferredHours);

    const row = await tx.siteAttendance.upsert({
      where: {
        employeeId_projectId_date: {
          employeeId,
          projectId,
          date
        }
      },
      update: {
        branchId,
        checkIn,
        checkOut,
        hoursWorked,
        shift: toText(data.shift),
        status: String(data.status ?? 'PRESENT').toUpperCase(),
        notes: toText(data.notes),
        updatedById: userId
      },
      create: {
        branchId,
        projectId,
        employeeId,
        date,
        checkIn,
        checkOut,
        hoursWorked,
        shift: toText(data.shift),
        status: String(data.status ?? 'PRESENT').toUpperCase(),
        source: 'SITE',
        approvalStatus: 'DRAFT',
        postingStatus: 'NOT_APPLICABLE',
        notes: toText(data.notes),
        createdById: userId,
        updatedById: userId
      }
    });

    await syncAttendanceFromSite(tx, employeeId, date, branchId);

    await enqueueOutboxEvent(tx, {
      eventType: 'site-ops.attendance.upserted',
      aggregateType: 'SiteAttendance',
      aggregateId: String(row.id),
      actorId: userId,
      branchId,
      correlationId: `site-attendance:${row.id}:upserted`,
      payload: {
        siteAttendanceId: row.id,
        employeeId,
        projectId,
        date,
        hoursWorked
      }
    });

    return fetchAttendance(tx, row.id);
  });
}

export async function updateAttendance(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.siteAttendance.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('سجل الحضور الميداني غير موجود');

    const projectId = Number(data.projectId ?? current.projectId);
    const employeeId = Number(data.employeeId ?? current.employeeId);
    const [project, employee] = await Promise.all([ensureProject(tx, projectId), ensureEmployee(tx, employeeId)]);

    const date = data.date ? normalizeDateOnly(data.date, 'date') : current.date;
    const branchId = Number(data.branchId ?? current.branchId ?? project.branchId ?? employee.branchId ?? 0) || null;
    const checkIn = data.checkIn !== undefined ? (data.checkIn ? parseDateOrThrow(data.checkIn, 'checkIn') : null) : current.checkIn;
    const checkOut = data.checkOut !== undefined ? (data.checkOut ? parseDateOrThrow(data.checkOut, 'checkOut') : null) : current.checkOut;
    const inferredHours = checkIn && checkOut ? Math.max(0, (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60)) : Number(current.hoursWorked ?? 0);
    const hoursWorked = data.hoursWorked !== undefined ? toNumber(data.hoursWorked, 'ساعات العمل') ?? 0 : roundAmount(inferredHours);

    await tx.siteAttendance.update({
      where: { id },
      data: {
        branchId,
        projectId,
        employeeId,
        date,
        checkIn,
        checkOut,
        hoursWorked,
        shift: data.shift !== undefined ? toText(data.shift) : current.shift,
        status: data.status !== undefined ? String(data.status).toUpperCase() : current.status,
        notes: data.notes !== undefined ? toText(data.notes) : current.notes,
        updatedById: userId
      }
    });

    await syncAttendanceFromSite(tx, employeeId, date, branchId);
    if (employeeId !== current.employeeId) {
      await syncAttendanceFromSite(tx, current.employeeId, normalizeDateOnly(current.date, 'date'), current.branchId);
    }

    await enqueueOutboxEvent(tx, {
      eventType: 'site-ops.attendance.updated',
      aggregateType: 'SiteAttendance',
      aggregateId: String(id),
      actorId: userId,
      branchId,
      correlationId: `site-attendance:${id}:updated`,
      payload: {
        siteAttendanceId: id,
        employeeId,
        projectId,
        date,
        hoursWorked
      }
    });

    return fetchAttendance(tx, id);
  });
}

export async function submitAttendance(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.siteAttendance.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('سجل الحضور الميداني غير موجود');
    if (current.approvalStatus === 'PENDING') return fetchAttendance(tx, id);

    await tx.siteAttendance.update({
      where: { id },
      data: {
        approvalStatus: 'PENDING',
        status: current.status === 'DRAFT' ? 'PRESENT' : current.status,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'site-ops.attendance.submitted',
      aggregateType: 'SiteAttendance',
      aggregateId: String(id),
      actorId: userId,
      branchId: current.branchId,
      correlationId: `site-attendance:${id}:submitted`,
      payload: {
        siteAttendanceId: id,
        employeeId: current.employeeId,
        projectId: current.projectId,
        date: current.date
      }
    });

    return fetchAttendance(tx, id);
  });
}

export async function approveAttendance(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.siteAttendance.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('سجل الحضور الميداني غير موجود');
    if (current.approvalStatus === 'APPROVED') return fetchAttendance(tx, id);

    await tx.siteAttendance.update({
      where: { id },
      data: {
        approvalStatus: 'APPROVED',
        updatedById: userId
      }
    });

    await syncAttendanceFromSite(tx, current.employeeId, normalizeDateOnly(current.date, 'date'), current.branchId);

    await enqueueOutboxEvent(tx, {
      eventType: 'site-ops.attendance.approved',
      aggregateType: 'SiteAttendance',
      aggregateId: String(id),
      actorId: userId,
      branchId: current.branchId,
      correlationId: `site-attendance:${id}:approved`,
      payload: {
        siteAttendanceId: id,
        employeeId: current.employeeId,
        projectId: current.projectId,
        date: current.date,
        hoursWorked: current.hoursWorked
      }
    });

    return fetchAttendance(tx, id);
  });
}
