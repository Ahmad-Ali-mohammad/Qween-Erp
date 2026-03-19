import { notifyAuthChanged } from './session-events.js';

const STORAGE_KEYS = {
  token: 'accessToken',
  refreshToken: 'refreshToken'
};

function readFrom(storage, key) {
  try {
    return storage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeTo(storage, key, value) {
  try {
    if (value) {
      storage.setItem(key, value);
    } else {
      storage.removeItem(key);
    }
  } catch {
    // no-op
  }
}

function clearStorage(storage) {
  writeTo(storage, STORAGE_KEYS.token, '');
  writeTo(storage, STORAGE_KEYS.refreshToken, '');
}

function readStoredAuth() {
  const localToken = readFrom(localStorage, STORAGE_KEYS.token);
  const localRefreshToken = readFrom(localStorage, STORAGE_KEYS.refreshToken);
  if (localToken || localRefreshToken) {
    return {
      token: localToken,
      refreshToken: localRefreshToken,
      remember: true
    };
  }

  return {
    token: readFrom(sessionStorage, STORAGE_KEYS.token),
    refreshToken: readFrom(sessionStorage, STORAGE_KEYS.refreshToken),
    remember: false
  };
}

const initialAuth = readStoredAuth();

export const store = {
  token: initialAuth.token,
  refreshToken: initialAuth.refreshToken,
  remember: initialAuth.remember,
  user: null,
  notifyAuthChange() {
    notifyAuthChanged({
      authenticated: Boolean(this.token),
      user: this.user,
      remember: this.remember
    });
  },
  persistAuth() {
    const targetStorage = this.remember ? localStorage : sessionStorage;
    const otherStorage = this.remember ? sessionStorage : localStorage;

    clearStorage(otherStorage);
    writeTo(targetStorage, STORAGE_KEYS.token, this.token);
    writeTo(targetStorage, STORAGE_KEYS.refreshToken, this.refreshToken);
  },
  setUser(user) {
    this.user = user || null;
    this.notifyAuthChange();
  },
  setAuth(tokenOrPayload, refreshToken, user) {
    const payload =
      typeof tokenOrPayload === 'object' && tokenOrPayload !== null
        ? tokenOrPayload
        : { token: tokenOrPayload, refreshToken, user };

    this.token = payload.token || '';
    this.refreshToken = payload.refreshToken || '';
    this.remember = payload.remember !== false;
    this.user = payload.user || null;

    this.persistAuth();
    this.notifyAuthChange();
  },
  clearAuth() {
    this.token = '';
    this.refreshToken = '';
    this.user = null;
    this.remember = false;
    clearStorage(localStorage);
    clearStorage(sessionStorage);
    this.notifyAuthChange();
  }
};
