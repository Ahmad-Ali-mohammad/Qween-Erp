import { Router } from 'express';
import { qw } from '../../utils/where';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { ok } from '../../utils/response';

const router = Router();
router.use(authenticate, requirePermissions(PERMISSIONS.PAYMENT_READ));

router.get('/', async (_req, res) => {
  const rows = await prisma.orm.public.BankTransaction.include('bank').orderBy([(r) => r.date.desc(), (r) => r.id.desc()]).all();
  ok(res, rows);
});

router.get('/:id', async (req, res) => {
  const row = await prisma.orm.public.BankTransaction.include('bank').first((r) => qw(r, { id: Number(req.params.id) }));
  ok(res, row);
});

router.post('/', requirePermissions(PERMISSIONS.PAYMENT_WRITE), async (req, res) => {
  const row = await prisma.orm.public.BankTransaction.create({
      ...req.body,
      date: new Date(req.body.date),
      valueDate: req.body.valueDate ? new Date(req.body.valueDate) : null,
      debit: req.body.debit ?? 0,
      credit: req.body.credit ?? 0
    });
  ok(res, row, undefined, 201);
});

router.post('/:id/reconcile', requirePermissions(PERMISSIONS.PAYMENT_WRITE), async (req, res) => {
  const row = await prisma.orm.public.BankTransaction.where((r) => qw(r, { id: Number(req.params.id) })).update({ isReconciled: true, reconciledAt: new Date() }).then((r0) => r0!);
  ok(res, row);
});

router.put('/:id', requirePermissions(PERMISSIONS.PAYMENT_WRITE), async (req, res) => {
  const data = { ...req.body } as any;
  if (data.date) data.date = new Date(data.date);
  if (data.valueDate) data.valueDate = new Date(data.valueDate);
  const row = await prisma.orm.public.BankTransaction.where((r) => qw(r, { id: Number(req.params.id) })).update(data).then((r0) => r0!);
  ok(res, row);
});

router.delete('/:id', requirePermissions(PERMISSIONS.PAYMENT_WRITE), async (req, res) => {
  await prisma.orm.public.BankTransaction.where((r) => qw(r, { id: Number(req.params.id) })).delete().then((r0) => r0!);
  ok(res, { deleted: true });
});

export default router;
