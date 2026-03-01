import { Router } from 'express';
import * as controller from './controller';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import { CreateSupplierDto, UpdateSupplierDto } from './dto';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);
router.use(requirePermissions(PERMISSIONS.PARTIES_READ));

// Supplier CRUD routes
router.post('/', requirePermissions(PERMISSIONS.PARTIES_WRITE), validateBody(CreateSupplierDto), controller.createSupplier);
router.get('/', controller.listSuppliers);
router.get('/:id', controller.getSupplier);
router.put('/:id', requirePermissions(PERMISSIONS.PARTIES_WRITE), validateBody(UpdateSupplierDto), controller.updateSupplier);
router.delete('/:id', requirePermissions(PERMISSIONS.PARTIES_WRITE), controller.deleteSupplier);

// Supplier statement route
router.get('/:id/statement', controller.getSupplierStatement);

export default router;
