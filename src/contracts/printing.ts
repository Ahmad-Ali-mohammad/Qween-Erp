import { z } from 'zod';
import { branchScopedWriteSchema, domainEnvelopeSchema } from './domain-base';

const outputFormatSchema = z.enum(['PDF', 'XLSX', 'CSV', 'DOCX', 'DOC', 'TXT', 'JSON', 'HTML']);
const runtimeStatusSchema = z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']);

export const createPrintTemplateSchema = domainEnvelopeSchema
  .extend({
    key: z.string().trim().min(1).max(100).optional(),
    title: z.string().trim().min(2).max(255),
    entityType: z.string().trim().min(2).max(100),
    defaultFormat: outputFormatSchema.optional(),
    templateHtml: z.string().trim().min(1).max(100000),
    templateJson: z.record(z.any()).optional()
  })
  .strict();

export const updatePrintTemplateSchema = createPrintTemplateSchema.partial().strict();

export const activateTemplateSchema = z
  .object({
    active: z.boolean()
  })
  .strict();

export const createPrintJobSchema = domainEnvelopeSchema
  .extend({
    number: z.string().trim().min(1).max(100).optional(),
    templateId: z.number().int().positive().optional(),
    entityType: z.string().trim().min(2).max(100),
    entityId: z.union([z.string(), z.number()]).optional(),
    outputFormat: outputFormatSchema.optional(),
    fileName: z.string().trim().max(255).optional(),
    fileUrl: z.string().trim().max(2000).optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const updatePrintJobSchema = createPrintJobSchema.partial().strict();

export const markPrintJobStatusSchema = z
  .object({
    status: runtimeStatusSchema,
    fileName: z.string().trim().max(255).optional(),
    fileUrl: z.string().trim().max(2000).optional(),
    errorMessage: z.string().trim().max(4000).optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const createExportJobSchema = domainEnvelopeSchema
  .extend({
    number: z.string().trim().min(1).max(100).optional(),
    sourceType: z.string().trim().min(2).max(100),
    sourceFilter: z.record(z.any()).optional(),
    outputFormat: outputFormatSchema.optional(),
    fileName: z.string().trim().max(255).optional(),
    fileUrl: z.string().trim().max(2000).optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const updateExportJobSchema = createExportJobSchema.partial().strict();

export const markExportJobStatusSchema = z
  .object({
    status: runtimeStatusSchema,
    rowsExported: z.number().int().nonnegative().optional(),
    fileName: z.string().trim().max(255).optional(),
    fileUrl: z.string().trim().max(2000).optional(),
    errorMessage: z.string().trim().max(4000).optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const createConversionJobSchema = domainEnvelopeSchema
  .extend({
    number: z.string().trim().min(1).max(100).optional(),
    sourceFileName: z.string().trim().min(1).max(255),
    sourceFileUrl: z.string().trim().max(2000).optional(),
    sourceFormat: z.string().trim().min(2).max(30),
    targetFormat: z.string().trim().min(2).max(30),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const updateConversionJobSchema = createConversionJobSchema.partial().strict();

export const markConversionJobStatusSchema = z
  .object({
    status: runtimeStatusSchema,
    outputFileName: z.string().trim().max(255).optional(),
    outputFileUrl: z.string().trim().max(2000).optional(),
    errorMessage: z.string().trim().max(4000).optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .strict();

export const printingAuditQuerySchema = branchScopedWriteSchema
  .extend({
    resourceType: z.string().trim().max(100).optional(),
    action: z.string().trim().max(100).optional(),
    status: z.string().trim().max(100).optional()
  })
  .partial()
  .strict();
