# إدارة العقود المتقدمة

## الهدف
فصل هذا النظام كتطبيق مستقل ومسار API واضح ضمن البنية الجديدة، مع الحفاظ على قاعدة البيانات المشتركة والتكامل السلس مع بقية الأنظمة.

## الحدود
- المسار الأمامي: `/systems/contracts`
- قاعدة الـ API: `/api/v1/contracts`
- الحالة الحالية: `foundation`

## الجداول المالكة
- `contracts`
- `contract_amendments`
- `contract_milestones`
- `contract_alerts`

## الأحداث الداخلية
- `contract.created`
- `contract.amendment.approved`
- `contract.expiring`

## التبعيات
- `crm`
- `procurement`
- `subcontractors`
- `hr`
- `projects`
- `documents`

## مهام Backend
- توحيد سجل العقود عبر الأنظمة دون تكرار النماذج
- إضافة الملاحق والتجديدات والتنبيهات
- تثبيت ownership boundaries مع CRM وsubcontractors

## مهام API
- إطلاق /contracts/*
- إضافة endpoints للـ amendments والrenewals والexpiring reports
- توثيق contract type matrix

## مهام Frontend
- إنشاء app مستقلة للعقود
- تقسيم السجل الموحد عن التنبيهات والملاحق
- إتاحة روابط رجوع إلى النظام المالك للعقد
