import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { AuthRequest } from '../../types/auth';
import {
  assertBranchScopeAccess,
  assertProjectScopeAccess,
  assertWarehouseScopeAccess,
  getScopeIds
} from '../../utils/access-scope';
import { ok } from '../../utils/response';
import purchaseOrderRoutes from '../purchase-orders/route';
import purchaseRequestRoutes from '../purchase-requests/route';
import * as service from './service';

const router = Router();

const receiptLineSchema = z
  .object({
    itemId: z.coerce.number().int().positive().optional(),
    description: z.string().trim().max(250).optional(),
    quantity: z.coerce.number().positive(),
    warehouseId: z.coerce.number().int().positive().optional(),
    locationId: z.coerce.number().int().positive().optional(),
    unitCost: z.coerce.number().nonnegative().optional()
  })
  .strict();

const receiptSchema = z
  .object({
    branchId: z.coerce.number().int().positive().optional(),
    purchaseOrderId: z.coerce.number().int().positive().optional(),
    supplierId: z.coerce.number().int().positive().optional(),
    warehouseId: z.coerce.number().int().positive().optional(),
    date: z.string().optional(),
    notes: z.string().trim().optional(),
    lines: z.array(receiptLineSchema).min(1).optional()
  })
  .strict();

const vendorInvoiceLineSchema = z
  .object({
    itemId: z.coerce.number().int().positive().optional(),
    description: z.string().trim().min(1),
    quantity: z.coerce.number().positive(),
    unitPrice: z.coerce.number().nonnegative(),
    discount: z.coerce.number().nonnegative().optional(),
    taxRate: z.coerce.number().min(0).max(100).optional(),
    accountId: z.coerce.number().int().positive().optional()
  })
  .strict();

const vendorInvoiceSchema = z
  .object({
    supplierId: z.coerce.number().int().positive().optional(),
    purchaseOrderId: z.coerce.number().int().positive().optional(),
    purchaseReceiptId: z.coerce.number().int().positive().optional(),
    projectId: z.coerce.number().int().positive().optional(),
    date: z.string().optional(),
    dueDate: z.string().optional(),
    notes: z.string().trim().optional(),
    lines: z.array(vendorInvoiceLineSchema).min(1).optional()
  })
  .strict();

const cancelSchema = z.object({ reason: z.string().trim().optional() }).strict();

async function assertPurchaseOrderAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const row = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: { id: true, branchId: true, projectId: true }
  });
  if (!row) return null;
  if (row.branchId) assertBranchScopeAccess(req, row.branchId, mode);
  if (row.projectId) assertProjectScopeAccess(req, row.projectId, mode);
  return row;
}

async function assertReceiptAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const row = await prisma.purchaseReceipt.findUnique({
    where: { id },
    select: { id: true, branchId: true, warehouseId: true, purchaseOrderId: true }
  });
  if (!row) return null;
  if (row.branchId) assertBranchScopeAccess(req, row.branchId, mode);
  if (row.warehouseId) assertWarehouseScopeAccess(req, row.warehouseId, mode);
  if (row.purchaseOrderId) await assertPurchaseOrderAccess(req, row.purchaseOrderId, mode);
  return row;
}

async function assertVendorInvoiceAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const row = await prisma.invoice.findUnique({
    where: { id },
    select: { id: true, projectId: true, type: true }
  });
  if (!row || row.type !== 'PURCHASE') return null;
  if (row.projectId) assertProjectScopeAccess(req, row.projectId, mode);
  return row;
}

async function assertReceiptPayloadAccess(req: AuthRequest, payload: Record<string, unknown>, mode: 'read' | 'write' = 'write') {
  if (payload.branchId) assertBranchScopeAccess(req, Number(payload.branchId), mode);
  if (payload.warehouseId) assertWarehouseScopeAccess(req, Number(payload.warehouseId), mode);
  if (Array.isArray(payload.lines)) {
    for (const line of payload.lines as Array<Record<string, unknown>>) {
      if (line.warehouseId) assertWarehouseScopeAccess(req, Number(line.warehouseId), mode);
    }
  }
  if (payload.purchaseOrderId) await assertPurchaseOrderAccess(req, Number(payload.purchaseOrderId), mode);
}

async function assertVendorInvoicePayloadAccess(req: AuthRequest, payload: Record<string, unknown>, mode: 'read' | 'write' = 'write') {
  if (payload.projectId) assertProjectScopeAccess(req, Number(payload.projectId), mode);
  if (payload.purchaseOrderId) await assertPurchaseOrderAccess(req, Number(payload.purchaseOrderId), mode);
  if (payload.purchaseReceiptId) await assertReceiptAccess(req, Number(payload.purchaseReceiptId), mode);
}

router.use(authenticate);
router.use('/requests', purchaseRequestRoutes);
router.use('/orders', purchaseOrderRoutes);

