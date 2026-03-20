import { z } from 'zod';
import { branchScopedWriteSchema } from '../../contracts/domain-base';

const QuoteLineDto = z.object({
  description: z.string().min(1, 'الوصف مطلوب'),
  quantity: z.number().positive('الكمية يجب أن تكون موجبة'),
  unitPrice: z.number().min(0, 'سعر الوحدة يجب أن يكون موجب أو صفر'),
  discount: z.number().min(0, 'الخصم يجب أن يكون موجب أو صفر').optional().default(0),
  taxRate: z.number().min(0, 'معدل الضريبة يجب أن يكون موجب أو صفر').max(100, 'معدل الضريبة لا يمكن أن يتجاوز 100%').optional().default(15)
});

export const CreateQuoteDto = branchScopedWriteSchema.extend({
  customerId: z.number().int().positive('معرف العميل مطلوب'),
  validUntil: z.string().optional(),
  lines: z.array(QuoteLineDto).min(1, 'يجب إضافة بند واحد على الأقل'),
  notes: z.string().optional()
});

export const UpdateQuoteDto = branchScopedWriteSchema.extend({
  validUntil: z.string().optional(),
  lines: z.array(QuoteLineDto).optional(),
  notes: z.string().optional()
});

export const QuoteQueryDto = z.object({
  customerId: z.number().int().positive().optional(),
  status: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().max(100).optional().default(20)
});

export const UpdateQuoteStatusDto = z.object({
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED'], {
    errorMap: () => ({ message: 'حالة غير صحيحة' })
  })
});
