import { t } from './i18n/ar.js';
import { registerRoute, navigate } from './core/router.js';
import { ensureUser, requireAuth, logout } from './core/auth.js';
import { store } from './core/store.js';
import {
  userBadge,
  bindGlobalShortcuts,
  wireShellInteractions,
  sanitizeArabic,
  toast,
  setTitle,
  setPageActions,
  table,
  formatDate,
  formatMoney,
  statusBadge
} from './core/ui.js';
import { api, withToast, toQuery, extractRows, extractData } from './core/api.js';
import { renderLogin } from './modules/login.js';
import { renderDashboard } from './modules/dashboard.js';
import { renderAccounts } from './modules/accounts.js';
import { renderJournals } from './modules/journals.js';
import { renderInvoices } from './modules/invoices.js';
import { renderPayments } from './modules/payments.js';
import { renderAssets } from './modules/assets.js';
import { renderReports } from './modules/reports.js';
import { renderSettings } from './modules/settings.js';
import { renderParties } from './modules/parties.js';
import { renderFiscal } from './modules/fiscal.js';
import { renderBanks } from './modules/banks.js';
import { renderBudgets } from './modules/budgets.js';
import { renderTaxes } from './modules/taxes.js';
import { renderCurrencies } from './modules/currencies.js';
import { renderAuditLogs } from './modules/audit.js';
import { renderHelp } from './modules/help.js';
import { renderProfile } from './modules/profile.js';
import { renderOperations } from './modules/operations.js';
import { renderQuickJournal, renderQuickInvoice, renderQuickStatement, renderGlobalSearch } from './modules/quick-actions.js';
import { renderSection } from './modules/erp-sections.js';

const navSections = [
  {
    title: t('nav.dashboard', 'لوحة التحكم'),
    items: [{ path: '/dashboard', label: 'الرئيسية' }]
  },
  {
    title: t('nav.quickActions', 'المدخل السريع'),
    items: [
      { path: '/quick-journal', label: 'قيد سريع' },
      { path: '/quick-invoice', label: 'فاتورة سريعة' },
      { path: '/quick-statement', label: 'كشف حساب' },
      { path: '/global-search', label: 'بحث شامل' }
    ]
  },
  {
    title: t('nav.accounting', 'المحاسبة'),
    items: [
      { path: '/accounts', label: 'دليل الحسابات' },
      { path: '/journals', label: 'قيود اليومية' },
      { path: '/reports/trial-balance', label: 'ميزان المراجعة' },
      { path: '/reports/income-statement', label: 'قائمة الدخل' },
      { path: '/reports/balance-sheet', label: 'الميزانية العمومية' },
      { path: '/general-ledger', label: 'الأستاذ العام' },
      { path: '/account-statement', label: 'كشف حساب' },
      { path: '/fiscal-years', label: 'السنوات المالية' },
      { path: '/periods', label: 'الفترات المحاسبية' },
      { path: '/year-close', label: 'إقفال السنة' }
    ]
  },
  {
    title: t('nav.sales', 'المبيعات'),
    items: [
      { path: '/customers', label: 'العملاء' },
      { path: '/sales-invoices', label: 'فواتير المبيعات' },
      { path: '/receipts', label: 'سندات القبض' },
      { path: '/sales-quotes', label: 'عروض الأسعار' },
      { path: '/sales-returns', label: 'مرتجعات المبيعات' },
      { path: '/sales-reports', label: 'تقارير المبيعات' }
    ]
  },
  {
    title: t('nav.purchasing', 'المشتريات'),
    items: [
      { path: '/suppliers', label: 'الموردين' },
      { path: '/purchase-invoices', label: 'فواتير الشراء' },
      { path: '/payment-vouchers', label: 'سندات الدفع' },
      { path: '/purchase-orders', label: 'طلبات الشراء' },
      { path: '/purchase-returns', label: 'مرتجعات المشتريات' },
      { path: '/purchase-reports', label: 'تقارير المشتريات' }
    ]
  },
  {
    title: t('nav.inventory', 'المخزون'),
    items: [
      { path: '/items', label: 'الأصناف' },
      { path: '/item-categories', label: 'التصنيفات' },
      { path: '/units', label: 'الوحدات' },
      { path: '/warehouses', label: 'المستودعات' },
      { path: '/stock-counts', label: 'جرد المخزون' },
      { path: '/stock-movements', label: 'حركات المخزون' },
      { path: '/inventory-reports', label: 'تقارير المخزون' }
    ]
  },
  {
    title: t('nav.fixedAssets', 'الأصول الثابتة'),
    items: [
      { path: '/asset-categories', label: 'تصنيفات الأصول' },
      { path: '/assets', label: 'بطاقات الأصول' },
      { path: '/depreciation', label: 'جداول الإهلاك' },
      { path: '/asset-disposal', label: 'صرف الأصول' },
      { path: '/asset-reports', label: 'تقارير الأصول' }
    ]
  },
  {
    title: t('nav.banking', 'البنوك والخزينة'),
    items: [
      { path: '/banks', label: 'الحسابات البنكية' },
      { path: '/bank-transactions', label: 'الحركات البنكية' },
      { path: '/reconciliation', label: 'التسويات البنكية' },
      { path: '/cashbox', label: 'الصندوق (الخزينة)' },
      { path: '/cash-transactions', label: 'حركات الصندوق' },
      { path: '/bank-reports', label: 'تقارير البنوك' }
    ]
  },
  {
    title: t('nav.budgets', 'الموازنات'),
    items: [
      { path: '/budgets', label: 'الموازنات التقديرية' },
      { path: '/budget-lines', label: 'بنود الموازنات' },
      { path: '/budget-variance', label: 'تحليل الانحرافات' },
      { path: '/budget-reports', label: 'تقارير الموازنات' }
    ]
  },
  {
    title: t('nav.tax', 'الضرائب'),
    items: [
      { path: '/tax-codes', label: 'أكواد الضرائب' },
      { path: '/tax-categories', label: 'فئات الضرائب' },
      { path: '/tax-declarations', label: 'إقرارات ضريبية' },
      { path: '/zatca', label: 'تكامل ZATCA' },
      { path: '/tax-reports', label: 'تقارير الضرائب' }
    ]
  },
  {
    title: t('nav.currencies', 'العملات'),
    items: [
      { path: '/currencies', label: 'العملات' },
      { path: '/exchange-rates', label: 'أسعار الصرف' },
      { path: '/currency-diff', label: 'فروق العملة' }
    ]
  },
  {
    title: t('nav.reports', 'التقارير'),
    items: [
      { path: '/reports/kpis', label: 'مؤشرات الأداء' },
      { path: '/reports/aging', label: 'تحليل الأعمار' },
      { path: '/reports/cash-flow', label: 'التدفقات النقدية' },
      { path: '/reports/income-comparative', label: 'قائمة دخل مقارنة' },
      { path: '/reports/custom', label: 'تقارير مخصصة' },
      { path: '/reports/schedules', label: 'تقارير مجدولة' },
      { path: '/analytics/abc', label: 'تحليل ABC' },
      { path: '/analytics/clv', label: 'قيمة العميل الدائمة' },
      { path: '/analytics/forecast', label: 'تنبؤ المبيعات' },
      { path: '/analytics/bsc', label: 'بطاقة الأداء المتوازن' }
    ]
  },
  {
    title: t('nav.administration', 'الإدارة'),
    items: [
      { path: '/users-roles', label: 'المستخدمين والصلاحيات' },
      { path: '/company-settings', label: 'إعدادات الشركة' },
      { path: '/system-settings', label: 'إعدادات النظام' },
      { path: '/audit-logs', label: 'سجل التدقيق' },
      { path: '/backups', label: 'النسخ الاحتياطي' },
      { path: '/notifications', label: 'الإشعارات' },
      { path: '/tasks', label: 'المهام' },
      { path: '/internal-controls', label: 'الرقابة الداخلية' },
      { path: '/security', label: 'الأمان والمصادقة' },
      { path: '/integrations', label: 'التكاملات' }
    ]
  },
  {
    title: 'CRM',
    items: [
      { path: '/opportunities', label: 'فرص البيع' },
      { path: '/support-tickets', label: 'تذاكر الدعم' },
      { path: '/contacts', label: 'جهات الاتصال' }
    ]
  },
  {
    title: 'المشاريع',
    items: [
      { path: '/projects', label: 'المشاريع' },
      { path: '/project-tasks', label: 'مهام المشاريع' },
      { path: '/project-expenses', label: 'مصاريف المشاريع' }
    ]
  },
  {
    title: 'الموارد البشرية',
    items: [
      { path: '/employees', label: 'الموظفون' },
      { path: '/leave-requests', label: 'الإجازات' },
      { path: '/payroll-runs', label: 'الرواتب' }
    ]
  },
  {
    title: 'العقود',
    items: [
      { path: '/contracts', label: 'العقود' },
      { path: '/contract-milestones', label: 'مراحل العقود' }
    ]
  },
  {
    title: t('nav.help', 'المساعدة والدعم'),
    items: [
      { path: '/help', label: 'مركز المساعدة' },
      { path: '/knowledge-base', label: 'قاعدة المعرفة' },
      { path: '/assistant', label: 'المساعد الذكي' },
      { path: '/support', label: 'الدعم الفني' },
      { path: '/onboarding', label: 'معالج الإعداد الأولي' }
    ]
  },
  {
    title: t('nav.profile', 'الملف الشخصي'),
    items: [
      { path: '/profile', label: 'بيانات المستخدم' },
      { path: '/profile-password', label: 'تغيير كلمة المرور' },
      { path: '/profile-mfa', label: 'المصادقة الثنائية' },
      { path: '/profile-preferences', label: 'تفضيلات النظام' }
    ]
  }
];

