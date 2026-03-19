import { registerRoute, navigate } from './core/router.js';
import { ensureUser, requireAuth, logout } from './core/auth.js';
import { store } from './core/store.js';
import { bindGlobalShortcuts, wireShellInteractions, sanitizeArabic, toast } from './core/ui.js';
import { renderLogin } from './auth/login.js';
import { AUTH_CHANGED_EVENT } from './core/session-events.js';
import { canAccessRoute, drawNav, syncShellVisibility } from './shell/app-shell.js';
import { registerProtectedRoutes } from './shell/route-registry.js';

function setVisible(element, isVisible) {
  if (!element) return;
  element.hidden = !isVisible;
  element.classList.toggle('hidden', !isVisible);
}

function updateShellVisibility() {
  syncShellVisibility(Boolean(store.token), store.user);
}

function protect(renderer) {
  return async () => {
    if (!requireAuth()) return;

    const currentPath = location.hash?.replace(/^#/, '') || '/dashboard';
    if (!canAccessRoute(currentPath, store.user)) {
      toast('ليس لديك صلاحية للوصول لهذه الصفحة', 'warning');
      location.hash = '#/dashboard';
      return;
    }

    await renderer();
  };
}

registerRoute('/login', async () => {
  updateShellVisibility();
  setVisible(document.getElementById('logout-btn'), false);
  await renderLogin();
});

registerProtectedRoutes(protect);

async function init() {
  wireShellInteractions();
  bindGlobalShortcuts();

  const logoutBtn = document.getElementById('logout-btn');
  const syncAuthShell = () => {
    updateShellVisibility();
    drawNav(store.user, Boolean(store.token));
    setVisible(logoutBtn, !(location.hash === '#/login' || !store.token));
  };

  window.addEventListener(AUTH_CHANGED_EVENT, syncAuthShell);

  const user = await ensureUser();
  if (user && !store.user) {
    store.setUser(user);
  }
  syncAuthShell();

  logoutBtn.addEventListener('click', () => {
    logout();
  });

  if (!location.hash) location.hash = store.token ? '#/dashboard' : '#/login';
  if (!store.token && location.hash !== '#/login') location.hash = '#/login';

  await navigate();
  sanitizeArabic(document.body);

  window.addEventListener('hashchange', () => {
    if (!store.token && location.hash !== '#/login') {
      location.hash = '#/login';
      return;
    }
    syncAuthShell();
  });
}

init();
