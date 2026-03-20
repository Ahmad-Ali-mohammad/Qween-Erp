import { z } from 'zod';
import { branchScopedWriteSchema } from './domain-base';

export const documentProviderSchema = z.enum(['LOCAL', 'S3']);
export const documentStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);

export const createDocumentSchema = branchScopedWriteSchema.extend({
  module: z.string().trim().min(1).max(100),
  entityType: z.string().trim().min(1).max(100),
  entityId: z.union([z.string().trim().min(1), z.number().int().positive()]).transform(String),
  provider: documentProviderSchema.optional(),
  fileName: z.string().trim().min(1).max(255),
  originalName: z.string().trim().max(255).optional(),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().nonnegative().optional(),
  bucket: z.string().trim().max(255).optional(),
  storageKey: z.string().trim().min(1).max(500),
  checksum: z.string().trim().max(255).optional(),
  ocrText: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  versionNumber: z.number().int().positive().optional()
}).strict();

export const updateDocumentSchema = createDocumentSchema.partial().extend({
  status: documentStatusSchema.optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: 'يجب إرسال حقل واحد على الأقل'
});
