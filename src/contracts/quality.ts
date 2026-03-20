import { z } from 'zod';
import { branchScopedWriteSchema, domainEnvelopeSchema } from './domain-base';

const dateStringSchema = z.string().trim().min(1);

export const qualityActionSchema = z
  .object({
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const createQualityStandardSchema = domainEnvelopeSchema
  .extend({
    code: z.string().trim().min(2).max(80).optional(),
    projectId: z.number().int().positive().optional(),
    title: z.string().trim().min(2).max(255),
    category: z.string().trim().max(100).optional(),
    checklist: z.any().optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const createInspectionSchema = branchScopedWriteSchema
  .extend({
    projectId: z.number().int().positive().optional(),
    standardId: z.number().int().positive().optional(),
    inspectionDate: dateStringSchema.optional(),
    inspectorEmployeeId: z.number().int().positive().optional(),
    title: z.string().trim().min(2).max(255),
    location: z.string().trim().max(255).optional(),
    result: z.enum(['PENDING', 'PASS', 'FAIL', 'CONDITIONAL']).optional(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    status: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const createNcrReportSchema = branchScopedWriteSchema
  .extend({
    projectId: z.number().int().positive().optional(),
    inspectionId: z.number().int().positive().optional(),
    reportDate: dateStringSchema.optional(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    title: z.string().trim().min(2).max(255),
    description: z.string().trim().max(4000).optional(),
    correctiveAction: z.string().trim().max(2000).optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const createSafetyIncidentSchema = branchScopedWriteSchema
  .extend({
    projectId: z.number().int().positive().optional(),
    permitId: z.number().int().positive().optional(),
    incidentDate: dateStringSchema.optional(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    title: z.string().trim().min(2).max(255),
    description: z.string().trim().max(4000).optional(),
    rootCause: z.string().trim().max(2000).optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const createPermitSchema = branchScopedWriteSchema
  .extend({
    projectId: z.number().int().positive().optional(),
    permitType: z.string().trim().max(100).optional(),
    title: z.string().trim().min(2).max(255),
    validFrom: dateStringSchema,
    validTo: dateStringSchema,
    issuerEmployeeId: z.number().int().positive().optional(),
    approverEmployeeId: z.number().int().positive().optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

