import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { parseDateOrThrow } from '../../utils/date';
import { buildSequentialNumberFromLatest } from '../../utils/id-generator';
import { Errors } from '../../utils/response';
import { applyLedgerLines } from '../shared/ledger';

function ensureBalanced(lines: Array<{ debit: number; credit: number }>): { debit: number; credit: number } {
  const debit = lines.reduce((sum, l) => sum + Number(l.debit), 0);
  const credit = lines.reduce((sum, l) => sum + Number(l.credit), 0);
  if (Math.abs(debit - credit) > 0.01) {
    throw Errors.business(`القيد غير متوازن: المدين ${debit} والدائن ${credit}`);
  }
  return { debit, credit };
}

async function resolvePeriod(date: Date) {
  const period = await prisma.accountingPeriod.findFirst({
    where: { startDate: { lte: date }, endDate: { gte: date } },
    include: { fiscalYear: true }
  });

  if (!period) throw Errors.business('لا توجد فترة محاسبية لهذا التاريخ');
  if (period.fiscalYear.status !== 'OPEN') throw Errors.business('السنة المالية مغلقة');
  if (period.status !== 'OPEN' || !period.canPost) throw Errors.business('الفترة المحاسبية مغلقة');

  return period;
}

async function nextEntryNumber(date: Date) {
  const year = date.getUTCFullYear();
  const latest = await prisma.journalEntry.findFirst({
    where: {
      entryNumber: {
        startsWith: `JE-${year}-`
      }
    },
    select: { entryNumber: true },
    orderBy: { entryNumber: 'desc' }
  });
  return buildSequentialNumberFromLatest('JE', latest?.entryNumber, year);
}

export async function createEntry(data: any, userId: number) {
  const date = parseDateOrThrow(data.date, 'date');
  const totals = ensureBalanced(data.lines);
  const period = await resolvePeriod(date);

  const accountIds = data.lines.map((l: any) => l.accountId);
  const accounts = await prisma.account.findMany({ where: { id: { in: accountIds } } });
  if (accounts.length !== accountIds.length) throw Errors.validation('بعض الحسابات غير موجودة');
  const blocked = accounts.filter((a) => !a.allowPosting);
  if (blocked.length) throw Errors.business(`حسابات لا تسمح بالترحيل المباشر: ${blocked.map((b) => b.code).join(', ')}`);

  const entryNumber = await nextEntryNumber(date);

  return prisma.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({
      data: {
        entryNumber,
        date,
        periodId: period.id,
        description: data.description,
        reference: data.reference,
        source: data.source ?? 'MANUAL',
        status: 'DRAFT',
        totalDebit: totals.debit,
        totalCredit: totals.credit,
        createdById: userId
      }
    });

    await tx.journalLine.createMany({
      data: data.lines.map((line: any, index: number) => ({
        entryId: entry.id,
        lineNumber: index + 1,
        accountId: line.accountId,
        description: line.description,
        debit: line.debit,
        credit: line.credit,
        projectId: line.projectId,
        departmentId: line.departmentId,
        costCenterId: line.costCenterId
      }))
    });

    return entry;
  });
}

export async function postEntry(entryId: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.journalEntry.findUnique({
      where: { id: entryId },
      include: { lines: true, period: true }
    });

    if (!entry) throw Errors.notFound('القيد غير موجود');
    if (entry.status !== 'DRAFT') throw Errors.business('يمكن ترحيل المسودات فقط');
    if (!entry.period || entry.period.status !== 'OPEN' || !entry.period.canPost) throw Errors.business('الفترة المحاسبية مغلقة');

    const totals = ensureBalanced(entry.lines.map((l) => ({ debit: Number(l.debit), credit: Number(l.credit) })));
    if (Math.abs(Number(entry.totalDebit) - totals.debit) > 0.01 || Math.abs(Number(entry.totalCredit) - totals.credit) > 0.01) {
      throw Errors.business('إجماليات القيد لا تطابق الأسطر');
    }

    const posted = await tx.journalEntry.update({
      where: { id: entryId },
      data: {
        status: 'POSTED',
        postedById: userId,
        postedAt: new Date()
      },
      include: { lines: true, period: true }
    });

    await applyLedgerLines(tx, posted.date, posted.period?.number ?? posted.date.getUTCMonth() + 1, posted.lines.map((l) => ({
      accountId: l.accountId,
      debit: l.debit,
      credit: l.credit
    })));

    return posted;
  });
}

