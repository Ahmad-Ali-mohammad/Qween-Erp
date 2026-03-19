import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { authenticate } from '../../middleware/auth';
import { audit } from '../../middleware/audit';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { ok } from '../../utils/response';
import {
  completeBankReconciliation,
  createBankReconciliation,
  getBankReconciliation,
  listBankReconciliations,
  matchBankReconciliation
} from './bank-reconciliation-service';
import { closeMonth, evaluateMonthClose } from './closing-service';
import { listAccountingEvents } from './events';
import { calculateTaxDeclaration, postTaxDeclaration } from './tax-declaration-service';

const router = Router();
const closeMonthSchema = z.object({ periodId: z.coerce.number().int().positive() }).strict();
const bankReconciliationSchema = z
  .object({
    bankId: z.coerce.number().int().positive(),
    statementBalance: z.coerce.number(),
    statementDate: z.string().optional()
  })
  .strict();
const bankReconciliationMatchSchema = z
  .object({
    transactionId: z.coerce.number().int().positive()
  })
  .strict();

const taxDeclarationCalcSchema = z
  .object({
    periodStart: z.string(),
    periodEnd: z.string(),
    type: z.enum(['VAT', 'WHT'])
  })
  .strict();

const taxDeclarationPostSchema = z
  .object({
    journalDate: z.string().optional(),
    reference: z.string().optional(),
    description: z.string().optional()
  })
  .strict();

router.use(authenticate);

router.get('/events', requirePermissions(PERMISSIONS.JOURNAL_READ), (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 50)));
  ok(res, listAccountingEvents(limit));
});

router.get('/month-close/check/:id', requirePermissions(PERMISSIONS.FISCAL_READ), async (req, res, next) => {
  try {
    ok(res, await evaluateMonthClose(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/month-close', requirePermissions(PERMISSIONS.FISCAL_WRITE), validateBody(closeMonthSchema), async (req: any, res, next) => {
  try {
    ok(res, await closeMonth(req.body.periodId, Number(req.user.id)));
  } catch (error) {
    next(error);
  }
});

router.get('/bank-reconciliations', requirePermissions(PERMISSIONS.PAYMENT_READ), async (_req, res, next) => {
  try {
    ok(res, await listBankReconciliations());
  } catch (error) {
    next(error);
  }
});

router.get('/bank-reconciliations/:id', requirePermissions(PERMISSIONS.PAYMENT_READ), async (req, res, next) => {
  try {
    ok(res, await getBankReconciliation(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post(
  '/bank-reconciliations',
  requirePermissions(PERMISSIONS.PAYMENT_WRITE),
  validateBody(bankReconciliationSchema),
  audit('bank_reconciliations'),
  async (req: any, res, next) => {
    try {
      ok(res, await createBankReconciliation(req.body), undefined, 201);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/bank-reconciliations/:id/match',
  requirePermissions(PERMISSIONS.PAYMENT_WRITE),
  validateBody(bankReconciliationMatchSchema),
  audit('bank_reconciliations'),
  async (req: any, res, next) => {
    try {
      ok(res, await matchBankReconciliation(Number(req.params.id), req.body.transactionId));
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/bank-reconciliations/:id/complete',
  requirePermissions(PERMISSIONS.PAYMENT_WRITE),
  audit('bank_reconciliations'),
  async (req, res, next) => {
    try {
      ok(res, await completeBankReconciliation(Number(req.params.id)));
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/tax-declarations/:id/post',
  requirePermissions(PERMISSIONS.JOURNAL_POST),
  validateBody(taxDeclarationPostSchema),
  audit('tax_declarations'),
  async (req: any, res, next) => {
    try {
      ok(res, await postTaxDeclaration(Number(req.params.id), Number(req.user.id), req.body));
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/tax-declarations/calculate',
  requirePermissions(PERMISSIONS.JOURNAL_READ),
  validateBody(taxDeclarationCalcSchema),
  async (req, res, next) => {
    try {
      ok(res, await calculateTaxDeclaration(req.body.periodStart, req.body.periodEnd, req.body.type));
    } catch (error) {
      next(error);
    }
  }
);

export default router;
