import { prisma } from '../../config/database';
import { enqueueOutboxEvent } from '../../platform/events/outbox';
import { buildSequentialNumberFromLatest } from '../../utils/id-generator';
import { Errors } from '../../utils/response';
import type { Prisma } from '@prisma/client';

const ALLOWED_OUTPUT_FORMATS = new Set(['PDF', 'XLSX', 'CSV', 'DOCX', 'DOC', 'TXT', 'JSON', 'HTML']);
const ALLOWED_RUNTIME_STATUSES = new Set(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']);
const ALLOWED_APPROVAL_STATUSES = new Set(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED']);
const ALLOWED_POSTING_STATUSES = new Set(['UNPOSTED', 'POSTED', 'REVERSED', 'NOT_APPLICABLE']);

type ApprovalStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
type PostingStatus = 'UNPOSTED' | 'POSTED' | 'REVERSED' | 'NOT_APPLICABLE';

function toText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function normalizeFormat(value: unknown, fallback: string): string {
  const format = String(value ?? fallback).trim().toUpperCase();
  if (!ALLOWED_OUTPUT_FORMATS.has(format)) {
    throw Errors.validation('صيغة الملف غير مدعومة');
  }
  return format;
}

function normalizeStatus(value: unknown): string {
  const status = String(value ?? '').trim().toUpperCase();
  if (!ALLOWED_RUNTIME_STATUSES.has(status)) {
    throw Errors.validation('حالة التشغيل غير صالحة');
  }
  return status;
}

function normalizeNumber(value: unknown, fieldName: string, allowNull = false): number | null {
  if ((value === null || value === undefined || value === '') && allowNull) return null;
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw Errors.validation(`${fieldName} غير صالح`);
  return parsed;
}

function normalizeObject(value: unknown): Prisma.InputJsonValue {
  if (value && typeof value === 'object') {
    return value as Prisma.InputJsonValue;
  }
  return {};
}

function normalizeApprovalStatus(value: unknown, fallback: ApprovalStatus): ApprovalStatus {
  const status = String(value ?? fallback).trim().toUpperCase();
  if (!ALLOWED_APPROVAL_STATUSES.has(status)) {
    return fallback;
  }
  return status as ApprovalStatus;
}

function normalizePostingStatus(value: unknown, fallback: PostingStatus): PostingStatus {
  const status = String(value ?? fallback).trim().toUpperCase();
  if (!ALLOWED_POSTING_STATUSES.has(status)) {
    return fallback;
  }
  return status as PostingStatus;
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

async function generateTemplateKey(tx: any): Promise<string> {
  const year = new Date().getUTCFullYear();
  const latest = await tx.printTemplate.findFirst({
    where: {
      key: {
        startsWith: `TPL-${year}-`
      }
    },
    select: { key: true },
    orderBy: { key: 'desc' }
  });
  return buildSequentialNumberFromLatest('TPL', latest?.key, year);
}

async function generateNumber(tx: any, modelName: 'printJob' | 'exportJob' | 'conversionJob', prefix: string): Promise<string> {
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

async function fetchTemplate(tx: any, id: number) {
  const row = await tx.printTemplate.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, code: true, nameAr: true } },
      _count: { select: { printJobs: true } }
    }
  });
  if (!row) throw Errors.notFound('قالب الطباعة غير موجود');
  return row;
}

async function fetchPrintJob(tx: any, id: number) {
  const row = await tx.printJob.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, code: true, nameAr: true } },
      template: { select: { id: true, key: true, title: true, entityType: true, defaultFormat: true } }
    }
  });
  if (!row) throw Errors.notFound('مهمة الطباعة غير موجودة');
  return row;
}

async function fetchExportJob(tx: any, id: number) {
  const row = await tx.exportJob.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, code: true, nameAr: true } }
    }
  });
  if (!row) throw Errors.notFound('مهمة التصدير غير موجودة');
  return row;
}

async function fetchConversionJob(tx: any, id: number) {
  const row = await tx.conversionJob.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, code: true, nameAr: true } }
    }
  });
  if (!row) throw Errors.notFound('مهمة التحويل غير موجودة');
  return row;
}

