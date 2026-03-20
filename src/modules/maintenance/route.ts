import { Router, type Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { audit } from '../../middleware/audit';
import { ok } from '../../utils/response';
import { PERMISSIONS } from '../../constants/permissions';
import { buildSystemDashboardRouter } from '../system-dashboards/route';
import {
  createFailureAnalysisSchema,
  createMaintenanceExecutionSchema,
  createMaintenanceOrderSchema,
  createMaintenancePlanSchema,
  maintenanceActionSchema
} from '../../contracts/maintenance';
import * as maintenanceService from './service';

const router = Router();

router.use('/dashboard', buildSystemDashboardRouter('maintenance'));
router.use(authenticate, requirePermissions(PERMISSIONS.ASSETS_READ));

router.get('/plans', async (req, res: Response) => {
  const result = await maintenanceService.listPlans(req.query);
  ok(res, result.rows, result.meta);
});

router.post(
  '/plans',
  requirePermissions(PERMISSIONS.ASSETS_WRITE),
  validateBody(createMaintenancePlanSchema),
  audit('maintenance_plans'),
  async (req: any, res: Response) => {
    ok(res, await maintenanceService.createPlan(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.get('/orders', async (req, res: Response) => {
  const result = await maintenanceService.listOrders(req.query);
  ok(res, result.rows, result.meta);
});

router.post(
  '/orders',
  requirePermissions(PERMISSIONS.ASSETS_WRITE),
  validateBody(createMaintenanceOrderSchema),
  audit('maintenance_orders'),
  async (req: any, res: Response) => {
    ok(res, await maintenanceService.createOrder(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.post(
  '/orders/:id/submit',
  requirePermissions(PERMISSIONS.ASSETS_WRITE),
  validateBody(maintenanceActionSchema),
  audit('maintenance_orders'),
  async (req: any, res: Response) => {
    ok(res, await maintenanceService.submitOrder(Number(req.params.id), Number(req.user.id)));
  }
);

router.post(
  '/orders/:id/approve',
  requirePermissions(PERMISSIONS.ASSETS_WRITE),
  validateBody(maintenanceActionSchema),
  audit('maintenance_orders'),
  async (req: any, res: Response) => {
    ok(res, await maintenanceService.approveOrder(Number(req.params.id), Number(req.user.id)));
  }
);

router.post(
  '/orders/:id/complete',
  requirePermissions(PERMISSIONS.ASSETS_WRITE),
  validateBody(maintenanceActionSchema),
  audit('maintenance_orders'),
  async (req: any, res: Response) => {
    ok(res, await maintenanceService.completeOrder(Number(req.params.id), Number(req.user.id), req.body));
  }
);

router.get('/executions', async (req, res: Response) => {
  const result = await maintenanceService.listExecutions(req.query);
  ok(res, result.rows, result.meta);
});

router.post(
  '/executions',
  requirePermissions(PERMISSIONS.ASSETS_WRITE),
  validateBody(createMaintenanceExecutionSchema),
  audit('maintenance_executions'),
  async (req: any, res: Response) => {
    ok(res, await maintenanceService.createExecution(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.get('/failures', async (req, res: Response) => {
  const result = await maintenanceService.listFailures(req.query);
  ok(res, result.rows, result.meta);
});

router.post(
  '/failures',
  requirePermissions(PERMISSIONS.ASSETS_WRITE),
  validateBody(createFailureAnalysisSchema),
  audit('failure_analysis'),
  async (req: any, res: Response) => {
    ok(res, await maintenanceService.createFailure(req.body, Number(req.user.id)), undefined, 201);
  }
);

export default router;
