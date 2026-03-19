import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';

export type CorrespondenceInput = {
  reference?: string;
  subject: string;
  direction: 'INCOMING' | 'OUTGOING' | 'INTERNAL';
  entityType?: string;
  entityId?: number;
  documentKey?: string;
  attachmentId?: number;
  receivedAt?: string;
  sentAt?: string;
  notes?: string;
};

function parseDateOrThrow(value: string | undefined, fieldName: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw Errors.validation(`${fieldName} غير صالح`);
  }
  return date;
}

export async function createCorrespondence(input: CorrespondenceInput, userId: number) {
  const result = await prisma.$transaction(async (tx) => {
    const correspondence = await tx.correspondenceRegister.create({
      data: {
        reference: input.reference || `CORR-${Date.now()}`,
        subject: input.subject,
        direction: input.direction,
        entityType: input.entityType,
        entityId: input.entityId,
        documentKey: input.documentKey,
        attachmentId: input.attachmentId,
        receivedAt: parseDateOrThrow(input.receivedAt, 'receivedAt'),
        sentAt: parseDateOrThrow(input.sentAt, 'sentAt'),
        notes: input.notes,
        status: 'OPEN',
        createdBy: userId
      }
    });

    await tx.auditLog.create({
      data: {
        userId,
        table: 'correspondence_register',
        recordId: correspondence.id,
        action: 'CREATE',
        newValue: { correspondence }
      }
    });

    return correspondence;
  });

  return {
    success: true,
    message: 'تم إنشاء المراسلة بنجاح',
    data: result
  };
}

export async function updateCorrespondence(id: number, input: Partial<CorrespondenceInput>, userId: number) {
  const correspondence = await prisma.correspondenceRegister.findUnique({ where: { id } });
  if (!correspondence) throw Errors.notFound('المراسلة غير موجودة');

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.correspondenceRegister.update({
      where: { id },
      data: {
        subject: input.subject,
        direction: input.direction,
        entityType: input.entityType,
        entityId: input.entityId,
        documentKey: input.documentKey,
        attachmentId: input.attachmentId,
        receivedAt: parseDateOrThrow(input.receivedAt, 'receivedAt'),
        sentAt: parseDateOrThrow(input.sentAt, 'sentAt'),
        notes: input.notes
      }
    });

    await tx.auditLog.create({
      data: {
        userId,
        table: 'correspondence_register',
        recordId: id,
        action: 'UPDATE',
        newValue: { updated }
      }
    });

    return updated;
  });

  return {
    success: true,
    message: 'تم تحديث المراسلة بنجاح',
    data: result
  };
}

export async function listCorrespondence(page = 1, limit = 20, filters?: { direction?: string; status?: string }) {
  const skip = (page - 1) * limit;

  const where: any = {};
  if (filters?.direction) where.direction = filters.direction;
  if (filters?.status) where.status = filters.status;

  const [rows, total] = await Promise.all([
    prisma.correspondenceRegister.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        attachment: { select: { fileName: true, mimeType: true } }
      }
    }),
    prisma.correspondenceRegister.count({ where })
  ]);

  return {
    rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
}

export async function getCorrespondence(id: number) {
  const correspondence = await prisma.correspondenceRegister.findUnique({
    where: { id },
    include: {
      attachment: true
    }
  });

  if (!correspondence) throw Errors.notFound('المراسلة غير موجودة');

  return correspondence;
}

export async function closeCorrespondence(id: number, userId: number) {
  const correspondence = await prisma.correspondenceRegister.findUnique({ where: { id } });
  if (!correspondence) throw Errors.notFound('المراسلة غير موجودة');

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.correspondenceRegister.update({
      where: { id },
      data: { status: 'CLOSED' }
    });

    await tx.auditLog.create({
      data: {
        userId,
        table: 'correspondence_register',
        recordId: id,
        action: 'CLOSE',
        newValue: { updated }
      }
    });

    return updated;
  });

  return {
    success: true,
    message: 'تم إغلاق المراسلة بنجاح',
    data: result
  };
}
