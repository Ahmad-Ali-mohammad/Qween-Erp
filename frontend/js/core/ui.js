import { t } from '../i18n/ar.js';

const moneyFormatter = new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numberFormatter = new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat('ar-SA', { year: 'numeric', month: 'short', day: '2-digit' });

let pageActions = {
  onNew: null,
  onSave: null,
  onSearch: null,
  onRefresh: null
};

let shortcutsBound = false;

export function bindGlobalShortcuts() {
  if (shortcutsBound) return;
  shortcutsBound = true;

  window.addEventListener('keydown', (event) => {
    const rawKey = typeof event.key === 'string' ? event.key : '';
    const key = rawKey.toLowerCase();
    if (!key && rawKey !== 'F5') return;

    if (event.ctrlKey && key === 'n' && pageActions.onNew) {
      event.preventDefault();
      pageActions.onNew();
      return;
    }

    if (event.ctrlKey && key === 's' && pageActions.onSave) {
      event.preventDefault();
      pageActions.onSave();
      return;
    }

    if (event.ctrlKey && key === 'f' && pageActions.onSearch) {
      event.preventDefault();
      pageActions.onSearch();
      return;
    }

    if (event.key === 'F5' && pageActions.onRefresh) {
      event.preventDefault();
      pageActions.onRefresh();
    }
  });
}

export function setPageActions(actions = {}) {
  pageActions = {
    onNew: actions.onNew ?? null,
    onSave: actions.onSave ?? null,
    onSearch: actions.onSearch ?? null,
    onRefresh: actions.onRefresh ?? null
  };
}

export function setTitle(title) {
  const el = document.getElementById('page-title');
  if (el) el.textContent = title;
}

export function userBadge(user) {
  const el = document.getElementById('user-badge');
  if (!el) return;
  if (!user) {
    el.textContent = t('app.guestUser', 'غير مسجل');
    return;
  }
  const displayName = user.fullName || user.name || user.username;
  el.textContent = `${displayName} (${user.username})`;
}

export function toast(message, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast ${type}`;
  el.classList.add('show');
  setTimeout(() => {
    el.classList.remove('show');
  }, 2400);
}

export async function confirmAction(message, title = t('common.confirmAction', 'تأكيد الإجراء')) {
  const dialog = document.getElementById('confirm-dialog');
  if (!dialog) return window.confirm(message);

  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;

  dialog.showModal();

  return new Promise((resolve) => {
    const closeHandler = () => {
      const accepted = dialog.returnValue === 'ok';
      dialog.removeEventListener('close', closeHandler);
      resolve(accepted);
    };

    dialog.addEventListener('close', closeHandler);
  });
}

export function formatMoney(value, currency = t('common.currency', 'ريال')) {
  const n = Number(value ?? 0);
  return `${moneyFormatter.format(Number.isFinite(n) ? n : 0)} ${currency}`;
}

export function formatNumber(value) {
  const n = Number(value ?? 0);
  return numberFormatter.format(Number.isFinite(n) ? n : 0);
}

export function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return dateFormatter.format(d);
}

export function badge(text, kind = 'info') {
  return `<span class="badge ${kind}">${text}</span>`;
}

export function statusBadge(status) {
  const map = {
    DRAFT: [t('common.draft', 'مسودة'), 'warning'],
    PENDING: [t('common.pending', 'معلق'), 'warning'],
    POSTED: [t('common.posted', 'مرحل'), 'success'],
    ISSUED: [t('common.issued', 'صادرة'), 'info'],
    PAID: [t('common.paid', 'مدفوعة'), 'success'],
    PARTIAL: [t('common.partial', 'مدفوعة جزئياً'), 'warning'],
    COMPLETED: [t('common.completed', 'مكتملة'), 'success'],
    CANCELLED: [t('common.cancelled', 'ملغاة'), 'danger'],
    CLOSED: [t('common.closed', 'مغلقة'), 'danger'],
    OPEN: [t('common.open', 'مفتوحة'), 'success'],
    ACTIVE: [t('common.active', 'نشط'), 'success'],
    VOID: [t('common.void', 'ملغى'), 'danger'],
    REVERSED: [t('common.reversed', 'معكوس'), 'info']
  };

  const [label, color] = map[status] ?? [status, 'info'];
  return badge(label, color);
}

export function table(headers, rows) {
  const th = headers.map((h) => `<th>${h}</th>`).join('');
  const tr = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell ?? ''}</td>`).join('')}</tr>`)
    .join('');

  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

export function openSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
}

export function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
}

export function wireShellInteractions() {
  const toggleBtn = document.getElementById('menu-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      if (!sidebar) return;
      sidebar.classList.toggle('open');
    });
  }

  document.addEventListener('click', (event) => {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar || window.innerWidth > 1200) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('#sidebar') || target.closest('#menu-toggle')) return;
    sidebar.classList.remove('open');
  });
}

function tryDecodeMojibake(text) {
  if (!/[ØÙ]/.test(text)) return text;
  try {
    return decodeURIComponent(escape(text));
  } catch {
    return text;
  }
}

function repairCorruptedString(text) {
  return tryDecodeMojibake(text);
}

export function sanitizeArabic(root = document.body) {
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  for (const node of textNodes) {
    const value = node.nodeValue ?? '';
    const repaired = repairCorruptedString(value);
    if (repaired !== value) {
      node.nodeValue = repaired;
    }
  }

  const attrs = ['placeholder', 'title', 'aria-label'];
  const elements = root.querySelectorAll('*');
  for (const el of elements) {
    for (const attr of attrs) {
      const current = el.getAttribute(attr);
      if (!current) continue;
      const repaired = repairCorruptedString(current);
      if (repaired !== current) {
        el.setAttribute(attr, repaired);
      }
    }
  }
}
