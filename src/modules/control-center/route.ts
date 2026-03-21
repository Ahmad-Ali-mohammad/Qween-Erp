import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { ok } from '../../utils/response';
import dashboardRoutes from '../dashboard/route';
import platformRoutes from '../platform/route';
import workspaceRoutes from '../workspace/route';
import { forwardSubtree } from '../shared/route-forward';
import { buildSystemDashboardRouter } from '../system-dashboards/route';
import * as service from './service';

const router = Router();

router.use('/dashboard', buildSystemDashboardRouter('control-center'));
router.use(authenticate);

router.get('/approval-requests', async (req: Request, res: Response) => {
  ok(res, await service.listApprovalRequests(req.query));
});

router.get('/notifications', async (req: any, res: Response) => {
  const result = await service.listNotifications(req.query, Number(req.user.id));
  ok(res, result.rows, result.meta);
});

router.get('/tasks', async (req: Request, res: Response) => {
  const result = await service.listTasks(req.query);
  ok(res, result.rows, result.meta);
});

router.get('/events/live', async (req: Request, res: Response) => {
  const result = await service.listLiveEvents(req.query);
  ok(res, result.rows, result.meta);
});

router.use('/legacy-dashboard', forwardSubtree('/dashboard', dashboardRoutes));
router.use('/branches', forwardSubtree('/branches', platformRoutes));
router.use('/approval-workflows', forwardSubtree('/approval-workflows', platformRoutes));
router.use('/outbox-events', forwardSubtree('/outbox-events', platformRoutes));
router.use('/notifications', forwardSubtree('/notifications', workspaceRoutes));
router.use('/tasks', forwardSubtree('/tasks', workspaceRoutes));

export default router;
