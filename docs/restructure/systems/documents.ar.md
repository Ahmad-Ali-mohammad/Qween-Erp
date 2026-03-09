# إدارة المستندات

## الهدف
فصل هذا النظام كتطبيق مستقل ومسار API واضح ضمن البنية الجديدة، مع الحفاظ على قاعدة البيانات المشتركة والتكامل السلس مع بقية الأنظمة.

## الحدود
- المسار الأمامي: `/systems/documents`
- قاعدة الـ API: `/api/v1/documents`
- الحالة الحالية: `foundation`

## الجداول المالكة
- `attachments`
- `document_versions`
- `correspondence_register`

## الأحداث الداخلية
- `document.uploaded`
- `document.versioned`
- `correspondence.logged`

## التبعيات
- `control-center`
- `crm`
- `projects`
- `procurement`
- `hr`
- `printing`

## مهام Backend
- توسيع attachments إلى documents + versions + correspondence
- إضافة search metadata وOCR hooks
- توحيد الربط بالكيانات المختلفة

## مهام API
- إطلاق /documents/* مع search/version/download
- إبقاء /attachments كـ compatibility alias
- إضافة soft delete وسياسات retention

## مهام Frontend
- إنشاء app مستقلة للأرشفة والبحث
- توفير filters حسب الكيان والنوع والمشروع
- عرض history للإصدارات
