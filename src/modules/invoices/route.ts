import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { audit } from '../../middleware/audit';
import { PERMISSIONS } from '../../constants/permissions';
import { createInvoiceSchema, cancelInvoiceSchema, updateInvoiceSchema } from './dto';
import * as controller from './controller';

const router = Router();
router.use(authenticate);

router.get('/', requirePermissions(PERMISSIONS.INVOICE_READ), controller.list);
router.get('/:id', requirePermissions(PERMISSIONS.INVOICE_READ), controller.getOne);
router.post('/', requirePermissions(PERMISSIONS.INVOICE_WRITE), validateBody(createInvoiceSchema), audit('invoices'), controller.create);
router.put('/:id', requirePermissions(PERMISSIONS.INVOICE_WRITE), validateBody(updateInvoiceSchema), audit('invoices'), controller.update);
router.post('/:id/issue', requirePermissions(PERMISSIONS.INVOICE_ISSUE), audit('invoices'), controller.issue);
router.post('/:id/cancel', requirePermissions(PERMISSIONS.INVOICE_CANCEL), validateBody(cancelInvoiceSchema), audit('invoices'), controller.cancel);
router.delete('/:id', requirePermissions(PERMISSIONS.INVOICE_WRITE), audit('invoices'), controller.remove);

export default router;
