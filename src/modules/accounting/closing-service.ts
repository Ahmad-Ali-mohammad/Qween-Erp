import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';
import { emitAccountingEvent } from './events';

export async function evaluateMonthClose(periodId: number) {
  const period = await prisma.accountingPeriod.findUnique({
    where: { id: periodId },
    include: { fiscalYear: true }
  });

  if (!period) throw Errors.notFound('الفترة المحاسبية غير موجودة');

  const [entries, unreconciledBankTransactions, pendingTaxDeclarations] = await Promise.all([
    prisma.journalEntry.findMany({
      where: { periodId },
      select: { id: true, entryNumber: true, status: true, totalDebit: true, totalCredit: true }
    }),
    prisma.bankTransaction.count({
      where: {
        date: { gte: period.startDate, lte: period.endDate },
        isReconciled: false
      }
    }),
    prisma.taxDeclaration.count({
      where: {
        periodStart: { lte: period.endDate },
        periodEnd: { gte: period.startDate },
        status: { in: ['DRAFT'] }
      }
    })
  ]);

  const draftEntries = entries.filter((row) => row.status === 'DRAFT').length;
  const pendingEntries = entries.filter((row) => row.status === 'PENDING').length;
  const unbalancedPostedEntries = entries
    .filter((row) => row.status === 'POSTED')
    .filter((row) => Math.abs(Number(row.totalDebit) - Number(row.totalCredit)) > 0.01)
    .map((row) => ({ id: row.id, entryNumber: row.entryNumber }));

  const issues: string[] = [];
  if (period.status !== 'OPEN' || !period.canPost) issues.push('الفترة ليست مفتوحة');
  if (period.fiscalYear.status !== 'OPEN') issues.push('السنة المالية مرتبطة بفترة غير مفتوحة');
  if (draftEntries > 0) issues.push(`يوجد ${draftEntries} قيود مسودة`);
  if (pendingEntries > 0) issues.push(`يوجد ${pendingEntries} قيود قيد الانتظار`);
  if (unbalancedPostedEntries.length > 0) issues.push(`يوجد ${unbalancedPostedEntries.length} قيود مرحلة غير متوازنة`);
  if (unreconciledBankTransactions > 0) issues.push(`يوجد ${unreconciledBankTransactions} حركات بنكية غير مسواة`);
  if (pendingTaxDeclarations > 0) issues.push(`يوجد ${pendingTaxDeclarations} إقرارات ضريبية غير مكتملة`);

  return {
    period: {
      id: period.id,
      number: period.number,
      name: period.name,
      startDate: period.startDate,
      endDate: period.endDate,
      fiscalYear: period.fiscalYear.name,
      status: period.status
    },
    checks: {
      draftEntries,
      pendingEntries,
      unreconciledBankTransactions,
      pendingTaxDeclarations,
      unbalancedPostedEntries
    },
    canClose: issues.length === 0,
    issues
  };
}

export async function closeMonth(periodId: number, userId: number) {
  const validation = await evaluateMonthClose(periodId);
  if (!validation.canClose) {
    throw Errors.business('تعذر إقفال الشهر', validation);
  }

  const period = await prisma.$transaction(async (tx) => {
    const updated = await tx.accountingPeriod.update({
      where: { id: periodId },
      data: {
        status: 'CLOSED',
        canPost: false,
        closedAt: new Date(),
        closedBy: userId
      }
    });

    await tx.auditLog.create({
      data: {
        userId,
        table: 'accounting_periods',
        recordId: periodId,
        action: 'MONTH_CLOSE',
        newValue: validation
      }
    });

    return updated;
  });

  emitAccountingEvent('period.month_closed', {
    recordId: periodId,
    userId,
    periodNumber: validation.period.number,
    fiscalYear: validation.period.fiscalYear
  });

  return {
    period,
    validation,
    message: 'تم إقفال الشهر بنجاح'
  };
}
