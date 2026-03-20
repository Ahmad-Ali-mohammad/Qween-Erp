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

function classifySeverity(exposure: number): string {
  if (exposure >= 20) return 'CRITICAL';
  if (exposure >= 12) return 'HIGH';
  if (exposure >= 6) return 'MEDIUM';
  return 'LOW';
}

async function generateCode(tx: any) {
  const year = new Date().getUTCFullYear();
  const latest = await tx.riskRegister.findFirst({
    where: {
      code: {
        startsWith: `RSK-${year}-`
      }
    },
    select: { code: true },
    orderBy: { code: 'desc' }
  });
  return buildSequentialNumberFromLatest('RSK', latest?.code, year);
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

async function ensureContract(tx: any, contractId: number | null) {
  if (!contractId) return null;
  const contract = await tx.contract.findUnique({
    where: { id: contractId },
    select: { id: true, number: true, title: true, branchId: true }
  });
  if (!contract) throw Errors.notFound('العقد غير موجود');
  return contract;
}

async function ensureDepartment(tx: any, departmentId: number | null) {
  if (!departmentId) return null;
  const department = await tx.department.findUnique({
    where: { id: departmentId },
    select: { id: true, code: true, nameAr: true, isActive: true }
  });
  if (!department) throw Errors.notFound('الإدارة غير موجودة');
  if (!department.isActive) throw Errors.business('الإدارة غير نشطة');
  return department;
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

async function ensureRisk(tx: any, riskId: number) {
  const risk = await tx.riskRegister.findUnique({
    where: { id: riskId },
    select: {
      id: true,
      code: true,
      title: true,
      branchId: true,
      projectId: true,
      contractId: true,
      departmentId: true,
      status: true,
      severity: true
    }
  });
  if (!risk) throw Errors.notFound('سجل الخطر غير موجود');
  return risk;
}

async function fetchLabelsByIds<T>(tx: any, modelName: string, ids: Array<number | null | undefined>, select: Record<string, boolean>): Promise<Map<number, T>> {
  const uniqueIds = Array.from(new Set(ids.filter((value): value is number => Number.isInteger(value) && Number(value) > 0)));
  if (!uniqueIds.length) return new Map<number, T>();
  const rows = await tx[modelName].findMany({ where: { id: { in: uniqueIds } }, select });
  return new Map<number, T>(rows.map((row: any) => [row.id, row]));
}

async function enrichRiskRows(tx: any, rows: any[]) {
  const [projectMap, contractMap, departmentMap, employeeMap] = await Promise.all([
    fetchLabelsByIds<any>(tx, 'project', rows.map((row) => row.projectId), { id: true, code: true, nameAr: true }),
    fetchLabelsByIds<any>(tx, 'contract', rows.map((row) => row.contractId), { id: true, number: true, title: true }),
    fetchLabelsByIds<any>(tx, 'department', rows.map((row) => row.departmentId), { id: true, code: true, nameAr: true }),
    fetchLabelsByIds<any>(tx, 'employee', rows.map((row) => row.ownerEmployeeId), { id: true, code: true, fullName: true })
  ]);

  return rows.map((row) => ({
    ...row,
    project: row.projectId ? projectMap.get(row.projectId) ?? null : null,
    contract: row.contractId ? contractMap.get(row.contractId) ?? null : null,
    department: row.departmentId ? departmentMap.get(row.departmentId) ?? null : null,
    ownerEmployee: row.ownerEmployeeId ? employeeMap.get(row.ownerEmployeeId) ?? null : null
  }));
}

async function enrichAssessmentRows(tx: any, rows: any[]) {
  const riskMap = await fetchLabelsByIds<any>(tx, 'riskRegister', rows.map((row) => row.riskId), {
    id: true,
    code: true,
    title: true,
    severity: true
  });
  return rows.map((row) => ({
    ...row,
    risk: row.riskId ? riskMap.get(row.riskId) ?? null : null
  }));
}

async function enrichMitigationRows(tx: any, rows: any[]) {
  const [riskMap, employeeMap] = await Promise.all([
    fetchLabelsByIds<any>(tx, 'riskRegister', rows.map((row) => row.riskId), { id: true, code: true, title: true, severity: true }),
    fetchLabelsByIds<any>(tx, 'employee', rows.map((row) => row.ownerEmployeeId), { id: true, code: true, fullName: true })
  ]);

  return rows.map((row) => ({
    ...row,
    risk: row.riskId ? riskMap.get(row.riskId) ?? null : null,
    ownerEmployee: row.ownerEmployeeId ? employeeMap.get(row.ownerEmployeeId) ?? null : null
  }));
}

async function enrichFollowupRows(tx: any, rows: any[]) {
  const riskMap = await fetchLabelsByIds<any>(tx, 'riskRegister', rows.map((row) => row.riskId), { id: true, code: true, title: true, severity: true });
  return rows.map((row) => ({
    ...row,
    risk: row.riskId ? riskMap.get(row.riskId) ?? null : null
  }));
}

async function fetchRiskRow(tx: any, id: number) {
  const row = await tx.riskRegister.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('سجل الخطر غير موجود');
  return (await enrichRiskRows(tx, [row]))[0];
}

async function fetchAssessment(tx: any, id: number) {
  const row = await tx.riskAssessment.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('تقييم الخطر غير موجود');
  return (await enrichAssessmentRows(tx, [row]))[0];
}

async function fetchMitigation(tx: any, id: number) {
  const row = await tx.mitigationPlan.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('خطة التخفيف غير موجودة');
  return (await enrichMitigationRows(tx, [row]))[0];
}

async function fetchFollowup(tx: any, id: number) {
  const row = await tx.riskFollowup.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('متابعة الخطر غير موجودة');
  return (await enrichFollowupRows(tx, [row]))[0];
}

function buildDateRange(query: any, field: string) {
  if (!query.dateFrom && !query.dateTo) return undefined;
  const range: Record<string, Date> = {};
  if (query.dateFrom) range.gte = parseDateOrThrow(String(query.dateFrom), 'dateFrom');
  if (query.dateTo) range.lte = parseDateOrThrow(String(query.dateTo), 'dateTo');
  return { [field]: range };
}

export async function listRiskRegisters(query: any) {
  const page = buildPage(query);
  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.contractId) where.contractId = Number(query.contractId);
  if (query.departmentId) where.departmentId = Number(query.departmentId);
  if (query.status) where.status = String(query.status);
  if (query.severity) where.severity = String(query.severity).toUpperCase();

  const [rows, total] = await Promise.all([
    prisma.riskRegister.findMany({ where, skip: page.skip, take: page.limit, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] }),
    prisma.riskRegister.count({ where })
  ]);

  return {
    rows: await prisma.$transaction((tx) => enrichRiskRows(tx, rows)),
    meta: { page: page.page, limit: page.limit, total, pages: Math.max(1, Math.ceil(total / page.limit)) }
  };
}

