import { Router } from 'express';
import erpExpansionRoutes from '../erp-expansion/route';
import apiCompatRoutes from '../api-compat/route';
import { forwardSubtree } from '../shared/route-forward';
import { buildSystemDashboardRouter } from '../system-dashboards/route';

const router = Router();

router.use('/dashboard', buildSystemDashboardRouter('inventory'));
router.use('/items', forwardSubtree('/items', erpExpansionRoutes));
router.use('/item-categories', forwardSubtree('/item-categories', erpExpansionRoutes));
router.use('/units', forwardSubtree('/units', erpExpansionRoutes));
router.use('/warehouses', forwardSubtree('/warehouses', erpExpansionRoutes));
router.use('/warehouses', forwardSubtree('/warehouses', apiCompatRoutes));
router.use('/stock-counts', forwardSubtree('/stock-counts', erpExpansionRoutes));

export default router;
