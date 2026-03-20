import { Router, type Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { audit } from '../../middleware/audit';
import { ok } from '../../utils/response';
import { PERMISSIONS } from '../../constants/permissions';
import { buildSystemDashboardRouter } from '../system-dashboards/route';
import {
  createBudgetScenarioSchema,
  createBudgetVersionSchema,
  createForecastSnapshotSchema,
  publishBudgetVersionSchema,
  updateBudgetScenarioSchema,
  updateBudgetVersionSchema,
  upsertBudgetAllocationsSchema
} from '../../contracts/budgeting';
import * as budgetingService from './service';

const router = Router();

router.use('/dashboard', buildSystemDashboardRouter('budgeting'));
router.use(authenticate, requirePermissions(PERMISSIONS.BUDGET_READ));

router.get('/scenarios', async (req, res: Response) => {
  const result = await budgetingService.listScenarios(req.query);
  ok(res, result.rows, result.meta);
});

router.get('/scenarios/:id', async (req, res: Response) => {
  ok(res, await budgetingService.getScenario(Number(req.params.id)));
});

router.post(
  '/scenarios',
  requirePermissions(PERMISSIONS.BUDGET_WRITE),
  validateBody(createBudgetScenarioSchema),
  audit('budget_scenarios'),
  async (req: any, res: Response) => {
    ok(res, await budgetingService.createScenario(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.put(
  '/scenarios/:id',
  requirePermissions(PERMISSIONS.BUDGET_WRITE),
  validateBody(updateBudgetScenarioSchema),
  audit('budget_scenarios'),
  async (req: any, res: Response) => {
    ok(res, await budgetingService.updateScenario(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.post(
  '/scenarios/:id/submit',
  requirePermissions(PERMISSIONS.BUDGET_WRITE),
  audit('budget_scenarios'),
  async (req: any, res: Response) => {
    ok(res, await budgetingService.submitScenario(Number(req.params.id), Number(req.user.id)));
  }
);

router.post(
  '/scenarios/:id/approve',
  requirePermissions(PERMISSIONS.BUDGET_WRITE),
  audit('budget_scenarios'),
  async (req: any, res: Response) => {
    ok(res, await budgetingService.approveScenario(Number(req.params.id), Number(req.user.id)));
  }
);

router.get('/versions', async (req, res: Response) => {
  const result = await budgetingService.listVersions(req.query);
  ok(res, result.rows, result.meta);
});

router.get('/versions/:id', async (req, res: Response) => {
  ok(res, await budgetingService.getVersion(Number(req.params.id)));
});

router.post(
  '/versions',
  requirePermissions(PERMISSIONS.BUDGET_WRITE),
  validateBody(createBudgetVersionSchema),
  audit('budget_versions'),
  async (req: any, res: Response) => {
    ok(res, await budgetingService.createVersion(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.put(
  '/versions/:id',
  requirePermissions(PERMISSIONS.BUDGET_WRITE),
  validateBody(updateBudgetVersionSchema),
  audit('budget_versions'),
  async (req: any, res: Response) => {
    ok(res, await budgetingService.updateVersion(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.post(
  '/versions/:id/publish',
  requirePermissions(PERMISSIONS.BUDGET_WRITE),
  validateBody(publishBudgetVersionSchema),
  audit('budget_versions'),
  async (req: any, res: Response) => {
    ok(res, await budgetingService.publishVersion(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.get('/allocations', async (req, res: Response) => {
  const result = await budgetingService.listAllocations(req.query);
  ok(res, result.rows, result.meta);
});

router.post(
  '/allocations/upsert-bulk',
  requirePermissions(PERMISSIONS.BUDGET_WRITE),
  validateBody(upsertBudgetAllocationsSchema),
  audit('budget_allocations'),
  async (req: any, res: Response) => {
    const result = await budgetingService.upsertAllocations(req.body, Number(req.user.id));
    ok(res, result.rows, result.meta);
  }
);

router.get('/forecast', async (req, res: Response) => {
  const result = await budgetingService.listForecastSnapshots(req.query);
  ok(res, result.rows, result.meta);
});

router.post(
  '/forecast/snapshot',
  requirePermissions(PERMISSIONS.BUDGET_WRITE),
  validateBody(createForecastSnapshotSchema),
  audit('budget_forecasts'),
  async (req: any, res: Response) => {
    ok(res, await budgetingService.createForecastSnapshot(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.get('/variance', async (req, res: Response) => {
  const result = await budgetingService.listVariances(req.query);
  ok(res, result.rows, result.meta);
});

export default router;
