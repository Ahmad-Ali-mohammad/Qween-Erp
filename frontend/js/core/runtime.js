function normalizeApiBase(rawValue) {
  const fallback = new URL('/api', window.location.origin).toString();
  if (!rawValue) return fallback;

  const value = String(rawValue).trim();
  if (!value) return fallback;

  try {
    return new URL(value, window.location.origin).toString().replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

function readRuntimeApiBase() {
  const metaValue = document.querySelector('meta[name="erp-api-base"]')?.getAttribute('content');
  const htmlValue = document.documentElement?.dataset?.apiBase;
  const globalValue = globalThis.__ERP_API_BASE__;
  return normalizeApiBase(globalValue || metaValue || htmlValue);
}

export const runtimeConfig = Object.freeze({
  apiBase: readRuntimeApiBase()
});
