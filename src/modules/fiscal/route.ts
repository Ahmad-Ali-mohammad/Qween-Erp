import { Router } from 'express';
import { qw } from '../../utils/where';
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
  const years = await prisma.orm.public.FiscalYear.include('periods').orderBy((r) => r.id.desc()).all();
  ok(res, years);
});

router.post('/years', requirePermissions(PERMISSIONS.FISCAL_WRITE), validateBody(fySchema), async (req, res, next) => {
  try {
    if (req.body.isCurrent) {
      await prisma.orm.public.FiscalYear.where((r) => qw(r, {})).updateAndCount({ isCurrent: false }).then((n0) => ({ count: n0 }));
    }
    const year = await prisma.orm.public.FiscalYear.create({
        ...req.body,
        startDate: new Date(req.body.startDate),
        endDate: new Date(req.body.endDate)
      });
    ok(res, year, undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.post('/years/:id/set-current', requirePermissions(PERMISSIONS.FISCAL_WRITE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const target = await prisma.orm.public.FiscalYear.first({ id });
    if (!target) throw Errors.notFound('السنة المالية غير موجودة');
    await prisma.orm.public.FiscalYear.where((r) => qw(r, {})).updateAndCount({ isCurrent: false }).then((n0) => ({ count: n0 }));
    const year = await prisma.orm.public.FiscalYear.where((r) => qw(r, { id })).update({ isCurrent: true }).then((r0) => r0!);
    ok(res, year);
  } catch (error) {
    next(error);
  }
});

router.get('/periods', async (_req, res) => {
  const periods = await prisma.orm.public.AccountingPeriod.include('fiscalYear').orderBy([(r) => r.fiscalYearId.desc(), (r) => r.number.asc()]).all();
  ok(res, periods);
});

router.post('/periods', requirePermissions(PERMISSIONS.FISCAL_WRITE), validateBody(periodSchema), async (req, res, next) => {
  try {
    const p = await prisma.orm.public.AccountingPeriod.create({
        ...req.body,
        startDate: new Date(req.body.startDate),
        endDate: new Date(req.body.endDate)
      });
    ok(res, p, undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.post('/periods/:id/close', requirePermissions(PERMISSIONS.FISCAL_WRITE), async (req: any, res, next) => {
  try {
    const p = await prisma.orm.public.AccountingPeriod.where((r) => qw(r, { id: Number(req.params.id) })).update({ status: 'CLOSED', canPost: false, closedAt: new Date(), closedBy: req.user?.id }).then((r0) => r0!);
    ok(res, p);
  } catch (error) {
    next(error);
  }
});

router.post('/periods/:id/open', requirePermissions(PERMISSIONS.FISCAL_WRITE), async (req, res, next) => {
  try {
    const p = await prisma.orm.public.AccountingPeriod.where((r) => qw(r, { id: Number(req.params.id) })).update({ status: 'OPEN', canPost: true, closedAt: null, closedBy: null }).then((r0) => r0!);
    ok(res, p);
  } catch (error) {
    next(error);
  }
});

export default router;
