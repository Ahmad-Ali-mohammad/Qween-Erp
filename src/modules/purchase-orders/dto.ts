import { z } from 'zod';

export const purchaseOrderLineSchema = z.object({
  itemId: z.coerce.number().int().positive().optional(),
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  discount: z.coerce.number().nonnegative().optional().default(0),
  taxRate: z.coerce.number().min(0).max(100).optional().default(15)
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  date: z.string().optional(),
  expectedDate: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(purchaseOrderLineSchema).min(1)
});

export const updatePurchaseOrderSchema = createPurchaseOrderSchema.partial();
