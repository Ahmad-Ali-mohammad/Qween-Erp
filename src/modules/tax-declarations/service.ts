import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { parseDateOrThrow } from '../../utils/date';
import { buildSequentialNumber } from '../../utils/id-generator';
import { Errors } from '../../utils/response';
import { applyLedgerLines } from '../shared/ledger';
import { resolvePostingAccounts } from '../shared/posting-accounts';

type SubmitDeclarationInput = {
  declarationId: number;
  userId: number;
  filedDate?: string;
  filedReference?: string;
};

type PayDeclarationInput = {
  declarationId: number;
  userId: number;
  paidDate?: string;
  paidReference?: string;
  cashAccountId?: number;
};

function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

function parsePositiveInt(value: unknown, fieldName: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw Errors.validation(`${fieldName} غير صالح`);
  return n;
}

async function findOpenPostingPeriod(tx: Prisma.TransactionClient, date: Date) {
  const period = await tx.accountingPeriod.findFirst({
    where: {
      startDate: { lte: date },
      endDate: { gte: date },
      status: 'OPEN',
      canPost: true,
      fiscalYear: { status: 'OPEN' }
    },
    include: { fiscalYear: true },
    orderBy: [{ fiscalYearId: 'desc' }, { number: 'asc' }]
  });
  if (!period) throw Errors.business('لا توجد فترة محاسبية مفتوحة بتاريخ السداد');
  return period;
}

export async function submitDeclaration(input: SubmitDeclarationInput) {
  const declarationId = parsePositiveInt(input.declarationId, 'declarationId');

  return prisma.$transaction(async (tx) => {
    const declaration = await tx.taxDeclaration.findUnique({ where: { id: declarationId } });
    if (!declaration) throw Errors.notFound('الإقرار الضريبي غير موجود');
    if (declaration.status === 'PAID') throw Errors.business('لا يمكن تقديم إقرار مدفوع');
    if (declaration.status === 'FILED') {
      return {
        duplicate: true,
        declaration
      };
    }
    if (declaration.status !== 'DRAFT') throw Errors.business('الحالة الحالية لا تسمح بتقديم الإقرار');

    const filedDate = input.filedDate ? parseDateOrThrow(input.filedDate, 'filedDate') : new Date();
    const filedReference = String(input.filedReference ?? `FILED-${declarationId}`).trim() || `FILED-${declarationId}`;

    const updated = await tx.taxDeclaration.update({
      where: { id: declarationId },
      data: {
        status: 'FILED',
        filedDate,
        filedReference,
        notes: declaration.notes
          ? `${declaration.notes}\nFiled by user ${input.userId} at ${filedDate.toISOString()}`
          : `Filed by user ${input.userId} at ${filedDate.toISOString()}`
      }
    });

    return {
      duplicate: false,
      declaration: updated
    };
  });
}

export async function payDeclaration(input: PayDeclarationInput) {
  const declarationId = parsePositiveInt(input.declarationId, 'declarationId');

  return prisma.$transaction(async (tx) => {
    const declaration = await tx.taxDeclaration.findUnique({ where: { id: declarationId } });
    if (!declaration) throw Errors.notFound('الإقرار الضريبي غير موجود');
    if (declaration.status !== 'FILED' && declaration.status !== 'PAID') {
      throw Errors.business('يجب تقديم الإقرار قبل تسجيل السداد');
    }

    if (declaration.status === 'PAID') {
      const existing = await tx.journalEntry.findFirst({
        where: { reference: `TAX-DECL-PAY-${declarationId}`, status: 'POSTED' },
        orderBy: { id: 'desc' }
      });
      return {
        duplicate: true,
        declaration,
        journalEntryId: existing?.id ?? null,
        journalEntryNumber: existing?.entryNumber ?? null
      };
    }

    const payable = roundAmount(
      Number(declaration.netPayable ?? 0) || roundAmount(Number(declaration.outputTax) - Number(declaration.inputTax))
    );
    if (payable <= 0) throw Errors.business('صافي الضريبة المستحقة يجب أن يكون أكبر من صفر');

    const paidDate = input.paidDate ? parseDateOrThrow(input.paidDate, 'paidDate') : new Date();
    const period = await findOpenPostingPeriod(tx, paidDate);
    const postingAccounts = await resolvePostingAccounts(tx as any);

    const cashAccountId = input.cashAccountId ? parsePositiveInt(input.cashAccountId, 'cashAccountId') : postingAccounts.cashAccountId;
    if (input.cashAccountId) {
      const cashAccount = await tx.account.findUnique({ where: { id: cashAccountId } });
      if (!cashAccount || !cashAccount.isActive || !cashAccount.allowPosting) {
        throw Errors.business('حساب السداد غير صالح للترحيل');
      }
    }

    const liabilityAccountId = postingAccounts.vatLiabilityAccountId;
    const reference = `TAX-DECL-PAY-${declarationId}`;
    const existing = await tx.journalEntry.findFirst({
      where: { reference, status: 'POSTED' },
      orderBy: { id: 'desc' }
    });

    let entry = existing;
    if (!entry) {
      const year = paidDate.getUTCFullYear();
      const count = await tx.journalEntry.count({ where: { entryNumber: { startsWith: `TAX-${year}-` } } });
      const entryNumber = buildSequentialNumber('TAX', count, year);
      const lines = [
        {
          lineNumber: 1,
          accountId: liabilityAccountId,
          debit: payable,
          credit: 0,
          description: `سداد إقرار ضريبي رقم ${declarationId}`
        },
        {
          lineNumber: 2,
          accountId: cashAccountId,
          debit: 0,
          credit: payable,
          description: `سداد نقدي/بنكي لإقرار ضريبي رقم ${declarationId}`
        }
      ];

      entry = await tx.journalEntry.create({
        data: {
          entryNumber,
          date: paidDate,
          periodId: period.id,
          description: `سداد الإقرار الضريبي رقم ${declarationId}`,
          reference,
          source: 'MANUAL',
          status: 'POSTED',
          totalDebit: payable,
          totalCredit: payable,
          createdById: input.userId,
          postedById: input.userId,
          postedAt: new Date(),
          lines: { create: lines }
        }
      });

      await applyLedgerLines(
        tx as unknown as Prisma.TransactionClient,
        paidDate,
        period.number,
        [
          { accountId: liabilityAccountId, debit: payable, credit: 0 },
          { accountId: cashAccountId, debit: 0, credit: payable }
        ]
      );
    }

    const paidReference = String(input.paidReference ?? `PAID-${declarationId}`).trim() || `PAID-${declarationId}`;
    const updated = await tx.taxDeclaration.update({
      where: { id: declarationId },
      data: {
        status: 'PAID',
        paidDate,
        paidReference,
        notes: declaration.notes
          ? `${declaration.notes}\nPaid by user ${input.userId} at ${paidDate.toISOString()}`
          : `Paid by user ${input.userId} at ${paidDate.toISOString()}`
      }
    });

    return {
      duplicate: Boolean(existing),
      declaration: updated,
      journalEntryId: entry.id,
      journalEntryNumber: entry.entryNumber
    };
  });
}
