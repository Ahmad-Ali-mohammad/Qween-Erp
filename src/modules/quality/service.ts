import { prisma } from '../../config/database';
import { enqueueOutboxEvent } from '../../platform/events/outbox';
import { buildSequentialNumberFromLatest } from '../../utils/id-generator';
import { parseDateOrThrow } from '../../utils/date';
import { Errors } from '../../utils/response';

function toNumber(value: unknown, fieldName: string, allowNull = false): number | null {
  if ((value === null || value === undefined || value === '') && allowNull) return null;
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw Errors.validation(`${fieldName} غير صالح`);
  return parsed;
}

function toPositiveInt(value: unknown, fieldName: string, allowNull = false): number | null {
  if ((value === null || value === undefined || value === '') && allowNull) return null;
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
  modelName: 'inspection' | 'ncrReport' | 'safetyIncident' | 'permitToWork',
  prefix: string
): Promise<string> {
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

async function ensureStandard(tx: any, standardId: number | null) {
  if (!standardId) return null;
  const standard = await tx.qualityStandard.findUnique({
    where: { id: standardId },
    select: { id: true, code: true, title: true, status: true }
  });
  if (!standard) throw Errors.notFound('معيار الجودة غير موجود');
  if (String(standard.status).toUpperCase() !== 'ACTIVE') throw Errors.business('معيار الجودة غير نشط');
  return standard;
}

async function ensureInspection(tx: any, inspectionId: number | null) {
  if (!inspectionId) return null;
  const inspection = await tx.inspection.findUnique({
    where: { id: inspectionId },
    select: { id: true, number: true, projectId: true, branchId: true, title: true, approvalStatus: true }
  });
  if (!inspection) throw Errors.notFound('الفحص غير موجود');
  return inspection;
}

async function ensurePermit(tx: any, permitId: number | null) {
  if (!permitId) return null;
  const permit = await tx.permitToWork.findUnique({
    where: { id: permitId },
    select: { id: true, number: true, title: true, projectId: true, branchId: true, approvalStatus: true }
  });
  if (!permit) throw Errors.notFound('تصريح العمل غير موجود');
  return permit;
}

async function fetchLabelsByIds<T>(tx: any, modelName: string, ids: Array<number | null | undefined>, select: Record<string, boolean>): Promise<Map<number, T>> {
  const uniqueIds = Array.from(new Set(ids.filter((value): value is number => Number.isInteger(value) && Number(value) > 0)));
  if (!uniqueIds.length) return new Map<number, T>();
  const rows = await tx[modelName].findMany({ where: { id: { in: uniqueIds } }, select });
  return new Map<number, T>(rows.map((row: any) => [row.id, row]));
}

async function enrichInspectionRows(tx: any, rows: any[]) {
  const [projectMap, standardMap, employeeMap] = await Promise.all([
    fetchLabelsByIds<any>(tx, 'project', rows.map((row) => row.projectId), { id: true, code: true, nameAr: true }),
    fetchLabelsByIds<any>(tx, 'qualityStandard', rows.map((row) => row.standardId), { id: true, code: true, title: true }),
    fetchLabelsByIds<any>(
      tx,
      'employee',
      rows.flatMap((row) => [row.inspectorEmployeeId, row.createdById, row.updatedById]),
      { id: true, code: true, fullName: true }
    )
  ]);

  return rows.map((row) => ({
    ...row,
    project: row.projectId ? projectMap.get(row.projectId) ?? null : null,
    standard: row.standardId ? standardMap.get(row.standardId) ?? null : null,
    inspector: row.inspectorEmployeeId ? employeeMap.get(row.inspectorEmployeeId) ?? null : null,
    createdBy: row.createdById ? employeeMap.get(row.createdById) ?? null : null,
    updatedBy: row.updatedById ? employeeMap.get(row.updatedById) ?? null : null
  }));
}

async function enrichNcrRows(tx: any, rows: any[]) {
  const [projectMap, inspectionMap] = await Promise.all([
    fetchLabelsByIds<any>(tx, 'project', rows.map((row) => row.projectId), { id: true, code: true, nameAr: true }),
    fetchLabelsByIds<any>(tx, 'inspection', rows.map((row) => row.inspectionId), { id: true, number: true, title: true })
  ]);

  return rows.map((row) => ({
    ...row,
    project: row.projectId ? projectMap.get(row.projectId) ?? null : null,
    inspection: row.inspectionId ? inspectionMap.get(row.inspectionId) ?? null : null
  }));
}

async function enrichIncidentRows(tx: any, rows: any[]) {
  const [projectMap, permitMap] = await Promise.all([
    fetchLabelsByIds<any>(tx, 'project', rows.map((row) => row.projectId), { id: true, code: true, nameAr: true }),
    fetchLabelsByIds<any>(tx, 'permitToWork', rows.map((row) => row.permitId), { id: true, number: true, title: true })
  ]);
  return rows.map((row) => ({
    ...row,
    project: row.projectId ? projectMap.get(row.projectId) ?? null : null,
    permit: row.permitId ? permitMap.get(row.permitId) ?? null : null
  }));
}

async function enrichPermitRows(tx: any, rows: any[]) {
  const [projectMap, employeeMap] = await Promise.all([
    fetchLabelsByIds<any>(tx, 'project', rows.map((row) => row.projectId), { id: true, code: true, nameAr: true }),
    fetchLabelsByIds<any>(tx, 'employee', rows.flatMap((row) => [row.issuerEmployeeId, row.approverEmployeeId]), {
      id: true,
      code: true,
      fullName: true
    })
  ]);

  return rows.map((row) => ({
    ...row,
    project: row.projectId ? projectMap.get(row.projectId) ?? null : null,
    issuerEmployee: row.issuerEmployeeId ? employeeMap.get(row.issuerEmployeeId) ?? null : null,
    approverEmployee: row.approverEmployeeId ? employeeMap.get(row.approverEmployeeId) ?? null : null
  }));
}

async function fetchInspection(tx: any, id: number) {
  const row = await tx.inspection.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('الفحص غير موجود');
  return (await enrichInspectionRows(tx, [row]))[0];
}

async function fetchNcr(tx: any, id: number) {
  const row = await tx.ncrReport.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('تقرير عدم المطابقة غير موجود');
  return (await enrichNcrRows(tx, [row]))[0];
}

async function fetchIncident(tx: any, id: number) {
  const row = await tx.safetyIncident.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('حادث السلامة غير موجود');
  return (await enrichIncidentRows(tx, [row]))[0];
}

async function fetchPermitRow(tx: any, id: number) {
  const row = await tx.permitToWork.findUnique({ where: { id } });
  if (!row) throw Errors.notFound('تصريح العمل غير موجود');
  return (await enrichPermitRows(tx, [row]))[0];
}

function buildDateRange(query: any, field: string) {
  if (!query.dateFrom && !query.dateTo) return undefined;
  const range: Record<string, Date> = {};
  if (query.dateFrom) range.gte = parseDateOrThrow(String(query.dateFrom), 'dateFrom');
  if (query.dateTo) range.lte = parseDateOrThrow(String(query.dateTo), 'dateTo');
  return { [field]: range };
}

export async function listInspections(query: any) {
  const page = buildPage(query);
  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.status) where.status = String(query.status);
  if (query.approvalStatus) where.approvalStatus = String(query.approvalStatus);
  Object.assign(where, buildDateRange(query, 'inspectionDate'));

  const [rows, total] = await Promise.all([
    prisma.inspection.findMany({ where, skip: page.skip, take: page.limit, orderBy: [{ inspectionDate: 'desc' }, { id: 'desc' }] }),
    prisma.inspection.count({ where })
  ]);

  return {
    rows: await prisma.$transaction((tx) => enrichInspectionRows(tx, rows)),
    meta: { page: page.page, limit: page.limit, total, pages: Math.max(1, Math.ceil(total / page.limit)) }
  };
}

