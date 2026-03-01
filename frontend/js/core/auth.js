import { store } from './store.js';
import { request } from './api.js';
import { userBadge } from './ui.js';

export async function ensureUser() {
  if (!store.token) return null;
  try {
    const me = await request('/auth/me');
    store.user = me.data;
    userBadge(store.user);
    return store.user;
  } catch {
    store.clearAuth();
    userBadge(null);
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
  userBadge(null);
  location.hash = '#/login';
}
