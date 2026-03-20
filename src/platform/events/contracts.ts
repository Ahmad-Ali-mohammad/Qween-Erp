import { z } from 'zod';

export const createDomainEventSchema = z.object({
  eventId: z.string().uuid().optional(),
  eventType: z.string().trim().min(1).max(255),
  aggregateType: z.string().trim().min(1).max(100),
  aggregateId: z.union([z.string().trim().min(1), z.number(), z.bigint()]).transform((value) => String(value)),
  occurredAt: z.coerce.date().optional(),
  actorId: z.number().int().positive().nullable().optional(),
  branchId: z.number().int().positive().nullable().optional(),
  correlationId: z.string().trim().max(255).optional(),
  version: z.number().int().positive().optional(),
  payload: z.any()
});

export type CreateDomainEventInput = z.infer<typeof createDomainEventSchema>;
