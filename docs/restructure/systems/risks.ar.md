# إدارة المخاطر

## الهدف
فصل هذا النظام كتطبيق مستقل ومسار API واضح ضمن البنية الجديدة، مع الحفاظ على قاعدة البيانات المشتركة والتكامل السلس مع بقية الأنظمة.

## الحدود
- المسار الأمامي: `/systems/risks`
- قاعدة الـ API: `/api/v1/risks`
- الحالة الحالية: `planned`

## الجداول المالكة
- `risks`
- `risk_mitigations`
- `risk_reviews`

## الأحداث الداخلية
- `risk.created`
- `risk.mitigation.updated`
- `risk.high_detected`

## التبعيات
- `projects`
- `quality-safety`
- `documents`

## مهام Backend
- إطلاق سجل المخاطر وخطط التخفيف
- ربط المخاطر بالمشاريع والأنشطة
- إضافة تقييم severity/probability واضح

## مهام API
- إطلاق /risks/*
- إضافة reports للمخاطر العالية والمتأخرة
- توحيد update lifecycle

## مهام Frontend
- إنشاء app مستقلة للمخاطر
- تقسيم السجل والتقييم والمتابعة
- إتاحة التنبيهات والربط بالمشاريع
