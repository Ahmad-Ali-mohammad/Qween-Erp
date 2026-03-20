import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';

const ATTACHMENT_COUNT_MODELS: Record<string, string> = {
  contract: 'contract',
  customer: 'customer',
  employee: 'employee',
  fixedasset: 'fixedAsset',
  invoice: 'invoice',
  payment: 'payment',
  project: 'project',
  purchaseorder: 'purchaseOrder',
  purchasereturn: 'purchaseReturn',
  salesquote: 'salesQuote',
  salesreturn: 'salesReturn',
  supplier: 'supplier',
  warehouse: 'warehouse'
};

async function syncAttachmentCount(entityType: string, entityId: string): Promise<void> {
  const delegateKey = ATTACHMENT_COUNT_MODELS[String(entityType).toLowerCase()];
  const numericId = Number(entityId);
  if (!delegateKey || !Number.isInteger(numericId) || numericId <= 0) return;

  const attachmentsCount = await prisma.document.count({
    where: {
      entityType,
      entityId,
      status: 'ACTIVE'
    }
  });

  const delegate = (prisma as unknown as Record<string, any>)[delegateKey];
  if (!delegate?.update) return;

  await delegate.update({
    where: { id: numericId },
    data: { attachmentsCount }
  }).catch(() => undefined);
}

export async function listDocuments(query: any) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (query.module) where.module = String(query.module);
  if (query.entityType) where.entityType = String(query.entityType);
  if (query.entityId) where.entityId = String(query.entityId);
  if (query.branchId) where.branchId = Number(query.branchId);
  if (query.status) where.status = String(query.status);

  const [rows, total] = await Promise.all([
    prisma.document.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ createdAt: 'desc' }]
    }),
    prisma.document.count({ where })
  ]);

  return {
    rows,
    meta: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit))
    }
  };
}

export async function getDocument(id: number) {
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) throw Errors.notFound('المستند غير موجود');
  return document;
}

export async function createDocument(data: any, userId: number) {
  const document = await prisma.document.create({
    data: {
      ...data,
      provider: data.provider ?? (env.objectStorageProvider.toUpperCase() === 'S3' ? 'S3' : 'LOCAL'),
      bucket: data.bucket ?? env.objectStorageBucket,
      uploadedById: userId
    }
  });

  await syncAttachmentCount(document.entityType, document.entityId);
  return document;
}

export async function updateDocument(id: number, data: any) {
  const current = await getDocument(id);
  const document = await prisma.document.update({
    where: { id },
    data
  });

  await syncAttachmentCount(document.entityType, document.entityId);
  if (current.entityType !== document.entityType || current.entityId !== document.entityId) {
    await syncAttachmentCount(current.entityType, current.entityId);
  }

  return document;
}

export async function archiveDocument(id: number) {
  const current = await getDocument(id);
  const document = await prisma.document.update({
    where: { id },
    data: { status: 'ARCHIVED' }
  });
  await syncAttachmentCount(current.entityType, current.entityId);
  return document;
}
