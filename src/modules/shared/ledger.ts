import { Prisma, PrismaClient } from '@prisma/client';
import { decimalToNumber } from '../../utils/decimal';

export type LedgerLineInput = {
  accountId: number;
  debit: number | Prisma.Decimal;
  credit: number | Prisma.Decimal;
};

export async function applyLedgerLines(
  tx: Prisma.TransactionClient | PrismaClient,
  date: Date,
  period: number,
  lines: LedgerLineInput[]
): Promise<void> {
  const fiscalYear = date.getUTCFullYear();

  for (const line of lines) {
    const debit = decimalToNumber(line.debit as any);
    const credit = decimalToNumber(line.credit as any);
    const net = debit - credit;

    await (tx as any).accountBalance.upsert({
      where: {
        accountId_fiscalYear_period: {
          accountId: line.accountId,
          fiscalYear,
          period
        }
      },
      update: {
        debit: { increment: debit },
        credit: { increment: credit },
        closingBalance: { increment: net }
      },
      create: {
        accountId: line.accountId,
        fiscalYear,
        period,
        openingBalance: 0,
        debit,
        credit,
        closingBalance: net
      }
    });
  }
}
