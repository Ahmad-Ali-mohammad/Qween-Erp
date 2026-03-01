import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import { ok, Errors } from '../../utils/response';

const fySchema = z.object({
  name: z.string().min(4),
  startDate: z.string(),
  endDate: z.string(),
  status: z.enum(['OPEN', 'CLOSED', 'ADJUSTING']).optional(),
  isCurrent: z.boolean().optional()
});

const periodSchema = z.object({
  fiscalYearId: z.number().int().positive(),
  number: z.number().int().min(1).max(12),
  name: z.string().min(1),
  startDate: z.string(),
  endDate: z.string(),
  status: z.enum(['OPEN', 'CLOSED']).optional(),
  canPost: z.boolean().optional()
});

const router = Router();
router.use(authenticate, requirePermissions(PERMISSIONS.FISCAL_READ));

router.get('/years', async (_req, res) => {
  const years = await prisma.fiscalYear.findMany({ include: { periods: true }, orderBy: { id: 'desc' } });
  ok(res, years);
});

router.post('/years', requirePermissions(PERMISSIONS.FISCAL_WRITE), validateBody(fySchema), async (req, res, next) => {
  try {
    if (req.body.isCurrent) {
      await prisma.fiscalYear.updateMany({ data: { isCurrent: false } });
    }
    const year = await prisma.fiscalYear.create({
      data: {
        ...req.body,
        startDate: new Date(req.body.startDate),
        endDate: new Date(req.body.endDate)
      }
    });
    ok(res, year, undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.post('/years/:id/set-current', requirePermissions(PERMISSIONS.FISCAL_WRITE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = await prisma.fiscalYear.findUnique({ where: { id } });
    if (!target) throw Errors.notFound('السنة المالية غير موجودة');
    await prisma.fiscalYear.updateMany({ data: { isCurrent: false } });
    const year = await prisma.fiscalYear.update({ where: { id }, data: { isCurrent: true } });
    ok(res, year);
  } catch (error) {
    next(error);
  }
});

router.get('/periods', async (_req, res) => {
  const periods = await prisma.accountingPeriod.findMany({ include: { fiscalYear: true }, orderBy: [{ fiscalYearId: 'desc' }, { number: 'asc' }] });
  ok(res, periods);
});

router.post('/periods', requirePermissions(PERMISSIONS.FISCAL_WRITE), validateBody(periodSchema), async (req, res, next) => {
  try {
    const p = await prisma.accountingPeriod.create({
      data: {
        ...req.body,
        startDate: new Date(req.body.startDate),
        endDate: new Date(req.body.endDate)
      }
    });
    ok(res, p, undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.post('/periods/:id/close', requirePermissions(PERMISSIONS.FISCAL_WRITE), async (req: any, res, next) => {
  try {
    const p = await prisma.accountingPeriod.update({
      where: { id: Number(req.params.id) },
      data: { status: 'CLOSED', canPost: false, closedAt: new Date(), closedBy: req.user?.id }
    });
    ok(res, p);
  } catch (error) {
    next(error);
  }
});

router.post('/periods/:id/open', requirePermissions(PERMISSIONS.FISCAL_WRITE), async (req, res, next) => {
  try {
    const p = await prisma.accountingPeriod.update({
      where: { id: Number(req.params.id) },
      data: { status: 'OPEN', canPost: true, closedAt: null, closedBy: null }
    });
    ok(res, p);
  } catch (error) {
    next(error);
  }
});

export default router;
