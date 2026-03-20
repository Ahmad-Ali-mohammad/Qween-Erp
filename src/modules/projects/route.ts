import { Router } from 'express';
import erpExpansionRoutes from '../erp-expansion/route';
import apiCompatRoutes from '../api-compat/route';
import { forwardSubtree } from '../shared/route-forward';
import { buildSystemDashboardRouter } from '../system-dashboards/route';

const router = Router();

router.use('/dashboard', buildSystemDashboardRouter('projects'));
router.use('/', forwardSubtree('/projects', erpExpansionRoutes));
router.use('/tasks', forwardSubtree('/project-tasks', erpExpansionRoutes));
router.use('/expenses', forwardSubtree('/project-expenses', erpExpansionRoutes));
router.use('/expenses', forwardSubtree('/expenses', apiCompatRoutes));

export default router;
