import { userBadge } from '../core/ui.js';
import { canAccessPath, getNavigationSections } from './workspace-config.js';

function setVisible(element, isVisible) {
  if (!element) return;
  element.hidden = !isVisible;
  element.classList.toggle('hidden', !isVisible);
}

export function syncShellVisibility(isAuthenticated, user) {
  const sidebar = document.getElementById('sidebar');
  const topbar = document.querySelector('.topbar');
  const nav = document.getElementById('main-nav');

  setVisible(sidebar, isAuthenticated);
  setVisible(topbar, isAuthenticated);
  userBadge(isAuthenticated ? user : null);

  if (!isAuthenticated && nav) {
    nav.innerHTML = '';
  }
}

export function drawNav(user, isAuthenticated) {
  const nav = document.getElementById('main-nav');
  if (!nav) return;

  if (!isAuthenticated) {
    nav.innerHTML = '';
    return;
  }

  const visibleSections = getNavigationSections(user);

  nav.innerHTML = visibleSections
    .map(
      (section) => `
        <section class="nav-section ${section.isPriority ? 'is-priority' : ''}">
          <div class="nav-section-head">
            <div>
              <p class="nav-section-kicker">${section.kicker}</p>
              <h4>${section.title}</h4>
            </div>
            ${section.isPriority ? '<span class="nav-priority-badge">مقترح</span>' : ''}
          </div>
          <p class="nav-section-description">${section.description}</p>
          <div class="nav-links">
            ${section.items
              .map(
                (item) => `
                  <a href="#${item.path}" class="nav-link">
                    <span class="nav-link-main">${item.label}</span>
                    <span class="nav-link-meta">${item.meta || ''}</span>
                  </a>
                `
              )
              .join('')}
          </div>
          ${
            section.secondary.length
              ? `
                <div class="nav-secondary-links">
                  ${section.secondary.map((item) => `<a href="#${item.path}" class="nav-secondary-link">${item.label}</a>`).join('')}
                </div>
              `
              : ''
          }
        </section>
      `
    )
    .join('');
}

export function canAccessRoute(path, user) {
  return canAccessPath(path, user);
}
