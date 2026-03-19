# المعدات والأصول

## الهدف
فصل هذا النظام كتطبيق مستقل ومسار API واضح ضمن البنية الجديدة، مع الحفاظ على قاعدة البيانات المشتركة والتكامل السلس مع بقية الأنظمة.

## الحدود
- المسار الأمامي: `/systems/equipment`
- قاعدة الـ API: `/api/v1/equipment`
- الحالة الحالية: `implemented`

## الجداول المالكة
- `equipment`
- `equipment_allocations`
- `maintenance_logs`
- `assets`
- `depreciation_runs`

## الأحداث الداخلية
- `equipment.allocated`
- `maintenance.logged`
- `depreciation.posted`

## التبعيات
- `projects`
- `maintenance`
- `inventory`
- `accounting`

## مهام Backend
- فصل operations عن maintenance analytics
- إبقاء asset lifecycle واضحاً داخل نفس context
- ربط الإهلاك والتكاليف بالمحاسبة

## مهام API
- تثبيت /equipment/* و/assets/*
- إضافة endpoints أكثر وضوحاً للصيانة والتحليلات
- تجهيز قنوات reserve spare parts

## مهام Frontend
- نقل شاشة المعدات الحالية إلى app مستقلة
- تقسيم الأصول والتشغيل والصيانة
- تجهيز انتقال لاحق إلى app maintenance
