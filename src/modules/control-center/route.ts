import { Router } from 'express';
import dashboardRoutes from '../dashboard/route';
import platformRoutes from '../platform/route';
import workspaceRoutes from '../workspace/route';
import { forwardSubtree } from '../shared/route-forward';
import { buildSystemDashboardRouter } from '../system-dashboards/route';

const router = Router();

router.use('/dashboard', buildSystemDashboardRouter('control-center'));
router.use('/legacy-dashboard', forwardSubtree('/dashboard', dashboardRoutes));
router.use('/branches', forwardSubtree('/branches', platformRoutes));
router.use('/approval-workflows', forwardSubtree('/approval-workflows', platformRoutes));
router.use('/outbox-events', forwardSubtree('/outbox-events', platformRoutes));
router.use('/notifications', forwardSubtree('/notifications', workspaceRoutes));
router.use('/tasks', forwardSubtree('/tasks', workspaceRoutes));

export default router;
