import { qw } from '../../utils/where';
import { randomUUID } from 'crypto';
import type { CollectionRowOf } from '@prisma/orm-postgres/orm-client';
import { prisma, type Executor } from '../../config/database';
import { createDomainEventSchema, type CreateDomainEventInput } from './contracts';

type OutboxEvent = CollectionRowOf<ReturnType<typeof prisma.orm.public.OutboxEvent>>;

function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function enqueueOutboxEvent(executor: Executor, input: CreateDomainEventInput): Promise<OutboxEvent> {
  const event = createDomainEventSchema.parse(input);
  return executor.orm.public.OutboxEvent.create({
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
    });
}

export async function listPendingOutboxEvents(limit = 25): Promise<OutboxEvent[]> {
  return prisma.orm.public.OutboxEvent.where((r) => qw(r, { status: 'PENDING' })).orderBy([(r) => r.createdAt.asc()]).limit(limit).all();
}

export async function markOutboxEventPublished(id: number): Promise<OutboxEvent> {
  return prisma.orm.public.OutboxEvent.where((r) => qw(r, { id })).update({
      status: 'PUBLISHED',
      publishedAt: new Date(),
      lastError: null
    }).then((r0) => r0!);
}

export async function markOutboxEventFailed(id: number, error: unknown): Promise<OutboxEvent> {
  const current = await prisma.orm.public.OutboxEvent.first({ id });
  return prisma.orm.public.OutboxEvent.where((r) => qw(r, { id })).update({
      status: 'FAILED',
      retryCount: (current?.retryCount ?? 0) + 1,
      lastError: normalizeError(error)
    }).then((r0) => r0!);
}

export async function retryOutboxEvent(id: number): Promise<OutboxEvent> {
  return prisma.orm.public.OutboxEvent.where((r) => qw(r, { id })).update({
      status: 'PENDING',
      lastError: null
    }).then((r0) => r0!);
}

export async function registerEventConsumption(input: {
  consumerName: string;
  eventId: string;
  outboxEventId?: number | null;
  status?: string;
  result?: unknown;
  errorMessage?: string | null;
}) {
  return prisma.orm.public.EventConsumption.upsert({ create: {
      consumerName: input.consumerName,
      eventId: input.eventId,
      outboxEventId: input.outboxEventId ?? null,
      status: input.status ?? 'CONSUMED',
      result: input.result ?? null,
      errorMessage: input.errorMessage ?? null
    }, update: {
      outboxEventId: input.outboxEventId ?? null,
      status: input.status ?? 'CONSUMED',
      result: input.result ?? null,
      errorMessage: input.errorMessage ?? null,
      consumedAt: new Date()
    }, conflictOn: {
      consumerName_eventId: {
        consumerName: input.consumerName,
        eventId: input.eventId
      }
    } });
}
