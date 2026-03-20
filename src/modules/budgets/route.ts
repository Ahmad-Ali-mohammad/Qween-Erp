import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { ok } from '../../utils/response';
import * as budgetingService from '../budgeting/service';

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
  ok(res, await budgetingService.listLegacyBudgets());
});

router.get('/:id', requirePermissions(PERMISSIONS.BUDGET_READ), async (req, res) => {
  ok(res, await budgetingService.getLegacyBudget(Number(req.params.id)));
});

router.post('/', requirePermissions(PERMISSIONS.BUDGET_WRITE), validateBody(budgetSchema), audit('budgets'), async (req: any, res) => {
  ok(res, await budgetingService.createLegacyBudget(req.body, Number(req.user.id)), undefined, 201);
});

router.put('/:id', requirePermissions(PERMISSIONS.BUDGET_WRITE), validateBody(budgetSchema.partial()), audit('budgets'), async (req: any, res) => {
  ok(res, await budgetingService.updateLegacyBudget(Number(req.params.id), req.body, Number(req.user.id)));
});

router.delete('/:id', requirePermissions(PERMISSIONS.BUDGET_WRITE), audit('budgets'), async (req, res) => {
  ok(res, await budgetingService.deleteLegacyBudget(Number(req.params.id)));
});

router.get('/lines/all', requirePermissions(PERMISSIONS.BUDGET_READ), async (req, res) => {
  ok(res, await budgetingService.listLegacyBudgetLines(req.query));
});

router.post('/lines', requirePermissions(PERMISSIONS.BUDGET_WRITE), validateBody(lineSchema), audit('budget_lines'), async (req: any, res) => {
  ok(res, await budgetingService.createLegacyBudgetLine(req.body, Number(req.user.id)), undefined, 201);
});

router.put('/lines/:id', requirePermissions(PERMISSIONS.BUDGET_WRITE), validateBody(lineSchema.partial()), audit('budget_lines'), async (req: any, res) => {
  ok(res, await budgetingService.updateLegacyBudgetLine(Number(req.params.id), req.body, Number(req.user.id)));
});

router.delete('/lines/:id', requirePermissions(PERMISSIONS.BUDGET_WRITE), audit('budget_lines'), async (req, res) => {
  ok(res, await budgetingService.deleteLegacyBudgetLine(Number(req.params.id)));
});

export default router;
