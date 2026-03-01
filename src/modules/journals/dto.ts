import { z } from 'zod';

export const journalLineSchema = z.object({
  accountId: z.number().int().positive(),
  description: z.string().optional(),
  debit: z.number().nonnegative(),
  credit: z.number().nonnegative(),
  projectId: z.number().int().optional(),
  departmentId: z.number().int().optional(),
  costCenterId: z.number().int().optional()
}).refine((line) => (line.debit > 0 && line.credit === 0) || (line.credit > 0 && line.debit === 0), {
  message: 'يجب أن يحتوي السطر على مدين أو دائن فقط'
});

export const createJournalSchema = z.object({
  date: z.string(),
  description: z.string().optional(),
  reference: z.string().optional(),
  source: z.enum(['MANUAL', 'SALES', 'PURCHASE', 'PAYROLL', 'ASSETS', 'REVERSAL']).optional(),
  lines: z.array(journalLineSchema).min(2)
});

export const reverseSchema = z.object({
  reversalDate: z.string().optional(),
  reason: z.string().optional()
});

export const updateJournalSchema = createJournalSchema.partial();

export const voidJournalSchema = z.object({
  reason: z.string().optional()
});
