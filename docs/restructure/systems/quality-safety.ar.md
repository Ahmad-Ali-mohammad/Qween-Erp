# الجودة والسلامة

## الهدف
فصل هذا النظام كتطبيق مستقل ومسار API واضح ضمن البنية الجديدة، مع الحفاظ على قاعدة البيانات المشتركة والتكامل السلس مع بقية الأنظمة.

## الحدود
- المسار الأمامي: `/systems/quality-safety`
- قاعدة الـ API: `/api/v1/quality`
- الحالة الحالية: `planned`

## الجداول المالكة
- `quality_inspections`
- `non_conformities`
- `safety_incidents`
- `work_permits`

## الأحداث الداخلية
- `quality.inspection.recorded`
- `quality.ncr.opened`
- `safety.incident.recorded`

## التبعيات
- `projects`
- `procurement`
- `equipment`
- `hr`
- `documents`

## مهام Backend
- إطلاق نماذج الفحوصات وعدم المطابقة والحوادث
- ربط السجلات بالمشروع والموظف والمعدة
- إضافة قواعد تنبيه للحوادث الخطيرة

## مهام API
- تعريف /quality/* و/safety/*
- إضافة reports للسلامة والجودة
- توحيد حالات incident/NCR lifecycle

## مهام Frontend
- إنشاء app مستقلة للجودة والسلامة
- فصل inspections وNCR وincidents وpermits
- ربط المرفقات والصور الميدانية