export async function createInspection(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const projectId = toPositiveInt(data.projectId, 'projectId', true);
    const standardId = toPositiveInt(data.standardId, 'standardId', true);
    const inspectorEmployeeId = toPositiveInt(data.inspectorEmployeeId, 'inspectorEmployeeId', true);
    const project = await ensureProject(tx, projectId);
    await ensureStandard(tx, standardId);
    await ensureEmployee(tx, inspectorEmployeeId);
    const branchId = toPositiveInt(data.branchId ?? project?.branchId, 'branchId', true);

    const row = await tx.inspection.create({
      data: {
        number: data.number ?? (await generateNumber(tx, 'inspection', 'INS')),
        branchId,
        projectId,
        standardId,
        inspectionDate: data.inspectionDate ? parseDateOrThrow(data.inspectionDate, 'inspectionDate') : new Date(),
        inspectorEmployeeId,
        title: String(data.title).trim(),
        location: toText(data.location),
        result: String(data.result ?? 'PENDING').toUpperCase(),
        severity: String(data.severity ?? 'MEDIUM').toUpperCase(),
        status: String(data.status ?? 'DRAFT').toUpperCase(),
        approvalStatus: 'DRAFT',
        postingStatus: 'NOT_APPLICABLE',
        notes: toText(data.notes),
        createdById: userId,
        updatedById: userId,
        attachmentsCount: Number(data.attachmentsCount ?? 0)
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'quality.inspection.created',
      aggregateType: 'Inspection',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: row.branchId ?? null,
      payload: { number: row.number, title: row.title, projectId: row.projectId ?? null }
    });

    return fetchInspection(tx, row.id);
  });
}

