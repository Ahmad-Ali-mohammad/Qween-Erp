import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { ok } from '../../utils/response';

const budgetSchema = z.object({
  code: z.string().min(1),
  nameAr: z.string().min(2),
  nameEn: z.string().optional(),
  fiscalYear: z.number().int(),
  version: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'CLOSED']).optional(),
  controlLevel: z.enum(['NONE', 'WARNING', 'HARD']).optional(),
  totalAmount: z.number().nonnegative().optional()
});

const lineSchema = z.object({
  budgetId: z.number().int(),
  accountId: z.number().int(),
  period: z.number().int().min(1).max(12),
  amount: z.number(),
  actual: z.number().optional(),
  committed: z.number().optional(),
  variance: z.number().optional()
});

const router = Router();
router.use(authenticate);

router.get('/', requirePermissions(PERMISSIONS.BUDGET_READ), async (_req, res) => {
  const rows = await prisma.budget.findMany({ include: { lines: true }, orderBy: { id: 'desc' } });
  ok(res, rows);
});

router.get('/:id', requirePermissions(PERMISSIONS.BUDGET_READ), async (req, res) => {
  const row = await prisma.budget.findUnique({
    where: { id: Number(req.params.id) },
    include: { lines: { include: { account: true }, orderBy: { period: 'asc' } } }
  });
  ok(res, row);
});

router.post('/', requirePermissions(PERMISSIONS.BUDGET_WRITE), validateBody(budgetSchema), audit('budgets'), async (req, res) => {
  const row = await prisma.budget.create({ data: req.body });
  ok(res, row, undefined, 201);
});

router.put('/:id', requirePermissions(PERMISSIONS.BUDGET_WRITE), validateBody(budgetSchema.partial()), audit('budgets'), async (req, res) => {
  const row = await prisma.budget.update({ where: { id: Number(req.params.id) }, data: req.body });
  ok(res, row);
});

router.delete('/:id', requirePermissions(PERMISSIONS.BUDGET_WRITE), audit('budgets'), async (req, res) => {
  await prisma.budget.delete({ where: { id: Number(req.params.id) } });
  ok(res, { deleted: true });
});

router.get('/lines/all', requirePermissions(PERMISSIONS.BUDGET_READ), async (_req, res) => {
  const rows = await prisma.budgetLine.findMany({ include: { budget: true, account: true }, orderBy: { id: 'desc' } });
  ok(res, rows);
});

router.post('/lines', requirePermissions(PERMISSIONS.BUDGET_WRITE), validateBody(lineSchema), audit('budget_lines'), async (req, res) => {
  const row = await prisma.budgetLine.create({ data: req.body });
  ok(res, row, undefined, 201);
});

router.put('/lines/:id', requirePermissions(PERMISSIONS.BUDGET_WRITE), validateBody(lineSchema.partial()), audit('budget_lines'), async (req, res) => {
  const row = await prisma.budgetLine.update({ where: { id: Number(req.params.id) }, data: req.body });
  ok(res, row);
});

router.delete('/lines/:id', requirePermissions(PERMISSIONS.BUDGET_WRITE), audit('budget_lines'), async (req, res) => {
  await prisma.budgetLine.delete({ where: { id: Number(req.params.id) } });
  ok(res, { deleted: true });
});

export default router;
