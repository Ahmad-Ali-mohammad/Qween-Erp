import { Errors } from './response';

export function parseDateOrThrow(value: string | Date, fieldName = 'date'): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw Errors.validation(`قيمة ${fieldName} غير صالحة`);
  }
  return date;
}

export function currentYear(): number {
  return new Date().getFullYear();
}
