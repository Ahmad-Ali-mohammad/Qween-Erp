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

function durationBetween(startDate: Date, endDate: Date) {
  const diff = endDate.getTime() - startDate.getTime();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

async function generateCode(tx: any) {
  const year = new Date().getUTCFullYear();
  const latest = await tx.schedulePlan.findFirst({
    where: { code: { startsWith: `SCH-${year}-` } },
    select: { code: true },
    orderBy: { code: 'desc' }
  });
  return buildSequentialNumberFromLatest('SCH', latest?.code, year);
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

async function ensurePlan(tx: any, planId: number) {
  const plan = await tx.schedulePlan.findUnique({
    where: { id: planId },
    select: { id: true, code: true, title: true, branchId: true, projectId: true, status: true }
  });
  if (!plan) throw Errors.notFound('الخطة الزمنية غير موجودة');
  return plan;
}

async function ensureTask(tx: any, taskId: number) {
  const task = await tx.scheduleTask.findUnique({
    where: { id: taskId },
    select: { id: true, planId: true, title: true, isCritical: true, endDate: true, progressPercent: true }
  });
  if (!task) throw Errors.notFound('المهمة غير موجودة');
  return task;
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

async function ensureAsset(tx: any, assetId: number | null) {
  if (!assetId) return null;
  const asset = await tx.fixedAsset.findUnique({
    where: { id: assetId },
    select: { id: true, code: true, nameAr: true }
  });
  if (!asset) throw Errors.notFound('المعدة أو الأصل غير موجود');
  return asset;
}

async function fetchLabelsByIds<T>(tx: any, modelName: string, ids: Array<number | null | undefined>, select: Record<string, boolean>): Promise<Map<number, T>> {
  const uniqueIds = Array.from(new Set(ids.filter((value): value is number => Number.isInteger(value) && Number(value) > 0)));
  if (!uniqueIds.length) return new Map<number, T>();
  const rows = await tx[modelName].findMany({ where: { id: { in: uniqueIds } }, select });
  return new Map<number, T>(rows.map((row: any) => [row.id, row]));
}

async function enrichPlanRows(tx: any, rows: any[]) {
  const projectMap = await fetchLabelsByIds<any>(tx, 'project', rows.map((row) => row.projectId), { id: true, code: true, nameAr: true });
  return rows.map((row) => ({
    ...row,
    project: row.projectId ? projectMap.get(row.projectId) ?? null : null
  }));
}

async function enrichTaskRows(tx: any, rows: any[]) {
  const [planMap, projectMap] = await Promise.all([
    fetchLabelsByIds<any>(tx, 'schedulePlan', rows.map((row) => row.planId), { id: true, code: true, title: true }),
    fetchLabelsByIds<any>(tx, 'project', rows.map((row) => row.projectId), { id: true, code: true, nameAr: true })
  ]);
  const taskIds = rows.map((row) => row.id);
  const assignments = taskIds.length
    ? await tx.resourceAssignment.findMany({
        where: { taskId: { in: taskIds } },
        orderBy: [{ id: 'asc' }]
      })
    : [];
  const assignmentMap = new Map<number, any[]>();
  for (const row of assignments) {
    const list = assignmentMap.get(row.taskId) ?? [];
    list.push(row);
    assignmentMap.set(row.taskId, list);
  }

  return rows.map((row) => ({
    ...row,
    plan: row.planId ? planMap.get(row.planId) ?? null : null,
    project: row.projectId ? projectMap.get(row.projectId) ?? null : null,
    assignments: assignmentMap.get(row.id) ?? []
  }));
}

async function enrichDependencyRows(tx: any, rows: any[]) {
  const [planMap, taskMap] = await Promise.all([
    fetchLabelsByIds<any>(tx, 'schedulePlan', rows.map((row) => row.planId), { id: true, code: true, title: true }),
    fetchLabelsByIds<any>(
      tx,
      'scheduleTask',
      rows.flatMap((row) => [row.predecessorTaskId, row.successorTaskId]),
      { id: true, title: true, wbsCode: true }
    )
  ]);

  return rows.map((row) => ({
    ...row,
    plan: row.planId ? planMap.get(row.planId) ?? null : null,
    predecessorTask: row.predecessorTaskId ? taskMap.get(row.predecessorTaskId) ?? null : null,
    successorTask: row.successorTaskId ? taskMap.get(row.successorTaskId) ?? null : null
  }));
}

async function enrichSnapshotRows(tx: any, rows: any[]) {
  const planMap = await fetchLabelsByIds<any>(tx, 'schedulePlan', rows.map((row) => row.planId), { id: true, code: true, title: true });
  return rows.map((row) => ({
    ...row,
    plan: row.planId ? planMap.get(row.planId) ?? null : null
  }));
}

async function fetchPlanRow(tx: any, id: number) {
  const row = await tx.schedulePlan.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('الخطة الزمنية غير موجودة');
  return (await enrichPlanRows(tx, [row]))[0];
}

async function fetchTaskRow(tx: any, id: number) {
  const row = await tx.scheduleTask.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('المهمة غير موجودة');
  return (await enrichTaskRows(tx, [row]))[0];
}

async function fetchDependencyRow(tx: any, id: number) {
  const row = await tx.taskDependency.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('الاعتمادية غير موجودة');
  return (await enrichDependencyRows(tx, [row]))[0];
}

async function fetchSnapshotRow(tx: any, id: number) {
  const row = await tx.criticalPathSnapshot.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('لقطة المسار الحرج غير موجودة');
  return (await enrichSnapshotRows(tx, [row]))[0];
}

function buildDateRange(query: any, field: string) {
  if (!query.dateFrom && !query.dateTo) return undefined;
  const range: Record<string, Date> = {};
  if (query.dateFrom) range.gte = parseDateOrThrow(String(query.dateFrom), 'dateFrom');
  if (query.dateTo) range.lte = parseDateOrThrow(String(query.dateTo), 'dateTo');
  return { [field]: range };
}

async function validateAssignmentRef(tx: any, resourceType: string, resourceRefId: number) {
  const type = String(resourceType).toUpperCase();
  if (type === 'EMPLOYEE') {
    await ensureEmployee(tx, resourceRefId);
    return;
  }
  if (type === 'ASSET') {
    await ensureAsset(tx, resourceRefId);
  }
}

export async function listPlans(query: any) {
  const page = buildPage(query);
  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.status) where.status = String(query.status);

  const [rows, total] = await Promise.all([
    prisma.schedulePlan.findMany({ where, skip: page.skip, take: page.limit, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] }),
    prisma.schedulePlan.count({ where })
  ]);

  return {
    rows: await prisma.$transaction((tx) => enrichPlanRows(tx, rows)),
    meta: { page: page.page, limit: page.limit, total, pages: Math.max(1, Math.ceil(total / page.limit)) }
  };
}

export async function createPlan(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const projectId = toPositiveInt(data.projectId, 'projectId', true);
    const project = await ensureProject(tx, projectId);
    const branchId = toPositiveInt(data.branchId ?? project?.branchId, 'branchId', true);

    const row = await tx.schedulePlan.create({
      data: {
        code: data.code ?? (await generateCode(tx)),
        branchId,
        projectId,
        title: String(data.title).trim(),
        baselineStart: data.baselineStart ? parseDateOrThrow(data.baselineStart, 'baselineStart') : null,
        baselineEnd: data.baselineEnd ? parseDateOrThrow(data.baselineEnd, 'baselineEnd') : null,
        actualStart: data.actualStart ? parseDateOrThrow(data.actualStart, 'actualStart') : null,
        actualEnd: data.actualEnd ? parseDateOrThrow(data.actualEnd, 'actualEnd') : null,
        status: 'DRAFT',
        approvalStatus: 'DRAFT',
        postingStatus: 'NOT_APPLICABLE',
        notes: toText(data.notes),
        createdById: userId,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'scheduling.plan.created',
      aggregateType: 'SchedulePlan',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: row.branchId ?? null,
      payload: { code: row.code, title: row.title, projectId: row.projectId ?? null }
    });

    return fetchPlanRow(tx, row.id);
  });
}