async function appendAudit(
  tx: any,
  data: {
    branchId?: number | null;
    action: string;
    resourceType: string;
    resourceId: string;
    format?: string | null;
    status: string;
    note?: string | null;
    actorId?: number | null;
    printJobId?: number | null;
    exportJobId?: number | null;
    conversionJobId?: number | null;
    metadata?: Record<string, unknown>;
  }
) {
  return tx.printAudit.create({
    data: {
      branchId: data.branchId ?? null,
      action: data.action,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      format: data.format ?? null,
      status: data.status,
      note: data.note ?? null,
      actorId: data.actorId ?? null,
      printJobId: data.printJobId ?? null,
      exportJobId: data.exportJobId ?? null,
      conversionJobId: data.conversionJobId ?? null,
      metadata: data.metadata ?? {}
    }
  });
}

export async function listTemplates(query: any) {
  const pageState = buildPage(query);
  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.status) where.status = String(query.status).trim().toUpperCase();
  if (query.entityType) where.entityType = String(query.entityType).trim();
  if (query.search) {
    const search = String(query.search).trim();
    if (search) {
      where.OR = [
        { key: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { entityType: { contains: search, mode: 'insensitive' } }
      ];
    }
  }

  const [rows, total] = await Promise.all([
    prisma.printTemplate.findMany({
      where,
      skip: pageState.skip,
      take: pageState.limit,
      include: {
        branch: { select: { id: true, code: true, nameAr: true } },
        _count: { select: { printJobs: true } }
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    }),
    prisma.printTemplate.count({ where })
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

export async function getTemplate(id: number) {
  return prisma.$transaction((tx) => fetchTemplate(tx, id));
}

export async function createTemplate(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.printTemplate.create({
      data: {
        key: data.key ? String(data.key).trim() : await generateTemplateKey(tx),
        title: String(data.title ?? '').trim(),
        entityType: String(data.entityType ?? '').trim(),
        defaultFormat: normalizeFormat(data.defaultFormat, 'PDF'),
        templateHtml: String(data.templateHtml ?? ''),
        templateJson: data.templateJson ?? null,
        status: String(data.status ?? 'ACTIVE').trim().toUpperCase(),
        approvalStatus: normalizeApprovalStatus(data.approvalStatus, 'DRAFT'),
        postingStatus: normalizePostingStatus(data.postingStatus, 'NOT_APPLICABLE'),
        attachmentsCount: Number(data.attachmentsCount ?? 0) || 0,
        branchId: Number(data.branchId ?? 0) || null,
        createdById: userId,
        updatedById: userId
      }
    });

    await appendAudit(tx, {
      branchId: row.branchId,
      action: 'TEMPLATE_CREATED',
      resourceType: 'PrintTemplate',
      resourceId: String(row.id),
      format: row.defaultFormat,
      status: row.status,
      actorId: userId,
      note: row.title,
      metadata: {
        templateKey: row.key,
        entityType: row.entityType
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'printing.template.created',
      aggregateType: 'PrintTemplate',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: row.branchId,
      correlationId: `printing-template:${row.id}:created`,
      payload: {
        templateId: row.id,
        key: row.key,
        entityType: row.entityType,
        defaultFormat: row.defaultFormat
      }
    });

    return fetchTemplate(tx, row.id);
  });
}

export async function updateTemplate(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.printTemplate.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('قالب الطباعة غير موجود');

    await tx.printTemplate.update({
      where: { id },
      data: {
        key: data.key !== undefined ? String(data.key).trim() : current.key,
        title: data.title !== undefined ? String(data.title).trim() : current.title,
        entityType: data.entityType !== undefined ? String(data.entityType).trim() : current.entityType,
        defaultFormat: data.defaultFormat !== undefined ? normalizeFormat(data.defaultFormat, current.defaultFormat) : current.defaultFormat,
        templateHtml: data.templateHtml !== undefined ? String(data.templateHtml) : current.templateHtml,
        templateJson: data.templateJson !== undefined ? data.templateJson : current.templateJson,
        status: data.status !== undefined ? String(data.status).trim().toUpperCase() : current.status,
        approvalStatus: data.approvalStatus !== undefined ? normalizeApprovalStatus(data.approvalStatus, current.approvalStatus) : current.approvalStatus,
        postingStatus: data.postingStatus !== undefined ? normalizePostingStatus(data.postingStatus, current.postingStatus) : current.postingStatus,
        attachmentsCount: data.attachmentsCount !== undefined ? Number(data.attachmentsCount) || 0 : current.attachmentsCount,
        branchId: data.branchId !== undefined ? Number(data.branchId || 0) || null : current.branchId,
        updatedById: userId
      }
    });

    await appendAudit(tx, {
      branchId: current.branchId,
      action: 'TEMPLATE_UPDATED',
      resourceType: 'PrintTemplate',
      resourceId: String(id),
      format: data.defaultFormat ? normalizeFormat(data.defaultFormat, current.defaultFormat) : current.defaultFormat,
      status: data.status ? String(data.status).trim().toUpperCase() : current.status,
      actorId: userId
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'printing.template.updated',
      aggregateType: 'PrintTemplate',
      aggregateId: String(id),
      actorId: userId,
      branchId: current.branchId,
      correlationId: `printing-template:${id}:updated`,
      payload: {
        templateId: id,
        key: data.key ?? current.key,
        status: data.status ?? current.status
      }
    });

    return fetchTemplate(tx, id);
  });
}

export async function toggleTemplateActive(id: number, active: boolean, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.printTemplate.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('قالب الطباعة غير موجود');

    const status = active ? 'ACTIVE' : 'INACTIVE';
    await tx.printTemplate.update({
      where: { id },
      data: {
        status,
        approvalStatus: active ? 'APPROVED' : current.approvalStatus,
        updatedById: userId
      }
    });

    await appendAudit(tx, {
      branchId: current.branchId,
      action: active ? 'TEMPLATE_ACTIVATED' : 'TEMPLATE_DEACTIVATED',
      resourceType: 'PrintTemplate',
      resourceId: String(id),
      format: current.defaultFormat,
      status,
      actorId: userId
    });

    await enqueueOutboxEvent(tx, {
      eventType: active ? 'printing.template.activated' : 'printing.template.deactivated',
      aggregateType: 'PrintTemplate',
      aggregateId: String(id),
      actorId: userId,
      branchId: current.branchId,
      correlationId: `printing-template:${id}:${active ? 'activated' : 'deactivated'}`,
      payload: {
        templateId: id,
        status
      }
    });

    return fetchTemplate(tx, id);
  });
}

