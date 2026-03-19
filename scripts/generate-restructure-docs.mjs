import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const docsDir = path.join(rootDir, 'docs', 'restructure');
const systemsDir = path.join(docsDir, 'systems');

const systems = [
  {
    key: 'control-center',
    titleAr: 'النظام المركزي',
    routeBase: '/portal',
    apiBase: '/api/v1/central',
    status: 'foundation',
    ownedTables: ['roles', 'permissions', 'workflow_instances', 'workflow_actions', 'audit_logs'],
    dependencies: ['auth', 'org', 'numbering', 'sync', 'printing'],
    events: ['central.event.accepted', 'central.approval.requested'],
    backendTasks: ['تثبيت سجل التطبيقات والتنقل المركزي', 'توحيد health والتنبيهات والاستثناءات', 'ربط الموافقات والأحداث الداخلية بالبوابة المركزية'],
    apiTasks: ['تعريف /central/apps', '/central/navigation', '/central/health', '/central/permissions', '/central/events', '/central/approval-requests', '/central/exceptions', 'توثيق العقود داخل OpenAPI tags'],
    frontendTasks: ['تقديم بوابة دخول موحدة', 'عرض بطاقات الأنظمة وحالتها', 'توفير deep links لكل app مستقلة']
  },
  {
    key: 'accounting',
    titleAr: 'المحاسبة',
    routeBase: '/systems/accounting',
    apiBase: '/api/v1/accounting',
    status: 'foundation',
    ownedTables: ['accounts', 'journal_entries', 'journal_lines', 'fiscal_periods', 'payments', 'bank_accounts', 'reconciliations'],
    dependencies: ['projects', 'procurement', 'hr', 'equipment', 'budgets'],
    events: ['journal.posted', 'period.closed', 'payment.completed'],
    backendTasks: ['تنظيم وحدات الحسابات والقيود والفترات تحت bounded context واحد', 'تثبيت posting services وclosing guards', 'ربط الترحيلات الآلية مع بقية الأنظمة'],
    apiTasks: ['تجميع الكتالوج المالي تحت /accounting/*', 'توحيد تقارير trial balance وGL وcash flow', 'إضافة tags محاسبية موحدة في OpenAPI'],
    frontendTasks: ['إنشاء dashboard محاسبية مستقلة', 'فصل القيود والفترات والمدفوعات إلى صفحات داخلية', 'إزالة الاعتماد على صفحة عامة متضخمة']
  },
  {
    key: 'crm',
    titleAr: 'إدارة العملاء والعقود التجارية',
    routeBase: '/systems/crm',
    apiBase: '/api/v1/crm',
    status: 'implemented',
    ownedTables: ['customers', 'opportunities', 'contracts', 'contacts'],
    dependencies: ['projects', 'printing', 'attachments'],
    events: ['crm.opportunity.created', 'crm.contract.created', 'crm.contract.converted'],
    backendTasks: ['تثبيت ملكية العملاء والفرص والعقود التجارية', 'تقليل الازدواج مع contracts المتقدم', 'إضافة مسارات تحويل أوضح إلى المشاريع'],
    apiTasks: ['تثبيت /crm/customers و/opportunities و/contracts', 'إضافة endpoints للأنشطة والتحصيل التجاري لاحقاً', 'توثيق حالات التحويل في العقد البرمجي'],
    frontendTasks: ['نقل شاشة CRM الحالية إلى app مستقلة', 'فصل العملاء والفرص والعقود إلى tabs داخلية', 'ربط المرفقات والطباعة من داخل app']
  },
  {
    key: 'hr',
    titleAr: 'الموارد البشرية',
    routeBase: '/systems/hr',
    apiBase: '/api/v1/hr',
    status: 'implemented',
    ownedTables: ['employees', 'attendance', 'timesheets', 'leave_requests', 'payroll_runs', 'payroll_lines'],
    dependencies: ['projects', 'accounting', 'documents'],
    events: ['attendance.recorded', 'timesheet.approved', 'payroll.posted'],
    backendTasks: ['تجميع employee lifecycle داخل module واحدة', 'فصل attendance/timesheets/payroll كمسارات domain واضحة', 'ربط تحميل الأجور بالمشاريع والمحاسبة'],
    apiTasks: ['تثبيت /hr/employees و/attendance و/timesheets و/payroll', 'توحيد response envelopes للترحيل المحاسبي', 'إضافة export-ready endpoints لكشوف الرواتب'],
    frontendTasks: ['إنشاء app مستقلة لـ HR', 'تقسيم الموظفين والحضور والرواتب إلى شاشات فرعية', 'تخفيف حجم الصفحة الحالية']
  },
  {
    key: 'projects',
    titleAr: 'المشاريع',
    routeBase: '/systems/projects',
    apiBase: '/api/v1/projects',
    status: 'implemented',
    ownedTables: ['projects', 'project_phases', 'project_tasks', 'project_budgets', 'project_expenses', 'change_orders'],
    dependencies: ['crm', 'procurement', 'inventory', 'equipment', 'hr', 'site-ops'],
    events: ['project.created', 'project.cost.updated', 'project.progress.recorded'],
    backendTasks: ['تثبيت WBS والموازنات والتكاليف والربحية', 'فصل read models للمشروع عن أوامر CRUD', 'ربط site progress وtimesheets وallocations'],
    apiTasks: ['استقرار /projects/*', 'إضافة read endpoints للربحية والbudget vs actual', 'تجميع التكلفة الفعلية من بقية الأنظمة'],
    frontendTasks: ['نقل شاشة المشاريع الحالية إلى app مستقلة', 'إضافة dashboard ومشاهدات list/details/reports', 'الحفاظ على attachments والطباعة داخلياً']
  },
  {
    key: 'procurement',
    titleAr: 'المشتريات',
    routeBase: '/systems/procurement',
    apiBase: '/api/v1/procurement',
    status: 'implemented',
    ownedTables: ['purchase_requests', 'purchase_orders', 'goods_receipts', 'vendor_invoices', 'suppliers'],
    dependencies: ['projects', 'inventory', 'accounting', 'documents'],
    events: ['purchase.request.submitted', 'purchase.order.approved', 'goods.receipt.posted', 'vendor.invoice.recorded'],
    backendTasks: ['توحيد دورة الشراء تحت module واحدة', 'الحفاظ على aliases القديمة أثناء cutover', 'ربط الاستلام والفواتير بالمخزون والمحاسبة'],
    apiTasks: ['تثبيت /procurement/requests|orders|receipts|vendor-invoices', 'توثيق حالات PR/PO/GRN/VINV', 'إضافة read models للموافقات المفتوحة'],
    frontendTasks: ['نقل شاشة procurement الحالية إلى app مستقلة', 'تقسيم الإدخال السريع عن القوائم وسجلات التنفيذ', 'إبقاء المرفقات والطباعة من داخل النظام']
  },
  {
    key: 'inventory',
    titleAr: 'المخزون',
    routeBase: '/systems/inventory',
    apiBase: '/api/v1/inventory',
    status: 'foundation',
    ownedTables: ['items', 'warehouses', 'stock_moves', 'stock_balances', 'stock_reservations', 'stock_counts'],
    dependencies: ['procurement', 'projects', 'maintenance', 'accounting'],
    events: ['stock.move.posted', 'stock.count.approved', 'stock.reservation.created'],
    backendTasks: ['تنظيم وحدات الأصناف والمستودعات والحركات والجرد', 'فصل costing logic عن واجهات الإدخال', 'تجهيز reservation API للصيانة والمواقع'],
    apiTasks: ['إطلاق /inventory/items|balances|moves|counts', 'توحيد approve flows للجرد', 'إضافة read endpoints لتحليلات الحركة'],
    frontendTasks: ['إنشاء app مستقلة للمخزون', 'تقسيم الأصناف والمستودعات والحركات والجرد إلى صفحات فرعية', 'إضافة مؤشرات حالة المخزون']
  },
  {
    key: 'equipment',
    titleAr: 'المعدات والأصول',
    routeBase: '/systems/equipment',
    apiBase: '/api/v1/equipment',
    status: 'implemented',
    ownedTables: ['equipment', 'equipment_allocations', 'maintenance_logs', 'assets', 'depreciation_runs'],
    dependencies: ['projects', 'maintenance', 'inventory', 'accounting'],
    events: ['equipment.allocated', 'maintenance.logged', 'depreciation.posted'],
    backendTasks: ['فصل operations عن maintenance analytics', 'إبقاء asset lifecycle واضحاً داخل نفس context', 'ربط الإهلاك والتكاليف بالمحاسبة'],
    apiTasks: ['تثبيت /equipment/* و/assets/*', 'إضافة endpoints أكثر وضوحاً للصيانة والتحليلات', 'تجهيز قنوات reserve spare parts'],
    frontendTasks: ['نقل شاشة المعدات الحالية إلى app مستقلة', 'تقسيم الأصول والتشغيل والصيانة', 'تجهيز انتقال لاحق إلى app maintenance']
  },
  {
    key: 'subcontractors',
    titleAr: 'مقاولو الباطن',
    routeBase: '/systems/subcontractors',
    apiBase: '/api/v1/subcontractors',
    status: 'implemented',
    ownedTables: ['subcontractors', 'subcontract_contracts', 'subcontract_work_orders', 'subcontract_certificates', 'subcontract_payments', 'subcontract_performance_reviews'],
    dependencies: ['projects', 'accounting', 'documents', 'printing'],
    events: ['subcontract.contract.created', 'subcontract.certificate.approved', 'subcontract.payment.recorded'],
    backendTasks: ['تثبيت bounded context لمقاولي الباطن', 'ربط المستخلصات والمدفوعات بالمحاسبة', 'إضافة أوامر التغيير داخل نفس المجال'],
    apiTasks: ['تثبيت /subcontractors/*', 'إضافة performance reports وopen certificates', 'توحيد حالات العقود والمستخلصات'],
    frontendTasks: ['فصل شاشة مقاولي الباطن إلى app مستقلة', 'تقسيم العقود والمستخلصات والمدفوعات والتقييم', 'إبقاء المرفقات والتنقل إلى المشاريع']
  },
  {
    key: 'site-ops',
    titleAr: 'التشغيل الميداني',
    routeBase: '/systems/site-ops',
    apiBase: '/api/v1/site',
    status: 'implemented',
    ownedTables: ['site_daily_logs', 'site_material_requests', 'site_material_request_lines', 'site_progress_entries', 'site_equipment_issues'],
    dependencies: ['projects', 'inventory', 'equipment', 'hr', 'documents'],
    events: ['site.daily_log.recorded', 'site.material_request.fulfilled', 'site.progress.recorded', 'site.equipment_issue.reported'],
    backendTasks: ['تثبيت context ميداني منفصل', 'ربط material requests بالمخزون والمشتريات', 'إبقاء progress entries محدثة لمهام المشروع'],
    apiTasks: ['تثبيت /site/daily-log|material-requests|progress|equipment-issues', 'إضافة تقارير يومية وأسبوعية', 'توحيد approve/fulfill flows'],
    frontendTasks: ['نقل شاشة site ops الحالية إلى app مستقلة', 'الإبقاء على واجهة خفيفة للشاشات الصغيرة', 'فصل السجلات والموافقات والمرفقات']
  },
  {
    key: 'documents',
    titleAr: 'إدارة المستندات',
    routeBase: '/systems/documents',
    apiBase: '/api/v1/documents',
    status: 'foundation',
    ownedTables: ['attachments', 'document_versions', 'correspondence_register'],
    dependencies: ['control-center', 'crm', 'projects', 'procurement', 'hr', 'printing'],
    events: ['document.uploaded', 'document.versioned', 'correspondence.logged'],
    backendTasks: ['توسيع attachments إلى documents + versions + correspondence', 'إضافة search metadata وOCR hooks', 'توحيد الربط بالكيانات المختلفة'],
    apiTasks: ['إطلاق /documents/* مع search/version/download', 'إبقاء /attachments كـ compatibility alias', 'إضافة soft delete وسياسات retention'],
    frontendTasks: ['إنشاء app مستقلة للأرشفة والبحث', 'توفير filters حسب الكيان والنوع والمشروع', 'عرض history للإصدارات']
  },
  {
    key: 'bi',
    titleAr: 'التقارير وذكاء الأعمال',
    routeBase: '/systems/bi',
    apiBase: '/api/v1/reports',
    status: 'planned',
    ownedTables: ['report_snapshots', 'analytics_jobs', 'read_models_*'],
    dependencies: ['accounting', 'projects', 'procurement', 'inventory', 'hr', 'equipment', 'subcontractors'],
    events: ['report.job.requested', 'analytics.snapshot.completed'],
    backendTasks: ['فصل read-model layer عن routes التشغيلية', 'إضافة jobs للتجميع الثقيل', 'تجهيز integration لاحق مع Metabase أو Superset'],
    apiTasks: ['إطلاق /bi/dashboards و/custom-reports و/exports', 'الحفاظ على /reports الحالية كتوافق', 'توحيد filters المشتركة حسب branch/project/date'],
    frontendTasks: ['إنشاء app مستقلة للتقارير واللوحات', 'فصل executive dashboards عن report builder', 'دعم scheduled exports لاحقاً']
  },
  {
    key: 'quality-safety',
    titleAr: 'الجودة والسلامة',
    routeBase: '/systems/quality-safety',
    apiBase: '/api/v1/quality',
    status: 'planned',
    ownedTables: ['quality_inspections', 'non_conformities', 'safety_incidents', 'work_permits'],
    dependencies: ['projects', 'procurement', 'equipment', 'hr', 'documents'],
    events: ['quality.inspection.recorded', 'quality.ncr.opened', 'safety.incident.recorded'],
    backendTasks: ['إطلاق نماذج الفحوصات وعدم المطابقة والحوادث', 'ربط السجلات بالمشروع والموظف والمعدة', 'إضافة قواعد تنبيه للحوادث الخطيرة'],
    apiTasks: ['تعريف /quality/* و/safety/*', 'إضافة reports للسلامة والجودة', 'توحيد حالات incident/NCR lifecycle'],
    frontendTasks: ['إنشاء app مستقلة للجودة والسلامة', 'فصل inspections وNCR وincidents وpermits', 'ربط المرفقات والصور الميدانية']
  },
  {
    key: 'maintenance',
    titleAr: 'الصيانة المتقدمة',
    routeBase: '/systems/maintenance',
    apiBase: '/api/v1/maintenance',
    status: 'foundation',
    ownedTables: ['maintenance_schedules', 'maintenance_work_orders', 'maintenance_spare_parts'],
    dependencies: ['equipment', 'inventory', 'procurement', 'documents'],
    events: ['maintenance.schedule.created', 'maintenance.work_order.completed', 'maintenance.parts.reserved'],
    backendTasks: ['فصل الصيانة المتقدمة عن شاشة المعدات الحالية', 'إضافة جداول الصيانة وأوامر العمل وMTBF', 'ربط قطع الغيار بالمخزون'],
    apiTasks: ['إطلاق /maintenance/schedules|work-orders|reports', 'إضافة complete/cancel flows', 'توحيد reservation endpoints مع inventory'],
    frontendTasks: ['إنشاء app مستقلة للصيانة', 'تقسيم schedules وwork orders والتكاليف', 'إتاحة drill-down من equipment app']
  },
  {
    key: 'contracts',
    titleAr: 'إدارة العقود المتقدمة',
    routeBase: '/systems/contracts',
    apiBase: '/api/v1/contracts',
    status: 'foundation',
    ownedTables: ['contracts', 'contract_amendments', 'contract_milestones', 'contract_alerts'],
    dependencies: ['crm', 'procurement', 'subcontractors', 'hr', 'projects', 'documents'],
    events: ['contract.created', 'contract.amendment.approved', 'contract.expiring'],
    backendTasks: ['توحيد سجل العقود عبر الأنظمة دون تكرار النماذج', 'إضافة الملاحق والتجديدات والتنبيهات', 'تثبيت ownership boundaries مع CRM وsubcontractors'],
    apiTasks: ['إطلاق /contracts/*', 'إضافة endpoints للـ amendments والrenewals والexpiring reports', 'توثيق contract type matrix'],
    frontendTasks: ['إنشاء app مستقلة للعقود', 'تقسيم السجل الموحد عن التنبيهات والملاحق', 'إتاحة روابط رجوع إلى النظام المالك للعقد']
  },
  {
    key: 'tenders',
    titleAr: 'العطاءات والمناقصات',
    routeBase: '/systems/tenders',
    apiBase: '/api/v1/tenders',
    status: 'planned',
    ownedTables: ['tenders', 'tender_estimates', 'tender_competitors', 'tender_documents'],
    dependencies: ['crm', 'projects', 'documents', 'printing'],
    events: ['tender.created', 'tender.submitted', 'tender.result.recorded'],
    backendTasks: ['إطلاق سجل العطاءات والتقديرات الأولية', 'ربط العطاءات بفرص CRM', 'إضافة نتيجة العطاء وتحويل الفائز إلى عقد ومشروع'],
    apiTasks: ['إطلاق /tenders/*', 'إضافة submit/result/win-rate endpoints', 'تجهيز exports للعروض'],
    frontendTasks: ['إنشاء app مستقلة للعطاءات', 'تقسيم السجل والتقديرات والمنافسين والنتائج', 'إضافة روابط إلى CRM والمشاريع']
  },
  {
    key: 'budgets',
    titleAr: 'الموازنات والتخطيط المالي',
    routeBase: '/systems/budgets',
    apiBase: '/api/v1/budgets',
    status: 'foundation',
    ownedTables: ['budgets', 'budget_lines', 'budget_forecasts'],
    dependencies: ['accounting', 'projects', 'bi'],
    events: ['budget.created', 'budget.forecast.updated', 'budget.threshold.exceeded'],
    backendTasks: ['توسيع budgets الحالية إلى تشغيلي/رأسمالي/نقدي', 'إضافة مقارنة الفعلي والتوقع', 'ربط تجاوزات الموازنة بالتنبيهات المركزية'],
    apiTasks: ['تثبيت /budgets/*', 'إضافة /vs-actual و/forecast و/variance', 'توحيد dimension filters'],
    frontendTasks: ['إنشاء app مستقلة للموازنات', 'تقسيم الإدخال عن المقارنة والتوقع', 'إضافة dashboard للانحرافات']
  },
  {
    key: 'risks',
    titleAr: 'إدارة المخاطر',
    routeBase: '/systems/risks',
    apiBase: '/api/v1/risks',
    status: 'planned',
    ownedTables: ['risks', 'risk_mitigations', 'risk_reviews'],
    dependencies: ['projects', 'quality-safety', 'documents'],
    events: ['risk.created', 'risk.mitigation.updated', 'risk.high_detected'],
    backendTasks: ['إطلاق سجل المخاطر وخطط التخفيف', 'ربط المخاطر بالمشاريع والأنشطة', 'إضافة تقييم severity/probability واضح'],
    apiTasks: ['إطلاق /risks/*', 'إضافة reports للمخاطر العالية والمتأخرة', 'توحيد update lifecycle'],
    frontendTasks: ['إنشاء app مستقلة للمخاطر', 'تقسيم السجل والتقييم والمتابعة', 'إتاحة التنبيهات والربط بالمشاريع']
  },
  {
    key: 'scheduling',
    titleAr: 'الجدولة المتقدمة',
    routeBase: '/systems/scheduling',
    apiBase: '/api/v1/scheduling',
    status: 'planned',
    ownedTables: ['schedule_tasks', 'task_dependencies', 'resource_assignments'],
    dependencies: ['projects', 'hr', 'equipment', 'site-ops'],
    events: ['schedule.task.created', 'schedule.progress.updated', 'schedule.critical_path.recalculated'],
    backendTasks: ['إضافة dependencies وresource assignments فوق مهام المشاريع', 'بناء خوارزمية critical path', 'ربط progress من site ops'],
    apiTasks: ['إطلاق /scheduling/tasks|gantt|reports', 'إضافة endpoints للتقدم والاعتماديات', 'توحيد project-aware filters'],
    frontendTasks: ['إنشاء app مستقلة للجدولة', 'إضافة gantt view لاحقاً', 'فصل planning عن execution tracking']
  },
  {
    key: 'printing',
    titleAr: 'الطباعة والتصدير',
    routeBase: '/systems/printing',
    apiBase: '/api/v1/printing',
    status: 'implemented',
    ownedTables: ['document_templates', 'print_jobs', 'attachments'],
    dependencies: ['documents', 'control-center', 'crm', 'procurement', 'hr', 'subcontractors'],
    events: ['print.job.created', 'print.job.completed', 'template.updated'],
    backendTasks: ['الحفاظ على printing كخدمة مستقلة', 'ربط jobs بالمرفقات والتخزين', 'تجهيز queue للعمليات الثقيلة'],
    apiTasks: ['تثبيت /printing/templates|render|export|jobs', 'إضافة endpoints للdownload status', 'توسيع tag coverage في OpenAPI'],
    frontendTasks: ['نقل شاشة الطباعة الحالية إلى app مستقلة', 'فصل templates عن jobs والمعاينات', 'إضافة links رجوع للأنظمة المالكة للمستند']
  }
];

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

