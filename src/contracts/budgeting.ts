import { z } from 'zod';
import { branchScopedWriteSchema, decimalLikeSchema, domainEnvelopeSchema } from './domain-base';

const dateStringSchema = z.string().trim().min(1);

export const createBudgetScenarioSchema = domainEnvelopeSchema
  .extend({
    code: z.string().trim().min(2).max(60),
    nameAr: z.string().trim().min(2).max(255),
    nameEn: z.string().trim().max(255).optional(),
    fiscalYear: z.number().int().min(2000).max(2200),
    controlLevel: z.enum(['NONE', 'WARNING', 'HARD']).optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const updateBudgetScenarioSchema = createBudgetScenarioSchema.partial().strict();

export const createBudgetVersionSchema = domainEnvelopeSchema
  .extend({
    scenarioId: z.number().int().positive(),
    label: z.string().trim().min(1).max(120),
    versionNumber: z.number().int().positive().optional(),
    effectiveDate: dateStringSchema.optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const updateBudgetVersionSchema = createBudgetVersionSchema.omit({ scenarioId: true }).partial().strict();

export const publishBudgetVersionSchema = z
  .object({
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const budgetingAllocationInputSchema = branchScopedWriteSchema
  .extend({
    id: z.number().int().positive().optional(),
    legacyLineId: z.number().int().positive().optional(),
    accountId: z.number().int().positive().optional(),
    projectId: z.number().int().positive().optional(),
    costCenterId: z.number().int().positive().optional(),
    departmentId: z.number().int().positive().optional(),
    contractId: z.number().int().positive().optional(),
    period: z.number().int().min(1).max(12),
    plannedAmount: decimalLikeSchema,
    actualAmount: decimalLikeSchema.optional(),
    committedAmount: decimalLikeSchema.optional(),
    note: z.string().trim().max(2000).optional(),
    status: z.string().trim().max(100).optional(),
    approvalStatus: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED']).optional(),
    postingStatus: z.enum(['UNPOSTED', 'POSTED', 'REVERSED', 'NOT_APPLICABLE']).optional(),
    attachmentsCount: z.number().int().nonnegative().optional()
  })
  .strict();

export const upsertBudgetAllocationsSchema = z
  .object({
    scenarioId: z.number().int().positive().optional(),
    versionId: z.number().int().positive(),
    allocations: z.array(budgetingAllocationInputSchema).min(1)
  })
  .strict();

export const createForecastSnapshotSchema = branchScopedWriteSchema
  .extend({
    scenarioId: z.number().int().positive().optional(),
    versionId: z.number().int().positive(),
    snapshotDate: dateStringSchema.optional(),
    label: z.string().trim().min(2).max(255).optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