export async function createRiskRegister(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const projectId = toPositiveInt(data.projectId, 'projectId', true);
    const contractId = toPositiveInt(data.contractId, 'contractId', true);
    const departmentId = toPositiveInt(data.departmentId, 'departmentId', true);
    const ownerEmployeeId = toPositiveInt(data.ownerEmployeeId, 'ownerEmployeeId', true);
    const project = await ensureProject(tx, projectId);
    const contract = await ensureContract(tx, contractId);
    await ensureDepartment(tx, departmentId);
    await ensureEmployee(tx, ownerEmployeeId);
    const branchId = toPositiveInt(data.branchId ?? project?.branchId ?? contract?.branchId, 'branchId', true);
    const probability = toAmount(data.probability, 'probability', true) ?? 0;
    const impact = toAmount(data.impact, 'impact', true) ?? 0;
    const exposure = roundAmount(probability * impact);
    const severity = classifySeverity(exposure);

    const row = await tx.riskRegister.create({
      data: {
        code: data.code ?? (await generateCode(tx)),
        branchId,
        projectId,
        contractId,
        departmentId,
        category: String(data.category ?? 'GENERAL').trim().toUpperCase(),
        title: String(data.title).trim(),
        description: toText(data.description),
        ownerEmployeeId,
        probability,
        impact,
        exposure,
        severity,
        dueDate: data.dueDate ? parseDateOrThrow(data.dueDate, 'dueDate') : null,
        status: 'OPEN',
        approvalStatus: 'DRAFT',
        postingStatus: 'NOT_APPLICABLE',
        createdById: userId,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'risk.register.created',
      aggregateType: 'RiskRegister',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: row.branchId ?? null,
      payload: { code: row.code, title: row.title, severity: row.severity }
    });

    return fetchRiskRow(tx, row.id);
  });
}

export async function listAssessments(query: any) {
  const page = buildPage(query);
  const where: any = {};
  if (query.riskId) where.riskId = Number(query.riskId);
  Object.assign(where, buildDateRange(query, 'assessmentDate'));

  const [rows, total] = await Promise.all([
    prisma.riskAssessment.findMany({ where, skip: page.skip, take: page.limit, orderBy: [{ assessmentDate: 'desc' }, { id: 'desc' }] }),
    prisma.riskAssessment.count({ where })
  ]);

  return {
    rows: await prisma.$transaction((tx) => enrichAssessmentRows(tx, rows)),
    meta: { page: page.page, limit: page.limit, total, pages: Math.max(1, Math.ceil(total / page.limit)) }
  };
}

