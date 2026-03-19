import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { authenticate } from '../../middleware/auth';
import { audit } from '../../middleware/audit';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { ok } from '../../utils/response';
import {
  closeCorrespondence,
  createCorrespondence,
  getCorrespondence,
  listCorrespondence,
  updateCorrespondence
} from './correspondence-service';

const router = Router();

const correspondenceCreateSchema = z
  .object({
    reference: z.string().trim().max(50).optional(),
    subject: z.string().trim().min(1).max(200),
    direction: z.enum(['INCOMING', 'OUTGOING', 'INTERNAL']),
    entityType: z.string().trim().max(50).optional(),
    entityId: z.coerce.number().int().positive().optional(),
    documentKey: z.string().trim().max(100).optional(),
    attachmentId: z.coerce.number().int().positive().optional(),
    notes: z.string().trim().optional(),
    receivedAt: z.string().optional(),
    sentAt: z.string().optional()
  })
  .strict();

const correspondenceUpdateSchema = correspondenceCreateSchema.partial();

router.use(authenticate);

router.get('/correspondence', requirePermissions(PERMISSIONS.ATTACHMENTS_READ), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 20)));
    const filters = {
      direction: req.query.direction as string | undefined,
      status: req.query.status as string | undefined
    };
    ok(res, await listCorrespondence(page, limit, filters));
  } catch (error) {
    next(error);
  }
});

router.get('/correspondence/:id', requirePermissions(PERMISSIONS.ATTACHMENTS_READ), async (req, res, next) => {
  try {
    ok(res, await getCorrespondence(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/correspondence', requirePermissions(PERMISSIONS.ATTACHMENTS_WRITE), validateBody(correspondenceCreateSchema), audit('correspondence'), async (req: any, res, next) => {
  try {
    ok(res, await createCorrespondence(req.body, Number(req.user.id)), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.put('/correspondence/:id', requirePermissions(PERMISSIONS.ATTACHMENTS_WRITE), validateBody(correspondenceUpdateSchema), audit('correspondence'), async (req: any, res, next) => {
  try {
    ok(res, await updateCorrespondence(Number(req.params.id), req.body, Number(req.user.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/correspondence/:id/close', requirePermissions(PERMISSIONS.ATTACHMENTS_WRITE), audit('correspondence'), async (req: any, res, next) => {
  try {
    ok(res, await closeCorrespondence(Number(req.params.id), Number(req.user.id)));
  } catch (error) {
    next(error);
  }
});

export default router;
