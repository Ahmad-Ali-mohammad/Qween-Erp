# ملكية الجداول المشتركة

| النظام | الجداول المملوكة |
|---|---|
| النظام المركزي | `roles`, `permissions`, `workflow_instances`, `workflow_actions`, `audit_logs` |
| المحاسبة | `accounts`, `journal_entries`, `journal_lines`, `fiscal_periods`, `payments`, `bank_accounts`, `reconciliations` |
| إدارة العملاء والعقود التجارية | `customers`, `opportunities`, `contracts`, `contacts` |
| الموارد البشرية | `employees`, `attendance`, `timesheets`, `leave_requests`, `payroll_runs`, `payroll_lines` |
| المشاريع | `projects`, `project_phases`, `project_tasks`, `project_budgets`, `project_expenses`, `change_orders` |
| المشتريات | `purchase_requests`, `purchase_orders`, `goods_receipts`, `vendor_invoices`, `suppliers` |
| المخزون | `items`, `warehouses`, `stock_moves`, `stock_balances`, `stock_reservations`, `stock_counts` |
| المعدات والأصول | `equipment`, `equipment_allocations`, `maintenance_logs`, `assets`, `depreciation_runs` |
| مقاولو الباطن | `subcontractors`, `subcontract_contracts`, `subcontract_work_orders`, `subcontract_certificates`, `subcontract_payments`, `subcontract_performance_reviews` |
| التشغيل الميداني | `site_daily_logs`, `site_material_requests`, `site_material_request_lines`, `site_progress_entries`, `site_equipment_issues` |
| إدارة المستندات | `attachments`, `document_versions`, `correspondence_register` |
| التقارير وذكاء الأعمال | `report_snapshots`, `analytics_jobs`, `read_models_*` |
| الجودة والسلامة | `quality_inspections`, `non_conformities`, `safety_incidents`, `work_permits` |
| الصيانة المتقدمة | `maintenance_schedules`, `maintenance_work_orders`, `maintenance_spare_parts` |
| إدارة العقود المتقدمة | `contracts`, `contract_amendments`, `contract_milestones`, `contract_alerts` |
| العطاءات والمناقصات | `tenders`, `tender_estimates`, `tender_competitors`, `tender_documents` |
| الموازنات والتخطيط المالي | `budgets`, `budget_lines`, `budget_forecasts` |
| إدارة المخاطر | `risks`, `risk_mitigations`, `risk_reviews` |
| الجدولة المتقدمة | `schedule_tasks`, `task_dependencies`, `resource_assignments` |
| الطباعة والتصدير | `document_templates`, `print_jobs`, `attachments` |

## قواعد الملكية
- النظام المالك فقط هو الذي يغيّر schema والدلالات التجارية للجدول.
- الأنظمة الأخرى تستهلك البيانات عبر service أو API أو read model.
- أي توسيع cross-system يكون عبر حقول مرجعية أو events، لا عبر نسخ جداول.