export async function listPrintJobs(query: any) {
  const pageState = buildPage(query);
  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.templateId) where.templateId = Number(query.templateId);
  if (query.entityType) where.entityType = String(query.entityType).trim();
  if (query.status) where.status = String(query.status).trim().toUpperCase();
  if (query.outputFormat) where.outputFormat = normalizeFormat(query.outputFormat, 'PDF');
  if (query.search) {
    const search = String(query.search).trim();
    if (search) {
      where.OR = [{ number: { contains: search, mode: 'insensitive' } }, { entityType: { contains: search, mode: 'insensitive' } }, { entityId: { contains: search, mode: 'insensitive' } }];
    }
  }

  const [rows, total] = await Promise.all([
    prisma.printJob.findMany({
      where,
      skip: pageState.skip,
      take: pageState.limit,
      include: {
        branch: { select: { id: true, code: true, nameAr: true } },
        template: { select: { id: true, key: true, title: true, defaultFormat: true } }
      },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }]
    }),
    prisma.printJob.count({ where })
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

export async function getPrintJob(id: number) {
  return prisma.$transaction((tx) => fetchPrintJob(tx, id));
}

export async function createPrintJob(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const templateId = Number(data.templateId ?? 0) || null;
    let template: any = null;
    if (templateId) {
      template = await tx.printTemplate.findUnique({ where: { id: templateId } });
      if (!template) throw Errors.notFound('قالب الطباعة غير موجود');
      if (template.status !== 'ACTIVE') throw Errors.business('القالب غير نشط حاليًا');
    }

    const outputFormat = normalizeFormat(data.outputFormat, template?.defaultFormat ?? 'PDF');
    const branchId = Number(data.branchId ?? template?.branchId ?? 0) || null;
    if (template?.branchId && branchId && Number(template.branchId) !== branchId) {
      throw Errors.business('الفرع المختار لا يطابق فرع القالب');
    }

    const entityType = String(data.entityType ?? template?.entityType ?? '').trim();
    if (!entityType) throw Errors.validation('يجب تحديد نوع الكيان');

    const row = await tx.printJob.create({
      data: {
        number: data.number ? String(data.number).trim() : await generateNumber(tx, 'printJob', 'PRN'),
        branchId,
        templateId,
        entityType,
        entityId: data.entityId !== undefined ? String(data.entityId) : null,
        outputFormat,
        status: 'QUEUED',
        approvalStatus: normalizeApprovalStatus(data.approvalStatus, 'DRAFT'),
        postingStatus: normalizePostingStatus(data.postingStatus, 'NOT_APPLICABLE'),
        requestedById: userId,
        fileName: toText(data.fileName),
        fileUrl: toText(data.fileUrl),
        errorMessage: null,
        attachmentsCount: Number(data.attachmentsCount ?? 0) || 0,
        createdById: userId,
        updatedById: userId
      }
    });

    await appendAudit(tx, {
      branchId,
      action: 'PRINT_JOB_CREATED',
      resourceType: 'PrintJob',
      resourceId: String(row.id),
      format: row.outputFormat,
      status: row.status,
      actorId: userId,
      printJobId: row.id,
      note: toText(data.notes),
      metadata: {
        number: row.number,
        templateId: row.templateId,
        entityType: row.entityType,
        entityId: row.entityId
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'printing.job.created',
      aggregateType: 'PrintJob',
      aggregateId: String(row.id),
      actorId: userId,
      branchId,
      correlationId: `printing-job:${row.id}:created`,
      payload: {
        printJobId: row.id,
        number: row.number,
        templateId: row.templateId,
        outputFormat: row.outputFormat,
        entityType: row.entityType,
        entityId: row.entityId
      }
    });

    return fetchPrintJob(tx, row.id);
  });
}

