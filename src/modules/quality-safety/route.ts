import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { ok } from '../../utils/response';
import * as siteService from '../site/service';

const router = Router();

const inspectionSchema = z
  .object({
    branchId: z.coerce.number().int().positive().optional(),
    siteId: z.coerce.number().int().positive().optional(),
    projectId: z.coerce.number().int().positive(),
    logDate: z.string().optional(),
    weather: z.string().trim().max(80).optional(),
    manpowerCount: z.coerce.number().int().min(0).optional(),
    equipmentCount: z.coerce.number().int().min(0).optional(),
    progressSummary: z.string().trim().optional(),
    issues: z.string().trim().optional(),
    notes: z.string().trim().optional()
  })
  .strict();

const incidentSchema = z
  .object({
    branchId: z.coerce.number().int().positive().optional(),
    siteId: z.coerce.number().int().positive().optional(),
    projectId: z.coerce.number().int().positive().optional(),
    assetId: z.coerce.number().int().positive(),
    issueDate: z.string().optional(),
    severity: z.string().trim().max(40).optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().optional(),
    createMaintenance: z.boolean().optional()
  })
  .strict();

const resolveSchema = z
  .object({
    resolutionNotes: z.string().trim().optional()
  })
  .strict();

router.use(authenticate);

async function listSafetyIncidents(req: any, res: any, next: any) {
  try {
    const data = await siteService.listEquipmentIssues(req.query, undefined);
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
}

async function createSafetyIncident(req: any, res: any, next: any) {
  try {
    ok(
      res,
      await siteService.createEquipmentIssue({
        ...req.body,
        severity: req.body.severity ?? 'HIGH'
      }),
      undefined,
      201
    );
  } catch (error) {
    next(error);
  }
}

async function resolveSafetyIncident(req: any, res: any, next: any) {
  try {
    ok(res, await siteService.resolveEquipmentIssue(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
}

async function listSafetyReports(_req: any, res: any, next: any) {
  try {
    const [total, open, resolved, high, medium, low] = await Promise.all([
      prisma.siteEquipmentIssue.count(),
      prisma.siteEquipmentIssue.count({ where: { status: { in: ['OPEN', 'ESCALATED'] } } }),
      prisma.siteEquipmentIssue.count({ where: { status: 'RESOLVED' } }),
      prisma.siteEquipmentIssue.count({ where: { severity: 'HIGH' } }),
      prisma.siteEquipmentIssue.count({ where: { severity: 'MEDIUM' } }),
      prisma.siteEquipmentIssue.count({ where: { severity: 'LOW' } })
    ]);

    ok(res, {
      total,
      open,
      resolved,
      bySeverity: { high, medium, low }
    });
  } catch (error) {
    next(error);
  }
}

router.get('/quality/inspections', requirePermissions(PERMISSIONS.SITE_READ), async (req, res, next) => {
  try {
    const data = await siteService.listDailyLogs(req.query, undefined);
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.post('/quality/inspections', requirePermissions(PERMISSIONS.SITE_WRITE), validateBody(inspectionSchema), audit('site_daily_logs'), async (req, res, next) => {
  try {
    ok(res, await siteService.createDailyLog(req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/quality/non-conformities', requirePermissions(PERMISSIONS.SITE_READ), async (req, res, next) => {
  try {
    const data = await siteService.listEquipmentIssues(req.query, undefined);
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.get('/quality/incidents', requirePermissions(PERMISSIONS.SITE_READ), async (req, res, next) => {
  try {
    const data = await siteService.listEquipmentIssues(req.query, undefined);
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.post('/quality/non-conformities', requirePermissions(PERMISSIONS.SITE_WRITE), validateBody(incidentSchema), audit('site_equipment_issues'), async (req, res, next) => {
  try {
    ok(
      res,
      await siteService.createEquipmentIssue({
        ...req.body,
        severity: req.body.severity ?? 'MEDIUM'
      }),
      undefined,
      201
    );
  } catch (error) {
    next(error);
  }
});

router.get('/safety/incidents', requirePermissions(PERMISSIONS.SITE_READ), listSafetyIncidents);
router.post('/safety/incidents', requirePermissions(PERMISSIONS.SITE_WRITE), validateBody(incidentSchema), audit('site_equipment_issues'), createSafetyIncident);
router.post('/safety/incidents/:id/resolve', requirePermissions(PERMISSIONS.SITE_WRITE), validateBody(resolveSchema), audit('site_equipment_issues'), resolveSafetyIncident);
router.get('/safety/reports', requirePermissions(PERMISSIONS.SITE_READ), listSafetyReports);

router.get('/quality/safety/incidents', requirePermissions(PERMISSIONS.SITE_READ), listSafetyIncidents);
router.post('/quality/safety/incidents', requirePermissions(PERMISSIONS.SITE_WRITE), validateBody(incidentSchema), audit('site_equipment_issues'), createSafetyIncident);
router.post('/quality/safety/incidents/:id/resolve', requirePermissions(PERMISSIONS.SITE_WRITE), validateBody(resolveSchema), audit('site_equipment_issues'), resolveSafetyIncident);
router.get('/quality/safety/reports', requirePermissions(PERMISSIONS.SITE_READ), listSafetyReports);

export default router;