const routePermissions = {
  '/quick-journal': 'journal.create',
  '/quick-invoice': 'invoice.write',
  '/quick-statement': 'reports.read',
  '/global-search': 'reports.read',
  '/accounts': 'accounts.read',
  '/journals': 'journal.read',
  '/fiscal-years': 'fiscal.read',
  '/periods': 'fiscal.read',
  '/year-close': 'fiscal.read',
  '/customers': 'parties.read',
  '/suppliers': 'parties.read',
  '/sales-invoices': 'invoice.read',
  '/purchase-invoices': 'invoice.read',
  '/receipts': 'payment.read',
  '/payment-vouchers': 'payment.read',
  '/asset-categories': 'assets.read',
  '/assets': 'assets.read',
  '/depreciation': 'assets.read',
  '/banks': 'settings.read',
  '/bank-transactions': 'settings.read',
  '/reconciliation': 'settings.read',
  '/cashbox': 'settings.read',
  '/cash-transactions': 'settings.read',
  '/bank-reports': 'settings.read',
  '/budgets': 'budget.read',
  '/budget-lines': 'budget.read',
  '/budget-variance': 'budget.read',
  '/budget-reports': 'budget.read',
  '/tax-codes': 'tax.read',
  '/tax-categories': 'tax.read',
  '/tax-declarations': 'tax.read',
  '/zatca': 'tax.read',
  '/tax-reports': 'tax.read',
  '/reports/trial-balance': 'reports.read',
  '/reports/income-statement': 'reports.read',
  '/reports/balance-sheet': 'reports.read',
  '/reports/kpis': 'reports.read',
  '/users-roles': 'users.read',
  '/company-settings': 'settings.read',
  '/system-settings': 'settings.read',
  '/audit-logs': 'audit.read',
  '/items': 'inventory.read',
  '/item-categories': 'inventory.read',
  '/units': 'inventory.read',
  '/warehouses': 'warehouse.read',
  '/stock-counts': 'inventory.read',
  '/stock-movements': 'inventory.read',
  '/inventory-reports': 'inventory.read',
  '/sales-quotes': 'commercial.read',
  '/sales-returns': 'commercial.read',
  '/purchase-orders': 'commercial.read',
  '/purchase-returns': 'commercial.read',
  '/purchase-reports': 'commercial.read',
  '/opportunities': 'crm.read',
  '/support-tickets': 'support.read',
  '/contacts': 'crm.read',
  '/projects': 'projects.read',
  '/project-tasks': 'projects.read',
  '/project-expenses': 'projects.read',
  '/employees': 'hr.read',
  '/leave-requests': 'hr.read',
  '/payroll-runs': 'hr.read',
  '/contracts': 'contracts.read',
  '/contract-milestones': 'contracts.read',
  '/notifications': 'notifications.read',
  '/tasks': 'tasks.read',
  '/internal-controls': 'audit.read',
  '/backups': 'backup.read',
  '/integrations': 'integrations.read',
  '/security': 'security.read',
  '/currencies': 'currency.read',
  '/exchange-rates': 'currency.read',
  '/currency-diff': 'currency.read',
  '/reports/aging': 'reports.advanced.read',
  '/reports/cash-flow': 'reports.advanced.read',
  '/reports/income-comparative': 'reports.advanced.read',
  '/reports/custom': 'reports.advanced.read',
  '/reports/schedules': 'reports.advanced.read',
  '/analytics/abc': 'analytics.read',
  '/analytics/clv': 'analytics.read',
  '/analytics/forecast': 'analytics.read',
  '/analytics/bsc': 'analytics.read'
};

