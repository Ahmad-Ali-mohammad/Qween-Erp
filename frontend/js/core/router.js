import { closeSidebar } from './ui.js';
import { sanitizeArabic } from './ui.js';

const routes = new Map();

export function registerRoute(path, handler) {
  routes.set(path, { handler });
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/dashboard';
  const [path] = raw.split('?');
  return path;
}

export async function navigate() {
  const path = parseHash();
  const route = routes.get(path) || routes.get('/login');
  if (!route) return;

  await route.handler();
  sanitizeArabic(document.body);

  document.querySelectorAll('#main-nav a').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('href') === `#${path}`);
  });

  closeSidebar();
}

window.addEventListener('hashchange', () => {
  navigate();
});
