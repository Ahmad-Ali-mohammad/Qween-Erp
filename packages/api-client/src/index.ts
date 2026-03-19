import { getAccessToken } from '@erp-qween/auth-client';

let apiBaseOverride: string | null = null;

export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
  status?: {
    code: string;
    message: string;
  };
};

export function setApiBase(base: string | null | undefined) {
  if (!base) {
    apiBaseOverride = null;
    return;
  }
  apiBaseOverride = String(base).replace(/\/$/, '');
}

export function resolveApiBase() {
  const envBase = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_API_BASE_URL : '';
  return apiBaseOverride || envBase || '/api/v1';
}

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function resolveBasePath(base: string) {
  if (!isAbsoluteUrl(base)) return base;
  try {
    return new URL(base).pathname || base;
  } catch {
    return base;
  }
}

function normalizeApiPath(path: string, base: string) {
  const safePath = path.startsWith('/') ? path : `/${path}`;
  const [rawPath, rawQuery] = safePath.split('?');

  const basePath = resolveBasePath(base).replace(/\/$/, '');
  const segment = basePath.split('/').filter(Boolean).pop();
  let normalizedPath = rawPath;

  if (segment) {
    const prefix = `/${segment}`;
    if (rawPath === prefix) {
      normalizedPath = '/';
    } else if (rawPath.startsWith(`${prefix}/`)) {
      normalizedPath = rawPath.slice(prefix.length);
    }
  }

  if (!normalizedPath.startsWith('/')) {
    normalizedPath = `/${normalizedPath}`;
  }

  return rawQuery ? `${normalizedPath}?${rawQuery}` : normalizedPath;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  const token = getAccessToken();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (init.body && !headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (isAbsoluteUrl(path)) {
    const response = await fetch(path, {
      ...init,
      headers
    });

    if (!response.ok) {
      const fallback = `HTTP ${response.status}`;
      try {
        const payload = await response.json();
        throw new Error(payload?.error?.message || payload?.status?.message || fallback);
      } catch (error) {
        if (error instanceof Error && error.message !== 'Unexpected end of JSON input') {
          throw error;
        }

        throw new Error(fallback);
      }
    }

    return response;
  }

  const apiBase = resolveApiBase();
  const normalizedPath = normalizeApiPath(path, apiBase);

  const response = await fetch(`${apiBase}${normalizedPath}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const fallback = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      throw new Error(payload?.error?.message || payload?.status?.message || fallback);
    } catch (error) {
      if (error instanceof Error && error.message !== 'Unexpected end of JSON input') {
        throw error;
      }

      throw new Error(fallback);
    }
  }

  return response;
}

export async function getJson<T>(path: string) {
  const response = await apiFetch(path);
  return (await response.json()) as ApiEnvelope<T>;
}

export async function postJson<T>(path: string, body: unknown, init: RequestInit = {}) {
  const response = await apiFetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
    ...init
  });

  return (await response.json()) as ApiEnvelope<T>;
}