export async function submitInspection(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.inspection.findUnique({ where: { id } });
    if (!row) throw Errors.notFound('الفحص غير موجود');
    if (row.approvalStatus === 'APPROVED') throw Errors.business('تم اعتماد الفحص بالفعل');

    await tx.inspection.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        approvalStatus: 'PENDING',
        submittedAt: new Date(),
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'quality.inspection.submitted',
      aggregateType: 'Inspection',
      aggregateId: String(id),
      actorId: userId,
      branchId: row.branchId ?? null,
      payload: { number: row.number, title: row.title }
    });

    return fetchInspection(tx, id);
  });
}

export async function approveInspection(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.inspection.findUnique({ where: { id } });
    if (!row) throw Errors.notFound('الفحص غير موجود');
    if (row.approvalStatus !== 'PENDING') throw Errors.business('الفحص غير جاهز للاعتماد');

    await tx.inspection.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'quality.inspection.approved',
      aggregateType: 'Inspection',
      aggregateId: String(id),
      actorId: userId,
      branchId: row.branchId ?? null,
      payload: { number: row.number, title: row.title }
    });

    return fetchInspection(tx, id);
  });
}

export async function listNcrReports(query: any) {
  const page = buildPage(query);
  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.status) where.status = String(query.status);
  if (query.severity) where.severity = String(query.severity).toUpperCase();
  Object.assign(where, buildDateRange(query, 'reportDate'));

  const [rows, total] = await Promise.all([
    prisma.ncrReport.findMany({ where, skip: page.skip, take: page.limit, orderBy: [{ reportDate: 'desc' }, { id: 'desc' }] }),
    prisma.ncrReport.count({ where })
  ]);

  return {
    rows: await prisma.$transaction((tx) => enrichNcrRows(tx, rows)),
    meta: { page: page.page, limit: page.limit, total, pages: Math.max(1, Math.ceil(total / page.limit)) }
  };
}

