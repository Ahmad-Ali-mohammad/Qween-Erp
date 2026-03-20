import { PERMISSIONS } from '../../constants/permissions';

export type SystemDashboardKey =
  | 'accounting'
  | 'crm'
  | 'hr'
  | 'printing'
  | 'control-center'
  | 'projects'
  | 'procurement'
  | 'inventory'
  | 'assets'
  | 'subcontractors'
  | 'site-ops'
  | 'documents'
  | 'analytics'
  | 'quality'
  | 'maintenance'
  | 'contracts'
  | 'tendering'
  | 'budgeting'
  | 'risk'
  | 'scheduling';

export type SystemDashboardDefinition = {
  key: SystemDashboardKey;
  namespace: string;
  title: string;
  permission?: string;
  maturity: 'real' | 'skeleton';
};

export const SYSTEM_DASHBOARD_DEFINITIONS: SystemDashboardDefinition[] = [
  { key: 'accounting', namespace: 'finance', title: 'النظام المحاسبي', permission: PERMISSIONS.ACCOUNTS_READ, maturity: 'real' },
  { key: 'crm', namespace: 'crm', title: 'إدارة علاقات العملاء', permission: PERMISSIONS.CRM_READ, maturity: 'real' },
  { key: 'hr', namespace: 'hr', title: 'الموارد البشرية', permission: PERMISSIONS.HR_READ, maturity: 'real' },
  { key: 'printing', namespace: 'printing', title: 'المطبوعات والتصدير', permission: PERMISSIONS.REPORTS_READ, maturity: 'real' },
  { key: 'control-center', namespace: 'control-center', title: 'مركز الرقابة المركزي', maturity: 'real' },
  { key: 'projects', namespace: 'projects', title: 'إدارة المشاريع', permission: PERMISSIONS.PROJECTS_READ, maturity: 'real' },
  { key: 'procurement', namespace: 'procurement', title: 'المشتريات', permission: PERMISSIONS.COMMERCIAL_READ, maturity: 'real' },
  { key: 'inventory', namespace: 'inventory', title: 'المخزون', permission: PERMISSIONS.INVENTORY_READ, maturity: 'real' },
  { key: 'assets', namespace: 'assets', title: 'المعدات والأصول', permission: PERMISSIONS.ASSETS_READ, maturity: 'real' },
  { key: 'subcontractors', namespace: 'subcontractors', title: 'المقاولون من الباطن', permission: PERMISSIONS.CONTRACTS_READ, maturity: 'real' },
  { key: 'site-ops', namespace: 'site-ops', title: 'التشغيل الميداني', permission: PERMISSIONS.PROJECTS_READ, maturity: 'real' },
  { key: 'documents', namespace: 'documents', title: 'المستندات والمراسلات', permission: PERMISSIONS.DOCUMENTS_READ, maturity: 'real' },
  { key: 'analytics', namespace: 'analytics', title: 'التقارير وذكاء الأعمال', permission: PERMISSIONS.ANALYTICS_READ, maturity: 'real' },
  { key: 'quality', namespace: 'quality', title: 'الجودة والسلامة', permission: PERMISSIONS.PROJECTS_READ, maturity: 'real' },
  { key: 'maintenance', namespace: 'maintenance', title: 'الصيانة المتقدمة', permission: PERMISSIONS.ASSETS_READ, maturity: 'real' },
  { key: 'contracts', namespace: 'contracts', title: 'إدارة العقود', permission: PERMISSIONS.CONTRACTS_READ, maturity: 'real' },
  { key: 'tendering', namespace: 'tendering', title: 'العطاءات والمناقصات', permission: PERMISSIONS.CRM_READ, maturity: 'real' },
  { key: 'budgeting', namespace: 'budgeting', title: 'الموازنات والتخطيط المالي', permission: PERMISSIONS.BUDGET_READ, maturity: 'real' },
  { key: 'risk', namespace: 'risk', title: 'إدارة المخاطر', permission: PERMISSIONS.PROJECTS_READ, maturity: 'real' },
  { key: 'scheduling', namespace: 'scheduling', title: 'الجدولة الزمنية المتقدمة', permission: PERMISSIONS.PROJECTS_READ, maturity: 'real' }
];

export function getSystemDashboardDefinition(key: SystemDashboardKey): SystemDashboardDefinition {
  const definition = SYSTEM_DASHBOARD_DEFINITIONS.find((item) => item.key === key);
  if (!definition) {
    throw new Error(`Unknown system dashboard key: ${key}`);
  }
  return definition;
}
