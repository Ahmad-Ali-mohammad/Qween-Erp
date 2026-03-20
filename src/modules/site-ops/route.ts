import { Router, type Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { audit } from '../../middleware/audit';
import { ok } from '../../utils/response';
import { PERMISSIONS } from '../../constants/permissions';
import { buildSystemDashboardRouter } from '../system-dashboards/route';
import {
  createSiteAttendanceSchema,
  createSiteDailyLogSchema,
  createSiteIssueSchema,
  createSiteMaterialRequestSchema,
  createSiteProgressSchema,
  fulfillSiteMaterialRequestSchema,
  resolveSiteIssueSchema,
  updateSiteAttendanceSchema,
  updateSiteDailyLogSchema,
  updateSiteIssueSchema,
  updateSiteMaterialRequestSchema,
  updateSiteProgressSchema
} from '../../contracts/site-ops';
import * as siteOpsService from './service';

const router = Router();

router.use('/dashboard', buildSystemDashboardRouter('site-ops'));
router.use(authenticate, requirePermissions(PERMISSIONS.PROJECTS_READ));

router.get('/daily-logs', async (req, res: Response) => {
  const result = await siteOpsService.listDailyLogs(req.query);
  ok(res, result.rows, result.meta);
});

router.get('/daily-logs/:id', async (req, res: Response) => {
  ok(res, await siteOpsService.getDailyLog(Number(req.params.id)));
});

router.post(
  '/daily-logs',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(createSiteDailyLogSchema),
  audit('site_daily_logs'),
  async (req: any, res: Response) => {
    ok(res, await siteOpsService.createDailyLog(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.put(
  '/daily-logs/:id',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(updateSiteDailyLogSchema),
  audit('site_daily_logs'),
  async (req: any, res: Response) => {
    ok(res, await siteOpsService.updateDailyLog(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.post(
  '/daily-logs/:id/submit',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  audit('site_daily_logs'),
  async (req: any, res: Response) => {
    ok(res, await siteOpsService.submitDailyLog(Number(req.params.id), Number(req.user.id)));
  }
);

router.post(
  '/daily-logs/:id/approve',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  audit('site_daily_logs'),
  async (req: any, res: Response) => {
    ok(res, await siteOpsService.approveDailyLog(Number(req.params.id), Number(req.user.id)));
  }
);

router.get('/material-requests', async (req, res: Response) => {
  const result = await siteOpsService.listMaterialRequests(req.query);
  ok(res, result.rows, result.meta);
});

router.get('/material-requests/:id', async (req, res: Response) => {
  ok(res, await siteOpsService.getMaterialRequest(Number(req.params.id)));
});

router.post(
  '/material-requests',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(createSiteMaterialRequestSchema),
  audit('site_material_requests'),
  async (req: any, res: Response) => {
    ok(res, await siteOpsService.createMaterialRequest(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.put(
  '/material-requests/:id',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(updateSiteMaterialRequestSchema),
  audit('site_material_requests'),
  async (req: any, res: Response) => {
    ok(res, await siteOpsService.updateMaterialRequest(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.post(
  '/material-requests/:id/submit',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  audit('site_material_requests'),
  async (req: any, res: Response) => {
    ok(res, await siteOpsService.submitMaterialRequest(Number(req.params.id), Number(req.user.id)));
  }
);

router.post(
  '/material-requests/:id/approve',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  audit('site_material_requests'),
  async (req: any, res: Response) => {
    ok(res, await siteOpsService.approveMaterialRequest(Number(req.params.id), Number(req.user.id)));
  }
);

router.post(
  '/material-requests/:id/fulfill',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(fulfillSiteMaterialRequestSchema),
  audit('site_material_requests'),
  async (req: any, res: Response) => {
    ok(res, await siteOpsService.fulfillMaterialRequest(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.get('/progress', async (req, res: Response) => {
  const result = await siteOpsService.listProgress(req.query);
  ok(res, result.rows, result.meta);
});

router.get('/progress/:id', async (req, res: Response) => {
  ok(res, await siteOpsService.getProgress(Number(req.params.id)));
});

router.post(
  '/progress',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(createSiteProgressSchema),
  audit('site_progress'),
  async (req: any, res: Response) => {
    ok(res, await siteOpsService.createProgress(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.put(
  '/progress/:id',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(updateSiteProgressSchema),
  audit('site_progress'),
  async (req: any, res: Response) => {
    ok(res, await siteOpsService.updateProgress(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.get('/issues', async (req, res: Response) => {
  const result = await siteOpsService.listIssues(req.query);
  ok(res, result.rows, result.meta);
});

router.get('/issues/:id', async (req, res: Response) => {
  ok(res, await siteOpsService.getIssue(Number(req.params.id)));
});

router.post(
  '/issues',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(createSiteIssueSchema),
  audit('site_issues'),
  async (req: any, res: Response) => {
    ok(res, await siteOpsService.createIssue(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.put(
  '/issues/:id',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(updateSiteIssueSchema),
  audit('site_issues'),
  async (req: any, res: Response) => {
    ok(res, await siteOpsService.updateIssue(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.post(
  '/issues/:id/resolve',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(resolveSiteIssueSchema),
  audit('site_issues'),
  async (req: any, res: Response) => {
    ok(res, await siteOpsService.resolveIssue(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.get('/attendance', async (req, res: Response) => {
  const result = await siteOpsService.listAttendance(req.query);
  ok(res, result.rows, result.meta);
});

router.get('/attendance/:id', async (req, res: Response) => {
  ok(res, await siteOpsService.getAttendance(Number(req.params.id)));
});

router.post(
  '/attendance',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(createSiteAttendanceSchema),
  audit('site_attendance'),
  async (req: any, res: Response) => {
    ok(res, await siteOpsService.createAttendance(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.put(
  '/attendance/:id',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  validateBody(updateSiteAttendanceSchema),
  audit('site_attendance'),
  async (req: any, res: Response) => {
    ok(res, await siteOpsService.updateAttendance(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.post(
  '/attendance/:id/submit',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  audit('site_attendance'),
  async (req: any, res: Response) => {
    ok(res, await siteOpsService.submitAttendance(Number(req.params.id), Number(req.user.id)));
  }
);

router.post(
  '/attendance/:id/approve',
  requirePermissions(PERMISSIONS.PROJECTS_WRITE),
  audit('site_attendance'),
  async (req: any, res: Response) => {
    ok(res, await siteOpsService.approveAttendance(Number(req.params.id), Number(req.user.id)));
  }
);

export default router;
