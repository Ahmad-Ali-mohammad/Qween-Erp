# الطباعة والتصدير

## الهدف
فصل هذا النظام كتطبيق مستقل ومسار API واضح ضمن البنية الجديدة، مع الحفاظ على قاعدة البيانات المشتركة والتكامل السلس مع بقية الأنظمة.

## الحدود
- المسار الأمامي: `/systems/printing`
- قاعدة الـ API: `/api/v1/printing`
- الحالة الحالية: `implemented`

## الجداول المالكة
- `document_templates`
- `print_jobs`
- `attachments`

## الأحداث الداخلية
- `print.job.created`
- `print.job.completed`
- `template.updated`

## التبعيات
- `documents`
- `control-center`
- `crm`
- `procurement`
- `hr`
- `subcontractors`

## مهام Backend
- الحفاظ على printing كخدمة مستقلة
- ربط jobs بالمرفقات والتخزين
- تجهيز queue للعمليات الثقيلة

## مهام API
- تثبيت /printing/templates|render|export|jobs
- إضافة endpoints للdownload status
- توسيع tag coverage في OpenAPI

## مهام Frontend
- نقل شاشة الطباعة الحالية إلى app مستقلة
- فصل templates عن jobs والمعاينات
- إضافة links رجوع للأنظمة المالكة للمستند