export async function updatePrintJob(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.printJob.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('مهمة الطباعة غير موجودة');
    if (current.status === 'COMPLETED') throw Errors.business('لا يمكن تعديل مهمة مكتملة');

    const templateId = data.templateId !== undefined ? Number(data.templateId || 0) || null : current.templateId;
    let template: any = null;
    if (templateId) {
      template = await tx.printTemplate.findUnique({ where: { id: templateId } });
      if (!template) throw Errors.notFound('قالب الطباعة غير موجود');
    }

    const entityType = data.entityType !== undefined ? String(data.entityType).trim() : current.entityType;
    const outputFormat = data.outputFormat !== undefined ? normalizeFormat(data.outputFormat, current.outputFormat) : current.outputFormat;
    const branchId = data.branchId !== undefined ? Number(data.branchId || 0) || null : current.branchId;

    if (template?.branchId && branchId && Number(template.branchId) !== branchId) {
      throw Errors.business('الفرع المختار لا يطابق فرع القالب');
    }

    await tx.printJob.update({
      where: { id },
      data: {
        branchId,
        templateId,
        entityType,
        entityId: data.entityId !== undefined ? String(data.entityId) : current.entityId,
        outputFormat,
        attachmentsCount: data.attachmentsCount !== undefined ? Number(data.attachmentsCount) || 0 : current.attachmentsCount,
        fileName: data.fileName !== undefined ? toText(data.fileName) : current.fileName,
        fileUrl: data.fileUrl !== undefined ? toText(data.fileUrl) : current.fileUrl,
        updatedById: userId
      }
    });

    await appendAudit(tx, {
      branchId,
      action: 'PRINT_JOB_UPDATED',
      resourceType: 'PrintJob',
      resourceId: String(id),
      format: outputFormat,
      status: current.status,
      actorId: userId,
      printJobId: id,
      note: toText(data.notes)
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'printing.job.updated',
      aggregateType: 'PrintJob',
      aggregateId: String(id),
      actorId: userId,
      branchId,
      correlationId: `printing-job:${id}:updated`,
      payload: {
        printJobId: id,
        templateId,
        outputFormat,
        entityType
      }
    });

    return fetchPrintJob(tx, id);
  });
}

