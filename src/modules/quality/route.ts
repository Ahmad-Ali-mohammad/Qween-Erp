import { Router, type Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { audit } from '../../middleware/audit';
import { ok } from '../../utils/response';
import { PERMISSIONS } from '../../constants/permissions';
import { buildSystemDashboardRouter } from '../system-dashboards/route';
import {
  createInspectionSchema,
  createNcrReportSchema,
  createPermitSchema,
  createSafetyIncidentSchema,
  qualityActionSchema
} from '../../contracts/quality';
import * as qualityService from './service';

const router = Router();

router.use('/dashboard', buildSystemDashboardRouter('quality'));
router.use(authenticate, requirePermissions(PERMISSIONS.PROJECTS_READ));

router.get('/inspections', async (req, res: Response) => {
  const result = await qualityService.listInspections(req.query);
  ok(res, result.rows, result.meta);
});

router.post(
  '/inspections',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(createInspectionSchema),
  audit('quality_inspections'),
  async (req: any, res: Response) => {
    ok(res, await qualityService.createInspection(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.post(
  '/inspections/:id/submit',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(qualityActionSchema),
  audit('quality_inspections'),
  async (req: any, res: Response) => {
    ok(res, await qualityService.submitInspection(Number(req.params.id), Number(req.user.id)));
  }
);

router.post(
  '/inspections/:id/approve',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(qualityActionSchema),
  audit('quality_inspections'),
  async (req: any, res: Response) => {
    ok(res, await qualityService.approveInspection(Number(req.params.id), Number(req.user.id)));
  }
);

router.get('/ncr', async (req, res: Response) => {
  const result = await qualityService.listNcrReports(req.query);
  ok(res, result.rows, result.meta);
});

router.post(
  '/ncr',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(createNcrReportSchema),
  audit('quality_ncr_reports'),
  async (req: any, res: Response) => {
    ok(res, await qualityService.createNcrReport(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.post(
  '/ncr/:id/close',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(qualityActionSchema),
  audit('quality_ncr_reports'),
  async (req: any, res: Response) => {
    ok(res, await qualityService.closeNcrReport(Number(req.params.id), Number(req.user.id), req.body));
  }
);

router.get('/incidents', async (req, res: Response) => {
  const result = await qualityService.listSafetyIncidents(req.query);
  ok(res, result.rows, result.meta);
});

router.post(
  '/incidents',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(createSafetyIncidentSchema),
  audit('quality_safety_incidents'),
  async (req: any, res: Response) => {
    ok(res, await qualityService.createSafetyIncident(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.post(
  '/incidents/:id/resolve',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(qualityActionSchema),
  audit('quality_safety_incidents'),
  async (req: any, res: Response) => {
    ok(res, await qualityService.resolveSafetyIncident(Number(req.params.id), Number(req.user.id), req.body));
  }
);

router.get('/permits', async (req, res: Response) => {
  const result = await qualityService.listPermits(req.query);
  ok(res, result.rows, result.meta);
});

router.post(
  '/permits',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(createPermitSchema),
  audit('quality_permits'),
  async (req: any, res: Response) => {
    ok(res, await qualityService.createPermit(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.post(
  '/permits/:id/approve',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(qualityActionSchema),
  audit('quality_permits'),
  async (req: any, res: Response) => {
    ok(res, await qualityService.approvePermit(Number(req.params.id), Number(req.user.id), req.body));
  }
);

export default router;
