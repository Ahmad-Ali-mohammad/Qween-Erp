import { Router, type Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { audit } from '../../middleware/audit';
import { ok } from '../../utils/response';
import { PERMISSIONS } from '../../constants/permissions';
import { buildSystemDashboardRouter } from '../system-dashboards/route';
import {
  createMitigationPlanSchema,
  createRiskAssessmentSchema,
  createRiskFollowupSchema,
  createRiskRegisterSchema
} from '../../contracts/risk';
import * as riskService from './service';

const router = Router();

router.use('/dashboard', buildSystemDashboardRouter('risk'));
router.use(authenticate, requirePermissions(PERMISSIONS.PROJECTS_READ));

router.get('/register', async (req, res: Response) => {
  const result = await riskService.listRiskRegisters(req.query);
  ok(res, result.rows, result.meta);
});

router.post(
  '/register',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(createRiskRegisterSchema),
  audit('risk_register'),
  async (req: any, res: Response) => {
    ok(res, await riskService.createRiskRegister(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.get('/assessments', async (req, res: Response) => {
  const result = await riskService.listAssessments(req.query);
  ok(res, result.rows, result.meta);
});

router.post(
  '/assessments',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(createRiskAssessmentSchema),
  audit('risk_assessments'),
  async (req: any, res: Response) => {
    ok(res, await riskService.createAssessment(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.get('/mitigations', async (req, res: Response) => {
  const result = await riskService.listMitigations(req.query);
  ok(res, result.rows, result.meta);
});

router.post(
  '/mitigations',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(createMitigationPlanSchema),
  audit('risk_mitigations'),
  async (req: any, res: Response) => {
    ok(res, await riskService.createMitigation(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.get('/followup', async (req, res: Response) => {
  const result = await riskService.listFollowups(req.query);
  ok(res, result.rows, result.meta);
});

router.post(
  '/followup',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(createRiskFollowupSchema),
  audit('risk_followups'),
  async (req: any, res: Response) => {
    ok(res, await riskService.createFollowup(req.body, Number(req.user.id)), undefined, 201);
  }
);

export default router;
