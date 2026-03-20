import { z } from 'zod';
import { branchScopedWriteSchema, decimalLikeSchema } from './domain-base';

const dateStringSchema = z.string().trim().min(1);

export const createSchedulePlanSchema = branchScopedWriteSchema
  .extend({
    code: z.string().trim().min(2).max(80).optional(),
    projectId: z.number().int().positive().optional(),
    title: z.string().trim().min(2).max(255),
    baselineStart: dateStringSchema.optional(),
    baselineEnd: dateStringSchema.optional(),
    actualStart: dateStringSchema.optional(),
    actualEnd: dateStringSchema.optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const createScheduleTaskSchema = branchScopedWriteSchema
  .extend({
    planId: z.number().int().positive(),
    projectId: z.number().int().positive().optional(),
    title: z.string().trim().min(2).max(255),
    wbsCode: z.string().trim().max(120).optional(),
    startDate: dateStringSchema,
    endDate: dateStringSchema,
    actualStart: dateStringSchema.optional(),
    actualEnd: dateStringSchema.optional(),
    progressPercent: decimalLikeSchema.optional(),
    durationDays: z.number().int().nonnegative().optional(),
    isCritical: z.boolean().optional(),
    status: z.string().trim().max(100).optional(),
    assignments: z
      .array(
        z
          .object({
            resourceType: z.enum(['EMPLOYEE', 'ASSET', 'CREW', 'MATERIAL']),
            resourceRefId: z.number().int().positive(),
            quantity: decimalLikeSchema.optional(),
            allocationPercent: decimalLikeSchema.optional()
          })
          .strict()
      )
      .optional()
  })
  .strict();

export const createTaskDependencySchema = z
  .object({
    planId: z.number().int().positive(),
    predecessorTaskId: z.number().int().positive(),
    successorTaskId: z.number().int().positive(),
    dependencyType: z.enum(['FS', 'SS', 'FF', 'SF']).optional(),
    lagDays: z.number().int().optional()
  })
  .strict();

export const createCriticalPathSnapshotSchema = z
  .object({
    planId: z.number().int().positive(),
    title: z.string().trim().min(2).max(255).optional()
  })
  .strict();
