import { Prisma, SequenceResetPolicy } from '@prisma/client';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { parseDateOrThrow } from '../../utils/date';
import { Errors } from '../../utils/response';

type NumberingDb = Prisma.TransactionClient | typeof prisma;

type SequenceParams = {
  documentType: string;
  branchId?: number | null;
  resetPolicy?: SequenceResetPolicy;
  prefix?: string | null;
  width?: number;
  date?: string | Date;
};

function cleanDocumentType(value: string) {
  const documentType = value.trim().toUpperCase();
  if (!documentType) throw Errors.validation('documentType مطلوب');
  return documentType;
}

function getPeriodParts(dateInput?: string | Date) {
  const date = dateInput ? parseDateOrThrow(dateInput) : new Date();
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: env.appTimezone,
    year: 'numeric',
    month: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value ?? date.getUTCFullYear());
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? date.getUTCMonth() + 1);

  return { date, year, month };
}

function scopeSuffix(policy: SequenceResetPolicy, year: number, month: number) {
  if (policy === 'NEVER') return 'GLOBAL';
  if (policy === 'YEARLY') return String(year);
  return `${year}${String(month).padStart(2, '0')}`;
}

function buildScopeKey(documentType: string, branchId: number | null | undefined, policy: SequenceResetPolicy, year: number, month: number) {
  return `${documentType}:${branchId ?? 'GLOBAL'}:${scopeSuffix(policy, year, month)}`;
}

function buildFormattedNumber(prefix: string, currentValue: number, width: number) {
  return `${prefix}${String(currentValue).padStart(width, '0')}`;
}

async function loadBranch(db: NumberingDb, branchId?: number | null) {
  if (!branchId) return null;
  const branch = await db.branch.findUnique({
    where: { id: branchId },
    select: { id: true, code: true, numberingPrefix: true, currencyCode: true }
  });
  if (!branch) throw Errors.validation('الفرع غير موجود');
  return branch;
}

function defaultPrefix(
  documentType: string,
  branch: { code: string; numberingPrefix: string | null } | null,
  policy: SequenceResetPolicy,
  year: number,
  month: number
) {
  const parts = [documentType];
  if (branch?.numberingPrefix) parts.push(branch.numberingPrefix);
  else if (branch?.code) parts.push(branch.code);
  parts.push(String(year));
  if (policy === 'MONTHLY') parts.push(String(month).padStart(2, '0'));
  return `${parts.join('-')}-`;
}

function toSequenceRecord(
  sequence: {
    id: number;
    scopeKey: string;
    documentType: string;
    branchId: number | null;
    resetPolicy: SequenceResetPolicy;
    sequenceYear: number | null;
    sequenceMonth: number | null;
    prefix: string | null;
    width: number;
    currentValue: number;
    lastGeneratedAt: Date | null;
  },
  previewValue?: number
) {
  const nextValue = previewValue ?? sequence.currentValue + 1;
  return {
    ...sequence,
    nextValue,
    previewNumber: buildFormattedNumber(sequence.prefix ?? '', nextValue, sequence.width)
  };
}

export async function listNumberSequences(filters: { documentType?: string; branchId?: number }) {
  return prisma.numberSequence.findMany({
    where: {
      ...(filters.documentType ? { documentType: cleanDocumentType(filters.documentType) } : {}),
      ...(filters.branchId ? { branchId: filters.branchId } : {})
    },
    include: {
      branch: { select: { id: true, code: true, nameAr: true } }
    },
    orderBy: [{ documentType: 'asc' }, { branchId: 'asc' }, { scopeKey: 'asc' }]
  });
}