const masterPlan = `# خطة إعادة الهيكلة إلى أنظمة مستقلة

## الهدف
تحويل ERP Qween من واجهة تشغيل موحدة كبيرة إلى مجموعة تطبيقات مستقلة متصلة ببوابة مركزية واحدة، مع إبقاء الـ backend موحداً وقاعدة البيانات مشتركة.

## القرارات المعتمدة
- ` + '`Monorepo Multi Apps`' + ` للواجهة.
- ` + '`Modular Monolith`' + ` للـ backend.
- ` + '`Gradual Cutover`' + ` للانتقال.
- قاعدة بيانات PostgreSQL مشتركة مع مصفوفة ownership موثقة.
- النظام المركزي تحت ` + '`/portal`' + ` وبقية التطبيقات تحت ` + '`/systems/*`' + `.

## موجات التنفيذ
1. موجة البنية: workspaces + packages مشتركة + control center + central APIs.
2. موجة الفصل: إنشاء apps مستقلة للأنظمة الحالية ونقل features إليها تدريجياً.
3. موجة التوسعة: documents, BI, quality-safety, maintenance, contracts, tenders, budgets, risks, scheduling.
4. موجة الإغلاق: إزالة الاعتماد على ` + '`frontend/`' + ` و` + '`apps/web`' + ` بعد اكتمال parity.

## الناتج التشغيلي المطلوب
- 20 تطبيق frontend مستقل داخل ` + '`apps/`' + `.
- بوابة مركزية موحدة للحالة والتنقل والصلاحيات.
- APIs مركزية للحالة والتنقل والأحداث والموافقات.
- توثيق إعادة الهيكلة والملكية والقطع المرحلي داخل ` + '`docs/restructure`' + `.
`;

