export function createSystemsRegistry(dashboardRendererFactory = null) {
  const realSystemKeys = new Set([
    'control-center',
    'accounting',
    'crm',
    'hr',
    'printing',
    'projects',
    'procurement',
    'inventory',
    'assets',
    'subcontractors',
    'site-ops',
    'documents',
    'contracts',
    'analytics',
    'tendering',
    'budgeting',
    'quality',
    'maintenance',
    'risk',
    'scheduling'
  ]);

  const definitions = [
    {
      key: 'control-center',
      title: 'مركز الرقابة المركزي',
      icon: 'control',
      permission: null,
      route: '/systems/control-center',
      namespace: 'control-center',
      theme: 'governance',
      layout: ['hero', 'systems', 'summary', 'alerts', 'charts', 'queues', 'activity'],
      group: 'core',
      summary: 'الموافقات الموحدة والتنبيهات والأحداث التنفيذية في مكان واحد.',
      quickActions: [
        { label: 'المهام', path: '/tasks' },
        { label: 'الإشعارات', path: '/notifications' },
        { label: 'سجل التدقيق', path: '/audit-logs' }
      ]
    },
    {
      key: 'accounting',
      title: 'النظام المحاسبي',
      icon: 'ledger',
      permission: 'accounts.read',
      route: '/systems/accounting',
      namespace: 'finance',
      theme: 'finance',
      layout: ['hero', 'summary', 'charts', 'queues', 'activity', 'alerts'],
      group: 'core',
      summary: 'القيود والذمم والبنوك والفترات والإقفال المالي.',
      moneyKeys: ['receivables', 'payables', 'cash-position'],
      quickActions: [
        { label: 'القيود', path: '/journals' },
        { label: 'كشف الحساب', path: '/account-statement' },
        { label: 'إقفال السنة', path: '/year-close' }
      ]
    },
    {
      key: 'crm',
      title: 'إدارة علاقات العملاء',
      icon: 'crm',
      permission: 'crm.read',
      route: '/systems/crm',
      namespace: 'crm',
      theme: 'commercial',
      layout: ['hero', 'summary', 'queues', 'activity', 'charts', 'alerts'],
      group: 'core',
      summary: 'العملاء والفرص والعروض والتحصيل التجاري.',
      moneyKeys: ['pipeline'],
      quickActions: [
        { label: 'الفرص', path: '/opportunities' },
        { label: 'العروض', path: '/sales-quotes' },
        { label: 'التحصيل', path: '/receipts' }
      ]
    },
    {
      key: 'hr',
      title: 'الموارد البشرية',
      icon: 'people',
      permission: 'hr.read',
      route: '/systems/hr',
      namespace: 'hr',
      theme: 'people',
      layout: ['hero', 'summary', 'queues', 'alerts', 'activity', 'charts'],
      group: 'core',
      summary: 'الموظفون والحضور والإجازات والرواتب وتوزيع الوقت.',
      moneyKeys: ['labor-cost'],
      quickActions: [
        { label: 'الموظفون', path: '/employees' },
        { label: 'الإجازات', path: '/leave-requests' },
        { label: 'الرواتب', path: '/payroll-runs' }
      ]
    },
    {
      key: 'projects',
      title: 'إدارة المشاريع',
      icon: 'projects',
      permission: 'projects.read',
      route: '/systems/projects',
      namespace: 'projects',
      theme: 'projects',
      layout: ['hero', 'alerts', 'summary', 'activity', 'charts', 'queues'],
      group: 'core',
      summary: 'الميزانيات والمهام والتقدم والانحرافات والتكاليف الفعلية.',
      moneyKeys: ['project-budget', 'actual-cost'],
      quickActions: [
        { label: 'المشاريع', path: '/projects' },
        { label: 'المهام', path: '/project-tasks' },
        { label: 'المصروفات', path: '/project-expenses' }
      ]
    },
    {
      key: 'procurement',
      title: 'المشتريات',
      icon: 'procurement',
      permission: 'commercial.read',
      route: '/systems/procurement',
      namespace: 'procurement',
      theme: 'operations',
      layout: ['hero', 'summary', 'queues', 'alerts', 'activity', 'charts'],
      group: 'delivery',
      summary: 'الموردون والطلبات والاستلام والفواتير والدفعات.',
      moneyKeys: ['spend'],
      quickActions: [
        { label: 'أوامر الشراء', path: '/purchase-orders' },
        { label: 'فواتير الشراء', path: '/purchase-invoices' },
        { label: 'الموردون', path: '/suppliers' }
      ]
    },
    {
      key: 'inventory',
      title: 'المخزون',
      icon: 'inventory',
      permission: 'inventory.read',
      route: '/systems/inventory',
      namespace: 'inventory',
      theme: 'operations',
      layout: ['hero', 'alerts', 'summary', 'queues', 'charts', 'activity'],
      group: 'delivery',
      summary: 'الأصناف والمستودعات والحركات والجرد والحدود التشغيلية.',
      moneyKeys: ['inventory-value'],
      quickActions: [
        { label: 'الأصناف', path: '/items' },
        { label: 'المستودعات', path: '/warehouses' },
        { label: 'الجرد', path: '/stock-counts' }
      ]
    },
    {
      key: 'assets',
      title: 'المعدات والأصول',
      icon: 'assets',
      permission: 'assets.read',
      route: '/systems/assets',
      namespace: 'assets',
      theme: 'operations',
      layout: ['hero', 'summary', 'charts', 'activity', 'alerts', 'queues'],
      group: 'delivery',
      summary: 'الأصول والصيانة والإهلاك والقيمة الدفترية.',
      moneyKeys: ['nbv'],
      quickActions: [
        { label: 'الأصول', path: '/assets' },
        { label: 'الإهلاك', path: '/depreciation' },
        { label: 'التقارير', path: '/asset-reports' }
      ]
    },
    {
      key: 'subcontractors',
      title: 'المقاولون من الباطن',
      icon: 'subcontract',
      permission: 'contracts.read',
      route: '/systems/subcontractors',
      namespace: 'subcontractors',
      theme: 'operations',
      layout: ['hero', 'summary', 'alerts', 'queues', 'activity', 'charts'],
      group: 'delivery',
      summary: 'عقود التنفيذ الفرعي والمستخلصات والمدفوعات والتقييم.',
      quickActions: [
        { label: 'دفتر العقود', path: '/systems/subcontractors/contracts' },
        { label: 'المدفوعات', path: '/systems/subcontractors/payments' },
        { label: 'المشاريع', path: '/projects' }
      ]
    },
    {
      key: 'site-ops',
      title: 'التشغيل الميداني',
      icon: 'site',
      permission: 'projects.read',
      route: '/systems/site-ops',
      namespace: 'site-ops',
      theme: 'operations',
      layout: ['hero', 'alerts', 'summary', 'activity', 'queues', 'charts'],
      group: 'delivery',
      summary: 'اليومية الميدانية والمواد والأعطال والحضور في المواقع.',
      quickActions: [
        { label: 'اليومية', path: '/systems/site-ops/daily' },
        { label: 'طلبات المواد', path: '/systems/site-ops/materials' },
        { label: 'الحضور', path: '/systems/site-ops/attendance' }
      ]
    },
    {
      key: 'quality',
      title: 'الجودة والسلامة',
      icon: 'quality',
      permission: 'projects.read',
      route: '/systems/quality',
      namespace: 'quality',
      theme: 'governance',
      layout: ['hero', 'summary', 'alerts', 'activity', 'queues', 'charts'],
      group: 'delivery',
      summary: 'الفحوصات والحوادث وعدم المطابقة والتصاريح.',
      quickActions: [
        { label: 'الفحوصات', path: '/systems/quality/inspections' },
        { label: 'عدم المطابقة', path: '/systems/quality/ncr' },
        { label: 'الحوادث', path: '/systems/quality/incidents' }
      ]
    },
    {
      key: 'maintenance',
      title: 'الصيانة المتقدمة',
      icon: 'maintenance',
      permission: 'assets.read',
      route: '/systems/maintenance',
      namespace: 'maintenance',
      theme: 'operations',
      layout: ['hero', 'summary', 'queues', 'activity', 'alerts', 'charts'],
      group: 'delivery',
      summary: 'الجداول الوقائية وأوامر العمل وقطع الغيار وتحليل الأعطال.',
      quickActions: [
        { label: 'الخطط', path: '/systems/maintenance/plans' },
        { label: 'الأوامر', path: '/systems/maintenance/orders' },
        { label: 'الأعطال', path: '/systems/maintenance/failures' }
      ]
    },
    {
      key: 'documents',
      title: 'المستندات والمراسلات',
      icon: 'documents',
      permission: 'documents.read',
      route: '/systems/documents',
      namespace: 'documents',
      theme: 'governance',
      layout: ['hero', 'summary', 'activity', 'queues', 'alerts', 'charts'],
      group: 'governance',
      summary: 'الأرشفة والفهرسة والصلاحيات والبحث والربط المرجعي.',
      quickActions: [
        { label: 'المستندات', path: '/documents' },
        { label: 'العقود', path: '/contracts' }
      ]
    },
    {
      key: 'contracts',
      title: 'إدارة العقود',
      icon: 'contracts',
      permission: 'contracts.read',
      route: '/systems/contracts',
      namespace: 'contracts',
      theme: 'governance',
      layout: ['hero', 'summary', 'alerts', 'queues', 'activity', 'charts'],
      group: 'governance',
      summary: 'السجل الموحد للعقود والالتزامات والملاحق والمواعيد المهمة.',
      moneyKeys: ['commitments'],
      quickActions: [
        { label: 'العقود', path: '/contracts' },
        { label: 'المراحل', path: '/contract-milestones' }
      ]
    },
    {
      key: 'printing',
      title: 'المطبوعات والتصدير',
      icon: 'printing',
      permission: 'reports.read',
      route: '/systems/printing',
      namespace: 'printing',
      theme: 'governance',
      layout: ['hero', 'summary', 'queues', 'activity', 'alerts', 'charts'],
      group: 'governance',
      summary: 'القوالب والتصدير والأرشفة وسجل الإصدارات.',
      quickActions: [
        { label: 'القوالب', path: '/systems/printing/templates' },
        { label: 'المهام', path: '/systems/printing/jobs' },
        { label: 'الأرشيف', path: '/systems/printing/archive' }
      ]
    },
    {
      key: 'tendering',
      title: 'العطاءات والمناقصات',
      icon: 'tendering',
      permission: 'crm.read',
      route: '/systems/tendering',
      namespace: 'tendering',
      theme: 'commercial',
      layout: ['hero', 'summary', 'alerts', 'activity', 'queues', 'charts'],
      group: 'governance',
      summary: 'سجل العطاءات والتسعير والمنافسين والتحويل إلى عقود ومشاريع.',
      quickActions: [
        { label: 'دفتر العطاءات', path: '/systems/tendering/tenders' },
        { label: 'تحليل العطاءات', path: '/systems/tendering/analysis' },
        { label: 'الفرص', path: '/opportunities' }
      ]
    },
    {
      key: 'budgeting',
      title: 'الموازنات والتخطيط',
      icon: 'budgeting',
      permission: 'budget.read',
      route: '/systems/budgeting',
      namespace: 'budgeting',
      theme: 'finance',
      layout: ['hero', 'summary', 'charts', 'alerts', 'queues', 'activity'],
      group: 'governance',
      summary: 'الموازنات السنوية والانحرافات والتوقعات المالية.',
      quickActions: [
        { label: 'السيناريوهات', path: '/systems/budgeting/scenarios' },
        { label: 'الانحراف', path: '/systems/budgeting/variance' },
        { label: 'التوقعات', path: '/systems/budgeting/forecast' }
      ]
    },
    {
      key: 'risk',
      title: 'إدارة المخاطر',
      icon: 'risk',
      permission: 'projects.read',
      route: '/systems/risk',
      namespace: 'risk',
      theme: 'governance',
      layout: ['hero', 'alerts', 'summary', 'activity', 'queues', 'charts'],
      group: 'governance',
      summary: 'سجل المخاطر وخطط التخفيف والمتابعة حسب المشروع.',
      quickActions: [
        { label: 'السجل', path: '/systems/risk/register' },
        { label: 'الحرارة', path: '/systems/risk/heatmap' },
        { label: 'المتابعة', path: '/systems/risk/followup' }
      ]
    },
    {
      key: 'scheduling',
      title: 'الجدولة الزمنية',
      icon: 'schedule',
      permission: 'projects.read',
      route: '/systems/scheduling',
      namespace: 'scheduling',
      theme: 'projects',
      layout: ['hero', 'summary', 'alerts', 'charts', 'queues', 'activity'],
      group: 'governance',
      summary: 'الخطط الزمنية والاعتماديات والمسار الحرج وتحميل الموارد.',
      quickActions: [
        { label: 'الخطط', path: '/systems/scheduling/plans' },
        { label: 'المهام', path: '/systems/scheduling/tasks' },
        { label: 'المسار الحرج', path: '/systems/scheduling/critical-path' }
      ]
    },
    {
      key: 'analytics',
      title: 'التقارير وذكاء الأعمال',
      icon: 'analytics',
      permission: 'analytics.read',
      route: '/systems/analytics',
      namespace: 'analytics',
      theme: 'insight',
      layout: ['hero', 'summary', 'charts', 'activity', 'alerts', 'queues'],
      group: 'governance',
      summary: 'لوحات القيادة والتحليل والاتجاهات والتقارير التنفيذية.',
      quickActions: [
        { label: 'تقارير مخصصة', path: '/reports/custom' },
        { label: 'التوقعات', path: '/analytics/forecast' },
        { label: 'لوحة المركز', path: '/dashboard' }
      ]
    }
  ];

  return definitions.map((definition) => ({
    ...definition,
    maturity: realSystemKeys.has(definition.key) ? 'real' : 'skeleton',
    dashboardRenderer: dashboardRendererFactory ? dashboardRendererFactory(definition.key) : null
  }));
}

export const systemsRegistry = createSystemsRegistry();

export const systemsGroupMeta = {
  core: {
    title: 'الأنظمة الأساسية',
    kicker: 'النواة المؤسسية',
    description: 'القيادة والمالية والعملاء والموارد والمشاريع.'
  },
  delivery: {
    title: 'الأنظمة التشغيلية',
    kicker: 'التنفيذ والتوريد',
    description: 'المشتريات والمخزون والأصول والتشغيل الميداني.'
  },
  governance: {
    title: 'الأنظمة التكميلية',
    kicker: 'الحوكمة والتحليل',
    description: 'العقود والمستندات والعطاءات والجودة والتحليلات.'
  }
};

export function findSystemByRoute(path) {
  return systemsRegistry.find((system) => system.route === path) || null;
}

export function findSystemByPath(path) {
  return systemsRegistry.find((system) => path === system.route || path.startsWith(`${system.route}/`)) || null;
}

export function findSystemByKey(key) {
  return systemsRegistry.find((system) => system.key === key) || null;
}
