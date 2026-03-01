import { Prisma } from '@prisma/client';

export function decimalToNumber(value: Prisma.Decimal | string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return Number(value.toString());
}

export function toDecimal(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}
