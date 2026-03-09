import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { buildSequentialNumberFromLatest } from '../../utils/id-generator';
import { Errors } from '../../utils/response';
import { applyLedgerLines } from '../shared/ledger';
import { resolvePostingAccounts } from '../shared/posting-accounts';

type DepreciationRunInput = {
  fiscalYear: number;
  period: number;
  userId: number;
  description?: string;
};

function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function runDepreciation(input: DepreciationRunInput) {
  const fiscalYear = Number(input.fiscalYear);
  const period = Number(input.period);
  if (!Number.isInteger(fiscalYear) || fiscalYear <= 0) throw Errors.validation('fiscalYear غير صالح');
  if (!Number.isInteger(period) || period < 1 || period > 12) throw Errors.validation('period غير صالح');

  return prisma.$transaction(async (tx) => {
    const postingPeriod = await tx.accountingPeriod.findFirst({
      where: {
        number: period,
        status: 'OPEN',
        canPost: true,
        fiscalYear: {
          status: 'OPEN',
          startDate: {
            gte: new Date(Date.UTC(fiscalYear, 0, 1)),
            lt: new Date(Date.UTC(fiscalYear + 1, 0, 1))
          }
        }
      },
      include: { fiscalYear: true },
      orderBy: [{ fiscalYearId: 'desc' }, { id: 'desc' }]
    });

    if (!postingPeriod) throw Errors.business('لا توجد فترة محاسبية مفتوحة لفترة الإهلاك المطلوبة');

    const reference = `DEP-${fiscalYear}-${String(period).padStart(2, '0')}`;
    const existing = await tx.journalEntry.findFirst({
      where: { reference, status: 'POSTED' },
      orderBy: { id: 'desc' }
    });

    if (existing) {
      return {
        duplicate: true,
        fiscalYear,
        period,
        journalEntryId: existing.id,
        journalEntryNumber: existing.entryNumber,
        summary: {
          evaluatedAssets: 0,
          createdSchedules: 0,
          skippedSchedules: 0,
          failedAssets: 0,
          totalExpense: 0
        },
        results: []
      };
    }

    const postingAccounts = await resolvePostingAccounts(tx as any);
    const assets = await tx.fixedAsset.findMany({
      where: { isDepreciating: true, status: 'ACTIVE' },
      include: { category: true }
    });

    const lineAccumulator = new Map<number, { debit: number; credit: number; description: string }>();
    const results: Array<Record<string, unknown>> = [];
    let createdSchedules = 0;
    let skippedSchedules = 0;
    let failedAssets = 0;
    let totalExpense = 0;

    for (const asset of assets) {
      try {
        const exists = await tx.depreciationSchedule.findUnique({
          where: { assetId_fiscalYear_period: { assetId: asset.id, fiscalYear, period } }
        });

        if (exists) {
          skippedSchedules += 1;
          results.push({ assetId: asset.id, skipped: true, reason: 'already_exists' });
          continue;
        }

        const usefulLife = Number(asset.usefulLifeMonths ?? asset.category.usefulLifeMonths ?? 0);
        if (!Number.isFinite(usefulLife) || usefulLife <= 0) {
          failedAssets += 1;
          results.push({ assetId: asset.id, success: false, reason: 'invalid_useful_life' });
          continue;
        }

        const purchaseCost = Number(asset.purchaseCost);
        const salvageValue = Number(asset.salvageValue ?? 0);
        const opening = Number(asset.netBookValue);
        const monthlyRaw = (purchaseCost - salvageValue) / usefulLife;
        const monthly = roundAmount(Math.max(0, monthlyRaw));
        const expense = roundAmount(Math.min(monthly, Math.max(0, opening)));

        if (expense <= 0) {
          skippedSchedules += 1;
          results.push({ assetId: asset.id, skipped: true, reason: 'no_expense' });
          continue;
        }

        const accumulated = roundAmount(Number(asset.accumulatedDepreciation) + expense);
        const closing = roundAmount(Math.max(0, opening - expense));

        await tx.depreciationSchedule.create({
          data: {
            assetId: asset.id,
            fiscalYear,
            period,
            openingNBV: opening,
            expense,
            accumulated,
            closingNBV: closing,
            status: 'POSTED'
          }
        });

        await tx.fixedAsset.update({
          where: { id: asset.id },
          data: {
            accumulatedDepreciation: accumulated,
            netBookValue: closing,
            lastDepreciationDate: postingPeriod.endDate
          }
        });

        const expenseAccountId = Number(asset.category.glExpenseId ?? postingAccounts.purchaseExpenseAccountId);
        const accumulatedAccountId = Number(asset.category.glAccumulatedId ?? postingAccounts.payableAccountId);

        const addLine = (accountId: number, debit: number, credit: number, description: string) => {
          const current = lineAccumulator.get(accountId) ?? { debit: 0, credit: 0, description };
          current.debit = roundAmount(current.debit + debit);
          current.credit = roundAmount(current.credit + credit);
          if (!current.description) current.description = description;
          lineAccumulator.set(accountId, current);
        };

        addLine(expenseAccountId, expense, 0, `مصروف إهلاك ${fiscalYear}-${String(period).padStart(2, '0')}`);
        addLine(accumulatedAccountId, 0, expense, `مجمع إهلاك ${fiscalYear}-${String(period).padStart(2, '0')}`);

        createdSchedules += 1;
        totalExpense = roundAmount(totalExpense + expense);
        results.push({ assetId: asset.id, success: true, expense, closingNBV: closing });
      } catch (error: any) {
        failedAssets += 1;
        results.push({ assetId: asset.id, success: false, error: error?.message ?? 'depreciation_failed' });
      }
    }

    const entryLines = Array.from(lineAccumulator.entries())
      .map(([accountId, value]) => ({
        accountId,
        debit: roundAmount(value.debit),
        credit: roundAmount(value.credit),
        description: value.description
      }))
      .filter((l) => l.debit > 0 || l.credit > 0);

    const totalDebit = roundAmount(entryLines.reduce((sum, l) => sum + l.debit, 0));
    const totalCredit = roundAmount(entryLines.reduce((sum, l) => sum + l.credit, 0));
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw Errors.business('تعذر ترحيل قيد الإهلاك بسبب عدم توازن القيد');
    }

    let journalEntryId: number | null = null;
    let journalEntryNumber: string | null = null;
    if (entryLines.length > 0) {
      const year = postingPeriod.endDate.getUTCFullYear();
      const latest = await tx.journalEntry.findFirst({
        where: { entryNumber: { startsWith: `DEP-${year}-` } },
        select: { entryNumber: true },
        orderBy: { entryNumber: 'desc' }
      });
      const entryNumber = buildSequentialNumberFromLatest('DEP', latest?.entryNumber, year);
      const entry = await tx.journalEntry.create({
        data: {
          entryNumber,
          date: postingPeriod.endDate,
          periodId: postingPeriod.id,
          description: input.description ?? `ترحيل إهلاك الفترة ${fiscalYear}-${String(period).padStart(2, '0')}`,
          reference,
          source: 'ASSETS',
          status: 'POSTED',
          totalDebit,
          totalCredit,
          createdById: input.userId,
          postedById: input.userId,
          postedAt: new Date(),
          lines: {
            create: entryLines.map((line, idx) => ({
              lineNumber: idx + 1,
              accountId: line.accountId,
              debit: line.debit,
              credit: line.credit,
              description: line.description
            }))
          }
        }
      });

      await applyLedgerLines(
        tx as unknown as Prisma.TransactionClient,
        postingPeriod.endDate,
        postingPeriod.number,
        entryLines.map((line) => ({
          accountId: line.accountId,
          debit: line.debit,
          credit: line.credit
        }))
      );

      journalEntryId = entry.id;
      journalEntryNumber = entry.entryNumber;
    }

    return {
      duplicate: false,
      fiscalYear,
      period,
      journalEntryId,
      journalEntryNumber,
      summary: {
        evaluatedAssets: assets.length,
        createdSchedules,
        skippedSchedules,
        failedAssets,
        totalExpense
      },
      results
    };
  }, {
    maxWait: 10000,
    timeout: 60000
  });
}
