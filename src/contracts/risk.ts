import { z } from 'zod';
import { branchScopedWriteSchema, decimalLikeSchema } from './domain-base';

const dateStringSchema = z.string().trim().min(1);

export const createRiskRegisterSchema = branchScopedWriteSchema
  .extend({
    code: z.string().trim().min(2).max(80).optional(),
    projectId: z.number().int().positive().optional(),
    contractId: z.number().int().positive().optional(),
    departmentId: z.number().int().positive().optional(),
    category: z.string().trim().max(100).optional(),
    title: z.string().trim().min(2).max(255),
    description: z.string().trim().max(4000).optional(),
    ownerEmployeeId: z.number().int().positive().optional(),
    probability: decimalLikeSchema.optional(),
    impact: decimalLikeSchema.optional(),
    dueDate: dateStringSchema.optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const createRiskAssessmentSchema = z
  .object({
    riskId: z.number().int().positive(),
    assessmentDate: dateStringSchema.optional(),
    probability: decimalLikeSchema,
    impact: decimalLikeSchema,
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const createMitigationPlanSchema = z
  .object({
    riskId: z.number().int().positive(),
    title: z.string().trim().min(2).max(255),
    description: z.string().trim().max(2000).optional(),
    ownerEmployeeId: z.number().int().positive().optional(),
    dueDate: dateStringSchema.optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const createRiskFollowupSchema = z
  .object({
    riskId: z.number().int().positive(),
    followupDate: dateStringSchema.optional(),
    status: z.string().trim().max(100).optional(),
    note: z.string().trim().max(2000).optional(),
    nextAction: z.string().trim().max(2000).optional(),
    nextReviewDate: dateStringSchema.optional()
  })
  .strict();

