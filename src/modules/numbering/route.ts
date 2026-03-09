import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { ok } from '../../utils/response';
import { listNumberSequences, previewNextSequence, reserveNextSequence, upsertNumberSequence } from './service';

const router = Router();

const sequenceBaseSchema = z
  .object({
    documentType: z.string().trim().min(1).max(30),
    branchId: z.coerce.number().int().positive().nullable().optional(),
    resetPolicy: z.enum(['NEVER', 'YEARLY', 'MONTHLY']).optional(),
    prefix: z.string().trim().max(40).nullable().optional(),
    width: z.coerce.number().int().min(3).max(12).optional(),
    date: z.string().optional()
  })
  .strict();

const upsertSequenceSchema = sequenceBaseSchema.extend({
  currentValue: z.coerce.number().int().min(0).optional()
});

router.use(authenticate);

router.get('/', requirePermissions(PERMISSIONS.NUMBERING_READ), async (req, res, next) => {
  try {
    const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
    const documentType = req.query.documentType ? String(req.query.documentType) : undefined;
    ok(res, await listNumberSequences({ branchId, documentType }));
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermissions(PERMISSIONS.NUMBERING_WRITE), validateBody(upsertSequenceSchema), audit('number_sequences'), async (req, res, next) => {
  try {
    ok(res, await upsertNumberSequence(req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/preview', requirePermissions(PERMISSIONS.NUMBERING_READ), async (req, res, next) => {
  try {
    ok(
      res,
      await previewNextSequence({
        documentType: String(req.query.documentType ?? ''),
        branchId: req.query.branchId ? Number(req.query.branchId) : undefined,
        resetPolicy: req.query.resetPolicy ? (String(req.query.resetPolicy) as 'NEVER' | 'YEARLY' | 'MONTHLY') : undefined,
        prefix: req.query.prefix ? String(req.query.prefix) : undefined,
        width: req.query.width ? Number(req.query.width) : undefined,
        date: req.query.date ? String(req.query.date) : undefined
      })
    );
  } catch (error) {
    next(error);
  }
});

router.post('/next', requirePermissions(PERMISSIONS.NUMBERING_WRITE), validateBody(sequenceBaseSchema), audit('number_sequences'), async (req, res, next) => {
  try {
    ok(res, await reserveNextSequence(req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

export default router;
