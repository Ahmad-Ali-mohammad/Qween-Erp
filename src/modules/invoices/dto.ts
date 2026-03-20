import { z } from 'zod';
import { branchScopedWriteSchema } from '../../contracts/domain-base';

export const invoiceLineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  discount: z.number().nonnegative().optional(),
  taxRate: z.number().nonnegative().optional(),
  accountId: z.number().int().optional()
});

export const createInvoiceSchema = branchScopedWriteSchema.extend({
  type: z.enum(['SALES', 'PURCHASE']),
  customerId: z.number().int().optional(),
  supplierId: z.number().int().optional(),
  date: z.string(),
  dueDate: z.string().optional(),
  projectId: z.number().int().optional(),
  notes: z.string().optional(),
  lines: z.array(invoiceLineSchema).min(1)
});

export const cancelInvoiceSchema = z.object({
  reason: z.string().optional()
});

export const updateInvoiceSchema = createInvoiceSchema.partial();