router.get('/receipts', requirePermissions(PERMISSIONS.COMMERCIAL_READ), async (req: AuthRequest, res, next) => {
  try {
    if (req.query.branchId) assertBranchScopeAccess(req, Number(req.query.branchId));
    if (req.query.warehouseId) assertWarehouseScopeAccess(req, Number(req.query.warehouseId));
    if (req.query.purchaseOrderId) await assertPurchaseOrderAccess(req, Number(req.query.purchaseOrderId));

    const data = await service.listReceipts(req.query, {
      branchIds: getScopeIds(req, 'branch'),
      warehouseIds: getScopeIds(req, 'warehouse')
    });
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.get('/receipts/:id', requirePermissions(PERMISSIONS.COMMERCIAL_READ), async (req: AuthRequest, res, next) => {
  try {
    await assertReceiptAccess(req, Number(req.params.id));
    ok(res, await service.getReceipt(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/receipts', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), validateBody(receiptSchema), audit('purchase_receipts'), async (req: AuthRequest, res, next) => {
  try {
    await assertReceiptPayloadAccess(req, req.body, 'write');
    ok(res, await service.createReceipt(req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.post('/orders/:id/receipts', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), validateBody(receiptSchema.partial()), audit('purchase_receipts'), async (req: AuthRequest, res, next) => {
  try {
    await assertPurchaseOrderAccess(req, Number(req.params.id), 'write');
    await assertReceiptPayloadAccess(req, req.body, 'write');
    ok(res, await service.createReceipt({ ...req.body, purchaseOrderId: Number(req.params.id) }), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.put('/receipts/:id', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), validateBody(receiptSchema.partial()), audit('purchase_receipts'), async (req: AuthRequest, res, next) => {
  try {
    await assertReceiptAccess(req, Number(req.params.id), 'write');
    await assertReceiptPayloadAccess(req, req.body, 'write');
    ok(res, await service.updateReceipt(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.delete('/receipts/:id', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), audit('purchase_receipts'), async (req: AuthRequest, res, next) => {
  try {
    await assertReceiptAccess(req, Number(req.params.id), 'write');
    ok(res, await service.deleteReceipt(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/receipts/:id/approve', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), audit('purchase_receipts'), async (req: AuthRequest, res, next) => {
  try {
    await assertReceiptAccess(req, Number(req.params.id), 'write');
    ok(res, await service.approveReceipt(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.get('/vendor-invoices', requirePermissions(PERMISSIONS.INVOICE_READ), async (req: AuthRequest, res, next) => {
  try {
    if (req.query.projectId) assertProjectScopeAccess(req, Number(req.query.projectId));
    const data = await service.listVendorInvoices(req.query, {
      projectIds: getScopeIds(req, 'project')
    });
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.get('/vendor-invoices/:id', requirePermissions(PERMISSIONS.INVOICE_READ), async (req: AuthRequest, res, next) => {
  try {
    await assertVendorInvoiceAccess(req, Number(req.params.id));
    ok(res, await service.getVendorInvoice(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/vendor-invoices', requirePermissions(PERMISSIONS.INVOICE_WRITE), validateBody(vendorInvoiceSchema), audit('vendor_invoices'), async (req: AuthRequest, res, next) => {
  try {
    await assertVendorInvoicePayloadAccess(req, req.body, 'write');
    ok(res, await service.createVendorInvoice(req.body, Number(req.user!.id)), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.post('/receipts/:id/to-vendor-invoice', requirePermissions(PERMISSIONS.INVOICE_WRITE), validateBody(vendorInvoiceSchema.partial()), audit('vendor_invoices'), async (req: AuthRequest, res, next) => {
  try {
    await assertReceiptAccess(req, Number(req.params.id), 'write');
    await assertVendorInvoicePayloadAccess(req, req.body, 'write');
    ok(
      res,
      await service.createVendorInvoice(
        {
          ...req.body,
          purchaseReceiptId: Number(req.params.id)
        },
        Number(req.user!.id)
      ),
      undefined,
      201
    );
  } catch (error) {
    next(error);
  }
});

router.put('/vendor-invoices/:id', requirePermissions(PERMISSIONS.INVOICE_WRITE), validateBody(vendorInvoiceSchema.partial()), audit('vendor_invoices'), async (req: AuthRequest, res, next) => {
  try {
    await assertVendorInvoiceAccess(req, Number(req.params.id), 'write');
    await assertVendorInvoicePayloadAccess(req, req.body, 'write');
    ok(res, await service.updateVendorInvoice(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.post('/vendor-invoices/:id/issue', requirePermissions(PERMISSIONS.INVOICE_ISSUE), audit('vendor_invoices'), async (req: AuthRequest, res, next) => {
  try {
    await assertVendorInvoiceAccess(req, Number(req.params.id), 'write');
    ok(res, await service.issueVendorInvoice(Number(req.params.id), Number(req.user!.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/vendor-invoices/:id/cancel', requirePermissions(PERMISSIONS.INVOICE_CANCEL), validateBody(cancelSchema), audit('vendor_invoices'), async (req: AuthRequest, res, next) => {
  try {
    await assertVendorInvoiceAccess(req, Number(req.params.id), 'write');
    ok(res, await service.cancelVendorInvoice(Number(req.params.id), req.body.reason));
  } catch (error) {
    next(error);
  }
});

router.delete('/vendor-invoices/:id', requirePermissions(PERMISSIONS.INVOICE_WRITE), audit('vendor_invoices'), async (req: AuthRequest, res, next) => {
  try {
    await assertVendorInvoiceAccess(req, Number(req.params.id), 'write');
    ok(res, await service.deleteVendorInvoice(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

export default router;