export async function listTasks(query: any) {
  const page = buildPage(query);
  const where: any = {};
  if (query.planId) where.planId = Number(query.planId);
  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.status) where.status = String(query.status);
  Object.assign(where, buildDateRange(query, 'endDate'));

  const [rows, total] = await Promise.all([
    prisma.scheduleTask.findMany({ where, skip: page.skip, take: page.limit, orderBy: [{ startDate: 'asc' }, { id: 'asc' }] }),
    prisma.scheduleTask.count({ where })
  ]);

  return {
    rows: await prisma.$transaction((tx) => enrichTaskRows(tx, rows)),
    meta: { page: page.page, limit: page.limit, total, pages: Math.max(1, Math.ceil(total / page.limit)) }
  };
}

export async function createTask(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const planId = toPositiveInt(data.planId, 'planId')!;
    const plan = await ensurePlan(tx, planId);
    const projectId = toPositiveInt(data.projectId ?? plan.projectId, 'projectId', true);
    const project = await ensureProject(tx, projectId);
    const branchId = toPositiveInt(data.branchId ?? plan.branchId ?? project?.branchId, 'branchId', true);
    const startDate = parseDateOrThrow(data.startDate, 'startDate');
    const endDate = parseDateOrThrow(data.endDate, 'endDate');
    if (endDate.getTime() < startDate.getTime()) throw Errors.validation('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
    const durationDays = Number(data.durationDays ?? durationBetween(startDate, endDate));
    const task = await tx.scheduleTask.create({
      data: {
        planId,
        branchId,
        projectId,
        title: String(data.title).trim(),
        wbsCode: toText(data.wbsCode),
        startDate,
        endDate,
        actualStart: data.actualStart ? parseDateOrThrow(data.actualStart, 'actualStart') : null,
        actualEnd: data.actualEnd ? parseDateOrThrow(data.actualEnd, 'actualEnd') : null,
        progressPercent: toAmount(data.progressPercent, 'progressPercent', true) ?? 0,
        durationDays,
        isCritical: Boolean(data.isCritical),
        status: String(data.status ?? 'OPEN').toUpperCase(),
        approvalStatus: 'DRAFT',
        postingStatus: 'NOT_APPLICABLE',
        createdById: userId,
        updatedById: userId
      }
    });

    const assignments = Array.isArray(data.assignments) ? data.assignments : [];
    for (const assignment of assignments) {
      const resourceType = String(assignment.resourceType).toUpperCase();
      const resourceRefId = toPositiveInt(assignment.resourceRefId, 'resourceRefId')!;
      await validateAssignmentRef(tx, resourceType, resourceRefId);
      await tx.resourceAssignment.create({
        data: {
          planId,
          taskId: task.id,
          resourceType,
          resourceRefId,
          quantity: toAmount(assignment.quantity, 'quantity', true) ?? 1,
          allocationPercent: toAmount(assignment.allocationPercent, 'allocationPercent', true) ?? 100,
          status: 'ALLOCATED',
          approvalStatus: 'DRAFT',
          postingStatus: 'NOT_APPLICABLE',
          createdById: userId,
          updatedById: userId
        }
      });
    }

    await enqueueOutboxEvent(tx, {
      eventType: 'scheduling.task.created',
      aggregateType: 'ScheduleTask',
      aggregateId: String(task.id),
      actorId: userId,
      branchId: task.branchId ?? null,
      payload: { planId: task.planId, title: task.title, isCritical: task.isCritical, endDate: task.endDate }
    });

    return fetchTaskRow(tx, task.id);
  });
}

