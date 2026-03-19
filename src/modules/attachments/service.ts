import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { parseDateOrThrow } from '../../utils/date';
import { Errors } from '../../utils/response';
import { buildNamespacedStorageKey, getStoredFileDownload, removeStoredFile, saveStoredFile } from '../../services/file-storage';

type AttachmentListFilter = {
  entityType?: string;
  entityId?: number;
  limit?: number;
};

type CreateAttachmentInput = {
  entityType: string;
  entityId: number;
  fileName: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  contentBase64: string;
};

type DocumentVersionListFilter = {
  documentKey?: string;
  entityType?: string;
  entityId?: number;
  page?: number;
  limit?: number;
};

type CreateDocumentVersionInput = {
  documentKey: string;
  attachmentId: number;
  title?: string;
  status?: string;
  notes?: string | null;
  entityType?: string;
  entityId?: number;
};

type CorrespondenceListFilter = {
  direction?: string;
  status?: string;
  entityType?: string;
  entityId?: number;
  documentKey?: string;
  page?: number;
  limit?: number;
};

type CreateCorrespondenceInput = {
  direction: string;
  subject: string;
  reference?: string;
  status?: string;
  entityType?: string;
  entityId?: number;
  documentKey?: string;
  attachmentId?: number;
  receivedAt?: string;
  sentAt?: string;
  notes?: string | null;
};

type UpdateCorrespondenceInput = {
  subject?: string;
  reference?: string;
  status?: string;
  documentKey?: string;
  attachmentId?: number | null;
  receivedAt?: string | null;
  sentAt?: string | null;
  notes?: string | null;
};

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

const DOCUMENT_VERSION_STATUSES = new Set(['ACTIVE', 'ARCHIVED', 'VOID']);
const CORRESPONDENCE_STATUSES = new Set(['OPEN', 'CLOSED', 'ARCHIVED']);
const CORRESPONDENCE_DIRECTIONS = new Set(['INBOUND', 'OUTBOUND']);

function normalizeDocumentStatus(status?: string) {
  if (!status) return 'ACTIVE';
  const normalized = String(status).trim().toUpperCase();
  if (!DOCUMENT_VERSION_STATUSES.has(normalized)) {
    throw Errors.validation('حالة الإصدار غير صالحة');
  }
  return normalized;
}

function normalizeCorrespondenceStatus(status?: string) {
  if (!status) return 'OPEN';
  const normalized = String(status).trim().toUpperCase();
  if (!CORRESPONDENCE_STATUSES.has(normalized)) {
    throw Errors.validation('حالة المراسلة غير صالحة');
  }
  return normalized;
}

function normalizeCorrespondenceDirection(direction: string) {
  const normalized = String(direction).trim().toUpperCase();
  if (!CORRESPONDENCE_DIRECTIONS.has(normalized)) {
    throw Errors.validation('اتجاه المراسلة غير صالح');
  }
  return normalized;
}

function buildPagination(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit))
  };
}

function decodeBase64Content(contentBase64: string): { buffer: Buffer; mimeType?: string } {
  const dataUriMatch = contentBase64.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = dataUriMatch?.[1];
  const encoded = dataUriMatch?.[2] ?? contentBase64;
  const buffer = Buffer.from(encoded, 'base64');

  if (!buffer.length) {
    throw Errors.validation('Attachment content is empty or invalid');
  }

  return { buffer, mimeType };
}

export async function listAttachments(filter: AttachmentListFilter) {
  return prisma.attachment.findMany({
    where: {
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {})
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: filter.limit ?? 50
  });
}

export async function getAttachment(id: number) {
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) throw Errors.notFound('Attachment not found');
  return attachment;
}

export async function createAttachment(input: CreateAttachmentInput, createdBy?: number) {
  const decoded = decodeBase64Content(input.contentBase64);
  const mimeType = input.mimeType?.trim() || decoded.mimeType || 'application/octet-stream';
  const storageKey = buildNamespacedStorageKey(
    ['attachments', input.entityType, String(input.entityId)],
    input.fileName
  );

  await saveStoredFile(storageKey, decoded.buffer, {
    contentType: mimeType,
    metadata: {
      entityType: input.entityType,
      entityId: String(input.entityId)
    }
  });

  return prisma.attachment.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      fileName: input.fileName,
      storageKey,
      mimeType,
      sizeBytes: decoded.buffer.length,
      metadata: toJsonValue(input.metadata ?? {}),
      createdBy: createdBy ?? null
    }
  });
}

export async function getAttachmentDownload(id: number) {
  const attachment = await getAttachment(id);
  const file = await getStoredFileDownload(attachment.storageKey);

  return {
    attachment,
    file
  };
}

export async function deleteAttachment(id: number) {
  const attachment = await getAttachment(id);
  await prisma.attachment.delete({ where: { id } });

  try {
    await removeStoredFile(attachment.storageKey);
  } catch (error) {
    logger.warn('Failed to remove stored attachment file', {
      attachmentId: id,
      storageKey: attachment.storageKey,
      error
    });
  }

  return {
    deleted: true,
    attachmentId: id
  };
}