export async function markPrintJobStatus(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.printJob.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('مهمة الطباعة غير موجودة');
    const status = normalizeStatus(data.status);

    const now = new Date();
    await tx.printJob.update({
      where: { id },
      data: {
        status,
        startedAt: status === 'RUNNING' ? current.startedAt ?? now : current.startedAt,
        completedAt: status === 'COMPLETED' ? now : status === 'QUEUED' ? null : current.completedAt,
        failedAt: status === 'FAILED' ? now : status === 'QUEUED' ? null : current.failedAt,
        fileName: data.fileName !== undefined ? toText(data.fileName) : current.fileName,
        fileUrl: data.fileUrl !== undefined ? toText(data.fileUrl) : current.fileUrl,
        errorMessage: data.errorMessage !== undefined ? toText(data.errorMessage) : status === 'FAILED' ? current.errorMessage : null,
        approvalStatus: status === 'COMPLETED' ? 'APPROVED' : current.approvalStatus,
        updatedById: userId
      }
    });

    const next = await fetchPrintJob(tx, id);

    await appendAudit(tx, {
      branchId: next.branchId,
      action: 'PRINT_JOB_STATUS',
      resourceType: 'PrintJob',
      resourceId: String(id),
      format: next.outputFormat,
      status,
      actorId: userId,
      printJobId: id,
      note: toText(data.notes),
      metadata: {
        fileName: next.fileName,
        fileUrl: next.fileUrl,
        errorMessage: next.errorMessage
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: `printing.job.${status.toLowerCase()}`,
      aggregateType: 'PrintJob',
      aggregateId: String(id),
      actorId: userId,
      branchId: next.branchId,
      correlationId: `printing-job:${id}:${status.toLowerCase()}`,
      payload: {
        printJobId: id,
        number: next.number,
        status,
        outputFormat: next.outputFormat,
        fileName: next.fileName,
        fileUrl: next.fileUrl
      }
    });

    return next;
  });
}

export async function listExportJobs(query: any) {
  const pageState = buildPage(query);
  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.sourceType) where.sourceType = String(query.sourceType).trim();
  if (query.status) where.status = String(query.status).trim().toUpperCase();
  if (query.outputFormat) where.outputFormat = normalizeFormat(query.outputFormat, 'XLSX');
  if (query.search) {
    const search = String(query.search).trim();
    if (search) {
      where.OR = [{ number: { contains: search, mode: 'insensitive' } }, { sourceType: { contains: search, mode: 'insensitive' } }];
    }
  }

  const [rows, total] = await Promise.all([
    prisma.exportJob.findMany({
      where,
      skip: pageState.skip,
      take: pageState.limit,
      include: {
        branch: { select: { id: true, code: true, nameAr: true } }
      },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }]
    }),
    prisma.exportJob.count({ where })
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

export async function getExportJob(id: number) {
  return prisma.$transaction((tx) => fetchExportJob(tx, id));
}

export async function createExportJob(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.exportJob.create({
      data: {
        number: data.number ? String(data.number).trim() : await generateNumber(tx, 'exportJob', 'EXP'),
        branchId: Number(data.branchId ?? 0) || null,
        sourceType: String(data.sourceType ?? '').trim(),
        sourceFilter: normalizeObject(data.sourceFilter),
        outputFormat: normalizeFormat(data.outputFormat, 'XLSX'),
        status: 'QUEUED',
        approvalStatus: normalizeApprovalStatus(data.approvalStatus, 'DRAFT'),
        postingStatus: normalizePostingStatus(data.postingStatus, 'NOT_APPLICABLE'),
        requestedById: userId,
        fileName: toText(data.fileName),
        fileUrl: toText(data.fileUrl),
        attachmentsCount: Number(data.attachmentsCount ?? 0) || 0,
        createdById: userId,
        updatedById: userId
      }
    });

    await appendAudit(tx, {
      branchId: row.branchId,
      action: 'EXPORT_JOB_CREATED',
      resourceType: 'ExportJob',
      resourceId: String(row.id),
      format: row.outputFormat,
      status: row.status,
      actorId: userId,
      exportJobId: row.id,
      note: toText(data.notes),
      metadata: {
        number: row.number,
        sourceType: row.sourceType
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'printing.export.created',
      aggregateType: 'ExportJob',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: row.branchId,
      correlationId: `printing-export:${row.id}:created`,
      payload: {
        exportJobId: row.id,
        number: row.number,
        sourceType: row.sourceType,
        outputFormat: row.outputFormat
      }
    });

    return fetchExportJob(tx, row.id);
  });
}

