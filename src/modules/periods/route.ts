import { Router } from 'express';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { ok } from '../../utils/response';

const router = Router();
router.use(authenticate, requirePermissions(PERMISSIONS.FISCAL_READ));

router.get('/', async (_req, res) => {
  const rows = await prisma.accountingPeriod.findMany({ include: { fiscalYear: true }, orderBy: [{ fiscalYearId: 'desc' }, { number: 'asc' }] });
  ok(res, rows);
});

router.get('/:id', async (req, res) => {
  const row = await prisma.accountingPeriod.findUnique({ where: { id: Number(req.params.id) }, include: { fiscalYear: true } });
  ok(res, row);
});

router.post('/', requirePermissions(PERMISSIONS.FISCAL_WRITE), async (req, res) => {
  const row = await prisma.accountingPeriod.create({
    data: {
      ...req.body,
      startDate: new Date(req.body.startDate),
      endDate: new Date(req.body.endDate)
    }
  });
  ok(res, row, undefined, 201);
});

router.post('/:id/close', requirePermissions(PERMISSIONS.FISCAL_WRITE), async (req: any, res) => {
  const row = await prisma.accountingPeriod.update({
    where: { id: Number(req.params.id) },
    data: { status: 'CLOSED', canPost: false, closedAt: new Date(), closedBy: req.user?.id }
  });
  ok(res, row);
});

router.post('/:id/open', requirePermissions(PERMISSIONS.FISCAL_WRITE), async (req, res) => {
  const row = await prisma.accountingPeriod.update({
    where: { id: Number(req.params.id) },
    data: { status: 'OPEN', canPost: true, closedAt: null, closedBy: null }
  });
  ok(res, row);
});

router.put('/:id', requirePermissions(PERMISSIONS.FISCAL_WRITE), async (req, res) => {
  const data = { ...req.body } as any;
  if (data.startDate) data.startDate = new Date(data.startDate);
  if (data.endDate) data.endDate = new Date(data.endDate);
  const row = await prisma.accountingPeriod.update({ where: { id: Number(req.params.id) }, data });
  ok(res, row);
});

router.delete('/:id', requirePermissions(PERMISSIONS.FISCAL_WRITE), async (req, res) => {
  await prisma.accountingPeriod.delete({ where: { id: Number(req.params.id) } });
  ok(res, { deleted: true });
});

export default router;