const systemCatalog = `# كتالوج الأنظمة

| النظام | المسار | API | الحالة |
|---|---|---|---|
${systems.map((system) => `| ${system.titleAr} | \`${system.routeBase}\` | \`${system.apiBase}\` | ${system.status} |`).join('\n')}
`;

const frontendMap = `# خريطة الـ Frontend Monorepo

## التطبيقات
${systems.map((system) => `- \`apps/${system.key}\`: ${system.titleAr} -> \`${system.routeBase}\``).join('\n')}

## الحزم المشتركة
- \`packages/ui\`: مكونات وCSS مشتركة.
- \`packages/auth-client\`: تخزين الجلسة واللغة.
- \`packages/api-client\`: fetch client موحد.
- \`packages/app-config\`: كتالوج الأنظمة.
- \`packages/i18n\`: اختيار اللغة والعناوين.
- \`packages/domain-types\`: الأنواع المشتركة.
`;

const backendMap = `# خريطة الـ Backend Domains

## الـ Contexts الحالية والمستهدفة
${systems.map((system) => `- **${system.titleAr}**: API \`${system.apiBase}\`، يعتمد على ${system.dependencies.map((value) => `\`${value}\``).join('، ')}.`).join('\n')}

## قاعدة عامة
- كل context يملك service وroute واضحين.
- أي تكامل عابر للأنظمة يمر عبر API contracts أو events داخلية موثقة.
- لا يسمح بتكرار الجداول الأساسية بين contexts.
`;

