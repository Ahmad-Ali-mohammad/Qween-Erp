import { store } from './store.js';
import { request } from './api.js';

export async function ensureUser() {
  if (!store.token) return null;
  try {
    const me = await request('/auth/me');
    store.setUser(me.data);
    return store.user;
  } catch {
    store.clearAuth();
    return null;
  }
}

export function requireAuth() {
  if (!store.token) {
    location.hash = '#/login';
    return false;
  }
  return true;
}

export async function logout() {
  try {
    if (store.refreshToken) {
      await request('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: store.refreshToken })
      });
    }
  } catch {
    // no-op
  }

  store.clearAuth();
  location.hash = '#/login';
}