export async function updateExportJob(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.exportJob.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('مهمة التصدير غير موجودة');
    if (current.status === 'COMPLETED') throw Errors.business('لا يمكن تعديل مهمة مكتملة');

    const branchId = data.branchId !== undefined ? Number(data.branchId || 0) || null : current.branchId;
    const sourceType = data.sourceType !== undefined ? String(data.sourceType).trim() : current.sourceType;
    const outputFormat = data.outputFormat !== undefined ? normalizeFormat(data.outputFormat, current.outputFormat) : current.outputFormat;

    await tx.exportJob.update({
      where: { id },
      data: {
        branchId,
        sourceType,
        sourceFilter: data.sourceFilter !== undefined ? normalizeObject(data.sourceFilter) : ((current.sourceFilter ?? {}) as Prisma.InputJsonValue),
        outputFormat,
        fileName: data.fileName !== undefined ? toText(data.fileName) : current.fileName,
        fileUrl: data.fileUrl !== undefined ? toText(data.fileUrl) : current.fileUrl,
        attachmentsCount: data.attachmentsCount !== undefined ? Number(data.attachmentsCount) || 0 : current.attachmentsCount,
        updatedById: userId
      }
    });

    await appendAudit(tx, {
      branchId,
      action: 'EXPORT_JOB_UPDATED',
      resourceType: 'ExportJob',
      resourceId: String(id),
      format: outputFormat,
      status: current.status,
      actorId: userId,
      exportJobId: id,
      note: toText(data.notes)
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'printing.export.updated',
      aggregateType: 'ExportJob',
      aggregateId: String(id),
      actorId: userId,
      branchId,
      correlationId: `printing-export:${id}:updated`,
      payload: {
        exportJobId: id,
        sourceType,
        outputFormat
      }
    });

    return fetchExportJob(tx, id);
  });
}

export async function markExportJobStatus(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.exportJob.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('مهمة التصدير غير موجودة');
    const status = normalizeStatus(data.status);
    const now = new Date();
    const rowsExported = normalizeNumber(data.rowsExported, 'عدد الصفوف', true);

    await tx.exportJob.update({
      where: { id },
      data: {
        status,
        completedAt: status === 'COMPLETED' ? now : status === 'QUEUED' ? null : current.completedAt,
        failedAt: status === 'FAILED' ? now : status === 'QUEUED' ? null : current.failedAt,
        rowsExported: rowsExported !== null ? Math.max(0, Math.round(rowsExported)) : current.rowsExported,
        fileName: data.fileName !== undefined ? toText(data.fileName) : current.fileName,
        fileUrl: data.fileUrl !== undefined ? toText(data.fileUrl) : current.fileUrl,
        errorMessage: data.errorMessage !== undefined ? toText(data.errorMessage) : status === 'FAILED' ? current.errorMessage : null,
        approvalStatus: status === 'COMPLETED' ? 'APPROVED' : current.approvalStatus,
        updatedById: userId
      }
    });

    const next = await fetchExportJob(tx, id);

    await appendAudit(tx, {
      branchId: next.branchId,
      action: 'EXPORT_JOB_STATUS',
      resourceType: 'ExportJob',
      resourceId: String(id),
      format: next.outputFormat,
      status,
      actorId: userId,
      exportJobId: id,
      note: toText(data.notes),
      metadata: {
        rowsExported: next.rowsExported,
        fileName: next.fileName,
        fileUrl: next.fileUrl,
        errorMessage: next.errorMessage
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: `printing.export.${status.toLowerCase()}`,
      aggregateType: 'ExportJob',
      aggregateId: String(id),
      actorId: userId,
      branchId: next.branchId,
      correlationId: `printing-export:${id}:${status.toLowerCase()}`,
      payload: {
        exportJobId: id,
        number: next.number,
        status,
        outputFormat: next.outputFormat,
        rowsExported: next.rowsExported
      }
    });

    return next;
  });
}

