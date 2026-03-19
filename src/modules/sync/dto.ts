import { z } from 'zod';

export const syncResources = [
  'projects',
  'projectTasks',
  'projectExpenses',
  'purchaseOrders',
  'purchaseReceipts',
  'items',
  'warehouses',
  'stockMovements',
  'accounts',
  'taxCodes',
  'currencies',
  'exchangeRates'
] as const;

const syncActionSchema = z.enum(['create', 'update', 'delete']);

export const syncOperationSchema = z
  .object({
    resource: z.enum(syncResources),
    action: syncActionSchema,
    recordId: z.union([z.coerce.number().int().positive(), z.string().trim().min(1)]).optional(),
    match: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
    data: z.record(z.any()).optional(),
    clientUpdatedAt: z.string().datetime().optional(),
    deviceId: z.string().trim().max(100).optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.action === 'update' || value.action === 'delete') && !value.recordId && !value.match) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'يجب تحديد recordId أو match لعمليات update/delete'
      });
    }

    if ((value.action === 'create' || value.action === 'update') && !value.data) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'حقل data مطلوب لعمليات create/update'
      });
    }
  });

export const syncBatchSchema = z
  .object({
    batchId: z.string().trim().max(100).optional(),
    sentAt: z.string().datetime().optional(),
    operations: z.array(syncOperationSchema).min(1).max(500)
  })
  .strict();

export type SyncBatchInput = z.infer<typeof syncBatchSchema>;
export type SyncOperationInput = z.infer<typeof syncOperationSchema>;
export type SyncResource = (typeof syncResources)[number];
