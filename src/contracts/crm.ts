import { z } from 'zod';
import { branchScopedWriteSchema, decimalLikeSchema } from './domain-base';

export const awardOpportunitySchema = branchScopedWriteSchema.extend({
  contractNumber: z.string().trim().min(1).max(100).optional(),
  contractTitle: z.string().trim().min(2).max(255).optional(),
  contractType: z.string().trim().max(100).optional(),
  startDate: z.string().trim().min(1).optional(),
  endDate: z.string().trim().min(1).optional(),
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

