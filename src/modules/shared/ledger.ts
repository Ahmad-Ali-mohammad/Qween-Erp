import { and } from '@prisma/orm-postgres/orm-client';
import type { Executor } from '../../config/database';
import { decimalToNumber } from '../../utils/decimal';

export type LedgerLineInput = {
  accountId: number;
  debit: number | string;
  credit: number | string;
};

export async function applyLedgerLines(
  tx: Executor,
  date: Date,
  period: number,
  lines: LedgerLineInput[]
): Promise<void> {
  const fiscalYear = date.getUTCFullYear();

  for (const line of lines) {
    const debit = decimalToNumber(line.debit as any);
    const credit = decimalToNumber(line.credit as any);
    const net = debit - credit;

    const existing = await tx.orm.public.AccountBalance.first((r) =>
      and(r.accountId.eq(line.accountId), r.fiscalYear.eq(fiscalYear), r.period.eq(period))
    );
    if (existing) {
      await tx.orm.public.AccountBalance.where({ id: existing.id }).update({
        debit: String(Number(existing.debit) + debit),
        credit: String(Number(existing.credit) + credit),
        closingBalance: String(Number(existing.closingBalance) + net)
      });
    } else {
      await tx.orm.public.AccountBalance.create({
        accountId: line.accountId,
        fiscalYear,
        period,
        openingBalance: '0',
        debit: String(debit),
        credit: String(credit),
        closingBalance: String(net)
      });
    }
  }
}
