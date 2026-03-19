## التطوير
- دفعت إصلاحات ملاحظات المراجعة على الفرع `fix/workflow-invoice-stability` في commitين: `8334623` و`43f502d`.
- مسار `forgot-password` و`reset-password` أصبح يعتمد على `validateBody` و`reset token` فعلي مخزن بشكل مجزأ عبر `integrationSetting`، مع تحديث مسار التوافق في `api-compat` أيضاً.
- أنشأت طبقة مشتركة لتوليد أرقام الفواتير في `src/modules/shared/invoice-numbering.ts` واستُخدمت في `invoices` و`purchase-orders`.

## التحسينات
- أزلت `LOCK TABLE "Invoice"` واستبدلته بحساب `max suffix` عبر `findFirst(orderBy: { number: 'desc' })` مع retry عند `P2002` بدل تسلسل الكتابة على مستوى الجدول.
- تحديث الفاتورة `DRAFT` صار يعيد الترقيم تلقائياً إذا تغيّر الشهر أو النوع حتى يبقى `number` متسقاً مع `date`.
- عدّلت اختبارات `workflow-stage14/15/16` لتغطي reset token وإعادة الترقيم، ثم أزلت literals الاختبارية الشبيهة بالأسرار من `workflow-stage15` لتفادي إنذار GitGuardian.

## التحقق
- `npm run lint`
- `python .codex/skills/erp-qween-development/scripts/check_modular_guardrails.py`
- `npx jest tests/integration/workflow-stage14.test.ts tests/integration/workflow-stage15.test.ts tests/integration/workflow-stage16.test.ts --runInBand`
- `npx jest tests/integration --runInBand`
- `npx jest tests/integration/workflow-stage15.test.ts --runInBand`

## ملاحظات
- التحقق تم على worktree معزول: `.tmp/verify-3a3fb04`.
- الـ worktree الرئيسي ما زال متسخاً بتغييرات أخرى غير مرتبطة ولم ألمسها.
