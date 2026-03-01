import { Router } from 'express';
import * as controller from './controller';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import { CreateSalesReturnDto } from './dto';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);
router.use(requirePermissions(PERMISSIONS.COMMERCIAL_READ));

// Sales return CRUD routes
router.post('/', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), validateBody(CreateSalesReturnDto), controller.createSalesReturn);
router.get('/', controller.listSalesReturns);
router.get('/:id', controller.getSalesReturn);
router.delete('/:id', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), controller.deleteSalesReturn);

// Sales return actions
router.post('/:id/approve', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), controller.approveSalesReturn);

export default router;
