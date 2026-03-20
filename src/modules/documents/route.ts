import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { audit } from '../../middleware/audit';
import { PERMISSIONS } from '../../constants/permissions';
import { ok } from '../../utils/response';
import { createDocumentSchema, updateDocumentSchema } from '../../contracts/documents';
import * as service from './service';
import { buildSystemDashboardRouter } from '../system-dashboards/route';

const router = Router();

router.use(authenticate);
router.use('/dashboard', buildSystemDashboardRouter('documents'));

router.get('/', requirePermissions(PERMISSIONS.DOCUMENTS_READ), async (req: Request, res: Response) => {
  const result = await service.listDocuments(req.query);
  ok(res, result.rows, result.meta);
});

router.get('/:id', requirePermissions(PERMISSIONS.DOCUMENTS_READ), async (req: Request, res: Response) => {
  ok(res, await service.getDocument(Number(req.params.id)));
});

router.post(
  '/',
  requirePermissions(PERMISSIONS.DOCUMENTS_WRITE),
  validateBody(createDocumentSchema),
  audit('documents'),
  async (req: any, res: Response) => {
    ok(res, await service.createDocument(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.put(
  '/:id',
  requirePermissions(PERMISSIONS.DOCUMENTS_WRITE),
  validateBody(updateDocumentSchema),
  audit('documents'),
  async (req: Request, res: Response) => {
    ok(res, await service.updateDocument(Number(req.params.id), req.body));
  }
);

router.delete('/:id', requirePermissions(PERMISSIONS.DOCUMENTS_WRITE), audit('documents'), async (req: Request, res: Response) => {
  ok(res, await service.archiveDocument(Number(req.params.id)));
});

export default router;