export async function createNcrReport(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const projectId = toPositiveInt(data.projectId, 'projectId', true);
    const inspectionId = toPositiveInt(data.inspectionId, 'inspectionId', true);
    const inspection = await ensureInspection(tx, inspectionId);
    const project = await ensureProject(tx, projectId ?? inspection?.projectId ?? null);
    const branchId = toPositiveInt(data.branchId ?? inspection?.branchId ?? project?.branchId, 'branchId', true);

    const row = await tx.ncrReport.create({
      data: {
        number: data.number ?? (await generateNumber(tx, 'ncrReport', 'NCR')),
        branchId,
        projectId: project?.id ?? null,
        inspectionId,
        reportDate: data.reportDate ? parseDateOrThrow(data.reportDate, 'reportDate') : new Date(),
        severity: String(data.severity ?? 'MEDIUM').toUpperCase(),
        title: String(data.title).trim(),
        description: toText(data.description),
        correctiveAction: toText(data.correctiveAction),
        status: 'OPEN',
        approvalStatus: 'DRAFT',
        postingStatus: 'NOT_APPLICABLE',
        createdById: userId,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'quality.ncr.created',
      aggregateType: 'NcrReport',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: row.branchId ?? null,
      payload: { number: row.number, title: row.title, severity: row.severity }
    });

    return fetchNcr(tx, row.id);
  });
}

export async function closeNcrReport(id: number, userId: number, data?: any) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.ncrReport.findUnique({ where: { id } });
    if (!row) throw Errors.notFound('تقرير عدم المطابقة غير موجود');
    if (row.status === 'CLOSED') throw Errors.business('تم إغلاق التقرير مسبقًا');

    await tx.ncrReport.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedById: userId,
        correctiveAction: toText(data?.notes) ?? row.correctiveAction,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'quality.ncr.closed',
      aggregateType: 'NcrReport',
      aggregateId: String(id),
      actorId: userId,
      branchId: row.branchId ?? null,
      payload: { number: row.number, title: row.title }
    });

    return fetchNcr(tx, id);
  });
}

export async function listSafetyIncidents(query: any) {
  const page = buildPage(query);
  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.status) where.status = String(query.status);
  if (query.severity) where.severity = String(query.severity).toUpperCase();
  Object.assign(where, buildDateRange(query, 'incidentDate'));

  const [rows, total] = await Promise.all([
    prisma.safetyIncident.findMany({ where, skip: page.skip, take: page.limit, orderBy: [{ incidentDate: 'desc' }, { id: 'desc' }] }),
    prisma.safetyIncident.count({ where })
  ]);

  return {
    rows: await prisma.$transaction((tx) => enrichIncidentRows(tx, rows)),
    meta: { page: page.page, limit: page.limit, total, pages: Math.max(1, Math.ceil(total / page.limit)) }
  };
}

export async function createSafetyIncident(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const permitId = toPositiveInt(data.permitId, 'permitId', true);
    const permit = await ensurePermit(tx, permitId);
    const projectId = toPositiveInt(data.projectId ?? permit?.projectId, 'projectId', true);
    const project = await ensureProject(tx, projectId);
    const branchId = toPositiveInt(data.branchId ?? permit?.branchId ?? project?.branchId, 'branchId', true);

    const row = await tx.safetyIncident.create({
      data: {
        number: data.number ?? (await generateNumber(tx, 'safetyIncident', 'INC')),
        branchId,
        projectId: project?.id ?? null,
        permitId,
        incidentDate: data.incidentDate ? parseDateOrThrow(data.incidentDate, 'incidentDate') : new Date(),
        severity: String(data.severity ?? 'HIGH').toUpperCase(),
        title: String(data.title).trim(),
        description: toText(data.description),
        rootCause: toText(data.rootCause),
        status: 'OPEN',
        approvalStatus: 'DRAFT',
        postingStatus: 'NOT_APPLICABLE',
        createdById: userId,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'quality.incident.created',
      aggregateType: 'SafetyIncident',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: row.branchId ?? null,
      payload: { number: row.number, title: row.title, severity: row.severity }
    });

    return fetchIncident(tx, row.id);
  });
}

