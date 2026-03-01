import { z } from 'zod';

export const createAccountSchema = z.object({
  code: z.string().min(2),
  nameAr: z.string().min(2),
  nameEn: z.string().optional(),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  subType: z.string().optional(),
  parentId: z.number().int().optional(),
  isControl: z.boolean().optional(),
  allowPosting: z.boolean().optional(),
  normalBalance: z.enum(['Debit', 'Credit']).optional()
});

export const updateAccountSchema = createAccountSchema.partial();

export const moveAccountSchema = z.object({
  newParentId: z.number().int().positive().nullable()
});

export const togglePostingSchema = z.object({
  allowPosting: z.boolean()
});
