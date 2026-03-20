import { Router, type Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { audit } from '../../middleware/audit';
import { ok } from '../../utils/response';
import { PERMISSIONS } from '../../constants/permissions';
import {
  activateTemplateSchema,
  createConversionJobSchema,
  createExportJobSchema,
  createPrintJobSchema,
  createPrintTemplateSchema,
  markConversionJobStatusSchema,
  markExportJobStatusSchema,
  markPrintJobStatusSchema,
  updateConversionJobSchema,
  updateExportJobSchema,
  updatePrintJobSchema,
  updatePrintTemplateSchema
} from '../../contracts/printing';
import { buildSystemDashboardRouter } from '../system-dashboards/route';
import * as printingService from './service';

const router = Router();

router.use('/dashboard', buildSystemDashboardRouter('printing'));
router.use(authenticate, requirePermissions(PERMISSIONS.REPORTS_READ));

router.get('/templates', async (req, res: Response) => {
  const result = await printingService.listTemplates(req.query);
  ok(res, result.rows, result.meta);
});

router.get('/templates/:id', async (req, res: Response) => {
  ok(res, await printingService.getTemplate(Number(req.params.id)));
});

router.post(
  '/templates',
  requirePermissions(PERMISSIONS.REPORTS_ADVANCED_WRITE),
  validateBody(createPrintTemplateSchema),
  audit('print_templates'),
  async (req: any, res: Response) => {
    ok(res, await printingService.createTemplate(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.put(
  '/templates/:id',
  requirePermissions(PERMISSIONS.REPORTS_ADVANCED_WRITE),
  validateBody(updatePrintTemplateSchema),
  audit('print_templates'),
  async (req: any, res: Response) => {
    ok(res, await printingService.updateTemplate(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.post(
  '/templates/:id/activate',
  requirePermissions(PERMISSIONS.REPORTS_ADVANCED_WRITE),
  validateBody(activateTemplateSchema),
  audit('print_templates'),
  async (req: any, res: Response) => {
    ok(res, await printingService.toggleTemplateActive(Number(req.params.id), Boolean(req.body.active), Number(req.user.id)));
  }
);

router.get('/jobs', async (req, res: Response) => {
  const result = await printingService.listPrintJobs(req.query);
  ok(res, result.rows, result.meta);
});

router.get('/jobs/:id', async (req, res: Response) => {
  ok(res, await printingService.getPrintJob(Number(req.params.id)));
});

router.post(
  '/jobs',
  requirePermissions(PERMISSIONS.REPORTS_ADVANCED_WRITE),
  validateBody(createPrintJobSchema),
  audit('print_jobs'),
  async (req: any, res: Response) => {
    ok(res, await printingService.createPrintJob(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.put(
  '/jobs/:id',
  requirePermissions(PERMISSIONS.REPORTS_ADVANCED_WRITE),
  validateBody(updatePrintJobSchema),
  audit('print_jobs'),
  async (req: any, res: Response) => {
    ok(res, await printingService.updatePrintJob(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.post(
  '/jobs/:id/status',
  requirePermissions(PERMISSIONS.REPORTS_ADVANCED_WRITE),
  validateBody(markPrintJobStatusSchema),
  audit('print_jobs'),
  async (req: any, res: Response) => {
    ok(res, await printingService.markPrintJobStatus(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.get('/exports', async (req, res: Response) => {
  const result = await printingService.listExportJobs(req.query);
  ok(res, result.rows, result.meta);
});

router.get('/exports/:id', async (req, res: Response) => {
  ok(res, await printingService.getExportJob(Number(req.params.id)));
});

router.post(
  '/exports',
  requirePermissions(PERMISSIONS.REPORTS_ADVANCED_WRITE),
  validateBody(createExportJobSchema),
  audit('export_jobs'),
  async (req: any, res: Response) => {
    ok(res, await printingService.createExportJob(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.put(
  '/exports/:id',
  requirePermissions(PERMISSIONS.REPORTS_ADVANCED_WRITE),
  validateBody(updateExportJobSchema),
  audit('export_jobs'),
  async (req: any, res: Response) => {
    ok(res, await printingService.updateExportJob(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.post(
  '/exports/:id/status',
  requirePermissions(PERMISSIONS.REPORTS_ADVANCED_WRITE),
  validateBody(markExportJobStatusSchema),
  audit('export_jobs'),
  async (req: any, res: Response) => {
    ok(res, await printingService.markExportJobStatus(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.get('/conversions', async (req, res: Response) => {
  const result = await printingService.listConversionJobs(req.query);
  ok(res, result.rows, result.meta);
});

router.get('/conversions/:id', async (req, res: Response) => {
  ok(res, await printingService.getConversionJob(Number(req.params.id)));
});

router.post(
  '/conversions',
  requirePermissions(PERMISSIONS.REPORTS_ADVANCED_WRITE),
  validateBody(createConversionJobSchema),
  audit('conversion_jobs'),
  async (req: any, res: Response) => {
    ok(res, await printingService.createConversionJob(req.body, Number(req.user.id)), undefined, 201);
  }
);

router.put(
  '/conversions/:id',
  requirePermissions(PERMISSIONS.REPORTS_ADVANCED_WRITE),
  validateBody(updateConversionJobSchema),
  audit('conversion_jobs'),
  async (req: any, res: Response) => {
    ok(res, await printingService.updateConversionJob(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.post(
  '/conversions/:id/status',
  requirePermissions(PERMISSIONS.REPORTS_ADVANCED_WRITE),
  validateBody(markConversionJobStatusSchema),
  audit('conversion_jobs'),
  async (req: any, res: Response) => {
    ok(res, await printingService.markConversionJobStatus(Number(req.params.id), req.body, Number(req.user.id)));
  }
);

router.get('/audit', async (req, res: Response) => {
  const result = await printingService.listPrintAudits(req.query);
  ok(res, result.rows, result.meta);
});

export default router;
