import { z } from 'zod';
import { branchScopedWriteSchema, decimalLikeSchema } from './domain-base';

const dateLikeSchema = z.union([z.string(), z.date()]);

export const emptyActionSchema = z.object({}).passthrough();

export const createContractSchema = branchScopedWriteSchema.extend({
  number: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  partyType: z.string().trim().min(1),
  partyId: z.number().int().positive().optional(),
  type: z.string().trim().min(1).optional(),
  startDate: dateLikeSchema,
  endDate: dateLikeSchema.optional(),
  value: decimalLikeSchema.optional(),
  status: z.string().trim().min(1).optional(),
  terms: z.string().trim().optional(),
  attachmentsCount: z.number().int().nonnegative().optional()
});

export const updateContractSchema = createContractSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'يجب إرسال حقل واحد على الأقل');

export const renewContractSchema = z
  .object({
    months: z.coerce.number().int().positive().max(120).optional()
  })
  .strict();

export const createContractMilestoneSchema = z
  .object({
    title: z.string().trim().min(1),
    dueDate: dateLikeSchema.optional(),
    amount: decimalLikeSchema.optional(),
    status: z.string().trim().min(1).optional(),
    notes: z.string().trim().optional()
  })
  .strict();

export const updateContractMilestoneSchema = createContractMilestoneSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'يجب إرسال حقل واحد على الأقل');
