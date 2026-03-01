import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import * as controller from './controller';
import { createPurchaseOrderSchema, updatePurchaseOrderSchema } from './dto';

const router = Router();

router.use(authenticate, requirePermissions(PERMISSIONS.COMMERCIAL_READ));

router.get('/', controller.listPurchaseOrders);
router.get('/:id', controller.getPurchaseOrder);
router.post('/', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), validateBody(createPurchaseOrderSchema), controller.createPurchaseOrder);
router.put('/:id', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), validateBody(updatePurchaseOrderSchema), controller.updatePurchaseOrder);
router.delete('/:id', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), controller.deletePurchaseOrder);
router.post('/:id/approve', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), controller.approvePurchaseOrder);
router.post('/:id/send', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), controller.sendPurchaseOrder);
router.post('/:id/convert', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), controller.convertPurchaseOrder);

export default router;
