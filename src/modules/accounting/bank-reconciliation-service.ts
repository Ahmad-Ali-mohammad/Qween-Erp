import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { parseDateOrThrow } from '../../utils/date';
import { Errors } from '../../utils/response';

const BANK_RECON_PREFIX = 'bank-reconciliation:';

type BankReconciliationSettings = {
  bankId: number;
  statementBalance: number;
  statementDate: string;
  matchedTransactions: number[];
  completedAt?: string;
  matchedCount?: number;
  matchedDebit?: number;
  matchedCredit?: number;
  systemBalance?: number;
  difference?: number;
};

type BankReconciliationSummary = {
  id: number;
  status: string;
  settings: BankReconciliationSettings;
};

type CreateBankReconciliationInput = {
  bankId: number;
  statementBalance: number;
  statementDate?: string;
};

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function parsePositiveInt(value: unknown, fieldName: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw Errors.validation(`${fieldName} غير صالح`);
  return n;
}

function parseStatementBalance(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw Errors.validation('رصيد كشف البنك غير صالح');
  return n;
}

function bankReconKey(id: number): string {
  return `${BANK_RECON_PREFIX}${id}`;
}

function parseReconciliationId(key: string): number | null {
  if (!key.startsWith(BANK_RECON_PREFIX)) return null;
  const raw = key.slice(BANK_RECON_PREFIX.length);
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

async function getReconciliationRow(id: number) {
  const row = await prisma.integrationSetting.findUnique({ where: { key: bankReconKey(id) } });
  if (!row) throw Errors.notFound('التسوية البنكية غير موجودة');
  return row;
}

function buildSummary(row: { key: string; status: string | null; settings: Prisma.JsonValue | null }): BankReconciliationSummary {
  const id = parseReconciliationId(row.key);
  if (!id) throw Errors.notFound('التسوية البنكية غير موجودة');
  return {
    id,
    status: row.status ?? 'DRAFT',
    settings: (row.settings ?? {}) as BankReconciliationSettings
  };
}

async function findLatestReconciliationId(): Promise<number> {
  const rows = await prisma.integrationSetting.findMany({
    where: { key: { startsWith: BANK_RECON_PREFIX } },
    select: { key: true },
    orderBy: { id: 'desc' },
    take: 50
  });

  let maxId = 0;
  for (const row of rows) {
    const parsed = parseReconciliationId(row.key);
    if (parsed && parsed > maxId) maxId = parsed;
  }
  return maxId;
}

export async function listBankReconciliations(): Promise<BankReconciliationSummary[]> {
  const rows = await prisma.integrationSetting.findMany({
    where: { key: { startsWith: BANK_RECON_PREFIX } },
    orderBy: { id: 'desc' }
  });

  return rows
    .map((row) => {
      const parsedId = parseReconciliationId(row.key);
      if (!parsedId) return null;
      return buildSummary(row);
    })
    .filter((row): row is BankReconciliationSummary => Boolean(row));
}

export async function getBankReconciliation(id: number): Promise<BankReconciliationSummary> {
  const row = await getReconciliationRow(parsePositiveInt(id, 'reconciliationId'));
  return buildSummary(row);
}

export async function createBankReconciliation(input: CreateBankReconciliationInput): Promise<BankReconciliationSummary> {
  const bankId = parsePositiveInt(input.bankId, 'bankId');
  const bank = await prisma.bankAccount.findUnique({ where: { id: bankId } });
  if (!bank) throw Errors.notFound('الحساب البنكي غير موجود');
  if (String(bank.accountType).toUpperCase() === 'CASHBOX') {
    throw Errors.business('لا يمكن إنشاء تسوية للحسابات النقدية');
  }

  const statementBalance = parseStatementBalance(input.statementBalance);
  const statementDate = input.statementDate ? parseDateOrThrow(input.statementDate, 'statementDate') : new Date();
  const settings: BankReconciliationSettings = {
    bankId,
    statementBalance,
    statementDate: statementDate.toISOString(),
    matchedTransactions: []
  };

  const baseId = await findLatestReconciliationId();
  let created: BankReconciliationSummary | null = null;

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const candidateId = baseId + attempt;
    try {
      const row = await prisma.integrationSetting.create({
        data: {
          key: bankReconKey(candidateId),
          provider: 'SYSTEM',
          isEnabled: true,
          status: 'DRAFT',
          settings: toJsonValue(settings)
        }
      });
      created = buildSummary(row);
      break;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        continue;
      }
      throw error;
    }
  }

  if (!created) {
    throw Errors.conflict('تعذر إنشاء تسوية بنكية بسبب تعارض المعرف');
  }

  return created;
}

