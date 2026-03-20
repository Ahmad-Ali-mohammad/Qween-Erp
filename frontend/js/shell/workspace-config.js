import { t } from '../i18n/ar.js';
import { findSystemByPath, systemsGroupMeta, systemsRegistry } from '../systems/registry.js';

export const routePermissions = {
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

const workspaceSections = [
  {
    id: 'today',
    title: t('nav.today', 'اليوم'),
    kicker: 'أهم المهام',
    description: 'اختصارات العمل اليومي والعودة السريعة لما تستخدمه باستمرار.',
    focusRoles: ['admin', 'finance', 'commercial', 'operations'],
    items: [
      { path: '/dashboard', label: 'لوحة العمل', meta: 'ملخص الدور الحالي' },
      { path: '/quick-journal', label: 'قيد سريع', meta: 'إدخال يومي مباشر' },
      { path: '/quick-invoice', label: 'فاتورة سريعة', meta: 'إنشاء وإصدار سريع' },
      { path: '/global-search', label: 'بحث شامل', meta: 'وصول للسجلات' }
    ],
    secondary: [
      { path: '/quick-statement', label: 'كشف حساب' },
      { path: '/profile', label: 'ملفي' }
    ]
  },
  {
    id: 'finance',
    title: t('nav.accounting', 'المالية'),
    kicker: 'الإقفال والتقارير',
    description: 'القيود، الدليل، الفترات، والتقارير المالية الأساسية.',
    focusRoles: ['admin', 'finance'],
    items: [
      { path: '/accounts', label: 'دليل الحسابات', meta: 'الهيكل المالي' },
      { path: '/journals', label: 'قيود اليومية', meta: 'مسودات وترحيل' },
      { path: '/reports/trial-balance', label: 'ميزان المراجعة', meta: 'مراجعة التوازن' },
      { path: '/year-close', label: 'إقفال السنة', meta: 'تحقق ومعالجة' }
    ],
    secondary: [
      { path: '/account-statement', label: 'كشف حساب' },
      { path: '/fiscal-years', label: 'السنوات المالية' },
      { path: '/periods', label: 'الفترات' },
      { path: '/reports/income-statement', label: 'قائمة الدخل' }
    ]
  },
  {
    id: 'commercial',
    title: t('nav.sales', 'المبيعات والتحصيل'),
    kicker: 'من العرض للتحصيل',
    description: 'إدارة العملاء وعروض الأسعار والفواتير وسندات القبض.',
    focusRoles: ['admin', 'commercial', 'finance'],
    items: [
      { path: '/customers', label: 'العملاء', meta: 'بيانات وملفات العميل' },
      { path: '/sales-quotes', label: 'عروض الأسعار', meta: 'تهيئة وتحويل' },
      { path: '/sales-invoices', label: 'فواتير المبيعات', meta: 'إصدار ومتابعة' },
      { path: '/receipts', label: 'سندات القبض', meta: 'توزيع على الفواتير' }
    ],
    secondary: [
      { path: '/sales-reports', label: 'تقارير المبيعات' },
      { path: '/sales-returns', label: 'مرتجعات المبيعات' },
      { path: '/opportunities', label: 'فرص البيع' }
    ]
  },
  {
    id: 'procurement',
    title: t('nav.purchasing', 'المشتريات'),
    kicker: 'الطلب حتى السداد',
    description: 'إدارة الموردين وأوامر الشراء وفواتير المشتريات وسندات الدفع.',
    focusRoles: ['admin', 'commercial', 'finance', 'operations'],
    items: [
      { path: '/suppliers', label: 'الموردون', meta: 'بيانات الموردين' },
      { path: '/purchase-orders', label: 'طلبات الشراء', meta: 'التجهيز والتوريد' },
      { path: '/purchase-invoices', label: 'فواتير الشراء', meta: 'اعتماد وتحليل' },
      { path: '/payment-vouchers', label: 'سندات الدفع', meta: 'ربط بالفواتير' }
    ],
    secondary: [
      { path: '/purchase-returns', label: 'مرتجعات المشتريات' },
      { path: '/purchase-reports', label: 'تقارير المشتريات' }
    ]
  },
  {
    id: 'operations',
    title: t('nav.operations', 'التشغيل'),
    kicker: 'الأصول والمخزون والبنوك',
    description: 'المستودعات، الأصول، البنوك، الموازنات، والضرائب التشغيلية.',
    focusRoles: ['admin', 'operations', 'finance'],
    items: [
      { path: '/items', label: 'الأصناف', meta: 'البيانات الرئيسية' },
      { path: '/assets', label: 'الأصول', meta: 'سجل الأصول والإهلاك' },
      { path: '/banks', label: 'البنوك والخزينة', meta: 'حسابات وتسويات' },
      { path: '/tax-declarations', label: 'الإقرارات الضريبية', meta: 'التزامات دورية' }
    ],
    secondary: [
      { path: '/stock-counts', label: 'جرد المخزون' },
      { path: '/budgets', label: 'الموازنات' },
      { path: '/currencies', label: 'العملات' },
      { path: '/tax-codes', label: 'أكواد الضرائب' }
    ]
  },
  {
    id: 'administration',
    title: t('nav.administration', 'الإدارة'),
    kicker: 'الأمان والإعدادات',
    description: 'المستخدمون والصلاحيات والإعدادات العامة والتدقيق والنسخ.',
    focusRoles: ['admin'],
    items: [
      { path: '/users-roles', label: 'المستخدمون والصلاحيات', meta: 'وصول وأدوار' },
      { path: '/company-settings', label: 'إعدادات الشركة', meta: 'ملف الشركة' },
      { path: '/security', label: 'الأمان', meta: 'سياسات ومصادقة' },
      { path: '/backups', label: 'النسخ الاحتياطي', meta: 'الاستعادة والجدولة' }
    ],
    secondary: [
      { path: '/audit-logs', label: 'سجل التدقيق' },
      { path: '/integrations', label: 'التكاملات' },
      { path: '/notifications', label: 'الإشعارات' }
    ]
  }
];

const dashboardProfiles = {
  admin: {
    id: 'admin',
    title: 'لوحة قيادة المؤسسة',
    subtitle: 'راقب صحة التشغيل، التفويضات، والأعمال المعلقة عبر الوحدات.',
    heroNote: 'الأولوية: تخفيف الأعمال العالقة وضمان الاستقرار التشغيلي.',
    primaryActions: [
      { path: '#/users-roles', label: 'إدارة الصلاحيات' },
      { path: '#/backups', label: 'النسخ الاحتياطية' },
      { path: '#/integrations', label: 'التكاملات' }
    ],
    priorityMetrics: [
      { key: 'openTasks', label: 'مهام مفتوحة', route: '#/tasks', source: 'kpis' },
      { key: 'pendingInvoices', label: 'فواتير تنتظر معالجة', route: '#/sales-invoices', source: 'kpis' },
      { key: 'pendingPayments', label: 'سندات تنتظر اعتماد', route: '#/payment-vouchers', source: 'kpis' },
      { key: 'draftEntries', label: 'قيود مسودة', route: '#/journals', source: 'kpis' }
    ],
    reviewBlocks: [
      { key: 'tasks', label: 'مهام الفريق', empty: 'لا توجد مهام مفتوحة.', route: '#/tasks' },
      { key: 'tickets', label: 'تذاكر الدعم', empty: 'لا توجد تذاكر مفتوحة.', route: '#/support-tickets' },
      { key: 'leaves', label: 'طلبات الإجازة', empty: 'لا توجد طلبات إجازة معلقة.', route: '#/leave-requests' }
    ]
  },
  finance: {
    id: 'finance',
    title: 'مكتب القيادة المالية',
    subtitle: 'تابع المسودات والترحيل والتحصيلات والمدفوعات اليومية من شاشة واحدة.',
    heroNote: 'الأولوية: ترحيل ما يمكن ترحيله وتقليل المستحقات المفتوحة.',
    primaryActions: [
      { path: '#/quick-journal', label: 'قيد سريع' },
      { path: '#/reports/trial-balance', label: 'ميزان المراجعة' },
      { path: '#/year-close', label: 'إقفال السنة' }
    ],
    priorityMetrics: [
      { key: 'draftEntries', label: 'قيود مسودة', route: '#/journals', source: 'kpis' },
      { key: 'pendingPayments', label: 'مدفوعات معلقة', route: '#/payment-vouchers', source: 'kpis' },
      { key: 'pendingInvoices', label: 'فواتير مفتوحة', route: '#/sales-invoices', source: 'kpis' },
      { key: 'netResult', label: 'صافي النتيجة', route: '#/reports/income-statement', source: 'derived' }
    ],
    reviewBlocks: [
      { key: 'journals', label: 'قيود حديثة', empty: 'لا توجد قيود حديثة.', route: '#/journals', source: 'recent' },
      { key: 'invoices', label: 'فواتير حديثة', empty: 'لا توجد فواتير حديثة.', route: '#/sales-invoices', source: 'recent' },
      { key: 'tasks', label: 'مهام متابعة', empty: 'لا توجد مهام متابعة.', route: '#/tasks' }
    ]
  },
  commercial: {
    id: 'commercial',
    title: 'مكتب المبيعات والتحصيل',
    subtitle: 'نظّم العروض والفواتير والتحصيلات حسب العميل والزمن والاستحقاق.',
    heroNote: 'الأولوية: تحويل العروض وإغلاق الفواتير المفتوحة بسرعة.',
    primaryActions: [
      { path: '#/sales-quotes', label: 'عرض سعر جديد' },
      { path: '#/sales-invoices', label: 'فاتورة مبيعات' },
      { path: '#/receipts', label: 'سند قبض' }
    ],
    priorityMetrics: [
      { key: 'pendingInvoices', label: 'فواتير بانتظار تحصيل', route: '#/sales-invoices', source: 'kpis' },
      { key: 'pendingPayments', label: 'تحصيلات قيد المعالجة', route: '#/receipts', source: 'kpis' },
      { key: 'salesTotal', label: 'إجمالي المبيعات', route: '#/reports/kpis', source: 'derived' },
      { key: 'openTasks', label: 'متابعات مفتوحة', route: '#/tasks', source: 'kpis' }
    ],
    reviewBlocks: [
      { key: 'invoices', label: 'آخر الفواتير', empty: 'لا توجد فواتير حديثة.', route: '#/sales-invoices', source: 'recent' },
      { key: 'tasks', label: 'مهام فريق المبيعات', empty: 'لا توجد مهام مفتوحة.', route: '#/tasks' },
      { key: 'tickets', label: 'طلبات العملاء', empty: 'لا توجد طلبات دعم حالياً.', route: '#/support-tickets' }
    ]
  },
  operations: {
    id: 'operations',
    title: 'لوحة المتابعة التشغيلية',
    subtitle: 'تابع المخزون والأصول والتوريد والمهام ذات الأثر التشغيلي المباشر.',
    heroNote: 'الأولوية: إزالة اختناقات التنفيذ وتنسيق الأعمال العابرة للوحدات.',
    primaryActions: [
      { path: '#/purchase-orders', label: 'طلب شراء' },
      { path: '#/assets', label: 'متابعة الأصول' },
      { path: '#/items', label: 'بيانات الأصناف' }
    ],
    priorityMetrics: [
      { key: 'openTasks', label: 'مهام مفتوحة', route: '#/tasks', source: 'kpis' },
      { key: 'activeAssets', label: 'أصول نشطة', route: '#/assets', source: 'kpis' },
      { key: 'pendingPayments', label: 'مدفوعات تتطلب متابعة', route: '#/payment-vouchers', source: 'kpis' },
      { key: 'expenseTotal', label: 'إجمالي المصروفات', route: '#/purchase-invoices', source: 'derived' }
    ],
    reviewBlocks: [
      { key: 'tasks', label: 'قائمة المهام', empty: 'لا توجد مهام تشغيلية مفتوحة.', route: '#/tasks' },
      { key: 'tickets', label: 'طلبات الدعم', empty: 'لا توجد بلاغات حالية.', route: '#/support-tickets' },
      { key: 'leaves', label: 'إجازات معلقة', empty: 'لا توجد إجازات معلقة.', route: '#/leave-requests' }
    ]
  }
};

function hasPermission(user, permissionKey) {
  if (!permissionKey) return true;
  if (!user?.permissions) return false;
  return user.permissions[permissionKey] === true;
}

export function canAccessPath(path, user) {
  const systemMatch = findSystemByPath(path);
  if (systemMatch) {
    return hasPermission(user, systemMatch.permission);
  }
  return hasPermission(user, routePermissions[path]);
}

function getSystemSections(user, profile) {
  const visibleSystems = systemsRegistry.filter((system) => canAccessPath(system.route, user));

  return Object.entries(systemsGroupMeta)
    .map(([group, meta]) => {
      const items = visibleSystems
        .filter((system) => system.group === group)
        .map((system) => ({
          path: system.route,
          label: system.title,
          meta: system.summary
        }));

      return {
        id: `systems-${group}`,
        title: meta.title,
        kicker: meta.kicker,
        description: meta.description,
        focusRoles: [profile],
        items,
        secondary: []
      };
    })
    .filter((section) => section.items.length > 0)
    .map((section, index) => ({
      ...section,
      isPriority: index === 0
    }));
}

export function resolveRoleProfile(user) {
  if (hasPermission(user, 'users.read') || hasPermission(user, 'security.read') || hasPermission(user, 'backup.read')) {
    return 'admin';
  }

  if (hasPermission(user, 'accounts.read') || hasPermission(user, 'journal.read') || hasPermission(user, 'fiscal.read')) {
    return 'finance';
  }

  if (hasPermission(user, 'commercial.read') || hasPermission(user, 'invoice.read') || hasPermission(user, 'payment.read')) {
    return 'commercial';
  }

  return 'operations';
}

export function getNavigationSections(user) {
  const profile = resolveRoleProfile(user);
  const systemSections = getSystemSections(user, profile);

  const workspaceVisibleSections = workspaceSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccessPath(item.path, user)),
      secondary: (section.secondary || []).filter((item) => canAccessPath(item.path, user)),
      isPriority: section.focusRoles.includes(profile)
    }))
    .filter((section) => section.items.length > 0)
    .sort((left, right) => Number(right.isPriority) - Number(left.isPriority));

  return [...systemSections, ...workspaceVisibleSections];
}

export function getDashboardProfile(user) {
  return dashboardProfiles[resolveRoleProfile(user)] || dashboardProfiles.operations;
}
