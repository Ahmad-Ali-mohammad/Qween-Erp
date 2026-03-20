import { z } from 'zod';
import { branchScopedWriteSchema, decimalLikeSchema } from './domain-base';

const numericAmountSchema = decimalLikeSchema.transform((value) => Number(value)).refine((value) => Number.isFinite(value), {
  message: 'قيمة رقمية غير صالحة'
});

export const createTimesheetSchema = branchScopedWriteSchema.extend({
  employeeId: z.number().int().positive(),
  projectId: z.number().int().positive(),
  date: z.string().trim().min(1),
  hours: numericAmountSchema.refine((value) => value > 0, {
    message: 'عدد الساعات يجب أن يكون أكبر من صفر'
  }),
  hourlyCost: numericAmountSchema.refine((value) => value >= 0, {
    message: 'تكلفة الساعة يجب ألا تكون سالبة'
  }),
  amount: numericAmountSchema.optional(),
  description: z.string().trim().max(2000).optional()
}).strict();