export async function resolveSafetyIncident(id: number, userId: number, data?: any) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.safetyIncident.findUnique({ where: { id } });
    if (!row) throw Errors.notFound('حادث السلامة غير موجود');
    if (row.status === 'RESOLVED') throw Errors.business('تمت معالجة الحادث مسبقًا');

    await tx.safetyIncident.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedById: userId,
        updatedById: userId,
        description: toText(data?.notes) ?? row.description
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'quality.incident.resolved',
      aggregateType: 'SafetyIncident',
      aggregateId: String(id),
      actorId: userId,
      branchId: row.branchId ?? null,
      payload: { number: row.number, title: row.title }
    });

    return fetchIncident(tx, id);
  });
}

export async function listPermits(query: any) {
  const page = buildPage(query);
  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.projectId) where.projectId = Number(query.projectId);
  if (query.status) where.status = String(query.status);
  if (query.approvalStatus) where.approvalStatus = String(query.approvalStatus);
  Object.assign(where, buildDateRange(query, 'validTo'));

  const [rows, total] = await Promise.all([
    prisma.permitToWork.findMany({ where, skip: page.skip, take: page.limit, orderBy: [{ validTo: 'asc' }, { id: 'desc' }] }),
    prisma.permitToWork.count({ where })
  ]);

  return {
    rows: await prisma.$transaction((tx) => enrichPermitRows(tx, rows)),
    meta: { page: page.page, limit: page.limit, total, pages: Math.max(1, Math.ceil(total / page.limit)) }
  };
}

export async function createPermit(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const projectId = toPositiveInt(data.projectId, 'projectId', true);
    const issuerEmployeeId = toPositiveInt(data.issuerEmployeeId, 'issuerEmployeeId', true);
    const approverEmployeeId = toPositiveInt(data.approverEmployeeId, 'approverEmployeeId', true);
    const project = await ensureProject(tx, projectId);
    await ensureEmployee(tx, issuerEmployeeId);
    await ensureEmployee(tx, approverEmployeeId);
    const branchId = toPositiveInt(data.branchId ?? project?.branchId, 'branchId', true);

    const row = await tx.permitToWork.create({
      data: {
        number: data.number ?? (await generateNumber(tx, 'permitToWork', 'PTW')),
        branchId,
        projectId,
        permitType: String(data.permitType ?? 'GENERAL').trim().toUpperCase(),
        title: String(data.title).trim(),
        validFrom: parseDateOrThrow(data.validFrom, 'validFrom'),
        validTo: parseDateOrThrow(data.validTo, 'validTo'),
        issuerEmployeeId,
        approverEmployeeId,
        status: 'DRAFT',
        approvalStatus: 'DRAFT',
        postingStatus: 'NOT_APPLICABLE',
        notes: toText(data.notes),
        createdById: userId,
        updatedById: userId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'quality.permit.created',
      aggregateType: 'PermitToWork',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: row.branchId ?? null,
      payload: { number: row.number, title: row.title, validTo: row.validTo }
    });

    return fetchPermitRow(tx, row.id);
  });
}

export async function approvePermit(id: number, userId: number, data?: any) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.permitToWork.findUnique({ where: { id } });
    if (!row) throw Errors.notFound('تصريح العمل غير موجود');
    if (row.approvalStatus === 'APPROVED') throw Errors.business('تم اعتماد التصريح مسبقًا');

    await tx.permitToWork.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        approvalStatus: 'APPROVED',
        approvedAt: new Date(),
        updatedById: userId,
        notes: toText(data?.notes) ?? row.notes
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'quality.permit.approved',
      aggregateType: 'PermitToWork',
      aggregateId: String(id),
      actorId: userId,
      branchId: row.branchId ?? null,
      payload: { number: row.number, title: row.title }
    });

    return fetchPermitRow(tx, id);
  });
}
