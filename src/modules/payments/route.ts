import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import * as controller from './controller';
import { createPaymentSchema, cancelPaymentSchema, updatePaymentSchema } from './dto';

const router = Router();
router.use(authenticate);

router.get('/', requirePermissions(PERMISSIONS.PAYMENT_READ), controller.list);
router.get('/:id', requirePermissions(PERMISSIONS.PAYMENT_READ), controller.getOne);
router.post('/', requirePermissions(PERMISSIONS.PAYMENT_WRITE), validateBody(createPaymentSchema), audit('payments'), controller.create);
router.put('/:id', requirePermissions(PERMISSIONS.PAYMENT_WRITE), validateBody(updatePaymentSchema), audit('payments'), controller.update);
router.post('/:id/complete', requirePermissions(PERMISSIONS.PAYMENT_COMPLETE), audit('payments'), controller.complete);
router.post('/:id/cancel', requirePermissions(PERMISSIONS.PAYMENT_CANCEL), validateBody(cancelPaymentSchema), audit('payments'), controller.cancel);
router.delete('/:id', requirePermissions(PERMISSIONS.PAYMENT_WRITE), audit('payments'), controller.remove);

export default router;