export async function listDependencies(query: any) {
  const page = buildPage(query);
  const where: any = {};
  if (query.planId) where.planId = Number(query.planId);

  const [rows, total] = await Promise.all([
    prisma.taskDependency.findMany({ where, skip: page.skip, take: page.limit, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    prisma.taskDependency.count({ where })
  ]);

  return {
    rows: await prisma.$transaction((tx) => enrichDependencyRows(tx, rows)),
    meta: { page: page.page, limit: page.limit, total, pages: Math.max(1, Math.ceil(total / page.limit)) }
  };
}

export async function createDependency(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const planId = toPositiveInt(data.planId, 'planId')!;
    await ensurePlan(tx, planId);
    const predecessorTaskId = toPositiveInt(data.predecessorTaskId, 'predecessorTaskId')!;
    const successorTaskId = toPositiveInt(data.successorTaskId, 'successorTaskId')!;
    if (predecessorTaskId === successorTaskId) throw Errors.business('لا يمكن ربط المهمة بنفسها');
    const predecessor = await ensureTask(tx, predecessorTaskId);
    const successor = await ensureTask(tx, successorTaskId);
    if (predecessor.planId !== planId || successor.planId !== planId) {
      throw Errors.business('يجب أن تنتمي المهام إلى نفس الخطة الزمنية');
    }

    const row = await tx.taskDependency.create({
      data: {
        planId,
        predecessorTaskId,
        successorTaskId,
        dependencyType: String(data.dependencyType ?? 'FS').toUpperCase(),
        lagDays: Number(data.lagDays ?? 0)
      }
    });

    return fetchDependencyRow(tx, row.id);
  });
}

