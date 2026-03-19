export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function currentYear() {
  return new Date().getFullYear();
}

export function toIsoDateTime(value) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}
