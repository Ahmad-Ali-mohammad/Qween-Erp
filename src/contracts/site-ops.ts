import { z } from 'zod';
import { branchScopedWriteSchema, decimalLikeSchema } from './domain-base';

const dateStringSchema = z.string().trim().min(1);

export const createSiteDailyLogSchema = branchScopedWriteSchema
  .extend({
    projectId: z.number().int().positive(),
    logDate: dateStringSchema,
    weather: z.string().trim().max(255).optional(),
    workforceCount: z.number().int().min(0).optional(),
    equipmentSummary: z.string().trim().max(2000).optional(),
    workExecuted: z.string().trim().max(5000).optional(),
    blockers: z.string().trim().max(2000).optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const updateSiteDailyLogSchema = createSiteDailyLogSchema.partial().strict();

export const createSiteMaterialRequestSchema = branchScopedWriteSchema
  .extend({
    projectId: z.number().int().positive(),
    dailyLogId: z.number().int().positive().optional(),
    itemId: z.number().int().positive().optional(),
    warehouseId: z.number().int().positive().optional(),
    requestDate: dateStringSchema.optional(),
    requiredBy: dateStringSchema.optional(),
    quantity: decimalLikeSchema,
    unit: z.string().trim().max(100).optional(),
    purpose: z.string().trim().max(1000).optional(),
    sourceMode: z.enum(['STOCK', 'PROCUREMENT', 'MIXED']).optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const updateSiteMaterialRequestSchema = createSiteMaterialRequestSchema.partial().strict();

export const fulfillSiteMaterialRequestSchema = z
  .object({
    issuedQuantity: decimalLikeSchema.optional(),
    unitCost: decimalLikeSchema.optional(),
    issueDate: dateStringSchema.optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const createSiteProgressSchema = branchScopedWriteSchema
  .extend({
    projectId: z.number().int().positive(),
    dailyLogId: z.number().int().positive().optional(),
    reportDate: dateStringSchema.optional(),
    wbsCode: z.string().trim().max(120).optional(),
    taskName: z.string().trim().min(2).max(255),
    plannedPercent: decimalLikeSchema.optional(),
    actualPercent: decimalLikeSchema.optional(),
    executedQty: decimalLikeSchema.optional(),
    unit: z.string().trim().max(100).optional(),
    status: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const updateSiteProgressSchema = createSiteProgressSchema.partial().strict();

export const createSiteIssueSchema = branchScopedWriteSchema
  .extend({
    projectId: z.number().int().positive(),
    dailyLogId: z.number().int().positive().optional(),
    issueDate: dateStringSchema.optional(),
    category: z.string().trim().max(100).optional(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    title: z.string().trim().min(2).max(255),
    description: z.string().trim().max(5000).optional(),
    dueDate: dateStringSchema.optional(),
    reportedByEmployeeId: z.number().int().positive().optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const updateSiteIssueSchema = createSiteIssueSchema.partial().strict();

export const resolveSiteIssueSchema = z
  .object({
    resolvedAt: dateStringSchema.optional(),
    resolvedByEmployeeId: z.number().int().positive().optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const createSiteAttendanceSchema = branchScopedWriteSchema
  .extend({
    projectId: z.number().int().positive(),
    employeeId: z.number().int().positive(),
    date: dateStringSchema,
    checkIn: dateStringSchema.optional(),
    checkOut: dateStringSchema.optional(),
    hoursWorked: decimalLikeSchema.optional(),
    shift: z.string().trim().max(100).optional(),
    status: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const updateSiteAttendanceSchema = createSiteAttendanceSchema.partial().strict();
