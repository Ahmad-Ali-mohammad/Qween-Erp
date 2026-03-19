export function isValidEmail(value: string): boolean {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidPhone(value: string): boolean {
  if (!value) return false;
  return /^\+?\d{7,15}$/.test(value);
}

export function isValidIdNumber(value: string): boolean {
  if (!value) return false;
  return /^\d{10}$/.test(value);
}
