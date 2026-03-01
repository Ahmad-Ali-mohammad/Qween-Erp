import { z } from 'zod';

export const CreateSupplierDto = z
  .object({
    code: z.string().optional(),
    name: z.string().min(1).optional(),
    nameAr: z.string().min(1).optional(),
    nameEn: z.string().optional(),
    type: z.enum(['Local', 'International']).optional().default('Local'),
    nationalId: z.string().optional(),
    taxNumber: z.string().optional(),
    vatNumber: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    phone: z.string().optional(),
    mobile: z.string().optional(),
    email: z.string().email().optional(),
    creditLimit: z.coerce.number().min(0).optional().default(0),
    paymentTerms: z.coerce.number().int().min(0).optional().default(30),
    bankName: z.string().optional(),
    bankAccount: z.string().optional(),
    iban: z.string().optional(),
    isActive: z.boolean().optional().default(true)
  })
  .refine((v) => Boolean(v.nameAr || v.name), { message: 'اسم المورد مطلوب' });

export const UpdateSupplierDto = z.object({
  code: z.string().optional(),
  name: z.string().min(1).optional(),
  nameAr: z.string().optional(),
  nameEn: z.string().optional(),
  type: z.enum(['Local', 'International']).optional(),
  nationalId: z.string().optional(),
  taxNumber: z.string().optional(),
  vatNumber: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  email: z.string().email().optional(),
  creditLimit: z.coerce.number().min(0).optional(),
  paymentTerms: z.coerce.number().int().min(0).optional(),
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  iban: z.string().optional(),
  isActive: z.boolean().optional()
});

export const SupplierQueryDto = z.object({
  search: z.string().optional(),
  isActive: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20)
});

export const SupplierStatementQueryDto = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional()
});