export async function listConversionJobs(query: any) {
  const pageState = buildPage(query);
  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.status) where.status = String(query.status).trim().toUpperCase();
  if (query.sourceFormat) where.sourceFormat = String(query.sourceFormat).trim().toUpperCase();
  if (query.targetFormat) where.targetFormat = String(query.targetFormat).trim().toUpperCase();
  if (query.search) {
    const search = String(query.search).trim();
    if (search) {
      where.OR = [{ number: { contains: search, mode: 'insensitive' } }, { sourceFileName: { contains: search, mode: 'insensitive' } }, { outputFileName: { contains: search, mode: 'insensitive' } }];
    }
  }

  const [rows, total] = await Promise.all([
    prisma.conversionJob.findMany({
      where,
      skip: pageState.skip,
      take: pageState.limit,
      include: {
        branch: { select: { id: true, code: true, nameAr: true } }
      },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }]
    }),
    prisma.conversionJob.count({ where })
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

export async function getConversionJob(id: number) {
  return prisma.$transaction((tx) => fetchConversionJob(tx, id));
}

export async function createConversionJob(data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.conversionJob.create({
      data: {
        number: data.number ? String(data.number).trim() : await generateNumber(tx, 'conversionJob', 'CNV'),
        branchId: Number(data.branchId ?? 0) || null,
        sourceFileName: String(data.sourceFileName ?? '').trim(),
        sourceFileUrl: toText(data.sourceFileUrl),
        sourceFormat: String(data.sourceFormat ?? '').trim().toUpperCase(),
        targetFormat: String(data.targetFormat ?? '').trim().toUpperCase(),
        status: 'QUEUED',
        approvalStatus: normalizeApprovalStatus(data.approvalStatus, 'DRAFT'),
        postingStatus: normalizePostingStatus(data.postingStatus, 'NOT_APPLICABLE'),
        requestedById: userId,
        attachmentsCount: Number(data.attachmentsCount ?? 0) || 0,
        createdById: userId,
        updatedById: userId
      }
    });

    await appendAudit(tx, {
      branchId: row.branchId,
      action: 'CONVERSION_JOB_CREATED',
      resourceType: 'ConversionJob',
      resourceId: String(row.id),
      format: `${row.sourceFormat}->${row.targetFormat}`,
      status: row.status,
      actorId: userId,
      conversionJobId: row.id,
      note: toText(data.notes),
      metadata: {
        number: row.number,
        sourceFileName: row.sourceFileName
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'printing.conversion.created',
      aggregateType: 'ConversionJob',
      aggregateId: String(row.id),
      actorId: userId,
      branchId: row.branchId,
      correlationId: `printing-conversion:${row.id}:created`,
      payload: {
        conversionJobId: row.id,
        number: row.number,
        sourceFormat: row.sourceFormat,
        targetFormat: row.targetFormat
      }
    });

    return fetchConversionJob(tx, row.id);
  });
}

export async function updateConversionJob(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.conversionJob.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('مهمة التحويل غير موجودة');
    if (current.status === 'COMPLETED') throw Errors.business('لا يمكن تعديل مهمة مكتملة');

    const branchId = data.branchId !== undefined ? Number(data.branchId || 0) || null : current.branchId;
    const sourceFormat = data.sourceFormat !== undefined ? String(data.sourceFormat).trim().toUpperCase() : current.sourceFormat;
    const targetFormat = data.targetFormat !== undefined ? String(data.targetFormat).trim().toUpperCase() : current.targetFormat;

    await tx.conversionJob.update({
      where: { id },
      data: {
        branchId,
        sourceFileName: data.sourceFileName !== undefined ? String(data.sourceFileName).trim() : current.sourceFileName,
        sourceFileUrl: data.sourceFileUrl !== undefined ? toText(data.sourceFileUrl) : current.sourceFileUrl,
        sourceFormat,
        targetFormat,
        attachmentsCount: data.attachmentsCount !== undefined ? Number(data.attachmentsCount) || 0 : current.attachmentsCount,
        updatedById: userId
      }
    });

    await appendAudit(tx, {
      branchId,
      action: 'CONVERSION_JOB_UPDATED',
      resourceType: 'ConversionJob',
      resourceId: String(id),
      format: `${sourceFormat}->${targetFormat}`,
      status: current.status,
      actorId: userId,
      conversionJobId: id,
      note: toText(data.notes)
    });

    await enqueueOutboxEvent(tx, {
      eventType: 'printing.conversion.updated',
      aggregateType: 'ConversionJob',
      aggregateId: String(id),
      actorId: userId,
      branchId,
      correlationId: `printing-conversion:${id}:updated`,
      payload: {
        conversionJobId: id,
        sourceFormat,
        targetFormat
      }
    });

    return fetchConversionJob(tx, id);
  });
}

