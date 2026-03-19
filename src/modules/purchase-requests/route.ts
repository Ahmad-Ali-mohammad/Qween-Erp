import { Router } from 'express';
import { PERMISSIONS } from '../../constants/permissions';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import * as controller from './controller';
import {
  convertPurchaseRequestSchema,
  createPurchaseRequestSchema,
  updatePurchaseRequestSchema
} from './dto';

const router = Router();

router.use(authenticate, requirePermissions(PERMISSIONS.COMMERCIAL_READ));

router.get('/', controller.listPurchaseRequests);
router.get('/:id', controller.getPurchaseRequest);
router.post('/', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), validateBody(createPurchaseRequestSchema), controller.createPurchaseRequest);
router.put('/:id', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), validateBody(updatePurchaseRequestSchema), controller.updatePurchaseRequest);
router.delete('/:id', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), controller.deletePurchaseRequest);
router.post('/:id/approve', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), controller.approvePurchaseRequest);
router.post('/:id/convert', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), validateBody(convertPurchaseRequestSchema), controller.convertPurchaseRequest);
router.post('/:id/convert-to-order', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), validateBody(convertPurchaseRequestSchema), controller.convertPurchaseRequest);

export default router;
