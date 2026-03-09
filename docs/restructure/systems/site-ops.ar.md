# التشغيل الميداني

## الهدف
فصل هذا النظام كتطبيق مستقل ومسار API واضح ضمن البنية الجديدة، مع الحفاظ على قاعدة البيانات المشتركة والتكامل السلس مع بقية الأنظمة.

## الحدود
- المسار الأمامي: `/systems/site-ops`
- قاعدة الـ API: `/api/v1/site`
- الحالة الحالية: `implemented`

## الجداول المالكة
- `site_daily_logs`
- `site_material_requests`
- `site_material_request_lines`
- `site_progress_entries`
- `site_equipment_issues`

## الأحداث الداخلية
- `site.daily_log.recorded`
- `site.material_request.fulfilled`
- `site.progress.recorded`
- `site.equipment_issue.reported`

## التبعيات
- `projects`
- `inventory`
- `equipment`
- `hr`
- `documents`

## مهام Backend
- تثبيت context ميداني منفصل
- ربط material requests بالمخزون والمشتريات
- إبقاء progress entries محدثة لمهام المشروع

## مهام API
- تثبيت /site/daily-log|material-requests|progress|equipment-issues
- إضافة تقارير يومية وأسبوعية
- توحيد approve/fulfill flows

## مهام Frontend
- نقل شاشة site ops الحالية إلى app مستقلة
- الإبقاء على واجهة خفيفة للشاشات الصغيرة
- فصل السجلات والموافقات والمرفقات
