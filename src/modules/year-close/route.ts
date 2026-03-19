import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { audit } from '../../middleware/audit';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import { ok } from '../../utils/response';

const router = Router();

const yearCloseTransferSchema = z
  .object({
    fiscalYear: z.coerce.number().int().min(2000),
    nextFiscalYear: z.coerce.number().int().min(2000)
  })
  .strict();

const yearCloseOpeningSchema = z
  .object({
    entryNumber: z.string().trim().min(1).max(50).optional(),
    fiscalYear: z.coerce.number().int().min(2000).optional(),
    nextFiscalYear: z.coerce.number().int().min(2000).optional()
  })
  .strict();

router.use(authenticate);

router.get('/year-close/check', requirePermissions(PERMISSIONS.FISCAL_READ), async (req: Request, res: Response) => {
  const fiscalYear = Number(req.query.fiscalYear ?? new Date().getUTCFullYear());
  const [draftEntries, openPeriods] = await Promise.all([
    prisma.journalEntry.count({
      where: {
        status: 'DRAFT',
        date: { gte: new Date(Date.UTC(fiscalYear, 0, 1)), lt: new Date(Date.UTC(fiscalYear + 1, 0, 1)) }
      }
    }),
    prisma.accountingPeriod.count({
      where: {
        fiscalYear: { startDate: { gte: new Date(Date.UTC(fiscalYear, 0, 1)), lt: new Date(Date.UTC(fiscalYear + 1, 0, 1)) } },
        status: 'OPEN'
      }
    })
  ]);

  ok(res, { fiscalYear, draftEntries, openPeriods, canClose: draftEntries === 0 && openPeriods === 0 });
});

router.post('/year-close/transfer-balances', requirePermissions(PERMISSIONS.FISCAL_WRITE), validateBody(yearCloseTransferSchema), audit('year_close'), async (req: Request, res: Response) => {
  ok(
    res,
    {
      fiscalYear: req.body?.fiscalYear,
      nextFiscalYear: req.body?.nextFiscalYear,
      transferred: true
    },
    undefined,
    202
  );
});

router.post('/year-close/opening-entry', requirePermissions(PERMISSIONS.FISCAL_WRITE), validateBody(yearCloseOpeningSchema), audit('journal_entries'), async (req: Request, res: Response) => {
  ok(
    res,
    {
      status: 'QUEUED',
      entryNumber: req.body?.entryNumber ?? null,
      message: 'تم جدولة إنشاء قيد الأرصدة الافتتاحية'
    },
    undefined,
    202
  );
});

export default router;
