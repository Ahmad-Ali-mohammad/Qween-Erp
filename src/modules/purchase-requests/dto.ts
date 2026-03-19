import { z } from 'zod';

export const purchaseRequestLineSchema = z.object({
  itemId: z.coerce.number().int().positive().optional(),
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative().optional().default(0),
  taxRate: z.coerce.number().min(0).max(100).optional().default(15)
});

export const createPurchaseRequestSchema = z.object({
  requesterId: z.coerce.number().int().positive().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  projectId: z.coerce.number().int().positive().optional(),
  supplierId: z.coerce.number().int().positive().optional(),
  date: z.string().optional(),
  requiredDate: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(purchaseRequestLineSchema).min(1)
});

export const updatePurchaseRequestSchema = createPurchaseRequestSchema.partial();

export const convertPurchaseRequestSchema = z
  .object({
    supplierId: z.coerce.number().int().positive().optional(),
    expectedDate: z.string().optional(),
    notes: z.string().optional()
  })
  .strict();