export async function markConversionJobStatus(id: number, data: any, userId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.conversionJob.findUnique({ where: { id } });
    if (!current) throw Errors.notFound('مهمة التحويل غير موجودة');
    const status = normalizeStatus(data.status);
    const now = new Date();

    await tx.conversionJob.update({
      where: { id },
      data: {
        status,
        completedAt: status === 'COMPLETED' ? now : status === 'QUEUED' ? null : current.completedAt,
        failedAt: status === 'FAILED' ? now : status === 'QUEUED' ? null : current.failedAt,
        outputFileName: data.outputFileName !== undefined ? toText(data.outputFileName) : current.outputFileName,
        outputFileUrl: data.outputFileUrl !== undefined ? toText(data.outputFileUrl) : current.outputFileUrl,
        errorMessage: data.errorMessage !== undefined ? toText(data.errorMessage) : status === 'FAILED' ? current.errorMessage : null,
        approvalStatus: status === 'COMPLETED' ? 'APPROVED' : current.approvalStatus,
        updatedById: userId
      }
    });

    const next = await fetchConversionJob(tx, id);

    await appendAudit(tx, {
      branchId: next.branchId,
      action: 'CONVERSION_JOB_STATUS',
      resourceType: 'ConversionJob',
      resourceId: String(id),
      format: `${next.sourceFormat}->${next.targetFormat}`,
      status,
      actorId: userId,
      conversionJobId: id,
      note: toText(data.notes),
      metadata: {
        outputFileName: next.outputFileName,
        outputFileUrl: next.outputFileUrl,
        errorMessage: next.errorMessage
      }
    });

    await enqueueOutboxEvent(tx, {
      eventType: `printing.conversion.${status.toLowerCase()}`,
      aggregateType: 'ConversionJob',
      aggregateId: String(id),
      actorId: userId,
      branchId: next.branchId,
      correlationId: `printing-conversion:${id}:${status.toLowerCase()}`,
      payload: {
        conversionJobId: id,
        number: next.number,
        status,
        sourceFormat: next.sourceFormat,
        targetFormat: next.targetFormat,
        outputFileName: next.outputFileName
      }
    });

    return next;
  });
}

export async function listPrintAudits(query: any) {
  const pageState = buildPage(query);
  const where: any = {};
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.resourceType) where.resourceType = String(query.resourceType).trim();
  if (query.action) where.action = String(query.action).trim().toUpperCase();
  if (query.status) where.status = String(query.status).trim().toUpperCase();
  if (query.search) {
    const search = String(query.search).trim();
    if (search) {
      where.OR = [{ resourceId: { contains: search, mode: 'insensitive' } }, { note: { contains: search, mode: 'insensitive' } }, { action: { contains: search, mode: 'insensitive' } }];
    }
  }

  const [rows, total] = await Promise.all([
    prisma.printAudit.findMany({
      where,
      skip: pageState.skip,
      take: pageState.limit,
      include: {
        branch: { select: { id: true, code: true, nameAr: true } },
        printJob: { select: { id: true, number: true, status: true } },
        exportJob: { select: { id: true, number: true, status: true } },
        conversionJob: { select: { id: true, number: true, status: true } }
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    }),
    prisma.printAudit.count({ where })
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
