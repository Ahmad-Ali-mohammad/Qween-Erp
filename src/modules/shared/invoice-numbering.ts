import { Prisma } from '@prisma/client';

const MAX_INVOICE_NUMBER_RETRIES = 5;

type InvoiceType = 'SALES' | 'PURCHASE';

function parseSequence(prefix: string, number: string | null | undefined) {
  if (!number || !number.startsWith(prefix)) return 0;
  const parsed = Number.parseInt(number.slice(prefix.length), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

export function buildInvoiceSequencePrefix(type: InvoiceType, docDate: Date) {
  const year = docDate.getUTCFullYear();
  const month = String(docDate.getUTCMonth() + 1).padStart(2, '0');
  const basePrefix = type === 'SALES' ? 'INV' : 'PINV';
  return `${basePrefix}-${year}-${month}-`;
}

export async function generateNextInvoiceNumber(tx: Prisma.TransactionClient, type: InvoiceType, docDate: Date) {
  const prefix = buildInvoiceSequencePrefix(type, docDate);
  const latest = await tx.invoice.findFirst({
    where: {
      type,
      number: { startsWith: prefix }
    },
    select: { number: true },
    orderBy: { number: 'desc' }
  });

  const nextSequence = parseSequence(prefix, latest?.number) + 1;
  return `${prefix}${String(nextSequence).padStart(5, '0')}`;
}

export function invoiceNumberMatches(type: InvoiceType, docDate: Date, number: string | null | undefined) {
  return typeof number === 'string' && number.startsWith(buildInvoiceSequencePrefix(type, docDate));
}

function isInvoiceNumberConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }

  const rawTarget = error.meta?.target;
  const targets = Array.isArray(rawTarget) ? rawTarget.map(String) : [String(rawTarget ?? '')];
  return targets.includes('number');
}

export async function withInvoiceNumberRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_INVOICE_NUMBER_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isInvoiceNumberConflict(error) || attempt === MAX_INVOICE_NUMBER_RETRIES - 1) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('تعذر توليد رقم فاتورة فريد');
}