export async function createAssessment(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const riskId = toPositiveInt(data.riskId, 'riskId')!;
    const risk = await ensureRisk(tx, riskId);
    const probability = toAmount(data.probability, 'probability') ?? 0;
    const impact = toAmount(data.impact, 'impact') ?? 0;
    const exposure = roundAmount(probability * impact);
    const severity = classifySeverity(exposure);

    const row = await tx.riskAssessment.create({
      data: {
        riskId,
        assessmentDate: data.assessmentDate ? parseDateOrThrow(data.assessmentDate, 'assessmentDate') : new Date(),
        probability,
        impact,
        exposure,
        severity,
        notes: toText(data.notes),
        createdById: userId,
        updatedById: userId
      }
    });

    await tx.riskRegister.update({
      where: { id: riskId },
      data: {
        probability,
        impact,
        exposure,
        severity,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'risk.assessment.recorded',
      aggregateType: 'RiskAssessment',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: risk.branchId ?? null,
      payload: { riskCode: risk.code, severity, exposure }
    });

    return fetchAssessment(tx, row.id);
  });
}

export async function listMitigations(query: any) {
  const page = buildPage(query);
  const where: any = {};
  if (query.riskId) where.riskId = Number(query.riskId);
  if (query.status) where.status = String(query.status);
  Object.assign(where, buildDateRange(query, 'dueDate'));

  const [rows, total] = await Promise.all([
    prisma.mitigationPlan.findMany({ where, skip: page.skip, take: page.limit, orderBy: [{ dueDate: 'asc' }, { id: 'desc' }] }),
    prisma.mitigationPlan.count({ where })
  ]);

  return {
    rows: await prisma.$transaction((tx) => enrichMitigationRows(tx, rows)),
    meta: { page: page.page, limit: page.limit, total, pages: Math.max(1, Math.ceil(total / page.limit)) }
  };
}

export async function createMitigation(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const riskId = toPositiveInt(data.riskId, 'riskId')!;
    const risk = await ensureRisk(tx, riskId);
    const ownerEmployeeId = toPositiveInt(data.ownerEmployeeId, 'ownerEmployeeId', true);
    await ensureEmployee(tx, ownerEmployeeId);

    const row = await tx.mitigationPlan.create({
      data: {
        riskId,
        title: String(data.title).trim(),
        description: toText(data.description),
        ownerEmployeeId,
        dueDate: data.dueDate ? parseDateOrThrow(data.dueDate, 'dueDate') : null,
        status: 'OPEN',
        approvalStatus: 'DRAFT',
        postingStatus: 'NOT_APPLICABLE',
        createdById: userId,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'risk.mitigation.created',
      aggregateType: 'MitigationPlan',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: risk.branchId ?? null,
      payload: { riskCode: risk.code, title: row.title, dueDate: row.dueDate }
    });

    if (row.dueDate && row.dueDate.getTime() < Date.now()) {
      await enqueueOutboxEvent(tx, {
        eventType: 'risk.mitigation.overdue',
        aggregateType: 'MitigationPlan',
        aggregateId: String(row.id),
        actorId: userId,
        branchId: risk.branchId ?? null,
        payload: { riskCode: risk.code, title: row.title, dueDate: row.dueDate }
      });
    }

    return fetchMitigation(tx, row.id);
  });
}

export async function listFollowups(query: any) {
  const page = buildPage(query);
  const where: any = {};
  if (query.riskId) where.riskId = Number(query.riskId);
  if (query.status) where.status = String(query.status);
  Object.assign(where, buildDateRange(query, 'followupDate'));

  const [rows, total] = await Promise.all([
    prisma.riskFollowup.findMany({ where, skip: page.skip, take: page.limit, orderBy: [{ followupDate: 'desc' }, { id: 'desc' }] }),
    prisma.riskFollowup.count({ where })
  ]);

  return {
    rows: await prisma.$transaction((tx) => enrichFollowupRows(tx, rows)),
    meta: { page: page.page, limit: page.limit, total, pages: Math.max(1, Math.ceil(total / page.limit)) }
  };
}

export async function createFollowup(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const riskId = toPositiveInt(data.riskId, 'riskId')!;
    const risk = await ensureRisk(tx, riskId);

    const row = await tx.riskFollowup.create({
      data: {
        riskId,
        followupDate: data.followupDate ? parseDateOrThrow(data.followupDate, 'followupDate') : new Date(),
        status: String(data.status ?? 'OPEN').toUpperCase(),
        note: toText(data.note),
        nextAction: toText(data.nextAction),
        nextReviewDate: data.nextReviewDate ? parseDateOrThrow(data.nextReviewDate, 'nextReviewDate') : null,
        createdById: userId,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'risk.followup.logged',
      aggregateType: 'RiskFollowup',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: risk.branchId ?? null,
      payload: { riskCode: risk.code, status: row.status, nextReviewDate: row.nextReviewDate }
    });

    return fetchFollowup(tx, row.id);
  });
}
