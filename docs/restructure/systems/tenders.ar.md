# العطاءات والمناقصات

## الهدف
فصل هذا النظام كتطبيق مستقل ومسار API واضح ضمن البنية الجديدة، مع الحفاظ على قاعدة البيانات المشتركة والتكامل السلس مع بقية الأنظمة.

## الحدود
- المسار الأمامي: `/systems/tenders`
- قاعدة الـ API: `/api/v1/tenders`
- الحالة الحالية: `planned`

## الجداول المالكة
- `tenders`
- `tender_estimates`
- `tender_competitors`
- `tender_documents`

## الأحداث الداخلية
- `tender.created`
- `tender.submitted`
- `tender.result.recorded`

## التبعيات
- `crm`
- `projects`
- `documents`
- `printing`

## مهام Backend
- إطلاق سجل العطاءات والتقديرات الأولية
- ربط العطاءات بفرص CRM
- إضافة نتيجة العطاء وتحويل الفائز إلى عقد ومشروع

## مهام API
- إطلاق /tenders/*
- إضافة submit/result/win-rate endpoints
- تجهيز exports للعروض

## مهام Frontend
- إنشاء app مستقلة للعطاءات
- تقسيم السجل والتقديرات والمنافسين والنتائج
- إضافة روابط إلى CRM والمشاريع
