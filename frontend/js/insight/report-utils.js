export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isoDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

export function startOfMonthIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export function buildPreviousPeriod(fromIso, toIso) {
  const from = new Date(`${fromIso}T00:00:00.000Z`);
  const to = new Date(`${toIso}T00:00:00.000Z`);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000) + 1);
  const prevTo = new Date(from.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86400000);
  return { previousFrom: isoDate(prevFrom), previousTo: isoDate(prevTo) };
}
