export function decimalToNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  return Number(value);
}

export function toDecimal(value: number | string): string {
  return String(value);
}
