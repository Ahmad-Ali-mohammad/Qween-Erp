import { Router } from 'express';
import type { Response } from 'express';
import erpExpansionRoutes from '../erp-expansion/route';
import apiCompatRoutes from '../api-compat/route';
import { forwardSubtree } from '../shared/route-forward';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { audit } from '../../middleware/audit';
import { ok } from '../../utils/response';
import { PERMISSIONS } from '../../constants/permissions';
import { createTimesheetSchema } from '../../contracts/hr';
import * as timesheetsService from './timesheets.service';
import { buildSystemDashboardRouter } from '../system-dashboards/route';

const router = Router();

router.use('/dashboard', buildSystemDashboardRouter('hr'));
router.get('/timesheets', authenticate, requirePermissions(PERMISSIONS.HR_READ), async (req, res: Response) => {
  const result = await timesheetsService.listTimesheets(req.query);
  ok(res, result.rows, result.meta);
});

router.get('/timesheets/:id', authenticate, requirePermissions(PERMISSIONS.HR_READ), async (req, res: Response) => {
  ok(res, await timesheetsService.getTimesheet(Number(req.params.id)));
});

router.post(
  '/timesheets',
  authenticate,
  requirePermissions(PERMISSIONS.HR_WRITE),
  validateBody(createTimesheetSchema),
  audit('timesheets'),
  async (req: any, res: Response) => {
    ok(res, await timesheetsService.createTimesheet(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.post(
  '/timesheets/:id/approve',
  authenticate,
  requirePermissions(PERMISSIONS.HR_WRITE),
  audit('timesheets'),
  async (req: any, res: Response) => {
    ok(res, await timesheetsService.approveTimesheet(Number(req.params.id), Number(req.user.id)));
  }
);

router.post(
  '/payroll/:id/distribute',
  authenticate,
  requirePermissions(PERMISSIONS.HR_WRITE),
  audit('project_expenses'),
  async (req: any, res: Response) => {
    ok(res, await timesheetsService.distributePayrollToProjects(Number(req.params.id), Number(req.user.id)));
  }
);

router.use('/employees', forwardSubtree('/employees', erpExpansionRoutes));
router.use('/leaves', forwardSubtree('/leaves', erpExpansionRoutes));
router.use('/leaves', forwardSubtree('/leaves', apiCompatRoutes));
router.use('/payroll-runs', forwardSubtree('/payroll-runs', erpExpansionRoutes));
router.use('/payroll-lines', forwardSubtree('/payroll-lines', erpExpansionRoutes));
router.use('/payroll', forwardSubtree('/payroll', apiCompatRoutes));

export default router;
