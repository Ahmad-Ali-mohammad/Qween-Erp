import { Router, type Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { audit } from '../../middleware/audit';
import { ok } from '../../utils/response';
import { PERMISSIONS } from '../../constants/permissions';
import { createTenderSchema, tenderResultSchema, updateTenderSchema } from '../../contracts/tendering';
import { buildSystemDashboardRouter } from '../system-dashboards/route';
import * as tenderingService from './service';

const router = Router();

router.use('/dashboard', buildSystemDashboardRouter('tendering'));
router.use(authenticate, requirePermissions(PERMISSIONS.CRM_READ));

router.get('/tenders', async (req, res: Response) => {
  const result = await tenderingService.listTenders(req.query);
  ok(res, result.rows, result.meta);
});

router.get('/tenders/:id', async (req, res: Response) => {
  ok(res, await tenderingService.getTender(Number(req.params.id)));
});

router.post(
  '/tenders',
  requirePermissions(PERMISSIONS.CRM_WRITE),
  validateBody(createTenderSchema),
  audit('tenders'),
  async (req: any, res: Response) => {
    ok(res, await tenderingService.createTender(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.put(
  '/tenders/:id',
  requirePermissions(PERMISSIONS.CRM_WRITE),
  validateBody(updateTenderSchema),
  audit('tenders'),
  async (req: any, res: Response) => {
    ok(res, await tenderingService.updateTender(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.post(
  '/tenders/:id/submit',
  requirePermissions(PERMISSIONS.CRM_WRITE),
  audit('tenders'),
  async (req: any, res: Response) => {
    ok(res, await tenderingService.submitTender(Number(req.params.id), Number(req.user.id)));
  }
);

router.post(
  '/tenders/:id/result',
  requirePermissions(PERMISSIONS.CRM_WRITE),
  validateBody(tenderResultSchema),
  audit('tenders'),
  async (req: any, res: Response) => {
    ok(res, await tenderingService.recordTenderResult(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

export default router;