function canAccessPath(path) {
  const required = routePermissions[path];
  if (!required) return true;
  if (!store.token) return false;
  return store.user?.permissions?.[required] === true;
}

function setVisible(element, isVisible) {
  if (!element) return;
  element.hidden = !isVisible;
  element.classList.toggle('hidden', !isVisible);
}

function drawNav() {
  const nav = document.getElementById('main-nav');
  if (!store.token) {
    nav.innerHTML = '';
    return;
  }

  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccessPath(item.path))
    }))
    .filter((section) => section.items.length > 0);

  nav.innerHTML = visibleSections
    .map((section) => `
      <section class="nav-section">
        <h4>${section.title}</h4>
        ${section.items.map((item) => `<a href="#${item.path}">${item.label}</a>`).join('')}
      </section>
    `)
    .join('');
}

function updateShellVisibility() {
  const isAuthenticated = Boolean(store.token);
  const sidebar = document.getElementById('sidebar');
  const topbar = document.querySelector('.topbar');

  setVisible(sidebar, isAuthenticated);
  setVisible(topbar, isAuthenticated);

  if (!isAuthenticated) {
    userBadge(null);
    const nav = document.getElementById('main-nav');
    if (nav) nav.innerHTML = '';
  }
}

function protect(renderer) {
  return async () => {
    if (!requireAuth()) return;
    const currentPath = location.hash?.replace(/^#/, '') || '/dashboard';
    if (!canAccessPath(currentPath)) {
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

registerRoute('/dashboard', protect(renderDashboard));
registerRoute('/accounts', protect(renderAccounts));
registerRoute('/journals', protect(renderJournals));
registerRoute('/fiscal-years', protect(() => renderFiscal('years')));
registerRoute('/periods', protect(() => renderFiscal('periods')));
registerRoute('/customers', protect(() => renderParties('customers')));
registerRoute('/suppliers', protect(() => renderParties('suppliers')));
registerRoute('/sales-invoices', protect(() => renderInvoices('SALES')));
registerRoute('/purchase-invoices', protect(() => renderInvoices('PURCHASE')));
registerRoute('/receipts', protect(() => renderPayments('RECEIPT')));
registerRoute('/payment-vouchers', protect(() => renderPayments('PAYMENT')));
registerRoute('/asset-categories', protect(() => renderAssets('categories')));
registerRoute('/assets', protect(() => renderAssets('assets')));
registerRoute('/depreciation', protect(() => renderAssets('depreciation')));
registerRoute('/banks', protect(() => renderBanks('banks')));
registerRoute('/bank-transactions', protect(() => renderBanks('transactions')));
registerRoute('/reconciliation', protect(() => renderBanks('reconciliation')));
registerRoute('/budgets', protect(() => renderBudgets('budgets')));
registerRoute('/budget-variance', protect(() => renderBudgets('variance')));
registerRoute('/tax-codes', protect(() => renderTaxes('codes')));
registerRoute('/tax-declarations', protect(() => renderTaxes('declarations')));
registerRoute('/reports/trial-balance', protect(() => renderReports('trial-balance')));
registerRoute('/reports/income-statement', protect(() => renderReports('income-statement')));
registerRoute('/reports/balance-sheet', protect(() => renderReports('balance-sheet')));
registerRoute('/reports/kpis', protect(() => renderReports('kpis')));
registerRoute('/users-roles', protect(() => renderSettings('users-roles')));
registerRoute('/company-settings', protect(() => renderSettings('company')));
registerRoute('/audit-logs', protect(renderAuditLogs));
registerRoute('/help', protect(() => renderHelp('center')));

// Module shells (phase-wise rollout)
registerRoute('/quick-journal', protect(renderQuickJournal));
registerRoute('/quick-invoice', protect(renderQuickInvoice));
registerRoute('/quick-statement', protect(renderQuickStatement));
registerRoute('/global-search', protect(renderGlobalSearch));
registerRoute('/general-ledger', protect(renderGeneralLedger));
registerRoute('/account-statement', protect(renderAccountStatement));
registerRoute('/year-close', protect(renderYearClose));
registerRoute('/sales-quotes', protect(() => renderSection('/sales-quotes')));
registerRoute('/sales-returns', protect(() => renderSection('/sales-returns')));
registerRoute('/sales-reports', protect(() => renderSection('/sales-reports')));
registerRoute('/purchase-orders', protect(() => renderSection('/purchase-orders')));
registerRoute('/purchase-returns', protect(() => renderSection('/purchase-returns')));
registerRoute('/purchase-reports', protect(() => renderSection('/purchase-reports')));
registerRoute('/items', protect(() => renderSection('/items')));
registerRoute('/item-categories', protect(() => renderSection('/item-categories')));
registerRoute('/units', protect(() => renderSection('/units')));
registerRoute('/warehouses', protect(() => renderSection('/warehouses')));
registerRoute('/stock-counts', protect(() => renderSection('/stock-counts')));
registerRoute('/stock-movements', protect(() => renderSection('/stock-movements')));
registerRoute('/inventory-reports', protect(() => renderSection('/inventory-reports')));
registerRoute('/asset-disposal', protect(() => renderAssets('disposal')));
registerRoute('/asset-reports', protect(() => renderAssets('reports')));
registerRoute('/cashbox', protect(() => renderBanks('cashbox')));
registerRoute('/cash-transactions', protect(() => renderBanks('cash-transactions')));
registerRoute('/bank-reports', protect(() => renderBanks('reports')));
registerRoute('/budget-lines', protect(() => renderBudgets('lines')));
registerRoute('/budget-reports', protect(() => renderBudgets('reports')));
registerRoute('/tax-categories', protect(() => renderTaxes('categories')));
registerRoute('/zatca', protect(() => renderTaxes('zatca')));
registerRoute('/tax-reports', protect(() => renderTaxes('reports')));
registerRoute('/currencies', protect(() => renderCurrencies('currencies')));
registerRoute('/exchange-rates', protect(() => renderCurrencies('exchange-rates')));
registerRoute('/currency-diff', protect(() => renderCurrencies('diff')));
registerRoute('/reports/aging', protect(() => renderReports('aging')));
registerRoute('/reports/cash-flow', protect(() => renderReports('cash-flow')));
registerRoute('/reports/income-comparative', protect(() => renderReports('income-comparative')));
registerRoute('/reports/custom', protect(() => renderReports('custom')));
registerRoute('/reports/schedules', protect(() => renderReports('schedules')));
registerRoute('/analytics/abc', protect(() => renderReports('abc')));
registerRoute('/analytics/clv', protect(() => renderReports('clv')));
registerRoute('/analytics/forecast', protect(() => renderReports('forecast')));
registerRoute('/analytics/bsc', protect(() => renderReports('bsc')));
registerRoute('/system-settings', protect(() => renderSettings('system')));
registerRoute('/backups', protect(() => renderSettings('backups')));
registerRoute('/notifications', protect(() => renderSettings('notifications')));
registerRoute('/tasks', protect(() => renderSettings('tasks')));
registerRoute('/internal-controls', protect(() => renderSettings('internal-controls')));
registerRoute('/security', protect(() => renderSettings('security')));
registerRoute('/integrations', protect(() => renderSettings('integrations')));
registerRoute('/opportunities', protect(() => renderOperations('opportunities')));
registerRoute('/support-tickets', protect(() => renderHelp('tickets')));
registerRoute('/contacts', protect(() => renderOperations('contacts')));
registerRoute('/projects', protect(() => renderOperations('projects')));
registerRoute('/project-tasks', protect(() => renderOperations('project-tasks')));
registerRoute('/project-expenses', protect(() => renderOperations('project-expenses')));
registerRoute('/employees', protect(() => renderOperations('employees')));
registerRoute('/leave-requests', protect(() => renderOperations('leave-requests')));
registerRoute('/payroll-runs', protect(() => renderOperations('payroll-runs')));
registerRoute('/contracts', protect(() => renderOperations('contracts')));
registerRoute('/contract-milestones', protect(() => renderOperations('contract-milestones')));
registerRoute('/knowledge-base', protect(() => renderHelp('knowledge')));
registerRoute('/assistant', protect(() => renderHelp('assistant')));
registerRoute('/support', protect(() => renderHelp('support')));
registerRoute('/onboarding', protect(() => renderHelp('onboarding')));
registerRoute('/profile', protect(() => renderProfile('profile')));
registerRoute('/profile-password', protect(() => renderProfile('password')));
registerRoute('/profile-mfa', protect(() => renderProfile('mfa')));
registerRoute('/profile-preferences', protect(() => renderProfile('preferences')));

// General Ledger Implementation
async function renderGeneralLedger() {
  setTitle('الأستاذ العام');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل الأستاذ العام...</div>';

  const state = {
    page: 1,
    limit: 50,
    fromDate: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
    toDate: new Date().toISOString().slice(0, 10),
    accountId: '',
    entryNumber: ''
  };

  const load = async () => {
    try {
      const [journalsRes, accountsRes] = await Promise.all([
        api(`/journals${toQuery({
          page: state.page,
          limit: state.limit,
          dateFrom: state.fromDate,
          dateTo: state.toDate,
          accountId: state.accountId || undefined,
          entryNumber: state.entryNumber || undefined
        })}`),
        api('/accounts?page=1&limit=1000')
      ]);

      const journals = journalsRes.rows || [];
      const accounts = accountsRes.rows || [];

      view.innerHTML = `
        <div class="card">
          <h3>الأستاذ العام</h3>
          <form id="ledger-filters" class="grid-4">
            <div><label>من تاريخ</label><input id="ledger-from" type="date" value="${state.fromDate}" /></div>
            <div><label>إلى تاريخ</label><input id="ledger-to" type="date" value="${state.toDate}" /></div>
            <div><label>الحساب</label>
              <select id="ledger-account">
                <option value="">جميع الحسابات</option>
                ${accounts.map(a => `<option value="${a.id}" ${state.accountId === a.id ? 'selected' : ''}>${a.code} - ${a.nameAr}</option>`).join('')}
              </select>
            </div>
            <div><label>رقم القيد</label><input id="ledger-entry" value="${state.entryNumber}" /></div>
            <div class="actions" style="grid-column:1 / -1;">
              <button type="submit" class="btn btn-primary">عرض</button>
              <button type="button" class="btn btn-secondary" onclick="exportLedger()">تصدير Excel</button>
            </div>
          </form>
        </div>

        <div class="card">
          <h3>القيود المحاسبية (${journalsRes.total || 0})</h3>
          ${table(
        ['التاريخ', 'رقم القيد', 'البيان', 'الحساب', 'مدين', 'دائن', 'الحالة'],
        journals.map(j => [
          formatDate(j.date),
          j.entryNumber,
          j.description || '-',
          j.lines?.map(l => `${l.account?.code || ''} - ${l.account?.nameAr || ''}`).join('<br>') || '-',
          j.lines?.map(l => l.debit > 0 ? formatMoney(l.debit) : '').join('<br>') || '-',
          j.lines?.map(l => l.credit > 0 ? formatMoney(l.credit) : '').join('<br>') || '-',
          statusBadge(j.status)
        ])
      )}
        </div>

        ${journalsRes.total > state.limit ? `
          <div class="card">
            <div class="pagination">
              <button ${state.page <= 1 ? 'disabled' : ''} onclick="changePage(${state.page - 1})">السابق</button>
              <span>صفحة ${state.page} من ${Math.ceil(journalsRes.total / state.limit)}</span>
              <button ${state.page >= Math.ceil(journalsRes.total / state.limit) ? 'disabled' : ''} onclick="changePage(${state.page + 1})">التالي</button>
            </div>
          </div>
        ` : ''}
      `;

      document.getElementById('ledger-filters').addEventListener('submit', async (event) => {
        event.preventDefault();
        state.fromDate = document.getElementById('ledger-from').value;
        state.toDate = document.getElementById('ledger-to').value;
        state.accountId = document.getElementById('ledger-account').value;
        state.entryNumber = document.getElementById('ledger-entry').value;
        state.page = 1;
        await load();
      });

      window.changePage = async (page) => {
        state.page = page;
        await load();
      };

      window.exportLedger = async () => {
        try {
          const response = await fetch(`http://localhost:3000/api/journals/export${toQuery({
            dateFrom: state.fromDate,
            dateTo: state.toDate,
            accountId: state.accountId || undefined,
            entryNumber: state.entryNumber || undefined
          })}`, {
            headers: { Authorization: `Bearer ${store.token}` }
          });

          if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'general-ledger.xlsx';
            a.click();
            window.URL.revokeObjectURL(url);
            toast('تم تصدير الأستاذ العام بنجاح', 'success');
          } else {
            toast('فشل في تصدير الأستاذ العام', 'error');
          }
        } catch (error) {
          toast('خطأ في التصدير', 'error');
        }
      };

      setPageActions({
        onRefresh: () => load(),
        onSearch: () => document.getElementById('ledger-entry').focus()
      });
    } catch (error) {
      console.error('Error loading general ledger:', error);
      view.innerHTML = `
        <div class="card">
          <h3>خطأ في تحميل الأستاذ العام</h3>
          <p class="error">${error.message}</p>
          <button onclick="load()" class="btn btn-primary">إعادة المحاولة</button>
        </div>
      `;
    }
  };

  await load();
}

// Account Statement Implementation
async function renderAccountStatement() {
  setTitle('كشف حساب');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل كشف الحساب...</div>';

  const state = {
    type: 'ACCOUNT',
    id: '',
    fromDate: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
    toDate: new Date().toISOString().slice(0, 10),
    export: null
  };

  const downloadCsv = (filename, headers, rows) => {
    const body = [headers, ...rows]
      .map((line) => line.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderReport = async () => {
    const panel = document.getElementById('statement-result');
    if (!panel) return;

    if (!state.id) {
      panel.innerHTML = '<p class="muted">اختر المعايير ثم اضغط "عرض الكشف".</p>';
      return;
    }

    panel.innerHTML = '<p class="muted">جاري تحميل البيانات...</p>';

    try {
      if (state.type === 'ACCOUNT') {
        const stmt = extractData(
          await api(`/reports/account-statement${toQuery({
            accountId: state.id,
            dateFrom: state.fromDate,
            dateTo: state.toDate
          })}`)
        ) || {};

        const rows = Array.isArray(stmt.rows) ? stmt.rows : [];
        const summary = stmt.summary || {};
        const totalDebit = Number(summary.totalDebit || 0);
        const totalCredit = Number(summary.totalCredit || 0);
        const closingBalance = Number(summary.closingBalance || 0);
        const openingBalance = Number(summary.openingBalance ?? (closingBalance - totalDebit + totalCredit));

        panel.innerHTML = `
          <h3>كشف حساب: ${stmt.account?.code || ''} - ${stmt.account?.nameAr || ''}</h3>
          <div class="kpi-grid">
            <div class="kpi"><div>الرصيد الافتتاحي</div><div class="val">${formatMoney(openingBalance)}</div></div>
            <div class="kpi"><div>إجمالي المدين</div><div class="val">${formatMoney(totalDebit)}</div></div>
            <div class="kpi"><div>إجمالي الدائن</div><div class="val">${formatMoney(totalCredit)}</div></div>
            <div class="kpi"><div>الرصيد الختامي</div><div class="val">${formatMoney(closingBalance)}</div></div>
          </div>
          ${table(
            ['التاريخ', 'رقم القيد', 'البيان', 'مدين', 'دائن', 'الرصيد'],
            rows.map((r) => [
              formatDate(r.date),
              r.entryNumber || '-',
              r.description || '-',
              formatMoney(r.debit),
              formatMoney(r.credit),
              formatMoney(r.balance)
            ])
          )}
        `;

        state.export = {
          filename: `statement-account-${stmt.account?.code || state.id}.csv`,
          headers: ['Date', 'EntryNumber', 'Description', 'Debit', 'Credit', 'Balance'],
          rows: rows.map((r) => [formatDate(r.date), r.entryNumber || '', r.description || '', Number(r.debit || 0), Number(r.credit || 0), Number(r.balance || 0)])
        };
      } else {
        const isCustomer = state.type === 'CUSTOMER';
        const endpoint = isCustomer ? `/customers/${state.id}/statement` : `/suppliers/${state.id}/statement`;
        const stmt = extractData(await api(`${endpoint}${toQuery({ startDate: state.fromDate, endDate: state.toDate })}`)) || {};
        const transactions = Array.isArray(stmt.transactions) ? stmt.transactions : [];

        const totalDebit = transactions.reduce((sum, tx) => sum + Number(tx.debit || 0), 0);
        const totalCredit = transactions.reduce((sum, tx) => sum + Number(tx.credit || 0), 0);
        const finalBalance = Number(stmt.finalBalance || 0);
        const partyName = isCustomer ? (stmt.customer?.nameAr || stmt.customer?.code || state.id) : (stmt.supplier?.nameAr || stmt.supplier?.code || state.id);

        panel.innerHTML = `
          <h3>كشف ${isCustomer ? 'العميل' : 'المورد'}: ${partyName}</h3>
          <div class="kpi-grid">
            <div class="kpi"><div>إجمالي المدين</div><div class="val">${formatMoney(totalDebit)}</div></div>
            <div class="kpi"><div>إجمالي الدائن</div><div class="val">${formatMoney(totalCredit)}</div></div>
            <div class="kpi"><div>الرصيد الختامي</div><div class="val">${formatMoney(finalBalance)}</div></div>
          </div>
          ${table(
            ['التاريخ', 'النوع', 'الرقم', 'البيان', 'مدين', 'دائن', 'الرصيد'],
            transactions.map((tx) => [
              formatDate(tx.date),
              tx.type || '-',
              tx.number || '-',
              tx.description || '-',
              formatMoney(tx.debit || 0),
              formatMoney(tx.credit || 0),
              formatMoney(tx.balance || 0)
            ])
          )}
        `;

        state.export = {
          filename: `statement-${isCustomer ? 'customer' : 'supplier'}-${state.id}.csv`,
          headers: ['Date', 'Type', 'Number', 'Description', 'Debit', 'Credit', 'Balance'],
          rows: transactions.map((tx) => [formatDate(tx.date), tx.type || '', tx.number || '', tx.description || '', Number(tx.debit || 0), Number(tx.credit || 0), Number(tx.balance || 0)])
        };
      }
    } catch (error) {
      panel.innerHTML = `<p class="error">خطأ في تحميل الكشف: ${error.message}</p>`;
    }
  };

  const load = async () => {
    try {
      const [accountsRes, customersRes, suppliersRes] = await Promise.all([
        api('/accounts?page=1&limit=1000'),
        api('/customers?page=1&limit=1000'),
        api('/suppliers?page=1&limit=1000')
      ]);

      const accounts = extractRows(accountsRes).filter((a) => a.allowPosting);
      const customers = extractRows(customersRes);
      const suppliers = extractRows(suppliersRes);

      view.innerHTML = `
        <div class="card">
          <h3>إعداد كشف الحساب</h3>
          <form id="statement-form" class="grid-4">
            <div><label>نوع الكشف</label>
              <select id="stmt-type">
                <option value="ACCOUNT" ${state.type === 'ACCOUNT' ? 'selected' : ''}>حساب محاسبي</option>
                <option value="CUSTOMER" ${state.type === 'CUSTOMER' ? 'selected' : ''}>عميل</option>
                <option value="SUPPLIER" ${state.type === 'SUPPLIER' ? 'selected' : ''}>مورد</option>
              </select>
            </div>
            <div><label>العنصر</label>
              <select id="stmt-id" required>
                <option value="">اختر العنصر</option>
                ${
                  state.type === 'ACCOUNT'
                    ? accounts.map((a) => `<option value="${a.id}" ${String(state.id) === String(a.id) ? 'selected' : ''}>${a.code} - ${a.nameAr}</option>`).join('')
                    : state.type === 'CUSTOMER'
                      ? customers.map((c) => `<option value="${c.id}" ${String(state.id) === String(c.id) ? 'selected' : ''}>${c.code} - ${c.nameAr}</option>`).join('')
                      : suppliers.map((s) => `<option value="${s.id}" ${String(state.id) === String(s.id) ? 'selected' : ''}>${s.code} - ${s.nameAr}</option>`).join('')
                }
              </select>
            </div>
            <div><label>من تاريخ</label><input id="stmt-from" type="date" value="${state.fromDate}" /></div>
            <div><label>إلى تاريخ</label><input id="stmt-to" type="date" value="${state.toDate}" /></div>
            <div class="actions" style="grid-column:1 / -1;">
              <button type="submit" class="btn btn-primary">عرض الكشف</button>
              <button type="button" class="btn btn-secondary" id="statement-export">تصدير CSV</button>
            </div>
          </form>
        </div>
        <div class="card" id="statement-result">
          <p class="muted">اختر المعايير ثم اضغط "عرض الكشف".</p>
        </div>
      `;

      document.getElementById('stmt-type')?.addEventListener('change', async (event) => {
        state.type = event.target.value;
        state.id = '';
        state.export = null;
        await load();
      });

      document.getElementById('statement-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const id = document.getElementById('stmt-id')?.value || '';
        if (!id) {
          toast('يرجى اختيار عنصر لعرض الكشف', 'warning');
          return;
        }
        state.id = id;
        state.fromDate = document.getElementById('stmt-from')?.value || state.fromDate;
        state.toDate = document.getElementById('stmt-to')?.value || state.toDate;
        await renderReport();
      });

      document.getElementById('statement-export')?.addEventListener('click', () => {
        if (!state.export?.rows?.length) {
          toast('اعرض الكشف أولاً قبل التصدير', 'warning');
          return;
        }
        downloadCsv(state.export.filename, state.export.headers, state.export.rows);
        toast('تم تصدير كشف الحساب بنجاح', 'success');
      });

      setPageActions({
        onRefresh: () => load()
      });
    } catch (error) {
      console.error('Error loading account statement:', error);
      view.innerHTML = `
        <div class="card">
          <h3>خطأ في تحميل كشف الحساب</h3>
          <p class="error">${error.message}</p>
          <button id="statement-retry" class="btn btn-primary">إعادة المحاولة</button>
        </div>
      `;
      document.getElementById('statement-retry')?.addEventListener('click', () => load());
    }
  };

  await load();
}

// Year-End Closing Implementation
async function renderYearClose() {
  setTitle('معالج إقفال السنة المالية');
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">جاري تحميل معالج إقفال السنة...</div>';

  const state = {
    currentStep: 1,
    fiscalYear: null,
    checks: [],
    readyToClose: false
  };

  const steps = [
    { id: 1, title: 'التحقق من المتطلبات', description: 'التأكد من اكتمال جميع العمليات المطلوبة' },
    { id: 2, title: 'مراجعة الأرصدة', description: 'مراجعة أرصدة الحسابات وإعداد قائمة المراجعة' },
    { id: 3, title: 'إنشاء قيود الإقفال', description: 'إنشاء قيود إقفال الإيرادات والمصروفات' },
    { id: 4, title: 'إقفال السنة المالية', description: 'إقفال السنة وإنشاء قيد الافتتاح للسنة الجديدة' }
  ];

  const load = async () => {
    try {
      // Get current fiscal year
      const fiscalYearsRes = await api('/fiscal-years?status=ACTIVE');
      const fiscalYears = extractRows(fiscalYearsRes);
      const activeYear = fiscalYears.find((y) => y.status === 'OPEN' || y.isCurrent) || fiscalYears[0];

      if (!activeYear) {
        view.innerHTML = `
          <div class="card">
            <h3>معالج إقفال السنة المالية</h3>
            <p class="error">لا توجد سنة مالية نشطة حالياً.</p>
            <p>يرجى إنشاء سنة مالية جديدة أولاً.</p>
          </div>
        `;
        return;
      }

      state.fiscalYear = activeYear;

      // Perform pre-closing checks
      await performChecks();

      view.innerHTML = `
        <div class="card">
          <h3>معالج إقفال السنة المالية</h3>
          <div class="year-info">
            <div><strong>السنة المالية:</strong> ${activeYear.name}</div>
            <div><strong>من:</strong> ${formatDate(activeYear.startDate)} <strong>إلى:</strong> ${formatDate(activeYear.endDate)}</div>
            <div><strong>الحالة:</strong> ${activeYear.status === 'ACTIVE' ? 'نشطة' : activeYear.status}</div>
          </div>
        </div>

        <div class="steps-container">
          ${steps.map(step => `
            <div class="step ${state.currentStep >= step.id ? 'active' : ''} ${state.currentStep > step.id ? 'completed' : ''}">
              <div class="step-number">${step.id}</div>
              <div class="step-content">
                <h4>${step.title}</h4>
                <p>${step.description}</p>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="card" id="step-content">
          ${renderStepContent()}
        </div>
      `;

      // Add event listeners
      document.getElementById('next-btn')?.addEventListener('click', () => nextStep());
      document.getElementById('prev-btn')?.addEventListener('click', () => prevStep());
      document.getElementById('close-year-btn')?.addEventListener('click', () => closeYear());

      setPageActions({
        onRefresh: () => load()
      });
    } catch (error) {
      console.error('Error loading year close wizard:', error);
      view.innerHTML = `
        <div class="card">
          <h3>خطأ في تحميل معالج الإقفال</h3>
          <p class="error">${error.message}</p>
          <button onclick="load()" class="btn btn-primary">إعادة المحاولة</button>
        </div>
      `;
    }
  };

  const performChecks = async () => {
    try {
      const checks = [];
      const fiscalYear = Number(new Date(state.fiscalYear.startDate).getUTCFullYear());
      const checkRes = await api(`/year-close/check?fiscalYear=${fiscalYear}`);
      const result = extractData(checkRes) || {};
      const openPeriods = Number(result.openPeriods ?? 0);
      const draftEntries = Number(result.draftEntries ?? 0);

      checks.push({
        id: 'periods_closed',
        title: 'إقفال جميع الفترات المحاسبية',
        status: openPeriods === 0 ? 'PASS' : 'FAIL',
        message: openPeriods === 0 ? 'جميع الفترات مغلقة' : `يوجد ${openPeriods} فترة غير مغلقة`
      });
      checks.push({
        id: 'no_draft_journals',
        title: 'عدم وجود قيود مسودة',
        status: draftEntries === 0 ? 'PASS' : 'FAIL',
        message: draftEntries === 0 ? 'لا توجد قيود مسودة' : `يوجد ${draftEntries} قيد مسودة`
      });
      const trialBalanceRes = await api('/reports/trial-balance');
      const trial = extractData(trialBalanceRes) || {};
      const difference = Number(trial?.totals?.difference ?? 0);
      const isBalanced = Math.abs(difference) < 0.01;
      checks.push({
        id: 'trial_balance_balanced',
        title: 'توازن ميزان المراجعة',
        status: isBalanced ? 'PASS' : 'FAIL',
        message: isBalanced ? 'ميزان المراجعة متوازن' : 'ميزان المراجعة غير متوازن'
      });

      state.checks = checks;
      state.readyToClose = checks.every(c => c.status === 'PASS');
    } catch (error) {
      console.error('Error performing checks:', error);
      state.checks = [];
      state.readyToClose = false;
    }
  };

  const renderStepContent = () => {
    switch (state.currentStep) {
      case 1:
        return `
          <h3>التحقق من المتطلبات</h3>
          <div class="checks-list">
            ${state.checks.map(check => `
              <div class="check-item ${check.status.toLowerCase()}">
                <div class="check-icon">${check.status === 'PASS' ? '✓' : '✗'}</div>
                <div class="check-details">
                  <h4>${check.title}</h4>
                  <p>${check.message}</p>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="step-actions">
            <button id="next-btn" class="btn btn-primary" ${!state.readyToClose ? 'disabled' : ''}>
              ${state.readyToClose ? 'التالي' : 'يرجى إكمال المتطلبات أولاً'}
            </button>
          </div>
        `;

      case 2:
        return `
          <h3>مراجعة الأرصدة</h3>
          <p>يرجى مراجعة أرصدة الحسابات التالية قبل المتابعة:</p>
          <div id="accounts-review" class="loading">جاري تحميل الأرصدة...</div>
          <div class="step-actions">
            <button id="prev-btn" class="btn btn-secondary">السابق</button>
            <button id="next-btn" class="btn btn-primary">التالي</button>
          </div>
        `;

      case 3:
        return `
          <h3>إنشاء قيود الإقفال</h3>
          <p>سيتم إنشاء قيود إقفال الإيرادات والمصروفات تلقائياً:</p>
          <div id="closing-entries" class="loading">جاري إعداد قيود الإقفال...</div>
          <div class="warning">
            <strong>تحذير:</strong> هذه العملية لا يمكن التراجع عنها. تأكد من مراجعة البيانات بعناية.
          </div>
          <div class="step-actions">
            <button id="prev-btn" class="btn btn-secondary">السابق</button>
            <button id="next-btn" class="btn btn-primary">إنشاء قيود الإقفال</button>
          </div>
        `;

      case 4:
        return `
          <h3>إقفال السنة المالية</h3>
          <p>الخطوة الأخيرة: إقفال السنة المالية وإنشاء قيد الافتتاح للسنة الجديدة.</p>
          <div class="summary">
            <h4>ملخص العملية:</h4>
            <ul>
              <li>إقفال السنة المالية الحالية</li>
              <li>إنشاء سنة مالية جديدة</li>
              <li>ترحيل الأرصدة الختامية كأرصدة افتتاحية</li>
            </ul>
          </div>
          <div class="warning">
            <strong>تحذير نهائي:</strong> هذه العملية لا يمكن التراجع عنها. تأكد من عمل نسخة احتياطية قبل المتابعة.
          </div>
          <div class="step-actions">
            <button id="prev-btn" class="btn btn-secondary">السابق</button>
            <button id="close-year-btn" class="btn btn-danger">إقفال السنة المالية</button>
          </div>
        `;

      default:
        return '<p>خطوة غير معروفة</p>';
    }
  };

  const nextStep = async () => {
    if (state.currentStep === 3) {
      const fiscalYear = Number(new Date(state.fiscalYear.startDate).getUTCFullYear());
      await withToast(
        () =>
          api('/year-close/transfer-balances', 'POST', {
            fiscalYear,
            nextFiscalYear: fiscalYear + 1
          }),
        'تم إنشاء قيود الإقفال'
      );
    }
    if (state.currentStep < steps.length) {
      state.currentStep++;
      await load();
    }
  };

  const prevStep = async () => {
    if (state.currentStep > 1) {
      state.currentStep--;
      await load();
    }
  };

  const closeYear = async () => {
    if (!confirm('هل أنت متأكد من إقفال السنة المالية؟ هذه العملية لا يمكن التراجع عنها.')) {
      return;
    }

    try {
      const fiscalYear = Number(new Date(state.fiscalYear.startDate).getUTCFullYear());
      await withToast(
        () =>
          api('/year-close/opening-entry', 'POST', {
            fiscalYear,
            nextFiscalYear: fiscalYear + 1
          }),
        'تمت جدولة إنشاء قيد الافتتاح'
      );
      toast('تم تنفيذ إجراءات إقفال السنة وجدولة قيد الافتتاح', 'success');
      location.hash = '#/dashboard';
    } catch (error) {
      toast('فشل في إقفال السنة المالية', 'error');
    }
  };

  await load();
}

async function init() {
  wireShellInteractions();
  bindGlobalShortcuts();

  const user = await ensureUser();
  userBadge(user);
  updateShellVisibility();
  drawNav();

  const logoutBtn = document.getElementById('logout-btn');
  setVisible(logoutBtn, Boolean(store.token));
  logoutBtn.addEventListener('click', () => {
    logout();
    setVisible(logoutBtn, false);
    updateShellVisibility();
    drawNav();
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
    updateShellVisibility();
    setVisible(logoutBtn, !(location.hash === '#/login' || !store.token));
    if (store.token) drawNav();
  });
}

init();
