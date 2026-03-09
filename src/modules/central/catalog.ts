import type { SystemStatus } from '../../types/central';

export type CentralSystemDefinition = {
  key: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  routeBase: string;
  appDir: string;
  apiBase: string;
  group: 'core' | 'operations' | 'support' | 'advanced';
  status: SystemStatus;
  permissions: string[];
  tags: string[];
};

export const CENTRAL_SYSTEMS: CentralSystemDefinition[] = [
  {
    key: 'control-center',
    titleAr: 'النظام المركزي',
    titleEn: 'Control Center',
    descriptionAr: 'بوابة الدخول الموحدة ومركز الصحة والتنبيهات والربط بين الأنظمة.',
    descriptionEn: 'Unified entry portal, health center, alerts, and cross-system links.',
    routeBase: '/portal',
    appDir: 'control-center',
    apiBase: '/api/v1/central',
    group: 'core',
    status: 'implemented',
    permissions: [],
    tags: ['central', 'portal']
  },
  {
    key: 'accounting',
    titleAr: 'المحاسبة',
    titleEn: 'Accounting',
    descriptionAr: 'دفتر الأستاذ والقيود والفترات والمدفوعات والتقارير المالية الأساسية.',
    descriptionEn: 'Ledger, journals, periods, payments, and core financial reporting.',
    routeBase: '/systems/accounting',
    appDir: 'accounting',
    apiBase: '/api/v1/accounting',
    group: 'core',
    status: 'implemented',
    permissions: ['accounting.read'],
    tags: ['accounting', 'journals', 'reports']
  },
  {
    key: 'crm',
    titleAr: 'إدارة العملاء والعقود التجارية',
    titleEn: 'CRM',
    descriptionAr: 'العملاء والفرص والعقود والتحويل إلى مشاريع.',
    descriptionEn: 'Customers, opportunities, contracts, and project conversion.',
    routeBase: '/systems/crm',
    appDir: 'crm',
    apiBase: '/api/v1/crm',
    group: 'core',
    status: 'implemented',
    permissions: ['crm.read'],
    tags: ['crm', 'customers', 'contracts']
  },
  {
    key: 'hr',
    titleAr: 'الموارد البشرية',
    titleEn: 'HR',
    descriptionAr: 'الموظفون والإجازات والحضور وسجلات الوقت والرواتب.',
    descriptionEn: 'Employees, leave, attendance, timesheets, and payroll.',
    routeBase: '/systems/hr',
    appDir: 'hr',
    apiBase: '/api/v1/hr',
    group: 'core',
    status: 'implemented',
    permissions: ['hr.read'],
    tags: ['hr', 'payroll', 'attendance']
  },
  {
    key: 'projects',
    titleAr: 'المشاريع',
    titleEn: 'Projects',
    descriptionAr: 'المشاريع والمراحل والمهام والميزانيات والتكاليف والربحية.',
    descriptionEn: 'Projects, phases, tasks, budgets, costs, and profitability.',
    routeBase: '/systems/projects',
    appDir: 'projects',
    apiBase: '/api/v1/projects',
    group: 'operations',
    status: 'implemented',
    permissions: ['projects.read'],
    tags: ['projects', 'wbs', 'costing']
  },
  {
    key: 'procurement',
    titleAr: 'المشتريات',
    titleEn: 'Procurement',
    descriptionAr: 'طلبات الشراء وأوامر الشراء والاستلام وفواتير الموردين.',
    descriptionEn: 'Purchase requests, orders, receipts, and vendor invoices.',
    routeBase: '/systems/procurement',
    appDir: 'procurement',
    apiBase: '/api/v1/procurement',
    group: 'operations',
    status: 'implemented',
    permissions: ['procurement.read'],
    tags: ['procurement', 'pr', 'po', 'grn']
  },
  {
    key: 'inventory',
    titleAr: 'المخزون',
    titleEn: 'Inventory',
    descriptionAr: 'الأصناف والمستودعات والحركات والجرد والحجوزات.',
    descriptionEn: 'Items, warehouses, movements, counts, and reservations.',
    routeBase: '/systems/inventory',
    appDir: 'inventory',
    apiBase: '/api/v1/inventory',
    group: 'operations',
    status: 'implemented',
    permissions: ['inventory.read'],
    tags: ['inventory', 'stock', 'warehouses']
  },
  {
    key: 'equipment',
    titleAr: 'المعدات والأصول',
    titleEn: 'Equipment & Assets',
    descriptionAr: 'تشغيل المعدات والتخصيص والصيانة والأصول الثابتة.',
    descriptionEn: 'Equipment operations, allocations, maintenance, and assets.',
    routeBase: '/systems/equipment',
    appDir: 'equipment',
    apiBase: '/api/v1/equipment',
    group: 'operations',
    status: 'implemented',
    permissions: ['equipment.read'],
    tags: ['equipment', 'assets', 'maintenance']
  },
  {
    key: 'subcontractors',
    titleAr: 'مقاولو الباطن',
    titleEn: 'Subcontractors',
    descriptionAr: 'عقود مقاولي الباطن والمستخلصات والمدفوعات والتقييم.',
    descriptionEn: 'Subcontractor contracts, certificates, payments, and performance.',
    routeBase: '/systems/subcontractors',
    appDir: 'subcontractors',
    apiBase: '/api/v1/subcontractors',
    group: 'operations',
    status: 'implemented',
    permissions: ['subcontractors.read'],
    tags: ['subcontractors', 'certificates', 'payments']
  },
  {
    key: 'site-ops',
    titleAr: 'التشغيل الميداني',
    titleEn: 'Site Operations',
    descriptionAr: 'اليوميات الميدانية وطلبات المواد والإنجاز وبلاغات المعدات.',
    descriptionEn: 'Daily site logs, material requests, progress, and equipment issues.',
    routeBase: '/systems/site-ops',
    appDir: 'site-ops',
    apiBase: '/api/v1/site',
    group: 'operations',
    status: 'implemented',
    permissions: ['site.read'],
    tags: ['site', 'field', 'operations']
  },
  {
    key: 'documents',
    titleAr: 'إدارة المستندات',
    titleEn: 'Document Management',
    descriptionAr: 'المستندات والإصدارات والمراسلات والبحث والربط بالكيانات.',
    descriptionEn: 'Documents, versions, correspondence, search, and entity linkage.',
    routeBase: '/systems/documents',
    appDir: 'documents',
    apiBase: '/api/v1/documents',
    group: 'support',
    status: 'implemented',
    permissions: ['attachments.read'],
    tags: ['documents', 'attachments', 'correspondence']
  },
  {
    key: 'bi',
    titleAr: 'التقارير وذكاء الأعمال',
    titleEn: 'Reporting & BI',
    descriptionAr: 'لوحات القيادة والتقارير المخصصة والنماذج القرائية.',
    descriptionEn: 'Dashboards, custom reporting, and read models.',
    routeBase: '/systems/bi',
    appDir: 'bi',
    apiBase: '/api/v1/reports',
    group: 'support',
    status: 'implemented',
    permissions: ['reports.read'],
    tags: ['bi', 'reports', 'analytics']
  },
  {
    key: 'quality-safety',
    titleAr: 'الجودة والسلامة',
    titleEn: 'Quality & Safety',
    descriptionAr: 'الفحوصات وعدم المطابقة والحوادث وتصاريح العمل.',
    descriptionEn: 'Inspections, NCRs, incidents, and permits.',
    routeBase: '/systems/quality-safety',
    appDir: 'quality-safety',
    apiBase: '/api/v1/quality',
    group: 'support',
    status: 'implemented',
    permissions: ['site.read'],
    tags: ['quality', 'safety', 'incidents']
  },
  {
    key: 'maintenance',
    titleAr: 'الصيانة المتقدمة',
    titleEn: 'Advanced Maintenance',
    descriptionAr: 'جداول الصيانة وأوامر العمل وقطع الغيار والتحليل.',
    descriptionEn: 'Maintenance schedules, work orders, spare parts, and analytics.',
    routeBase: '/systems/maintenance',
    appDir: 'maintenance',
    apiBase: '/api/v1/maintenance',
    group: 'support',
    status: 'implemented',
    permissions: ['equipment.read'],
    tags: ['maintenance', 'work-orders', 'spare-parts']
  },
  {
    key: 'contracts',
    titleAr: 'إدارة العقود المتقدمة',
    titleEn: 'Advanced Contracts',
    descriptionAr: 'سجل عقود موحد وملاحق وتجديدات وتنبيهات.',
    descriptionEn: 'Unified contract registry, amendments, renewals, and alerts.',
    routeBase: '/systems/contracts',
    appDir: 'contracts',
    apiBase: '/api/v1/contracts',
    group: 'advanced',
    status: 'implemented',
    permissions: ['contracts.read'],
    tags: ['contracts', 'amendments', 'renewals']
  },
  {
    key: 'tenders',
    titleAr: 'العطاءات والمناقصات',
    titleEn: 'Tendering & Bidding',
    descriptionAr: 'العطاءات وتقدير التكاليف والمنافسين والنتائج.',
    descriptionEn: 'Tenders, cost estimation, competitors, and results.',
    routeBase: '/systems/tenders',
    appDir: 'tenders',
    apiBase: '/api/v1/tenders',
    group: 'advanced',
    status: 'implemented',
    permissions: ['crm.read'],
    tags: ['tenders', 'bidding', 'estimation']
  },
  {
    key: 'budgets',
    titleAr: 'الموازنات والتخطيط المالي',
    titleEn: 'Budgeting & Financial Planning',
    descriptionAr: 'الموازنات السنوية والتوقعات والانحرافات مقابل الفعلي.',
    descriptionEn: 'Budgets, forecasts, and actual variance analysis.',
    routeBase: '/systems/budgets',
    appDir: 'budgets',
    apiBase: '/api/v1/budgets',
    group: 'advanced',
    status: 'implemented',
    permissions: ['budgets.read'],
    tags: ['budgets', 'forecast', 'variance']
  },
  {
    key: 'risks',
    titleAr: 'إدارة المخاطر',
    titleEn: 'Risk Management',
    descriptionAr: 'سجل المخاطر وتقييمها وخطط التخفيف والمتابعة.',
    descriptionEn: 'Risk register, assessment, mitigation plans, and follow-up.',
    routeBase: '/systems/risks',
    appDir: 'risks',
    apiBase: '/api/v1/risks',
    group: 'advanced',
    status: 'implemented',
    permissions: ['tasks.read'],
    tags: ['risks', 'mitigation', 'projects']
  },
  {
    key: 'scheduling',
    titleAr: 'الجدولة المتقدمة',
    titleEn: 'Advanced Scheduling',
    descriptionAr: 'الجداول الزمنية والمسار الحرج والموارد ومخطط جانت.',
    descriptionEn: 'Schedules, critical path, resources, and gantt planning.',
    routeBase: '/systems/scheduling',
    appDir: 'scheduling',
    apiBase: '/api/v1/scheduling',
    group: 'advanced',
    status: 'implemented',
    permissions: ['projects.read'],
    tags: ['scheduling', 'gantt', 'critical-path']
  },
  {
    key: 'printing',
    titleAr: 'الطباعة والتصدير',
    titleEn: 'Printing & Exports',
    descriptionAr: 'القوالب والمعاينات والملفات الناتجة وjobs الطباعة.',
    descriptionEn: 'Templates, previews, generated files, and print jobs.',
    routeBase: '/systems/printing',
    appDir: 'printing',
    apiBase: '/api/v1/printing',
    group: 'support',
    status: 'implemented',
    permissions: ['printing.read'],
    tags: ['printing', 'exports', 'pdf']
  }
];

export const CENTRAL_GROUP_ORDER = ['core', 'operations', 'support', 'advanced'] as const;
