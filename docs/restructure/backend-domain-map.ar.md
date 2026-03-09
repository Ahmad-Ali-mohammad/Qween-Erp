# خريطة الـ Backend Domains

## الـ Contexts الحالية والمستهدفة
- **النظام المركزي**: API `/api/v1/central`، يعتمد على `auth`، `org`، `numbering`، `sync`، `printing`.
- **المحاسبة**: API `/api/v1/accounting`، يعتمد على `projects`، `procurement`، `hr`، `equipment`، `budgets`.
- **إدارة العملاء والعقود التجارية**: API `/api/v1/crm`، يعتمد على `projects`، `printing`، `attachments`.
- **الموارد البشرية**: API `/api/v1/hr`، يعتمد على `projects`، `accounting`، `documents`.
- **المشاريع**: API `/api/v1/projects`، يعتمد على `crm`، `procurement`، `inventory`، `equipment`، `hr`، `site-ops`.
- **المشتريات**: API `/api/v1/procurement`، يعتمد على `projects`، `inventory`، `accounting`، `documents`.
- **المخزون**: API `/api/v1/inventory`، يعتمد على `procurement`، `projects`، `maintenance`، `accounting`.
- **المعدات والأصول**: API `/api/v1/equipment`، يعتمد على `projects`، `maintenance`، `inventory`، `accounting`.
- **مقاولو الباطن**: API `/api/v1/subcontractors`، يعتمد على `projects`، `accounting`، `documents`، `printing`.
- **التشغيل الميداني**: API `/api/v1/site`، يعتمد على `projects`، `inventory`، `equipment`، `hr`، `documents`.
- **إدارة المستندات**: API `/api/v1/documents`، يعتمد على `control-center`، `crm`، `projects`، `procurement`، `hr`، `printing`.
- **التقارير وذكاء الأعمال**: API `/api/v1/reports`، يعتمد على `accounting`، `projects`، `procurement`، `inventory`، `hr`، `equipment`، `subcontractors`.
- **الجودة والسلامة**: API `/api/v1/quality`، يعتمد على `projects`، `procurement`، `equipment`، `hr`، `documents`.
- **الصيانة المتقدمة**: API `/api/v1/maintenance`، يعتمد على `equipment`، `inventory`، `procurement`، `documents`.
- **إدارة العقود المتقدمة**: API `/api/v1/contracts`، يعتمد على `crm`، `procurement`، `subcontractors`، `hr`، `projects`، `documents`.
- **العطاءات والمناقصات**: API `/api/v1/tenders`، يعتمد على `crm`، `projects`، `documents`، `printing`.
- **الموازنات والتخطيط المالي**: API `/api/v1/budgets`، يعتمد على `accounting`، `projects`، `bi`.
- **إدارة المخاطر**: API `/api/v1/risks`، يعتمد على `projects`، `quality-safety`، `documents`.
- **الجدولة المتقدمة**: API `/api/v1/scheduling`، يعتمد على `projects`، `hr`، `equipment`، `site-ops`.
- **الطباعة والتصدير**: API `/api/v1/printing`، يعتمد على `documents`، `control-center`، `crm`، `procurement`، `hr`، `subcontractors`.

## قاعدة عامة
- كل context يملك service وroute واضحين.
- أي تكامل عابر للأنظمة يمر عبر API contracts أو events داخلية موثقة.
- لا يسمح بتكرار الجداول الأساسية بين contexts.
