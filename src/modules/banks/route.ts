import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { ok } from '../../utils/response';

const bankSchema = z.object({
  name: z.string().min(2),
  accountNumber: z.string().min(3),
  iban: z.string().optional(),
  bankName: z.string().min(2),
  currency: z.string().optional(),
  accountType: z.string().optional(),
  openingBalance: z.number().optional(),
  currentBalance: z.number().optional(),
  glAccountId: z.number().int().optional(),
  isActive: z.boolean().optional()
});

const bankTxnSchema = z.object({
  bankId: z.number().int(),
  date: z.string(),
  valueDate: z.string().optional(),
  reference: z.string().optional(),
  description: z.string().min(1),
  debit: z.number().nonnegative().optional(),
  credit: z.number().nonnegative().optional(),
  balance: z.number().optional(),
  type: z.string().optional(),
  counterparty: z.string().optional()
});

const router = Router();
router.use(authenticate);

router.get('/', requirePermissions(PERMISSIONS.PAYMENT_READ), async (_req, res) => {
  const rows = await prisma.bankAccount.findMany({ include: { glAccount: true }, orderBy: { id: 'desc' } });
  ok(res, rows);
});

router.post('/', requirePermissions(PERMISSIONS.PAYMENT_WRITE), validateBody(bankSchema), audit('bank_accounts'), async (req, res) => {
  const row = await prisma.bankAccount.create({ data: req.body });
  ok(res, row, undefined, 201);
});

router.get('/:id', requirePermissions(PERMISSIONS.PAYMENT_READ), async (req, res) => {
  const row = await prisma.bankAccount.findUnique({
    where: { id: Number(req.params.id) },
    include: { transactions: { take: 20, orderBy: { date: 'desc' } } }
  });
  ok(res, row);
});

router.put('/:id', requirePermissions(PERMISSIONS.PAYMENT_WRITE), validateBody(bankSchema.partial()), audit('bank_accounts'), async (req, res) => {
  const row = await prisma.bankAccount.update({ where: { id: Number(req.params.id) }, data: req.body });
  ok(res, row);
});

router.delete('/:id', requirePermissions(PERMISSIONS.PAYMENT_WRITE), audit('bank_accounts'), async (req, res) => {
  await prisma.bankAccount.delete({ where: { id: Number(req.params.id) } });
  ok(res, { deleted: true });
});

router.get('/transactions/all', requirePermissions(PERMISSIONS.PAYMENT_READ), async (_req, res) => {
  const rows = await prisma.bankTransaction.findMany({ include: { bank: true }, orderBy: [{ date: 'desc' }, { id: 'desc' }] });
  ok(res, rows);
});

router.post('/transactions', requirePermissions(PERMISSIONS.PAYMENT_WRITE), validateBody(bankTxnSchema), audit('bank_transactions'), async (req, res) => {
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

router.post('/transactions/:id/reconcile', requirePermissions(PERMISSIONS.PAYMENT_WRITE), audit('bank_transactions'), async (req, res) => {
  const row = await prisma.bankTransaction.update({
    where: { id: Number(req.params.id) },
    data: { isReconciled: true, reconciledAt: new Date() }
  });
  ok(res, row);
});

export default router;
