import { Router } from 'express';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { ok } from '../../utils/response';

const router = Router();
router.use(authenticate, requirePermissions(PERMISSIONS.PAYMENT_READ));

router.get('/', async (_req, res) => {
  const rows = await prisma.bankTransaction.findMany({ include: { bank: true }, orderBy: [{ date: 'desc' }, { id: 'desc' }] });
  ok(res, rows);
});

router.get('/:id', async (req, res) => {
  const row = await prisma.bankTransaction.findUnique({ where: { id: Number(req.params.id) }, include: { bank: true } });
  ok(res, row);
});

router.post('/', requirePermissions(PERMISSIONS.PAYMENT_WRITE), async (req, res) => {
  const row = await prisma.bankTransaction.create({
    data: {
      ...req.body,
      date: new Date(req.body.date),
      valueDate: req.body.valueDate ? new Date(req.body.valueDate) : null,
      debit: req.body.debit ?? 0,
      credit: req.body.credit ?? 0
    }
  });
  ok(res, row, undefined, 201);
});

router.post('/:id/reconcile', requirePermissions(PERMISSIONS.PAYMENT_WRITE), async (req, res) => {
  const row = await prisma.bankTransaction.update({
    where: { id: Number(req.params.id) },
    data: { isReconciled: true, reconciledAt: new Date() }
  });
  ok(res, row);
});

router.put('/:id', requirePermissions(PERMISSIONS.PAYMENT_WRITE), async (req, res) => {
  const data = { ...req.body } as any;
  if (data.date) data.date = new Date(data.date);
  if (data.valueDate) data.valueDate = new Date(data.valueDate);
  const row = await prisma.bankTransaction.update({ where: { id: Number(req.params.id) }, data });
  ok(res, row);
});

router.delete('/:id', requirePermissions(PERMISSIONS.PAYMENT_WRITE), async (req, res) => {
  await prisma.bankTransaction.delete({ where: { id: Number(req.params.id) } });
  ok(res, { deleted: true });
});

export default router;
