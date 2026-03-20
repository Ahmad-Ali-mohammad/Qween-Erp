import { Router, type Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { audit } from '../../middleware/audit';
import { ok } from '../../utils/response';
import { PERMISSIONS } from '../../constants/permissions';
import { buildSystemDashboardRouter } from '../system-dashboards/route';
import {
  createCriticalPathSnapshotSchema,
  createSchedulePlanSchema,
  createScheduleTaskSchema,
  createTaskDependencySchema
} from '../../contracts/scheduling';
import * as schedulingService from './service';

const router = Router();

router.use('/dashboard', buildSystemDashboardRouter('scheduling'));
router.use(authenticate, requirePermissions(PERMISSIONS.PROJECTS_READ));

router.get('/plans', async (req, res: Response) => {
  const result = await schedulingService.listPlans(req.query);
  ok(res, result.rows, result.meta);
});

router.post(
  '/plans',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(createSchedulePlanSchema),
  audit('schedule_plans'),
  async (req: any, res: Response) => {
    ok(res, await schedulingService.createPlan(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.get('/tasks', async (req, res: Response) => {
  const result = await schedulingService.listTasks(req.query);
  ok(res, result.rows, result.meta);
});

router.post(
  '/tasks',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(createScheduleTaskSchema),
  audit('schedule_tasks'),
  async (req: any, res: Response) => {
    ok(res, await schedulingService.createTask(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.get('/dependencies', async (req, res: Response) => {
  const result = await schedulingService.listDependencies(req.query);
  ok(res, result.rows, result.meta);
});

router.post(
  '/dependencies',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(createTaskDependencySchema),
  audit('task_dependencies'),
  async (req: any, res: Response) => {
    ok(res, await schedulingService.createDependency(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.get('/critical-path', async (req, res: Response) => {
  const result = await schedulingService.listCriticalPathSnapshots(req.query);
  ok(res, result.rows, result.meta);
});

router.post(
  '/critical-path',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(createCriticalPathSnapshotSchema),
  audit('critical_path_snapshots'),
  async (req: any, res: Response) => {
    ok(res, await schedulingService.createCriticalPathSnapshot(req.body, Number(req.user.id)), undefined, 201);
  }
);

export default router;
