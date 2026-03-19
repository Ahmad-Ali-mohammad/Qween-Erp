# إدارة العملاء والعقود التجارية

## الهدف
فصل هذا النظام كتطبيق مستقل ومسار API واضح ضمن البنية الجديدة، مع الحفاظ على قاعدة البيانات المشتركة والتكامل السلس مع بقية الأنظمة.

## الحدود
- المسار الأمامي: `/systems/crm`
- قاعدة الـ API: `/api/v1/crm`
- الحالة الحالية: `implemented`

## الجداول المالكة
- `customers`
- `opportunities`
- `contracts`
- `contacts`

## الأحداث الداخلية
- `crm.opportunity.created`
- `crm.contract.created`
- `crm.contract.converted`

## التبعيات
- `projects`
- `printing`
- `attachments`

## مهام Backend
- تثبيت ملكية العملاء والفرص والعقود التجارية
- تقليل الازدواج مع contracts المتقدم
- إضافة مسارات تحويل أوضح إلى المشاريع

## مهام API
- تثبيت /crm/customers و/opportunities و/contracts
- إضافة endpoints للأنشطة والتحصيل التجاري لاحقاً
- توثيق حالات التحويل في العقد البرمجي

## مهام Frontend
- نقل شاشة CRM الحالية إلى app مستقلة
- فصل العملاء والفرص والعقود إلى tabs داخلية
- ربط المرفقات والطباعة من داخل app