const ownershipDoc = `# ملكية الجداول المشتركة

| النظام | الجداول المملوكة |
|---|---|
${systems.map((system) => `| ${system.titleAr} | ${system.ownedTables.map((table) => `\`${table}\``).join(', ')} |`).join('\n')}

## قواعد الملكية
- النظام المالك فقط هو الذي يغيّر schema والدلالات التجارية للجدول.
- الأنظمة الأخرى تستهلك البيانات عبر service أو API أو read model.
- أي توسيع cross-system يكون عبر حقول مرجعية أو events، لا عبر نسخ جداول.
`;

const cutoverDoc = `# خطة الانتقال المرحلي

## المرحلة الحالية
- إبقاء \`frontend/\` كواجهة legacy.
- إبقاء \`apps/web\` كواجهة انتقالية/مرجعية.
- تقديم \`apps/control-center\` و\`apps/*\` الجديدة بالتوازي.

## قواعد القطع
1. لا يتم إيقاف أي واجهة قديمة قبل وجود parity وظيفي في app النظام المقابل.
2. كل app جديدة تبنى وتختبر مستقلة.
3. deep links من \`/portal\` تصبح نقطة الدخول الرسمية تدريجياً.
4. بعد اكتمال parity: يتحول legacy إلى read-only ثم يزال.
`;