export async function upsertNumberSequence(params: SequenceParams & { currentValue?: number }) {
  const documentType = cleanDocumentType(params.documentType);
  const policy = params.resetPolicy ?? 'MONTHLY';
  const { year, month } = getPeriodParts(params.date);

  return prisma.$transaction(async (tx) => {
    const branch = await loadBranch(tx, params.branchId);
    const scopeKey = buildScopeKey(documentType, params.branchId, policy, year, month);
    const prefix = params.prefix ?? defaultPrefix(documentType, branch, policy, year, month);
    const sequence = await tx.numberSequence.upsert({
      where: { scopeKey },
      update: {
        documentType,
        branchId: params.branchId ?? null,
        resetPolicy: policy,
        sequenceYear: policy === 'NEVER' ? null : year,
        sequenceMonth: policy === 'MONTHLY' ? month : null,
        prefix,
        width: params.width ?? 5,
        ...(params.currentValue !== undefined ? { currentValue: params.currentValue } : {})
      },
      create: {
        scopeKey,
        documentType,
        branchId: params.branchId ?? null,
        resetPolicy: policy,
        sequenceYear: policy === 'NEVER' ? null : year,
        sequenceMonth: policy === 'MONTHLY' ? month : null,
        prefix,
        width: params.width ?? 5,
        currentValue: params.currentValue ?? 0
      }
    });

    return toSequenceRecord(sequence);
  });
}

export async function previewNextSequence(params: SequenceParams) {
  const documentType = cleanDocumentType(params.documentType);
  const policy = params.resetPolicy ?? 'MONTHLY';
  const { year, month } = getPeriodParts(params.date);
  const branch = await loadBranch(prisma, params.branchId);
  const scopeKey = buildScopeKey(documentType, params.branchId, policy, year, month);

  const existing = await prisma.numberSequence.findUnique({ where: { scopeKey } });
  if (existing) return toSequenceRecord(existing);

  const prefix = params.prefix ?? defaultPrefix(documentType, branch, policy, year, month);
  return {
    id: null,
    scopeKey,
    documentType,
    branchId: params.branchId ?? null,
    resetPolicy: policy,
    sequenceYear: policy === 'NEVER' ? null : year,
    sequenceMonth: policy === 'MONTHLY' ? month : null,
    prefix,
    width: params.width ?? 5,
    currentValue: 0,
    lastGeneratedAt: null,
    nextValue: 1,
    previewNumber: buildFormattedNumber(prefix, 1, params.width ?? 5)
  };
}

export async function reserveNextSequenceInDb(db: NumberingDb, params: SequenceParams) {
  const documentType = cleanDocumentType(params.documentType);
  const policy = params.resetPolicy ?? 'MONTHLY';
  const { date, year, month } = getPeriodParts(params.date);

  const branch = await loadBranch(db, params.branchId);
  const scopeKey = buildScopeKey(documentType, params.branchId, policy, year, month);
  const existing = await db.numberSequence.findUnique({ where: { scopeKey } });

  const sequence =
    existing === null
      ? await db.numberSequence.create({
          data: {
            scopeKey,
            documentType,
            branchId: params.branchId ?? null,
            resetPolicy: policy,
            sequenceYear: policy === 'NEVER' ? null : year,
            sequenceMonth: policy === 'MONTHLY' ? month : null,
            prefix: params.prefix ?? defaultPrefix(documentType, branch, policy, year, month),
            width: params.width ?? 5,
            currentValue: 1,
            lastGeneratedAt: date
          }
        })
      : await db.numberSequence.update({
          where: { id: existing.id },
          data: {
            currentValue: { increment: 1 },
            lastGeneratedAt: date,
            ...(params.prefix !== undefined ? { prefix: params.prefix } : {}),
            ...(params.width !== undefined ? { width: params.width } : {})
          }
        });

  const prefix = sequence.prefix ?? defaultPrefix(documentType, branch, policy, year, month);
  const width = params.width ?? sequence.width;

  return {
    scopeKey,
    documentType,
    branchId: params.branchId ?? null,
    resetPolicy: policy,
    sequenceYear: sequence.sequenceYear,
    sequenceMonth: sequence.sequenceMonth,
    currentValue: sequence.currentValue,
    prefix,
    width,
    number: buildFormattedNumber(prefix, sequence.currentValue, width),
    lastGeneratedAt: sequence.lastGeneratedAt
  };
}

export async function reserveNextSequence(params: SequenceParams) {
  return prisma.$transaction((tx) => reserveNextSequenceInDb(tx, params));
}
