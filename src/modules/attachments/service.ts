import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
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

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
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

