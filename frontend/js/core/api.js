import { t } from '../i18n/ar.js';
import { store } from './store.js';
import { toast } from './ui.js';

const base = 'http://localhost:3000/api';
const inFlightGetRequests = new Map();
const getResponseCache = new Map();
const GET_CACHE_TTL_MS = 3000;
const MAX_CONCURRENT_REQUESTS = 6;
const MAX_429_RETRIES = 3;
const rateLimitState = {
  retryAfterAt: 0
};
let activeRequests = 0;
const requestQueue = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireRequestSlot() {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests += 1;
    return;
  }

  await new Promise((resolve) => requestQueue.push(resolve));
  activeRequests += 1;
}

function releaseRequestSlot() {
  activeRequests = Math.max(0, activeRequests - 1);
  const next = requestQueue.shift();
  if (next) next();
}

function parseRetryAfterMs(response) {
  const retryAfterHeader = Number(response.headers.get('Retry-After') || 0);
  if (Number.isFinite(retryAfterHeader) && retryAfterHeader > 0) return Math.min(10000, retryAfterHeader * 1000);
  return 1200;
}

function normalizePath(path) {
  if (/^https?:\/\//i.test(path)) return path;
  let normalized = String(path || '').trim();
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  if (normalized === '/api') return '/';
  if (normalized.startsWith('/api/')) normalized = normalized.slice(4);
  return normalized;
}

export async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (store.token) headers.Authorization = `Bearer ${store.token}`;

  const normalizedPath = normalizePath(path);
  const url = /^https?:\/\//i.test(normalizedPath)
    ? normalizedPath
    : `${base.replace(/\/+$/, '')}${normalizedPath}`;

  const method = String(options.method || 'GET').toUpperCase();
  const requestKey = `${method}:${url}:${headers.Authorization || ''}`;

  if (method === 'GET') {
    const cached = getResponseCache.get(requestKey);
    if (cached && Date.now() - cached.at < GET_CACHE_TTL_MS) {
      return cached.payload;
    }
    const pending = inFlightGetRequests.get(requestKey);
    if (pending) return pending;
  }

  const execute = async () => {
    if (Date.now() < rateLimitState.retryAfterAt) {
      await sleep(Math.min(5000, rateLimitState.retryAfterAt - Date.now()));
    }

    const doFetch = async () =>
      fetch(url, {
        ...options,
        method,
        headers
      });

    let response = null;
    for (let attempt = 0; attempt < MAX_429_RETRIES; attempt += 1) {
      response = await doFetch();
      if (response.status !== 429) break;

      const retryAfterMs = parseRetryAfterMs(response);
      rateLimitState.retryAfterAt = Date.now() + retryAfterMs;

      const cached = method === 'GET' ? getResponseCache.get(requestKey) : null;
      if (cached && Date.now() - cached.at < GET_CACHE_TTL_MS * 5) {
        return cached.payload;
      }

      if (attempt < MAX_429_RETRIES - 1) {
        const jitter = Math.floor(Math.random() * 250);
        await sleep(Math.min(10000, retryAfterMs + jitter));
      }
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok || !payload?.success) {
      let message = payload?.error?.message || `Request failed (${response.status})`;
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        message = retryAfter
          ? `تم تجاوز حد الطلبات. حاول مرة أخرى بعد ${retryAfter} ثانية`
          : 'تم تجاوز حد الطلبات. حاول مرة أخرى بعد قليل';
      }
      if (response.status === 401) {
        store.clearAuth();
        location.hash = '#/login';
      }
      throw new Error(message);
    }

    if (method === 'GET') {
      getResponseCache.set(requestKey, { at: Date.now(), payload });
    } else {
      // Mutations should invalidate stale GET cache so UI immediately reflects CRUD changes.
      getResponseCache.clear();
    }

    return payload;
  };

  const promise = (async () => {
    await acquireRequestSlot();
    try {
      return await execute();
    } finally {
      releaseRequestSlot();
    }
  })();
  if (method === 'GET') {
    inFlightGetRequests.set(requestKey, promise);
  }

  try {
    return await promise;
  } finally {
    if (method === 'GET') {
      inFlightGetRequests.delete(requestKey);
    }
  }
}

export async function withToast(action, successMessage = t('common.saveSuccess', 'تم الحفظ بنجاح')) {
  try {
    const result = await action();
    toast(successMessage, 'success');
    return result;
  } catch (error) {
    toast(error.message || t('common.requestFailed', 'حدث خطأ أثناء التنفيذ'), 'error');
    throw error;
  }
}

export function toQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.append(key, String(value));
  });
  const q = search.toString();
  return q ? `?${q}` : '';
}

export async function api(path, method = 'GET', data = null) {
  const options = { method };
  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(data);
  }
  return request(path, options);
}

export function extractData(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.data ?? null;
}

export function extractRows(payload) {
  const data = extractData(payload);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.rows)) return data.rows;
  return [];
}

export function extractMeta(payload) {
  if (!payload || typeof payload !== 'object') return {};
  if (payload.meta && typeof payload.meta === 'object') return payload.meta;
  const data = extractData(payload);
  if (data && data.pagination && typeof data.pagination === 'object') return data.pagination;
  if (payload.pagination && typeof payload.pagination === 'object') return payload.pagination;
  return {};
}
