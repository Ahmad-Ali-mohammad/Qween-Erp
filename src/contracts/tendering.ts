import { z } from 'zod';
import { branchScopedWriteSchema, decimalLikeSchema } from './domain-base';

export const tenderEstimateLineSchema = z.object({
  category: z.string().trim().max(100).optional(),
  description: z.string().trim().min(2).max(500),
  costType: z.string().trim().max(100).optional(),
  quantity: decimalLikeSchema,
  unitCost: decimalLikeSchema
});

export const tenderCompetitorSchema = z.object({
  name: z.string().trim().min(2).max(255),
  offeredValue: decimalLikeSchema.optional(),
  rank: z.number().int().positive().optional(),
  notes: z.string().trim().max(1000).optional()
});

export const createTenderSchema = branchScopedWriteSchema.extend({
  number: z.string().trim().min(1).max(100).optional(),
  title: z.string().trim().min(2).max(255),
  customerId: z.number().int().positive().optional(),
  opportunityId: z.number().int().positive().optional(),
  issuerName: z.string().trim().max(255).optional(),
  bidDueDate: z.string().trim().min(1).optional(),
  offeredValue: decimalLikeSchema.optional(),
  guaranteeAmount: decimalLikeSchema.optional(),
  notes: z.string().trim().max(5000).optional(),
  estimateLines: z.array(tenderEstimateLineSchema).optional().default([]),
  competitors: z.array(tenderCompetitorSchema).optional().default([])
}).strict();

export const updateTenderSchema = createTenderSchema.partial().strict();

export const tenderResultSchema = branchScopedWriteSchema.extend({
  result: z.enum(['WON', 'LOST', 'CANCELLED']),
  resultReason: z.string().trim().max(5000).optional(),
  startDate: z.string().trim().min(1).optional(),
  endDate: z.string().trim().min(1).optional(),
  contractNumber: z.string().trim().min(1).max(100).optional(),
  contractTitle: z.string().trim().min(2).max(255).optional(),
  contractType: z.string().trim().max(100).optional(),
  contractValue: decimalLikeSchema.optional(),
  terms: z.string().trim().max(5000).optional(),
  createProject: z.boolean().optional().default(true),
  projectCode: z.string().trim().min(1).max(100).optional(),
  projectNameAr: z.string().trim().min(2).max(255).optional(),
  projectNameEn: z.string().trim().max(255).optional(),
  projectType: z.string().trim().max(100).optional(),
  managerId: z.number().int().positive().optional(),
  projectDescription: z.string().trim().max(5000).optional()
}).strict();
