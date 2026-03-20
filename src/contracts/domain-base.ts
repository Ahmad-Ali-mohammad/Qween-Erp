import { z } from 'zod';

export const approvalLifecycleSchema = z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED']);
export const postingLifecycleSchema = z.enum(['UNPOSTED', 'POSTED', 'REVERSED', 'NOT_APPLICABLE']);

export const branchScopedWriteSchema = z.object({
  branchId: z.number().int().positive().optional()
});

export const domainEnvelopeSchema = branchScopedWriteSchema.extend({
  status: z.string().optional(),
  approvalStatus: approvalLifecycleSchema.optional(),
  postingStatus: postingLifecycleSchema.optional(),
  attachmentsCount: z.number().int().nonnegative().optional()
});

export const decimalLikeSchema = z.union([z.number(), z.string()]);
