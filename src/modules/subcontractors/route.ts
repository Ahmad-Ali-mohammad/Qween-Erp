import { Router, type Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { audit } from '../../middleware/audit';
import { ok } from '../../utils/response';
import { PERMISSIONS } from '../../constants/permissions';
import { buildSystemDashboardRouter } from '../system-dashboards/route';
import {
  createSubcontractSchema,
  createSubcontractIpcSchema,
  createSubcontractPaymentSchema,
  updateSubcontractIpcSchema,
  updateSubcontractSchema
} from '../../contracts/subcontractors';
import * as subcontractorsService from './service';

const router = Router();

router.use('/dashboard', buildSystemDashboardRouter('subcontractors'));
router.use(authenticate, requirePermissions(PERMISSIONS.CONTRACTS_READ));

router.get('/subcontracts', async (req, res: Response) => {
  const result = await subcontractorsService.listSubcontracts(req.query);
  ok(res, result.rows, result.meta);
});

router.get('/subcontracts/:id', async (req, res: Response) => {
  ok(res, await subcontractorsService.getSubcontract(Number(req.params.id)));
});

router.post(
  '/subcontracts',
  requirePermissions(PERMISSIONS.CONTRACTS_WRITE),
  validateBody(createSubcontractSchema),
  audit('subcontracts'),
  async (req: any, res: Response) => {
    ok(res, await subcontractorsService.createSubcontract(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.put(
  '/subcontracts/:id',
  requirePermissions(PERMISSIONS.CONTRACTS_WRITE),
  validateBody(updateSubcontractSchema),
  audit('subcontracts'),
  async (req: any, res: Response) => {
    ok(res, await subcontractorsService.updateSubcontract(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.post(
  '/subcontracts/:id/activate',
  requirePermissions(PERMISSIONS.CONTRACTS_WRITE),
  audit('subcontracts'),
  async (req: any, res: Response) => {
    ok(res, await subcontractorsService.activateSubcontract(Number(req.params.id), Number(req.user.id)));
  }
);

router.get('/ipcs', async (req, res: Response) => {
  const result = await subcontractorsService.listIpcs(req.query);
  ok(res, result.rows, result.meta);
});

router.get('/ipcs/:id', async (req, res: Response) => {
  ok(res, await subcontractorsService.getIpc(Number(req.params.id)));
});

router.post(
  '/ipcs',
  requirePermissions(PERMISSIONS.CONTRACTS_WRITE),
  validateBody(createSubcontractIpcSchema),
  audit('subcontract-ipcs'),
  async (req: any, res: Response) => {
    ok(res, await subcontractorsService.createIpc(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.put(
  '/ipcs/:id',
  requirePermissions(PERMISSIONS.CONTRACTS_WRITE),
  validateBody(updateSubcontractIpcSchema),
  audit('subcontract-ipcs'),
  async (req: any, res: Response) => {
    ok(res, await subcontractorsService.updateIpc(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.post(
  '/ipcs/:id/submit',
  requirePermissions(PERMISSIONS.CONTRACTS_WRITE),
  audit('subcontract-ipcs'),
  async (req: any, res: Response) => {
    ok(res, await subcontractorsService.submitIpc(Number(req.params.id), Number(req.user.id)));
  }
);

router.post(
  '/ipcs/:id/approve',
  requirePermissions(PERMISSIONS.CONTRACTS_WRITE),
  audit('subcontract-ipcs'),
  async (req: any, res: Response) => {
    ok(res, await subcontractorsService.approveIpc(Number(req.params.id), Number(req.user.id)));
  }
);

router.post(
  '/ipcs/:id/payments',
  requirePermissions(PERMISSIONS.PAYMENT_WRITE),
  validateBody(createSubcontractPaymentSchema),
  audit('subcontract-ipc-payments'),
  async (req: any, res: Response) => {
    ok(res, await subcontractorsService.createIpcPayment(Number(req.params.id), req.body, Number(req.user.id)), undefined, 201);
  }
);

export default router;
