# المخزون

## الهدف
فصل هذا النظام كتطبيق مستقل ومسار API واضح ضمن البنية الجديدة، مع الحفاظ على قاعدة البيانات المشتركة والتكامل السلس مع بقية الأنظمة.

## الحدود
- المسار الأمامي: `/systems/inventory`
- قاعدة الـ API: `/api/v1/inventory`
- الحالة الحالية: `foundation`

## الجداول المالكة
- `items`
- `warehouses`
- `stock_moves`
- `stock_balances`
- `stock_reservations`
- `stock_counts`

## الأحداث الداخلية
- `stock.move.posted`
- `stock.count.approved`
- `stock.reservation.created`

## التبعيات
- `procurement`
- `projects`
- `maintenance`
- `accounting`

## مهام Backend
- تنظيم وحدات الأصناف والمستودعات والحركات والجرد
- فصل costing logic عن واجهات الإدخال
- تجهيز reservation API للصيانة والمواقع

## مهام API
- إطلاق /inventory/items|balances|moves|counts|stock-reservations مع مسارات release/consume
- توحيد approve flows للجرد
- إضافة read endpoints لتحليلات الحركة

## مهام Frontend
- إنشاء app مستقلة للمخزون
- تقسيم الأصناف والمستودعات والحركات والجرد إلى صفحات فرعية
- إضافة مؤشرات حالة المخزون
