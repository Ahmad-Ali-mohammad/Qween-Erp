import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import * as controller from './controller';
import {
  createAccountSchema,
  moveAccountSchema,
  togglePostingSchema,
  updateAccountSchema
} from './dto';

const router = Router();
router.use(authenticate);

router.get('/', requirePermissions(PERMISSIONS.ACCOUNTS_READ), controller.list);
router.get('/tree', requirePermissions(PERMISSIONS.ACCOUNTS_READ), controller.tree);
router.get('/tree/with-balances', requirePermissions(PERMISSIONS.ACCOUNTS_READ), controller.treeWithBalances);
router.post('/rebuild-levels', requirePermissions(PERMISSIONS.ACCOUNTS_WRITE), audit('accounts'), controller.rebuild);
router.get('/:id/balances', requirePermissions(PERMISSIONS.ACCOUNTS_READ), controller.balances);
router.get('/:id/subtree', requirePermissions(PERMISSIONS.ACCOUNTS_READ), controller.subtree);
router.get('/:id', requirePermissions(PERMISSIONS.ACCOUNTS_READ), controller.getOne);

router.post('/', requirePermissions(PERMISSIONS.ACCOUNTS_WRITE), validateBody(createAccountSchema), audit('accounts'), controller.create);
router.put('/:id', requirePermissions(PERMISSIONS.ACCOUNTS_WRITE), validateBody(updateAccountSchema), audit('accounts'), controller.update);
router.post('/:id/move', requirePermissions(PERMISSIONS.ACCOUNTS_WRITE), validateBody(moveAccountSchema), audit('accounts'), controller.move);
router.post('/:id/toggle-posting', requirePermissions(PERMISSIONS.ACCOUNTS_WRITE), validateBody(togglePostingSchema), audit('accounts'), controller.togglePosting);
router.delete('/:id', requirePermissions(PERMISSIONS.ACCOUNTS_WRITE), audit('accounts'), controller.remove);

export default router;
