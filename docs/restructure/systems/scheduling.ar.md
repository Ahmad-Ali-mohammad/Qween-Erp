# الجدولة المتقدمة

## الهدف
فصل هذا النظام كتطبيق مستقل ومسار API واضح ضمن البنية الجديدة، مع الحفاظ على قاعدة البيانات المشتركة والتكامل السلس مع بقية الأنظمة.

## الحدود
- المسار الأمامي: `/systems/scheduling`
- قاعدة الـ API: `/api/v1/scheduling`
- الحالة الحالية: `planned`

## الجداول المالكة
- `schedule_tasks`
- `task_dependencies`
- `resource_assignments`

## الأحداث الداخلية
- `schedule.task.created`
- `schedule.progress.updated`
- `schedule.critical_path.recalculated`

## التبعيات
- `projects`
- `hr`
- `equipment`
- `site-ops`

## مهام Backend
- إضافة dependencies وresource assignments فوق مهام المشاريع
- بناء خوارزمية critical path
- ربط progress من site ops

## مهام API
- إطلاق /scheduling/tasks|gantt|reports
- إضافة endpoints للتقدم والاعتماديات
- توحيد project-aware filters

## مهام Frontend
- إنشاء app مستقلة للجدولة
- إضافة gantt view لاحقاً
- فصل planning عن execution tracking