export async function listCriticalPathSnapshots(query: any) {
  const page = buildPage(query);
  const where: any = {};
  if (query.planId) where.planId = Number(query.planId);
  Object.assign(where, buildDateRange(query, 'snapshotDate'));

  const [rows, total] = await Promise.all([
    prisma.criticalPathSnapshot.findMany({ where, skip: page.skip, take: page.limit, orderBy: [{ snapshotDate: 'desc' }, { id: 'desc' }] }),
    prisma.criticalPathSnapshot.count({ where })
  ]);

  return {
    rows: await prisma.$transaction((tx) => enrichSnapshotRows(tx, rows)),
    meta: { page: page.page, limit: page.limit, total, pages: Math.max(1, Math.ceil(total / page.limit)) }
  };
}

export async function createCriticalPathSnapshot(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const planId = toPositiveInt(data.planId, 'planId')!;
    const plan = await ensurePlan(tx, planId);
    const tasks = await tx.scheduleTask.findMany({
      where: { planId },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }]
    });
    const now = new Date();
    const criticalTasks = tasks.filter((task: any) => Boolean(task.isCritical));
    const delayedTasks = tasks.filter((task: any) => new Date(task.endDate).getTime() < now.getTime() && Number(task.progressPercent ?? 0) < 100);
    const delayedCriticalTasks = delayedTasks.filter((task: any) => Boolean(task.isCritical));
    const summary = {
      delayedCriticalTaskIds: delayedCriticalTasks.map((task: any) => task.id),
      delayedCriticalTasks: delayedCriticalTasks.map((task: any) => ({
        id: task.id,
        title: task.title,
        progressPercent: Number(task.progressPercent ?? 0),
        endDate: task.endDate
      }))
    };

    const row = await tx.criticalPathSnapshot.create({
      data: {
        planId,
        snapshotDate: new Date(),
        title: toText(data.title) ?? `Snapshot ${new Date().toISOString().slice(0, 10)}`,
        criticalTasksCount: criticalTasks.length,
        delayedTasksCount: delayedTasks.length,
        totalTasksCount: tasks.length,
        summary,
        status: 'SNAPSHOT',
        createdById: userId,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'scheduling.critical-path.snapshot.created',
      aggregateType: 'CriticalPathSnapshot',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: plan.branchId ?? null,
      payload: { planId, delayedTasksCount: delayedTasks.length, criticalTasksCount: criticalTasks.length }
    });

    if (delayedCriticalTasks.length) {
      await enqueueOutboxEvent(tx, {
        eventType: 'scheduling.delay.detected',
        aggregateType: 'SchedulePlan',
        aggregateId: String(planId),
        actorId: userId,
        branchId: plan.branchId ?? null,
        payload: { delayedCriticalTasksCount: delayedCriticalTasks.length, taskIds: delayedCriticalTasks.map((task: any) => task.id) }
      });
    }

    return fetchSnapshotRow(tx, row.id);
  });
}
