import type { AppSession, Locale } from '@erp-qween/domain-types';

const TOKEN_KEY = 'erpqween.token';
const REFRESH_KEY = 'erpqween.refreshToken';
const USER_KEY = 'erpqween.user';
const LOCALE_KEY = 'erpqween.locale';

function safeStorage(): Storage | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  return window.localStorage;
}

export function getLocale(): Locale {
  const storage = safeStorage();
  return ((storage?.getItem(LOCALE_KEY) as Locale | null) ?? 'ar');
}

export function setLocale(locale: Locale) {
  safeStorage()?.setItem(LOCALE_KEY, locale);
}

export function saveSession(session: AppSession) {
  const storage = safeStorage();
  if (!storage) return;

  storage.setItem(TOKEN_KEY, session.token);
  if (session.refreshToken) {
    storage.setItem(REFRESH_KEY, session.refreshToken);
  }

  if (session.user) {
    storage.setItem(USER_KEY, JSON.stringify(session.user));
  }
}

export function clearSession() {
  const storage = safeStorage();
  if (!storage) return;

  storage.removeItem(TOKEN_KEY);
  storage.removeItem(REFRESH_KEY);
  storage.removeItem(USER_KEY);
}

export function getAccessToken() {
  return safeStorage()?.getItem(TOKEN_KEY) ?? null;
}

export function readSession(): AppSession | null {
  const storage = safeStorage();
  if (!storage) return null;

  const token = storage.getItem(TOKEN_KEY);
  if (!token) return null;

  const refreshToken = storage.getItem(REFRESH_KEY);
  const userJson = storage.getItem(USER_KEY);

  return {
    token,
    refreshToken,
    user: userJson ? JSON.parse(userJson) : null
  };
}

export function isAuthenticated() {
  return Boolean(getAccessToken());
}
