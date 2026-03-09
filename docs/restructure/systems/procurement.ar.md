# المشتريات

## الهدف
فصل هذا النظام كتطبيق مستقل ومسار API واضح ضمن البنية الجديدة، مع الحفاظ على قاعدة البيانات المشتركة والتكامل السلس مع بقية الأنظمة.

## الحدود
- المسار الأمامي: `/systems/procurement`
- قاعدة الـ API: `/api/v1/procurement`
- الحالة الحالية: `implemented`

## الجداول المالكة
- `purchase_requests`
- `purchase_orders`
- `goods_receipts`
- `vendor_invoices`
- `suppliers`

## الأحداث الداخلية
- `purchase.request.submitted`
- `purchase.order.approved`
- `goods.receipt.posted`
- `vendor.invoice.recorded`

## التبعيات
- `projects`
- `inventory`
- `accounting`
- `documents`

## مهام Backend
- توحيد دورة الشراء تحت module واحدة
- الحفاظ على aliases القديمة أثناء cutover
- ربط الاستلام والفواتير بالمخزون والمحاسبة

## مهام API
- تثبيت /procurement/requests|orders|receipts|vendor-invoices
- توثيق حالات PR/PO/GRN/VINV
- إضافة read models للموافقات المفتوحة

## مهام Frontend
- نقل شاشة procurement الحالية إلى app مستقلة
- تقسيم الإدخال السريع عن القوائم وسجلات التنفيذ
- إبقاء المرفقات والطباعة من داخل النظام
