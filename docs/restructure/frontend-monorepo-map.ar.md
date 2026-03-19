# خريطة الـ Frontend Monorepo

## التطبيقات
- `apps/web`: واجهة legacy انتقالية فقط، ليست نقطة التشغيل الرسمية، وتعيد التوجيه إلى `/portal`، وتم تبسيطها تقنياً بدون Redux أو PWA أو ربط تشغيلي مباشر، ولا تحتوي الآن إلا على ملفات الدخول الانتقالية الدنيا
- `apps/control-center`: النظام المركزي -> `/portal`
- `apps/accounting`: المحاسبة -> `/systems/accounting`
- `apps/crm`: إدارة العملاء والعقود التجارية -> `/systems/crm`
- `apps/hr`: الموارد البشرية -> `/systems/hr`
- `apps/projects`: المشاريع -> `/systems/projects`
- `apps/procurement`: المشتريات -> `/systems/procurement`
- `apps/inventory`: المخزون -> `/systems/inventory`
- `apps/equipment`: المعدات والأصول -> `/systems/equipment`
- `apps/subcontractors`: مقاولو الباطن -> `/systems/subcontractors`
- `apps/site-ops`: التشغيل الميداني -> `/systems/site-ops`
- `apps/documents`: إدارة المستندات -> `/systems/documents`
- `apps/bi`: التقارير وذكاء الأعمال -> `/systems/bi`
- `apps/quality-safety`: الجودة والسلامة -> `/systems/quality-safety`
- `apps/maintenance`: الصيانة المتقدمة -> `/systems/maintenance`
- `apps/contracts`: إدارة العقود المتقدمة -> `/systems/contracts`
- `apps/tenders`: العطاءات والمناقصات -> `/systems/tenders`
- `apps/budgets`: الموازنات والتخطيط المالي -> `/systems/budgets`
- `apps/risks`: إدارة المخاطر -> `/systems/risks`
- `apps/scheduling`: الجدولة المتقدمة -> `/systems/scheduling`
- `apps/printing`: الطباعة والتصدير -> `/systems/printing`

## الحزم المشتركة
- `packages/ui`: مكونات وCSS مشتركة.
- `packages/auth-client`: تخزين الجلسة واللغة.
- `packages/api-client`: fetch client موحد.
- `packages/app-config`: كتالوج الأنظمة.
- `packages/i18n`: اختيار اللغة والعناوين.
- `packages/domain-types`: الأنواع المشتركة.
