import { z } from 'zod';
import { branchScopedWriteSchema } from '../../contracts/domain-base';

export const createPaymentSchema = branchScopedWriteSchema.extend({
  type: z.enum(['RECEIPT', 'PAYMENT']),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CHECK', 'CARD']),
  amount: z.number().positive(),
  date: z.string(),
  customerId: z.number().int().optional(),
  supplierId: z.number().int().optional(),
  bankId: z.number().int().optional(),
  checkNumber: z.string().optional(),
  checkDate: z.string().optional(),
  checkBank: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  allocations: z.array(z.object({ invoiceId: z.number().int(), amount: z.number().positive() })).optional()
});

export const cancelPaymentSchema = z.object({
  reason: z.string().optional()
});

export const updatePaymentSchema = createPaymentSchema.partial();
