import { randomUUID } from 'crypto';
import { Prisma, type OutboxEvent } from '@prisma/client';
import { prisma } from '../../config/database';
import { createDomainEventSchema, type CreateDomainEventInput } from './contracts';

type PrismaExecutor = Prisma.TransactionClient | typeof prisma;

function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function enqueueOutboxEvent(executor: PrismaExecutor, input: CreateDomainEventInput): Promise<OutboxEvent> {
  const event = createDomainEventSchema.parse(input);
  return executor.outboxEvent.create({
    data: {
      eventId: event.eventId ?? randomUUID(),
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      occurredAt: event.occurredAt ?? new Date(),
      actorId: event.actorId ?? null,
      branchId: event.branchId ?? null,
      correlationId: event.correlationId,
      version: event.version ?? 1,
      payload: event.payload
    }
  });
}

export async function listPendingOutboxEvents(limit = 25): Promise<OutboxEvent[]> {
  return prisma.outboxEvent.findMany({
    where: { status: 'PENDING' },
    orderBy: [{ createdAt: 'asc' }],
    take: limit
  });
}

export async function markOutboxEventPublished(id: number): Promise<OutboxEvent> {
  return prisma.outboxEvent.update({
    where: { id },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      lastError: null
    }
  });
}

export async function markOutboxEventFailed(id: number, error: unknown): Promise<OutboxEvent> {
  return prisma.outboxEvent.update({
    where: { id },
    data: {
      status: 'FAILED',
      retryCount: { increment: 1 },
      lastError: normalizeError(error)
    }
  });
}

export async function retryOutboxEvent(id: number): Promise<OutboxEvent> {
  return prisma.outboxEvent.update({
    where: { id },
    data: {
      status: 'PENDING',
      lastError: null
    }
  });
}

export async function registerEventConsumption(input: {
  consumerName: string;
  eventId: string;
  outboxEventId?: number | null;
  status?: string;
  result?: Prisma.InputJsonValue;
  errorMessage?: string | null;
}) {
  return prisma.eventConsumption.upsert({
    where: {
      consumerName_eventId: {
        consumerName: input.consumerName,
        eventId: input.eventId
      }
    },
    update: {
      outboxEventId: input.outboxEventId ?? null,
      status: input.status ?? 'CONSUMED',
      result: input.result,
      errorMessage: input.errorMessage ?? null,
      consumedAt: new Date()
    },
    create: {
      consumerName: input.consumerName,
      eventId: input.eventId,
      outboxEventId: input.outboxEventId ?? null,
      status: input.status ?? 'CONSUMED',
      result: input.result,
      errorMessage: input.errorMessage ?? null
    }
  });
}