export async function reverseEntry(entryId: number, userId: number, reversalDate?: string, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const original = await tx.journalEntry.findUnique({
      where: { id: entryId },
      include: { lines: true, period: true }
    });

    if (!original) throw Errors.notFound('القيد غير موجود');
    if (original.status !== 'POSTED') throw Errors.business('يمكن عكس القيد المرحل فقط');

    const reverseAt = reversalDate ? parseDateOrThrow(reversalDate, 'reversalDate') : new Date();
    const period = await tx.accountingPeriod.findFirst({
      where: { startDate: { lte: reverseAt }, endDate: { gte: reverseAt }, status: 'OPEN', canPost: true },
      include: { fiscalYear: true }
    });
    if (!period || period.fiscalYear.status !== 'OPEN') throw Errors.business('لا يمكن العكس في فترة مغلقة');

    const reverseYear = reverseAt.getUTCFullYear();
    const latest = await tx.journalEntry.findFirst({
      where: {
        entryNumber: {
          startsWith: `REV-${reverseYear}-`
        }
      },
      select: { entryNumber: true },
      orderBy: { entryNumber: 'desc' }
    });
    const entryNumber = buildSequentialNumberFromLatest('REV', latest?.entryNumber, reverseYear);

    const reversal = await tx.journalEntry.create({
      data: {
        entryNumber,
        date: reverseAt,
        periodId: period.id,
        description: `عكس ${original.entryNumber}${reason ? ` - ${reason}` : ''}`,
        reference: `REV-${original.entryNumber}`,
        source: 'REVERSAL',
        status: 'POSTED',
        totalDebit: original.totalCredit,
        totalCredit: original.totalDebit,
        createdById: userId,
        postedById: userId,
        postedAt: new Date()
      }
    });

    const reversedLines = original.lines.map((line, i) => ({
      entryId: reversal.id,
      lineNumber: i + 1,
      accountId: line.accountId,
      description: `عكس ${line.description ?? ''}`,
      debit: line.credit,
      credit: line.debit,
      projectId: line.projectId,
      departmentId: line.departmentId,
      costCenterId: line.costCenterId
    }));

    await tx.journalLine.createMany({ data: reversedLines });

    await tx.journalEntry.update({ where: { id: original.id }, data: { status: 'REVERSED' } });

    await applyLedgerLines(tx, reverseAt, period.number, reversedLines.map((l) => ({
      accountId: l.accountId,
      debit: l.debit as any,
      credit: l.credit as any
    })));

    return reversal;
  });
}

export async function listEntries(query: any) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  const skip = (page - 1) * limit;

  const where: Prisma.JournalEntryWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.dateFrom || query.dateTo) {
    where.date = {};
    if (query.dateFrom) where.date.gte = parseDateOrThrow(String(query.dateFrom), 'dateFrom');
    if (query.dateTo) where.date.lte = parseDateOrThrow(String(query.dateTo), 'dateTo');
  }

  const [rows, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      skip,
      take: limit,
      include: { createdBy: true, postedBy: true, lines: true },
      orderBy: [{ date: 'desc' }, { id: 'desc' }]
    }),
    prisma.journalEntry.count({ where })
  ]);

  return {
    rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit))
    }
  };
}

export async function deleteDraft(id: number) {
  const entry = await prisma.journalEntry.findUnique({ where: { id } });
  if (!entry) throw Errors.notFound('القيد غير موجود');
  if (entry.status !== 'DRAFT') throw Errors.business('لا يمكن حذف قيد مرحل أو غير مسودة');
  await prisma.journalEntry.delete({ where: { id } });
  return { deleted: true, id };
}

export async function updateDraftEntry(id: number, data: any) {
  const existing = await prisma.journalEntry.findUnique({ where: { id }, include: { lines: true } });
  if (!existing) throw Errors.notFound('القيد غير موجود');
  if (existing.status !== 'DRAFT') throw Errors.business('يمكن تعديل المسودة فقط');

  const mergedLines = data.lines ?? existing.lines.map((line) => ({
    accountId: line.accountId,
    description: line.description,
    debit: Number(line.debit),
    credit: Number(line.credit),
    projectId: line.projectId,
    departmentId: line.departmentId,
    costCenterId: line.costCenterId
  }));

  const totals = ensureBalanced(mergedLines);
  const date = data.date ? parseDateOrThrow(data.date, 'date') : existing.date;
  const period = await resolvePeriod(date);

  return prisma.$transaction(async (tx) => {
    const entry = await tx.journalEntry.update({
      where: { id },
      data: {
        date,
        periodId: period.id,
        description: data.description ?? existing.description,
        reference: data.reference ?? existing.reference,
        source: data.source ?? existing.source,
        totalDebit: totals.debit,
        totalCredit: totals.credit
      }
    });

    if (data.lines) {
      await tx.journalLine.deleteMany({ where: { entryId: id } });
      await tx.journalLine.createMany({
        data: mergedLines.map((line: any, index: number) => ({
          entryId: id,
          lineNumber: index + 1,
          accountId: line.accountId,
          description: line.description,
          debit: line.debit,
          credit: line.credit,
          projectId: line.projectId,
          departmentId: line.departmentId,
          costCenterId: line.costCenterId
        }))
      });
    }

    return entry;
  });
}

export async function voidEntry(id: number, reason?: string) {
  const entry = await prisma.journalEntry.findUnique({ where: { id } });
  if (!entry) throw Errors.notFound('القيد غير موجود');
  if (entry.status === 'POSTED') throw Errors.business('القيد المرحل لا يُلغى مباشرة، استخدم العكس');
  if (entry.status === 'REVERSED') throw Errors.business('لا يمكن إلغاء قيد معكوس');

  return prisma.journalEntry.update({
    where: { id },
    data: {
      status: 'VOID',
      notes: reason ? `${entry.notes ?? ''}\nإلغاء: ${reason}`.trim() : entry.notes
    }
  });
}

export async function bulkPostEntries(entryIds: number[], userId: number) {
  const posted: number[] = [];
  const failed: Array<{ id: number; reason: string }> = [];

  for (const id of entryIds) {
    try {
      await postEntry(id, userId);
      posted.push(id);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'تعذر ترحيل القيد';
      failed.push({ id, reason });
    }
  }

  return {
    requested: entryIds.length,
    postedCount: posted.length,
    failedCount: failed.length,
    posted,
    failed
  };
}
