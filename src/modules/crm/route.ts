import { Router } from 'express';
import type { Response } from 'express';
import customersRoutes from '../customers/route';
import quotesRoutes from '../quotes/route';
import salesReturnsRoutes from '../sales-returns/route';
import erpExpansionRoutes from '../erp-expansion/route';
import apiCompatRoutes from '../api-compat/route';
import { forwardSubtree } from '../shared/route-forward';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { audit } from '../../middleware/audit';
import { ok } from '../../utils/response';
import { PERMISSIONS } from '../../constants/permissions';
import { awardOpportunitySchema } from '../../contracts/crm';
import * as opportunitiesService from './opportunities.service';
import { buildSystemDashboardRouter } from '../system-dashboards/route';

const router = Router();

router.use('/dashboard', buildSystemDashboardRouter('crm'));
router.use('/customers', customersRoutes);
router.use('/quotes', quotesRoutes);
router.use('/sales-returns', salesReturnsRoutes);
router.post(
  '/opportunities/:id/award',
  authenticate,
  requirePermissions(PERMISSIONS.CRM_WRITE),
  validateBody(awardOpportunitySchema),
  audit('opportunities'),
  async (req: any, res: Response) => {
    ok(res, await opportunitiesService.awardOpportunity(Number(req.params.id), req.body, Number(req.user.id)));
  }
);
router.use('/opportunities', forwardSubtree('/opportunities', erpExpansionRoutes));
router.use('/opportunities', forwardSubtree('/opportunities', apiCompatRoutes));

export default router;
