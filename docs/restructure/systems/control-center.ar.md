# النظام المركزي

## الهدف
فصل هذا النظام كتطبيق مستقل ومسار API واضح ضمن البنية الجديدة، مع الحفاظ على قاعدة البيانات المشتركة والتكامل السلس مع بقية الأنظمة.

## الحدود
- المسار الأمامي: `/portal`
- قاعدة الـ API: `/api/v1/central`
- الحالة الحالية: `foundation`

## الجداول المالكة
- `roles`
- `permissions`
- `workflow_instances`
- `workflow_actions`
- `audit_logs`

## الأحداث الداخلية
- `central.event.accepted`
- `central.approval.requested`

## التبعيات
- `auth`
- `org`
- `numbering`
- `sync`
- `printing`

## مهام Backend
- تثبيت سجل التطبيقات والتنقل المركزي
- توحيد health والتنبيهات والاستثناءات
- ربط الموافقات والأحداث الداخلية بالبوابة المركزية

## مهام API
- تعريف /central/apps
- /central/navigation
- /central/health
- /central/permissions
- /central/events
- /central/approval-requests
- /central/exceptions
- توثيق العقود داخل OpenAPI tags

## مهام Frontend
- تقديم بوابة دخول موحدة
- عرض بطاقات الأنظمة وحالتها
- توفير deep links لكل app مستقلة
