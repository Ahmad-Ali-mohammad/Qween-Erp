# الموارد البشرية

## الهدف
فصل هذا النظام كتطبيق مستقل ومسار API واضح ضمن البنية الجديدة، مع الحفاظ على قاعدة البيانات المشتركة والتكامل السلس مع بقية الأنظمة.

## الحدود
- المسار الأمامي: `/systems/hr`
- قاعدة الـ API: `/api/v1/hr`
- الحالة الحالية: `implemented`

## الجداول المالكة
- `employees`
- `attendance`
- `timesheets`
- `leave_requests`
- `payroll_runs`
- `payroll_lines`

## الأحداث الداخلية
- `attendance.recorded`
- `timesheet.approved`
- `payroll.posted`

## التبعيات
- `projects`
- `accounting`
- `documents`

## مهام Backend
- تجميع employee lifecycle داخل module واحدة
- فصل attendance/timesheets/payroll كمسارات domain واضحة
- ربط تحميل الأجور بالمشاريع والمحاسبة

## مهام API
- تثبيت /hr/employees و/attendance و/timesheets و/payroll
- توحيد response envelopes للترحيل المحاسبي
- إضافة export-ready endpoints لكشوف الرواتب

## مهام Frontend
- إنشاء app مستقلة لـ HR
- تقسيم الموظفين والحضور والرواتب إلى شاشات فرعية
- تخفيف حجم الصفحة الحالية
