import { Router } from 'express';
import { qw } from '../../utils/where';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { ok, Errors } from '../../utils/response';

const router = Router();
router.use(authenticate, requirePermissions(PERMISSIONS.FISCAL_READ));

router.get('/', async (_req, res) => {
  const rows = await prisma.orm.public.FiscalYear.include('periods').orderBy((r) => r.id.desc()).all();
  ok(res, rows);
});

router.get('/:id', async (req, res) => {
  const row = await prisma.orm.public.FiscalYear.include('periods').first((r) => qw(r, { id: Number(req.params.id) }));
  ok(res, row);
});

router.post('/', requirePermissions(PERMISSIONS.FISCAL_WRITE), async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const startDate = new Date(req.body?.startDate);
  const endDate = new Date(req.body?.endDate);

  if (!name) throw Errors.validation('اسم السنة المالية مطلوب');
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw Errors.validation('تواريخ السنة المالية غير صالحة');
  }
  if (startDate > endDate) throw Errors.validation('تاريخ البداية يجب أن يسبق تاريخ النهاية');

  const duplicate = await prisma.orm.public.FiscalYear.first({ name });
  if (duplicate) throw Errors.business('اسم السنة المالية موجود مسبقاً');

  if (req.body.isCurrent) await prisma.orm.public.FiscalYear.where((r) => qw(r, {})).updateAndCount({ isCurrent: false }).then((n0) => ({ count: n0 }));
  const row = await prisma.orm.public.FiscalYear.create({
      ...req.body,
      name,
      startDate,
      endDate
    });
  ok(res, row, undefined, 201);
});

router.post('/:id/set-current', requirePermissions(PERMISSIONS.FISCAL_WRITE), async (req, res) => {
  const id = Number(req.params.id);
  const exists = await prisma.orm.public.FiscalYear.first({ id });
  if (!exists) throw Errors.notFound('السنة المالية غير موجودة');
  await prisma.orm.public.FiscalYear.where((r) => qw(r, {})).updateAndCount({ isCurrent: false }).then((n0) => ({ count: n0 }));
  const row = await prisma.orm.public.FiscalYear.where((r) => qw(r, { id })).update({ isCurrent: true }).then((r0) => r0!);
  ok(res, row);
});

router.put('/:id', requirePermissions(PERMISSIONS.FISCAL_WRITE), async (req, res) => {
  const data = { ...req.body } as any;
  if (data.startDate) data.startDate = new Date(data.startDate);
  if (data.endDate) data.endDate = new Date(data.endDate);
  const row = await prisma.orm.public.FiscalYear.where((r) => qw(r, { id: Number(req.params.id) })).update(data).then((r0) => r0!);
  ok(res, row);
});

router.delete('/:id', requirePermissions(PERMISSIONS.FISCAL_WRITE), async (req, res) => {
  await prisma.orm.public.FiscalYear.where((r) => qw(r, { id: Number(req.params.id) })).delete().then((r0) => r0!);
  ok(res, { deleted: true });
});

export default router;
