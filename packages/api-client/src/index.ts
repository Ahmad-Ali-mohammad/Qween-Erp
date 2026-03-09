import { getAccessToken } from '@erp-qween/auth-client';

export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
  status?: {
    code: string;
    message: string;
  };
};

export function resolveApiBase() {
  const envBase = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_API_BASE_URL : '';
  return envBase || '/api/v1';
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

  const response = await fetch(`${resolveApiBase()}${path}`, {
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
