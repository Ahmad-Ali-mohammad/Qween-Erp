import { z } from 'zod';
import { branchScopedWriteSchema, decimalLikeSchema } from './domain-base';

export const createBranchSchema = z.object({
  code: z.string().trim().min(1).max(50),
  nameAr: z.string().trim().min(2).max(255),
  nameEn: z.string().trim().max(255).optional(),
  city: z.string().trim().max(255).optional(),
  address: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().email().optional(),
  isActive: z.boolean().optional()
}).strict();

export const updateBranchSchema = createBranchSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'يجب إرسال حقل واحد على الأقل'
});

export const createApprovalWorkflowSchema = branchScopedWriteSchema.extend({
  code: z.string().trim().min(1).max(50),
  nameAr: z.string().trim().min(2).max(255),
  nameEn: z.string().trim().max(255).optional(),
  entityType: z.string().trim().min(1).max(100),
  thresholdAmount: decimalLikeSchema.optional(),
  isActive: z.boolean().optional(),
  steps: z.record(z.any()).optional()
}).strict();

export const updateApprovalWorkflowSchema = createApprovalWorkflowSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'يجب إرسال حقل واحد على الأقل'
});
