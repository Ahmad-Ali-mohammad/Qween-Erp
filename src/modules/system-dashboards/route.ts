import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { ok } from '../../utils/response';
import { getSystemDashboardDefinition, type SystemDashboardKey } from './catalog';
import {
  getSystemDashboardActivity,
  getSystemDashboardAlerts,
  getSystemDashboardCharts,
  getSystemDashboardQueues,
  getSystemDashboardSummary,
  parseDashboardFilters
} from './service';

export function buildSystemDashboardRouter(key: SystemDashboardKey): Router {
  const router = Router();
  const definition = getSystemDashboardDefinition(key);

  router.use(authenticate);
  if (definition.permission) {
    router.use(requirePermissions(definition.permission));
  }

  router.get('/summary', async (req: Request, res: Response) => {
    ok(res, await getSystemDashboardSummary(key, parseDashboardFilters(req.query as Record<string, unknown>)));
  });

  router.get('/queues', async (req: Request, res: Response) => {
    ok(res, await getSystemDashboardQueues(key, parseDashboardFilters(req.query as Record<string, unknown>)));
  });

  router.get('/activity', async (req: Request, res: Response) => {
    ok(res, await getSystemDashboardActivity(key, parseDashboardFilters(req.query as Record<string, unknown>)));
  });

  router.get('/alerts', async (req: Request, res: Response) => {
    ok(res, await getSystemDashboardAlerts(key, parseDashboardFilters(req.query as Record<string, unknown>)));
  });

  router.get('/charts', async (req: Request, res: Response) => {
    ok(res, await getSystemDashboardCharts(key, parseDashboardFilters(req.query as Record<string, unknown>)));
  });

  return router;
}
