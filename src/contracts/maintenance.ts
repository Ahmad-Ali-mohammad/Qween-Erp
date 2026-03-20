import { z } from 'zod';
import { branchScopedWriteSchema, decimalLikeSchema } from './domain-base';

const dateStringSchema = z.string().trim().min(1);

export const maintenanceActionSchema = z
  .object({
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const createMaintenancePlanSchema = branchScopedWriteSchema
  .extend({
    code: z.string().trim().min(2).max(80).optional(),
    assetId: z.number().int().positive().optional(),
    projectId: z.number().int().positive().optional(),
    title: z.string().trim().min(2).max(255),
    frequencyType: z.enum(['TIME', 'HOURS']).optional(),
    intervalValue: z.number().int().positive().optional(),
    nextDueDate: dateStringSchema.optional(),
    nextDueHours: decimalLikeSchema.optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const createMaintenanceOrderSchema = branchScopedWriteSchema
  .extend({
    planId: z.number().int().positive().optional(),
    assetId: z.number().int().positive().optional(),
    projectId: z.number().int().positive().optional(),
    title: z.string().trim().min(2).max(255),
    description: z.string().trim().max(4000).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    scheduledDate: dateStringSchema.optional(),
    dueDate: dateStringSchema.optional(),
    estimatedCost: decimalLikeSchema.optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const createMaintenanceExecutionSchema = branchScopedWriteSchema
  .extend({
    orderId: z.number().int().positive(),
    assetId: z.number().int().positive().optional(),
    projectId: z.number().int().positive().optional(),
    executionDate: dateStringSchema.optional(),
    technicianEmployeeId: z.number().int().positive().optional(),
    hoursWorked: decimalLikeSchema.optional(),
    laborCost: decimalLikeSchema.optional(),
    spareItemId: z.number().int().positive().optional(),
    warehouseId: z.number().int().positive().optional(),
    spareQuantity: decimalLikeSchema.optional(),
    spareCost: decimalLikeSchema.optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const createFailureAnalysisSchema = branchScopedWriteSchema
  .extend({
    orderId: z.number().int().positive().optional(),
    assetId: z.number().int().positive().optional(),
    projectId: z.number().int().positive().optional(),
    incidentDate: dateStringSchema.optional(),
    title: z.string().trim().min(2).max(255),
    failureMode: z.string().trim().min(2).max(255),
    rootCause: z.string().trim().max(2000).optional(),
    mtbfHours: decimalLikeSchema.optional(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    repeatCount: z.number().int().nonnegative().optional()
  })
  .strict();