write(path.join(docsDir, 'erp-modularization-master-plan.ar.md'), masterPlan);
write(path.join(docsDir, 'system-catalog.ar.md'), systemCatalog);
write(path.join(docsDir, 'frontend-monorepo-map.ar.md'), frontendMap);
write(path.join(docsDir, 'backend-domain-map.ar.md'), backendMap);
write(path.join(docsDir, 'shared-database-ownership.ar.md'), ownershipDoc);
write(path.join(docsDir, 'cutover-plan.ar.md'), cutoverDoc);

for (const system of systems) {
  const content = `# ${system.titleAr}

## الهدف
فصل هذا النظام كتطبيق مستقل ومسار API واضح ضمن البنية الجديدة، مع الحفاظ على قاعدة البيانات المشتركة والتكامل السلس مع بقية الأنظمة.

## الحدود
- المسار الأمامي: \`${system.routeBase}\`
- قاعدة الـ API: \`${system.apiBase}\`
- الحالة الحالية: \`${system.status}\`

## الجداول المالكة
${system.ownedTables.map((table) => `- \`${table}\``).join('\n')}

## الأحداث الداخلية
${system.events.map((eventName) => `- \`${eventName}\``).join('\n')}

## التبعيات
${system.dependencies.map((dependency) => `- \`${dependency}\``).join('\n')}

## مهام Backend
${system.backendTasks.map((task) => `- ${task}`).join('\n')}

## مهام API
${system.apiTasks.map((task) => `- ${task}`).join('\n')}

## مهام Frontend
${system.frontendTasks.map((task) => `- ${task}`).join('\n')}
`;

  write(path.join(systemsDir, `${system.key}.ar.md`), content);
}

console.log(`Generated restructure docs for ${systems.length} systems.`);
