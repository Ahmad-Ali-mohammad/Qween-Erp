# الموازنات والتخطيط المالي

## الهدف
فصل هذا النظام كتطبيق مستقل ومسار API واضح ضمن البنية الجديدة، مع الحفاظ على قاعدة البيانات المشتركة والتكامل السلس مع بقية الأنظمة.

## الحدود
- المسار الأمامي: `/systems/budgets`
- قاعدة الـ API: `/api/v1/budgets`
- الحالة الحالية: `foundation`

## الجداول المالكة
- `budgets`
- `budget_lines`
- `budget_forecasts`

## الأحداث الداخلية
- `budget.created`
- `budget.forecast.updated`
- `budget.threshold.exceeded`

## التبعيات
- `accounting`
- `projects`
- `bi`

## مهام Backend
- توسيع budgets الحالية إلى تشغيلي/رأسمالي/نقدي
- إضافة مقارنة الفعلي والتوقع
- ربط تجاوزات الموازنة بالتنبيهات المركزية

## مهام API
- تثبيت /budgets/*
- إضافة /vs-actual و/forecast و/variance
- توحيد dimension filters

## مهام Frontend
- إنشاء app مستقلة للموازنات
- تقسيم الإدخال عن المقارنة والتوقع
- إضافة dashboard للانحرافات
