import { currentYear } from './date';

export function buildSequentialNumber(prefix: string, count: number, year = currentYear()): string {
  return `${prefix}-${year}-${String(count + 1).padStart(5, '0')}`;
}

export function buildSequentialNumberFromLatest(
  prefix: string,
  latestNumber: string | null | undefined,
  year = currentYear()
): string {
  const expectedPrefix = `${prefix}-${year}-`;
  let next = 1;

  if (latestNumber && latestNumber.startsWith(expectedPrefix)) {
    const raw = latestNumber.slice(expectedPrefix.length);
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) next = parsed + 1;
  }

  return `${prefix}-${year}-${String(next).padStart(5, '0')}`;
}
