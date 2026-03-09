# المحاسبة

## الهدف
فصل هذا النظام كتطبيق مستقل ومسار API واضح ضمن البنية الجديدة، مع الحفاظ على قاعدة البيانات المشتركة والتكامل السلس مع بقية الأنظمة.

## الحدود
- المسار الأمامي: `/systems/accounting`
- قاعدة الـ API: `/api/v1/accounting`
- الحالة الحالية: `foundation`

## الجداول المالكة
- `accounts`
- `journal_entries`
- `journal_lines`
- `fiscal_periods`
- `payments`
- `bank_accounts`
- `reconciliations`

## الأحداث الداخلية
- `journal.posted`
- `period.closed`
- `payment.completed`

## التبعيات
- `projects`
- `procurement`
- `hr`
- `equipment`
- `budgets`

## مهام Backend
- تنظيم وحدات الحسابات والقيود والفترات تحت bounded context واحد
- تثبيت posting services وclosing guards
- ربط الترحيلات الآلية مع بقية الأنظمة

## مهام API
- تجميع الكتالوج المالي تحت /accounting/*
- توحيد تقارير trial balance وGL وcash flow
- إضافة tags محاسبية موحدة في OpenAPI

## مهام Frontend
- إنشاء dashboard محاسبية مستقلة
- فصل القيود والفترات والمدفوعات إلى صفحات داخلية
- إزالة الاعتماد على صفحة عامة متضخمة
