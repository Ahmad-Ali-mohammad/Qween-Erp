# خطة الانتقال المرحلي

## المرحلة الحالية
- إبقاء `frontend/` كواجهة legacy.
- إبقاء `apps/web` كواجهة انتقالية/مرجعية.
- تقديم `apps/control-center` و`apps/*` الجديدة بالتوازي.

## قواعد القطع
1. لا يتم إيقاف أي واجهة قديمة قبل وجود parity وظيفي في app النظام المقابل.
2. كل app جديدة تبنى وتختبر مستقلة.
3. deep links من `/portal` تصبح نقطة الدخول الرسمية تدريجياً.
4. بعد اكتمال parity: يتحول legacy إلى read-only ثم يزال.

## تحديث التنفيذ (2026-03-08)
- تم تحويل التطبيقات التالية إلى واجهات مستقلة (Standalone) بدون `legacy-ops-runtime`: `crm`, `projects`, `procurement`, `hr`, `equipment`, `site-ops`, `subcontractors`.
- تم اعتماد بنية موحدة داخل هذه التطبيقات: `Dashboard`, `List`, `Quick Actions`, و`Session/Locale controls`.
- تم توسيع اختبار الدمج `workspace-frontends` للتحقق من mount للمسارات:
  - `/systems/crm`
  - `/systems/hr`
  - `/systems/projects`
  - `/systems/procurement`
  - `/systems/equipment`
  - `/systems/site-ops`
  - `/systems/subcontractors`
- تم فصل اعتماد `legacy-ops-runtime` بالكامل عن جميع تطبيقات `apps/*` ونقل أنماط الشاشات المشتركة إلى `packages/ui`.
- تم حذف workspace الخاص بالحزمة القديمة `packages/legacy-ops-runtime` بعد توقف جميع تطبيقات الأنظمة عن استهلاكها.
- تم تقليص `apps/web` من واجهة تشغيل متعددة الأنظمة إلى صفحة انتقالية خفيفة تقوم بإعادة التوجيه إلى `/portal` وتعرض روابط مباشرة إلى الأنظمة الأساسية.
- تم تحويل الجذر `/` على مستوى الخادم إلى redirect صريح نحو `/portal` مع إبقاء `frontend/` كصفحة legacy انتقالية للمسارات غير المهاجرة.
- تم تبسيط `apps/web` تقنياً إلى workspace انتقالية minimal وإزالة اعتماداته التشغيلية السابقة (`Redux`, `Sentry`, `PWA`) لأنه لم يعد تطبيق تشغيل رئيسي.
- تم حذف شيفرة React legacy غير المستخدمة من `apps/web/src` والإبقاء فقط على ملفات الدخول الانتقالية اللازمة (`App.tsx`, `main.tsx`, `styles.css`, `vite-env.d.ts`).
- تم حذف طبقات JavaScript وCSS القديمة غير المستخدمة من `frontend/` والإبقاء فقط على صفحة الهبوط الانتقالية وملف `frontend/js/app.js` المستقل.
