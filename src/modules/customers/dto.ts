import { z } from 'zod';

export const CreateCustomerDto = z
  .object({
    code: z.string().optional(),
    name: z.string().min(1).optional(),
    nameAr: z.string().min(1).optional(),
    nameEn: z.string().optional(),
    taxNumber: z.string().optional(),
    phone: z.string().optional(),
    mobile: z.string().optional(),
    email: z.string().email().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    creditLimit: z.coerce.number().min(0).optional().default(0),
    paymentTerms: z.coerce.number().int().min(0).optional().default(30),
    isActive: z.boolean().optional().default(true),
    notes: z.string().optional()
  })
  .refine((v) => Boolean(v.nameAr || v.name), { message: 'اسم العميل مطلوب' });

export const UpdateCustomerDto = z.object({
  code: z.string().optional(),
  name: z.string().min(1).optional(),
  nameAr: z.string().optional(),
  nameEn: z.string().optional(),
  taxNumber: z.string().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  creditLimit: z.coerce.number().min(0).optional(),
  paymentTerms: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().optional()
});

export const CustomerQueryDto = z.object({
  search: z.string().optional(),
  isActive: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20)
});

export const CustomerStatementQueryDto = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional()
});
