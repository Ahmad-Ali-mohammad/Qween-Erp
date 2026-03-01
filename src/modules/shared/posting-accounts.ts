import { PrismaClient } from '@prisma/client';
import { Errors } from '../../utils/response';

type TxLike = PrismaClient | any;

type PostingAccountsConfig = {
  receivableAccountId?: number;
  payableAccountId?: number;
  salesRevenueAccountId?: number;
  purchaseExpenseAccountId?: number;
  vatLiabilityAccountId?: number;
  vatRecoverableAccountId?: number;
  cashAccountId?: number;
  inventoryAccountId?: number;
  cogsAccountId?: number;
  stockAdjustmentGainAccountId?: number;
  stockAdjustmentLossAccountId?: number;
};

type PostingAccountsResolved = {
  receivableAccountId: number;
  payableAccountId: number;
  salesRevenueAccountId: number;
  purchaseExpenseAccountId: number;
  vatLiabilityAccountId: number;
  vatRecoverableAccountId: number;
  cashAccountId: number;
  inventoryAccountId: number;
  cogsAccountId: number;
  stockAdjustmentGainAccountId: number;
  stockAdjustmentLossAccountId: number;
};

const FALLBACK_CODES = {
  receivableAccountId: '1300',
  payableAccountId: '2100',
  salesRevenueAccountId: '4100',
  purchaseExpenseAccountId: '5100',
  vatLiabilityAccountId: '2200',
  vatRecoverableAccountId: '2200',
  cashAccountId: '1100',
  inventoryAccountId: '1100',
  cogsAccountId: '5100',
  stockAdjustmentGainAccountId: '4100',
  stockAdjustmentLossAccountId: '5100'
} as const;

async function validateAccountById(tx: TxLike, id: number, label: string): Promise<number> {
  const account = await tx.account.findUnique({ where: { id } });
  if (!account) throw Errors.business(`حساب ${label} غير موجود`);
  if (!account.isActive) throw Errors.business(`حساب ${label} غير نشط`);
  if (!account.allowPosting) throw Errors.business(`حساب ${label} غير قابل للترحيل`);
  return account.id;
}

async function resolveAccountId(
  tx: TxLike,
  configuredId: number | undefined,
  fallbackCode: string,
  label: string
): Promise<number> {
  if (typeof configuredId === 'number' && Number.isInteger(configuredId) && configuredId > 0) {
    return validateAccountById(tx, configuredId, label);
  }

  const account = await tx.account.findUnique({ where: { code: fallbackCode } });
  if (!account) throw Errors.business(`تعذر العثور على حساب ${label} الافتراضي (${fallbackCode})`);
  if (!account.isActive) throw Errors.business(`حساب ${label} الافتراضي غير نشط (${fallbackCode})`);
  if (!account.allowPosting) throw Errors.business(`حساب ${label} الافتراضي غير قابل للترحيل (${fallbackCode})`);
  return account.id;
}

function normalizePostingConfig(raw: unknown): PostingAccountsConfig {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const parsed: PostingAccountsConfig = {};
  for (const key of Object.keys(FALLBACK_CODES) as Array<keyof PostingAccountsConfig>) {
    const value = obj[key];
    if (value === undefined || value === null || value === '') continue;
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) {
      throw Errors.validation(`قيمة غير صالحة للحقل ${key}`);
    }
    parsed[key] = n;
  }
  return parsed;
}

export function parsePostingAccounts(raw: unknown): PostingAccountsConfig {
  return normalizePostingConfig(raw);
}

export async function resolvePostingAccounts(tx: TxLike): Promise<PostingAccountsResolved> {
  const settings = await tx.systemSettings.findUnique({ where: { id: 1 } });
  const configured = normalizePostingConfig(settings?.postingAccounts);

  return {
    receivableAccountId: await resolveAccountId(tx, configured.receivableAccountId, FALLBACK_CODES.receivableAccountId, 'الذمم المدينة'),
    payableAccountId: await resolveAccountId(tx, configured.payableAccountId, FALLBACK_CODES.payableAccountId, 'الذمم الدائنة'),
    salesRevenueAccountId: await resolveAccountId(tx, configured.salesRevenueAccountId, FALLBACK_CODES.salesRevenueAccountId, 'إيرادات المبيعات'),
    purchaseExpenseAccountId: await resolveAccountId(tx, configured.purchaseExpenseAccountId, FALLBACK_CODES.purchaseExpenseAccountId, 'مصروفات المشتريات'),
    vatLiabilityAccountId: await resolveAccountId(tx, configured.vatLiabilityAccountId, FALLBACK_CODES.vatLiabilityAccountId, 'ضريبة مخرجات'),
    vatRecoverableAccountId: await resolveAccountId(tx, configured.vatRecoverableAccountId, FALLBACK_CODES.vatRecoverableAccountId, 'ضريبة مدخلات'),
    cashAccountId: await resolveAccountId(tx, configured.cashAccountId, FALLBACK_CODES.cashAccountId, 'الصندوق/النقدية'),
    inventoryAccountId: await resolveAccountId(tx, configured.inventoryAccountId, FALLBACK_CODES.inventoryAccountId, 'المخزون'),
    cogsAccountId: await resolveAccountId(tx, configured.cogsAccountId, FALLBACK_CODES.cogsAccountId, 'تكلفة المبيعات'),
    stockAdjustmentGainAccountId: await resolveAccountId(
      tx,
      configured.stockAdjustmentGainAccountId,
      FALLBACK_CODES.stockAdjustmentGainAccountId,
      'مكاسب فروقات المخزون'
    ),
    stockAdjustmentLossAccountId: await resolveAccountId(
      tx,
      configured.stockAdjustmentLossAccountId,
      FALLBACK_CODES.stockAdjustmentLossAccountId,
      'خسائر فروقات المخزون'
    )
  };
}
