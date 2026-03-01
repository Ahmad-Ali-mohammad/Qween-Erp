import { Router } from 'express';
import * as controller from './controller';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import { CreateQuoteDto, UpdateQuoteDto, UpdateQuoteStatusDto } from './dto';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);
router.use(requirePermissions(PERMISSIONS.COMMERCIAL_READ));

// Quote CRUD routes
router.post('/', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), validateBody(CreateQuoteDto), controller.createQuote);
router.get('/', controller.listQuotes);
router.get('/:id', controller.getQuote);
router.put('/:id', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), validateBody(UpdateQuoteDto), controller.updateQuote);
router.delete('/:id', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), controller.deleteQuote);

// Quote actions
router.post('/:id/send', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), controller.sendQuote);
router.post('/:id/convert', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), controller.convertToInvoice);
router.patch('/:id/status', requirePermissions(PERMISSIONS.COMMERCIAL_WRITE), validateBody(UpdateQuoteStatusDto), controller.updateQuoteStatus);

export default router;
