import { qw } from '../../utils/where';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { buildSequentialNumberFromLatest } from '../../utils/id-generator';
import { Errors } from '../../utils/response';
import { applyLedgerLines } from '../shared/ledger';
import { resolvePostingAccounts } from '../shared/posting-accounts';

type DisposeAssetInput = {
  assetId: number;
  userId: number;
  salePrice?: number;
  reason?: string;
  disposedAt?: string;
  proceedsAccountId?: number;
};

function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseDisposeDate(input?: string): Date {
  const parsed = input ? new Date(String(input)) : new Date();
  if (Number.isNaN(parsed.getTime())) throw Errors.validation('تاريخ الصرف غير صالح');
  return parsed;
}

export async function disposeAsset(input: DisposeAssetInput) {
  if (!Number.isInteger(input.assetId) || input.assetId <= 0) throw Errors.validation('assetId غير صالح');
  if (!Number.isInteger(input.userId) || input.userId <= 0) throw Errors.validation('userId غير صالح');

  const salePriceRaw = Number(input.salePrice ?? 0);
  if (!Number.isFinite(salePriceRaw) || salePriceRaw < 0) throw Errors.validation('سعر البيع غير صالح');
  const salePrice = roundAmount(salePriceRaw);
  const disposedAt = parseDisposeDate(input.disposedAt);

  return prisma.transaction(async (tx) => {{
    const asset = await tx.orm.public.FixedAsset.include('category').first({ id: input.assetId });
    if (!asset) throw Errors.notFound('الأصل غير موجود');
    if (asset.status === 'SOLD' || asset.status === 'SCRAPPED') {
      throw Errors.business('تم صرف الأصل مسبقاً');
    }

    const period = await tx.orm.public.AccountingPeriod.include('fiscalYear').orderBy([(r) => r.fiscalYearId.desc(), (r) => r.id.desc()]).first((r) => qw(r, {
        startDate: { lte: disposedAt },
        endDate: { gte: disposedAt },
        status: 'OPEN',
        canPost: true,
        fiscalYear: { status: 'OPEN' }
      }));
    if (!period) throw Errors.business('لا توجد فترة محاسبية مفتوحة لتسجيل صرف الأصل');

    const reference = `ASSET-DISPOSE-${asset.id}`;
    const existing = await tx.orm.public.JournalEntry.orderBy((r) => r.id.desc()).first({ reference });
    if (existing) throw Errors.business('يوجد قيد صرف سابق لهذا الأصل');

    const postingAccounts = await resolvePostingAccounts(tx as any);
    const assetAccountId = Number(asset.category.glAssetId ?? postingAccounts.inventoryAccountId);
    const accumulatedAccountId = Number(asset.category.glAccumulatedId ?? postingAccounts.payableAccountId);
    const proceedsAccountId = Number(input.proceedsAccountId ?? postingAccounts.cashAccountId);
    const gainAccountId = Number(postingAccounts.stockAdjustmentGainAccountId);
    const lossAccountId = Number(postingAccounts.stockAdjustmentLossAccountId);

    const purchaseCost = roundAmount(Number(asset.purchaseCost));
    const accumulatedDepreciation = roundAmount(Number(asset.accumulatedDepreciation));
    const netBookValue = roundAmount(Number(asset.netBookValue));
    const gainLoss = roundAmount(salePrice - netBookValue);

    const lines: Array<{ accountId: number; debit: number; credit: number; description: string }> = [];
    if (accumulatedDepreciation > 0) {
      lines.push({
        accountId: accumulatedAccountId,
        debit: accumulatedDepreciation,
        credit: 0,
        description: `إقفال مجمع إهلاك الأصل ${asset.code}`
      });
    }
    if (salePrice > 0) {
      lines.push({
        accountId: proceedsAccountId,
        debit: salePrice,
        credit: 0,
        description: `متحصلات بيع الأصل ${asset.code}`
      });
    }
    lines.push({
      accountId: assetAccountId,
      debit: 0,
      credit: purchaseCost,
      description: `إخراج تكلفة الأصل ${asset.code}`
    });
    if (gainLoss > 0) {
      lines.push({
        accountId: gainAccountId,
        debit: 0,
        credit: gainLoss,
        description: `ربح بيع أصل ${asset.code}`
      });
    } else if (gainLoss < 0) {
      lines.push({
        accountId: lossAccountId,
        debit: Math.abs(gainLoss),
        credit: 0,
        description: `خسارة بيع أصل ${asset.code}`
      });
    }

    const totalDebit = roundAmount(lines.reduce((sum, line) => sum + line.debit, 0));
    const totalCredit = roundAmount(lines.reduce((sum, line) => sum + line.credit, 0));
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw Errors.business('قيد صرف الأصل غير متوازن');
    }

    const year = disposedAt.getUTCFullYear();
    const latest = await tx.orm.public.JournalEntry.select('entryNumber').orderBy((r) => r.entryNumber.desc()).first((r) => qw(r, { entryNumber: { startsWith: `DSP-${year}-` } }));
    const entryNumber = buildSequentialNumberFromLatest('DSP', latest?.entryNumber, year);

    const entry = await tx.orm.public.JournalEntry.create({
        entryNumber,
        date: disposedAt,
        periodId: period.id,
        description: `صرف أصل ${asset.code} - ${asset.nameAr}`,
        reference,
        source: 'ASSETS',
        status: 'POSTED',
        totalDebit,
        totalCredit,
        createdById: input.userId,
        postedById: input.userId,
        postedAt: new Date(),
        lines: {
          create: lines.map((line, idx) => ({
            lineNumber: idx + 1,
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
            description: line.description
          }))
        }
      });

    await applyLedgerLines(
      tx as unknown as any,
      disposedAt,
      period.number,
      lines.map((line) => ({
        accountId: line.accountId,
        debit: line.debit,
        credit: line.credit
      }))
    );

    const nextStatus = salePrice > 0 ? 'SOLD' : 'SCRAPPED';
    const reason = String(input.reason ?? '').trim();
    const updatedNotes = [
      asset.notes ?? '',
      `صرف أصل بتاريخ ${disposedAt.toISOString().slice(0, 10)}`,
      reason ? `السبب: ${reason}` : '',
      `سعر البيع: ${salePrice}`,
      `قيد الصرف: ${entry.entryNumber}`
    ]
      .filter(Boolean)
      .join('\n');

    const updatedAsset = await tx.orm.public.FixedAsset.where((r) => qw(r, { id: asset.id })).update({
        status: nextStatus,
        isDepreciating: false,
        netBookValue: 0,
        notes: updatedNotes
      }).then((r0) => r0!);

    return {
      asset: updatedAsset,
      journalEntryId: entry.id,
      journalEntryNumber: entry.entryNumber,
      salePrice,
      netBookValue,
      gainLoss,
      status: nextStatus
    };
  }});
}
