# مقاولو الباطن

## الهدف
فصل هذا النظام كتطبيق مستقل ومسار API واضح ضمن البنية الجديدة، مع الحفاظ على قاعدة البيانات المشتركة والتكامل السلس مع بقية الأنظمة.

## الحدود
- المسار الأمامي: `/systems/subcontractors`
- قاعدة الـ API: `/api/v1/subcontractors`
- الحالة الحالية: `implemented`

## الجداول المالكة
- `subcontractors`
- `subcontract_contracts`
- `subcontract_work_orders`
- `subcontract_certificates`
- `subcontract_payments`
- `subcontract_performance_reviews`

## الأحداث الداخلية
- `subcontract.contract.created`
- `subcontract.certificate.approved`
- `subcontract.payment.recorded`

## التبعيات
- `projects`
- `accounting`
- `documents`
- `printing`

## مهام Backend
- تثبيت bounded context لمقاولي الباطن
- ربط المستخلصات والمدفوعات بالمحاسبة
- إضافة أوامر التغيير داخل نفس المجال

## مهام API
- تثبيت /subcontractors/*
- إضافة performance reports وopen certificates
- توحيد حالات العقود والمستخلصات

## مهام Frontend
- فصل شاشة مقاولي الباطن إلى app مستقلة
- تقسيم العقود والمستخلصات والمدفوعات والتقييم
- إبقاء المرفقات والتنقل إلى المشاريع
