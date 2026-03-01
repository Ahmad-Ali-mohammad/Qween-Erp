import { Router } from 'express';
import * as controller from './controller';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import { CreateCustomerDto, UpdateCustomerDto } from './dto';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);
router.use(requirePermissions(PERMISSIONS.PARTIES_READ));

// Customer CRUD routes
router.post('/', requirePermissions(PERMISSIONS.PARTIES_WRITE), validateBody(CreateCustomerDto), controller.createCustomer);
router.get('/', controller.listCustomers);
router.get('/:id', controller.getCustomer);
router.put('/:id', requirePermissions(PERMISSIONS.PARTIES_WRITE), validateBody(UpdateCustomerDto), controller.updateCustomer);
router.delete('/:id', requirePermissions(PERMISSIONS.PARTIES_WRITE), controller.deleteCustomer);

// Customer statement route
router.get('/:id/statement', controller.getCustomerStatement);

export default router;