export async function listDocumentVersions(filter: DocumentVersionListFilter) {
  const page = Math.max(1, Number(filter.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(filter.limit ?? 20)));
  const skip = (page - 1) * limit;

  const where: Prisma.DocumentVersionWhereInput = {
    ...(filter.documentKey ? { documentKey: filter.documentKey } : {}),
    ...(filter.entityType ? { entityType: filter.entityType } : {}),
    ...(filter.entityId ? { entityId: filter.entityId } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.documentVersion.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { attachment: true }
    }),
    prisma.documentVersion.count({ where })
  ]);

  return {
    rows,
    pagination: buildPagination(page, limit, total)
  };
}

export async function getDocumentVersion(id: number) {
  const version = await prisma.documentVersion.findUnique({
    where: { id },
    include: { attachment: true }
  });
  if (!version) throw Errors.notFound('الإصدار غير موجود');
  return version;
}

export async function createDocumentVersion(input: CreateDocumentVersionInput, createdBy?: number) {
  const documentKey = String(input.documentKey ?? '').trim();
  if (!documentKey) throw Errors.validation('documentKey مطلوب');

  return prisma.$transaction(async (tx) => {
    const attachment = await tx.attachment.findUnique({ where: { id: input.attachmentId } });
    if (!attachment) throw Errors.notFound('المرفق غير موجود');

    const latest = await tx.documentVersion.findFirst({
      where: { documentKey },
      orderBy: [{ versionNumber: 'desc' }, { id: 'desc' }],
      select: { versionNumber: true }
    });
    const nextVersion = (latest?.versionNumber ?? 0) + 1;
    const status = normalizeDocumentStatus(input.status);

    return tx.documentVersion.create({
      data: {
        documentKey,
        versionNumber: nextVersion,
        title: input.title?.trim() || null,
        entityType: input.entityType ?? attachment.entityType,
        entityId: input.entityId ?? attachment.entityId,
        attachmentId: attachment.id,
        status,
        notes: input.notes ?? null,
        createdBy: createdBy ?? null
      },
      include: { attachment: true }
    });
  });
}

export async function listCorrespondence(filter: CorrespondenceListFilter) {
  const page = Math.max(1, Number(filter.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(filter.limit ?? 20)));
  const skip = (page - 1) * limit;

  const where: Prisma.CorrespondenceRegisterWhereInput = {
    ...(filter.direction ? { direction: normalizeCorrespondenceDirection(filter.direction) } : {}),
    ...(filter.status ? { status: normalizeCorrespondenceStatus(filter.status) } : {}),
    ...(filter.entityType ? { entityType: filter.entityType } : {}),
    ...(filter.entityId ? { entityId: filter.entityId } : {}),
    ...(filter.documentKey ? { documentKey: filter.documentKey } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.correspondenceRegister.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { attachment: true }
    }),
    prisma.correspondenceRegister.count({ where })
  ]);

  return {
    rows,
    pagination: buildPagination(page, limit, total)
  };
}

export async function getCorrespondence(id: number) {
  const row = await prisma.correspondenceRegister.findUnique({
    where: { id },
    include: { attachment: true }
  });
  if (!row) throw Errors.notFound('المراسلة غير موجودة');
  return row;
}

export async function createCorrespondence(input: CreateCorrespondenceInput, createdBy?: number) {
  const direction = normalizeCorrespondenceDirection(input.direction);
  const status = normalizeCorrespondenceStatus(input.status);
  const subject = String(input.subject ?? '').trim();
  if (!subject) throw Errors.validation('الموضوع مطلوب');

  if (input.attachmentId) {
    const attachment = await prisma.attachment.findUnique({ where: { id: input.attachmentId } });
    if (!attachment) throw Errors.notFound('المرفق غير موجود');
  }

  return prisma.correspondenceRegister.create({
    data: {
      direction,
      subject,
      reference: input.reference?.trim() || null,
      status,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      documentKey: input.documentKey ?? null,
      attachmentId: input.attachmentId ?? null,
      receivedAt: input.receivedAt ? parseDateOrThrow(input.receivedAt, 'receivedAt') : null,
      sentAt: input.sentAt ? parseDateOrThrow(input.sentAt, 'sentAt') : null,
      notes: input.notes ?? null,
      createdBy: createdBy ?? null
    },
    include: { attachment: true }
  });
}

export async function updateCorrespondence(id: number, input: UpdateCorrespondenceInput) {
  const current = await prisma.correspondenceRegister.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('المراسلة غير موجودة');

  const status = input.status ? normalizeCorrespondenceStatus(input.status) : current.status;

  if (input.attachmentId) {
    const attachment = await prisma.attachment.findUnique({ where: { id: input.attachmentId } });
    if (!attachment) throw Errors.notFound('المرفق غير موجود');
  }

  return prisma.correspondenceRegister.update({
    where: { id },
    data: {
      subject: input.subject?.trim() ?? current.subject,
      reference: input.reference?.trim() ?? current.reference,
      status,
      documentKey: input.documentKey ?? current.documentKey,
      attachmentId: input.attachmentId === undefined ? current.attachmentId : input.attachmentId,
      receivedAt:
        input.receivedAt === undefined ? current.receivedAt : input.receivedAt ? parseDateOrThrow(input.receivedAt, 'receivedAt') : null,
      sentAt:
        input.sentAt === undefined ? current.sentAt : input.sentAt ? parseDateOrThrow(input.sentAt, 'sentAt') : null,
      notes: input.notes === undefined ? current.notes : input.notes
    },
    include: { attachment: true }
  });
}
