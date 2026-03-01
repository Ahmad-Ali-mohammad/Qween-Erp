import { z } from 'zod';

export const purchaseReturnLineSchema = z.object({
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  discount: z.coerce.number().nonnegative().optional().default(0),
  taxRate: z.coerce.number().min(0).max(100).optional().default(15),
  invoiceLineId: z.coerce.number().int().positive().optional()
});

export const createPurchaseReturnSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  date: z.string().optional(),
  lines: z.array(purchaseReturnLineSchema).min(1),
  reason: z.string().optional()
});
