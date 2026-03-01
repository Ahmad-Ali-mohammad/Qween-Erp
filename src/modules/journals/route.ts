import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { audit } from '../../middleware/audit';
import { PERMISSIONS } from '../../constants/permissions';
import { createJournalSchema, reverseSchema, updateJournalSchema, voidJournalSchema } from './dto';
import * as controller from './controller';

const router = Router();
router.use(authenticate);

router.get('/', requirePermissions(PERMISSIONS.JOURNAL_READ), controller.list);
router.get('/:id', requirePermissions(PERMISSIONS.JOURNAL_READ), controller.getOne);
router.post('/', requirePermissions(PERMISSIONS.JOURNAL_CREATE), validateBody(createJournalSchema), audit('journal_entries'), controller.create);
router.put('/:id', requirePermissions(PERMISSIONS.JOURNAL_CREATE), validateBody(updateJournalSchema), audit('journal_entries'), controller.update);
router.post('/:id/post', requirePermissions(PERMISSIONS.JOURNAL_POST), audit('journal_entries'), controller.post);
router.post(
  '/bulk-post',
  requirePermissions(PERMISSIONS.JOURNAL_POST),
  validateBody(z.object({ ids: z.array(z.number().int().positive()).min(1) })),
  audit('journal_entries'),
  controller.bulkPost
);
router.post('/:id/reverse', requirePermissions(PERMISSIONS.JOURNAL_REVERSE), validateBody(reverseSchema), audit('journal_entries'), controller.reverse);
router.post('/:id/void', requirePermissions(PERMISSIONS.JOURNAL_DELETE), validateBody(voidJournalSchema), audit('journal_entries'), controller.voidEntry);
router.delete('/:id', requirePermissions(PERMISSIONS.JOURNAL_DELETE), audit('journal_entries'), controller.remove);

export default router;
