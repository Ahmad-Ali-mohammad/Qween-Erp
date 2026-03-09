# المشاريع

## الهدف
فصل هذا النظام كتطبيق مستقل ومسار API واضح ضمن البنية الجديدة، مع الحفاظ على قاعدة البيانات المشتركة والتكامل السلس مع بقية الأنظمة.

## الحدود
- المسار الأمامي: `/systems/projects`
- قاعدة الـ API: `/api/v1/projects`
- الحالة الحالية: `implemented`

## الجداول المالكة
- `projects`
- `project_phases`
- `project_tasks`
- `project_budgets`
- `project_expenses`
- `change_orders`

## الأحداث الداخلية
- `project.created`
- `project.cost.updated`
- `project.progress.recorded`

## التبعيات
- `crm`
- `procurement`
- `inventory`
- `equipment`
- `hr`
- `site-ops`

## مهام Backend
- تثبيت WBS والموازنات والتكاليف والربحية
- فصل read models للمشروع عن أوامر CRUD
- ربط site progress وtimesheets وallocations

## مهام API
- استقرار /projects/*
- إضافة read endpoints للربحية والbudget vs actual
- تجميع التكلفة الفعلية من بقية الأنظمة

## مهام Frontend
- نقل شاشة المشاريع الحالية إلى app مستقلة
- إضافة dashboard ومشاهدات list/details/reports
- الحفاظ على attachments والطباعة داخلياً
