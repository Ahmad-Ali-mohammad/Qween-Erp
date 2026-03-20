import { z } from 'zod';
import { branchScopedWriteSchema, decimalLikeSchema } from './domain-base';

export const createSubcontractSchema = branchScopedWriteSchema.extend({
  supplierId: z.number().int().positive(),
  projectId: z.number().int().positive(),
  title: z.string().min(3),
  scope: z.string().optional(),
  workOrderNumber: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  contractValue: decimalLikeSchema,
  retentionRate: decimalLikeSchema.optional(),
  performanceRating: z.number().int().min(1).max(5).optional(),
  notes: z.string().optional()
});

export const updateSubcontractSchema = createSubcontractSchema.partial();

export const createSubcontractIpcSchema = z.object({
  subcontractId: z.number().int().positive(),
  certificateDate: z.string(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  claimedAmount: decimalLikeSchema,
  certifiedAmount: decimalLikeSchema.optional(),
  retentionRate: decimalLikeSchema.optional(),
  notes: z.string().optional()
});

export const updateSubcontractIpcSchema = createSubcontractIpcSchema.partial().omit({ subcontractId: true });

export const createSubcontractPaymentSchema = z.object({
  amount: decimalLikeSchema.optional(),
  date: z.string(),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CHECK', 'CARD']).default('BANK_TRANSFER'),
  bankId: z.number().int().positive().optional(),
  checkNumber: z.string().optional(),
  checkDate: z.string().optional(),
  checkBank: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  completeImmediately: z.boolean().optional()
});
