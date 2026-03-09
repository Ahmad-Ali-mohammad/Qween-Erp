# التقارير وذكاء الأعمال

## الهدف
فصل هذا النظام كتطبيق مستقل ومسار API واضح ضمن البنية الجديدة، مع الحفاظ على قاعدة البيانات المشتركة والتكامل السلس مع بقية الأنظمة.

## الحدود
- المسار الأمامي: `/systems/bi`
- قاعدة الـ API: `/api/v1/reports`
- الحالة الحالية: `planned`

## الجداول المالكة
- `report_snapshots`
- `analytics_jobs`
- `read_models_*`

## الأحداث الداخلية
- `report.job.requested`
- `analytics.snapshot.completed`

## التبعيات
- `accounting`
- `projects`
- `procurement`
- `inventory`
- `hr`
- `equipment`
- `subcontractors`

## مهام Backend
- فصل read-model layer عن routes التشغيلية
- إضافة jobs للتجميع الثقيل
- تجهيز integration لاحق مع Metabase أو Superset

## مهام API
- إطلاق /bi/dashboards و/custom-reports و/exports
- الحفاظ على /reports الحالية كتوافق
- توحيد filters المشتركة حسب branch/project/date

## مهام Frontend
- إنشاء app مستقلة للتقارير واللوحات
- فصل executive dashboards عن report builder
- دعم scheduled exports لاحقاً
