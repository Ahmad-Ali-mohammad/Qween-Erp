import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import * as controller from './controller';
import { createPurchaseReturnSchema } from './dto';

const router = Router();

router.use(authenticate, requirePermissions(PERMISSIONS.COMMERCIAL_READ));

router.get('/', controller.listPurchaseReturns);
router.get('/:id', controller.getPurchaseReturn);
router.post('/', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), validateBody(createPurchaseReturnSchema), controller.createPurchaseReturn);
router.delete('/:id', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), controller.deletePurchaseReturn);
router.post('/:id/approve', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), controller.approvePurchaseReturn);

export default router;
