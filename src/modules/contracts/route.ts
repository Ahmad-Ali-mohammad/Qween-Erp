import { Router, type Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { audit } from '../../middleware/audit';
import { ok } from '../../utils/response';
import { PERMISSIONS } from '../../constants/permissions';
import { buildSystemDashboardRouter } from '../system-dashboards/route';
import {
  createContractMilestoneSchema,
  createContractSchema,
  emptyActionSchema,
  renewContractSchema,
  updateContractMilestoneSchema,
  updateContractSchema
} from '../../contracts/contracts';
import * as contractsService from './service';

const router = Router();

router.use('/dashboard', buildSystemDashboardRouter('contracts'));
router.use(authenticate, requirePermissions(PERMISSIONS.CONTRACTS_READ));

router.get('/', async (req, res: Response) => {
  const result = await contractsService.listContracts(req.query);
  ok(res, result.rows, result.meta);
});

router.get('/:id', async (req, res: Response) => {
  ok(res, await contractsService.getContract(Number(req.params.id)));
});

router.post(
  '/',
  requirePermissions(PERMISSIONS.CONTRACTS_WRITE),
  validateBody(createContractSchema),
  audit('contracts'),
  async (req: any, res: Response) => {
    ok(res, await contractsService.createContract(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.put(
  '/:id',
  requirePermissions(PERMISSIONS.CONTRACTS_WRITE),
  validateBody(updateContractSchema),
  audit('contracts'),
  async (req: any, res: Response) => {
    ok(res, await contractsService.updateContract(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.delete(
  '/:id',
  requirePermissions(PERMISSIONS.CONTRACTS_WRITE),
  audit('contracts'),
  async (req: any, res: Response) => {
    ok(res, await contractsService.deleteContract(Number(req.params.id)));
  }
);

router.post(
  '/:id/approve',
  requirePermissions(PERMISSIONS.CONTRACTS_WRITE),
  validateBody(emptyActionSchema),
  audit('contracts'),
  async (req: any, res: Response) => {
    ok(res, await contractsService.approveContract(Number(req.params.id), Number(req.user.id)));
  }
);

router.post(
  '/:id/renew',
  requirePermissions(PERMISSIONS.CONTRACTS_WRITE),
  validateBody(renewContractSchema),
  audit('contracts'),
  async (req: any, res: Response) => {
    ok(res, await contractsService.renewContract(Number(req.params.id), Number(req.body.months ?? 12), Number(req.user.id)));
  }
);

router.post(
  '/:id/terminate',
  requirePermissions(PERMISSIONS.CONTRACTS_WRITE),
  validateBody(emptyActionSchema),
  audit('contracts'),
  async (req: any, res: Response) => {
    ok(res, await contractsService.terminateContract(Number(req.params.id), Number(req.user.id)));
  }
);

router.get('/:id/milestones', async (req, res: Response) => {
  const result = await contractsService.listContractMilestones(Number(req.params.id), req.query);
  ok(res, result.rows, result.meta);
});

router.post(
  '/:id/milestones',
  requirePermissions(PERMISSIONS.CONTRACTS_WRITE),
  validateBody(createContractMilestoneSchema),
  audit('contract_milestones'),
  async (req: any, res: Response) => {
    ok(res, await contractsService.createContractMilestone(Number(req.params.id), req.body, Number(req.user.id)), undefined, 201);
  }
);

router.put(
  '/milestones/:id',
  requirePermissions(PERMISSIONS.CONTRACTS_WRITE),
  validateBody(updateContractMilestoneSchema),
  audit('contract_milestones'),
  async (req: any, res: Response) => {
    ok(res, await contractsService.updateContractMilestone(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.delete(
  '/milestones/:id',
  requirePermissions(PERMISSIONS.CONTRACTS_WRITE),
  audit('contract_milestones'),
  async (req: any, res: Response) => {
    ok(res, await contractsService.deleteContractMilestone(Number(req.params.id), Number(req.user.id)));
  }
);

router.post(
  '/milestones/:id/complete',
  requirePermissions(PERMISSIONS.CONTRACTS_WRITE),
  validateBody(emptyActionSchema),
  audit('contract_milestones'),
  async (req: any, res: Response) => {
    ok(res, await contractsService.completeContractMilestone(Number(req.params.id), Number(req.user.id)));
  }
);

export default router;
