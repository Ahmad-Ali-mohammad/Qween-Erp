import { z } from 'zod';

const SalesReturnLineDto = z.object({
  description: z.string().min(1, 'الوصف مطلوب'),
  quantity: z.number().positive('الكمية يجب أن تكون موجبة'),
  unitPrice: z.number().min(0, 'سعر الوحدة يجب أن يكون موجب أو صفر'),
  discount: z.number().min(0, 'الخصم يجب أن يكون موجب أو صفر').optional().default(0),
  taxRate: z.number().min(0, 'معدل الضريبة يجب أن يكون موجب أو صفر').max(100, 'معدل الضريبة لا يمكن أن يتجاوز 100%').optional().default(15),
  invoiceLineId: z.number().int().positive().optional()
});

export const CreateSalesReturnDto = z.object({
  invoiceId: z.number().int().positive('معرف الفاتورة مطلوب'),
  lines: z.array(SalesReturnLineDto).min(1, 'يجب إضافة بند واحد على الأقل'),
  reason: z.string().optional(),
  notes: z.string().optional()
});

export const SalesReturnQueryDto = z.object({
  customerId: z.number().int().positive().optional(),
  invoiceId: z.number().int().positive().optional(),
  status: z.string().optional(),
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().max(100).optional().default(20)
});
