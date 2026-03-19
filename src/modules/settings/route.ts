import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import { Errors, ok } from '../../utils/response';
import { parsePostingAccounts } from '../shared/posting-accounts';
import {
  readDemoDataFile,
  purgeAndImportDemoData,
  purgeAllOperationalData,
  getDemoFilePath
} from '../demo-data/service';

const companySchema = z.object({
  nameAr: z.string().min(2).optional(),
  nameEn: z.string().optional(),
  commercialRegistration: z.string().optional(),
  taxNumber: z.string().optional(),
  vatNumber: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
  currency: z.string().optional()
});

const systemSchema = z.object({
  allowNegativeStock: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
  approvalThreshold: z.number().nonnegative().optional(),
  invoicePrefix: z.string().optional(),
  quotePrefix: z.string().optional(),
  postingAccounts: z
    .object({
      receivableAccountId: z.coerce.number().int().positive().optional(),
      payableAccountId: z.coerce.number().int().positive().optional(),
      salesRevenueAccountId: z.coerce.number().int().positive().optional(),
      purchaseExpenseAccountId: z.coerce.number().int().positive().optional(),
      vatLiabilityAccountId: z.coerce.number().int().positive().optional(),
      vatRecoverableAccountId: z.coerce.number().int().positive().optional(),
      cashAccountId: z.coerce.number().int().positive().optional(),
      inventoryAccountId: z.coerce.number().int().positive().optional(),
      cogsAccountId: z.coerce.number().int().positive().optional(),
      stockAdjustmentGainAccountId: z.coerce.number().int().positive().optional(),
      stockAdjustmentLossAccountId: z.coerce.number().int().positive().optional()
    })
    .strict()
    .optional()
});

async function validatePostingAccountsInDb(raw: unknown) {
  const postingAccounts = parsePostingAccounts(raw);
  const uniqueIds = [...new Set(Object.values(postingAccounts).filter((v): v is number => typeof v === 'number'))];
  if (!uniqueIds.length) return postingAccounts;

  const rows = await prisma.account.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, isActive: true, allowPosting: true, nameAr: true }
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of uniqueIds) {
    const row = byId.get(id);
    if (!row) throw Errors.validation(`الحساب رقم ${id} غير موجود`);
    if (!row.isActive) throw Errors.validation(`الحساب ${row.nameAr} غير نشط`);
    if (!row.allowPosting) throw Errors.validation(`الحساب ${row.nameAr} غير قابل للترحيل`);
  }
  return postingAccounts;
}

const router = Router();
router.use(authenticate);

router.get('/company', requirePermissions(PERMISSIONS.SETTINGS_READ), async (_req, res) => {
  const profile = await prisma.companyProfile.findUnique({ where: { id: 1 } });
  ok(res, profile);
});

router.put('/company', requirePermissions(PERMISSIONS.SETTINGS_WRITE), validateBody(companySchema), async (req, res, next) => {
  try {
    const profile = await prisma.companyProfile.upsert({
      where: { id: 1 },
      update: req.body,
      create: { id: 1, nameAr: req.body.nameAr ?? 'شركة واحدة', ...req.body }
    });
    ok(res, profile);
  } catch (error) {
    next(error);
  }
});

router.get('/system', requirePermissions(PERMISSIONS.SETTINGS_READ), async (_req, res) => {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  const settingsData = (settings ?? {}) as Record<string, unknown>;
  ok(res, { ...settingsData, postingAccounts: settingsData.postingAccounts ?? {} });
});

router.get('/sequences', requirePermissions(PERMISSIONS.SETTINGS_READ), async (_req, res) => {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  ok(res, {
    invoice: settings?.invoicePrefix ?? 'INV',
    quote: settings?.quotePrefix ?? 'QT',
    paymentReceipt: 'RCV',
    paymentVoucher: 'PAY'
  });
});

router.put('/system', requirePermissions(PERMISSIONS.SETTINGS_WRITE), validateBody(systemSchema), async (req, res, next) => {
  try {
    const postingAccounts = await validatePostingAccountsInDb(req.body.postingAccounts);
    const settings = await prisma.systemSettings.upsert({
      where: { id: 1 },
      update: { ...req.body, postingAccounts },
      create: { id: 1, ...req.body, postingAccounts }
    });
    ok(res, settings);
  } catch (error) {
    next(error);
  }
});

router.put('/sequences/:entity', requirePermissions(PERMISSIONS.SETTINGS_WRITE), async (req, res, next) => {
  try {
    const entity = String(req.params.entity ?? '').toLowerCase();
    const prefix = String(req.body?.prefix ?? '').trim();
    if (!prefix) throw Errors.validation('prefix مطلوب');

    const data: Record<string, unknown> = {};
    if (entity === 'invoice' || entity === 'sales-invoice') data.invoicePrefix = prefix;
    if (entity === 'quote' || entity === 'quotation') data.quotePrefix = prefix;
    if (!Object.keys(data).length) throw Errors.validation('entity غير مدعوم');

    const settings = await prisma.systemSettings.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data }
    });

    ok(res, settings);
  } catch (error) {
    next(error);
  }
});

router.get('/demo-data/file', requirePermissions(PERMISSIONS.SETTINGS_READ), async (_req, res, next) => {
  try {
    const data = await readDemoDataFile();
    ok(res, { filePath: getDemoFilePath(), data });
  } catch (error) {
    next(error);
  }
});

router.post('/demo-data/import-default', requirePermissions(PERMISSIONS.SETTINGS_WRITE), async (req, res, next) => {
  try {
    const payload = await readDemoDataFile();
    const summary = await purgeAndImportDemoData(payload, { purgeFirst: req.body?.purgeFirst !== false });
    ok(res, summary);
  } catch (error) {
    next(error);
  }
});

router.post('/demo-data/import', requirePermissions(PERMISSIONS.SETTINGS_WRITE), async (req, res, next) => {
  try {
    const payload = req.body?.data ?? req.body;
    const summary = await purgeAndImportDemoData(payload, { purgeFirst: req.body?.purgeFirst !== false });
    ok(res, summary);
  } catch (error) {
    next(error);
  }
});

router.post('/demo-data/purge', requirePermissions(PERMISSIONS.BACKUP_WRITE), async (req, res, next) => {
  try {
    const result = await purgeAllOperationalData(String(req.body?.confirm ?? ''));
    ok(res, result);
  } catch (error) {
    next(error);
  }
});

export default router;