export async function matchBankReconciliation(reconciliationId: number, transactionId: number) {
  const row = await getReconciliationRow(parsePositiveInt(reconciliationId, 'reconciliationId'));
  if (String(row.status ?? '').toUpperCase() === 'COMPLETED') {
    throw Errors.business('التسوية البنكية مكتملة');
  }

  const settings = (row.settings ?? {}) as BankReconciliationSettings;
  const bankId = parsePositiveInt(settings.bankId, 'bankId');

  const transaction = await prisma.bankTransaction.findUnique({ where: { id: parsePositiveInt(transactionId, 'transactionId') } });
  if (!transaction) throw Errors.notFound('الحركة البنكية غير موجودة');
  if (transaction.bankId !== bankId) throw Errors.business('الحركة البنكية لا تخص الحساب المحدد');
  if (transaction.isReconciled) throw Errors.business('الحركة البنكية مسواة مسبقاً');

  const matched = Array.isArray(settings.matchedTransactions) ? [...settings.matchedTransactions] : [];
  if (!matched.includes(transaction.id)) matched.push(transaction.id);

  const updated = await prisma.integrationSetting.update({
    where: { key: row.key },
    data: {
      status: row.status && row.status !== 'DRAFT' ? row.status : 'IN_PROGRESS',
      settings: toJsonValue({ ...settings, matchedTransactions: matched })
    }
  });

  return buildSummary(updated);
}

export async function completeBankReconciliation(reconciliationId: number) {
  const row = await getReconciliationRow(parsePositiveInt(reconciliationId, 'reconciliationId'));
  if (String(row.status ?? '').toUpperCase() === 'COMPLETED') {
    throw Errors.business('التسوية البنكية مكتملة');
  }

  const settings = (row.settings ?? {}) as BankReconciliationSettings;
  const bankId = parsePositiveInt(settings.bankId, 'bankId');
  const bank = await prisma.bankAccount.findUnique({ where: { id: bankId } });
  if (!bank) throw Errors.notFound('الحساب البنكي غير موجود');

  const matchedIds = Array.isArray(settings.matchedTransactions)
    ? [...new Set(settings.matchedTransactions.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
    : [];

  const matchedRows = matchedIds.length
    ? await prisma.bankTransaction.findMany({ where: { id: { in: matchedIds } } })
    : [];

  if (matchedRows.some((txn) => txn.bankId !== bankId)) {
    throw Errors.business('يوجد حركات لا تخص الحساب البنكي المحدد');
  }
  if (matchedRows.some((txn) => txn.isReconciled)) {
    throw Errors.business('يوجد حركات مسواة مسبقاً');
  }

  const now = new Date();
  if (matchedIds.length) {
    await prisma.bankTransaction.updateMany({
      where: { id: { in: matchedIds } },
      data: { isReconciled: true, reconciledAt: now }
    });
  }

  const totals = await prisma.bankTransaction.aggregate({
    where: { bankId },
    _sum: { debit: true, credit: true }
  });

  const systemBalance = Number(bank.openingBalance) + Number(totals._sum.credit ?? 0) - Number(totals._sum.debit ?? 0);
  const statementBalance = parseStatementBalance(settings.statementBalance);
  const matchedDebit = matchedRows.reduce((sum, row) => sum + Number(row.debit), 0);
  const matchedCredit = matchedRows.reduce((sum, row) => sum + Number(row.credit), 0);

  const completedSettings: BankReconciliationSettings = {
    ...settings,
    completedAt: now.toISOString(),
    matchedCount: matchedRows.length,
    matchedDebit,
    matchedCredit,
    systemBalance,
    difference: statementBalance - systemBalance
  };

  await prisma.bankAccount.update({ where: { id: bankId }, data: { currentBalance: systemBalance } });

  const updated = await prisma.integrationSetting.update({
    where: { key: row.key },
    data: { status: 'COMPLETED', settings: toJsonValue(completedSettings) }
  });

  return buildSummary(updated);
}
