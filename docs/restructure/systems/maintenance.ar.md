# الصيانة المتقدمة

## الهدف
فصل هذا النظام كتطبيق مستقل ومسار API واضح ضمن البنية الجديدة، مع الحفاظ على قاعدة البيانات المشتركة والتكامل السلس مع بقية الأنظمة.

## الحدود
- المسار الأمامي: `/systems/maintenance`
- قاعدة الـ API: `/api/v1/maintenance`
- الحالة الحالية: `foundation`

## الجداول المالكة
- `maintenance_schedules`
- `maintenance_work_orders`
- `maintenance_spare_parts`

## الأحداث الداخلية
- `maintenance.schedule.created`
- `maintenance.work_order.completed`
- `maintenance.parts.reserved`

## التبعيات
- `equipment`
- `inventory`
- `procurement`
- `documents`

## مهام Backend
- فصل الصيانة المتقدمة عن شاشة المعدات الحالية
- إضافة جداول الصيانة وأوامر العمل وMTBF
- ربط قطع الغيار بالمخزون

## مهام API
- إطلاق /maintenance/schedules|work-orders|reports
- إضافة complete/cancel flows
- توحيد reservation endpoints مع inventory

## مهام Frontend
- إنشاء app مستقلة للصيانة
- تقسيم schedules وwork orders والتكاليف
- إتاحة drill-down من equipment app
