# قائمة تسليم الأنظمة

هذه القائمة هي مرجع التنفيذ الحالي لبناء الأنظمة واحدًا واحدًا داخل نفس البوابة، مع اعتبار `Control Center` بوابة الدخول الرئيسية و`#/systems/<system-key>` نقطة الوصول الرسمية لكل نظام.

## قواعد التنفيذ

- نبدأ بنظام واحد ونكمله من الخلفية إلى الواجهة قبل الانتقال للنظام التالي.
- كل نظام يجب أن يخرج بـ:
  - `namespace` قانوني في الباك.
  - `dashboard` مستقلة داخل `#/systems/<system-key>`.
  - صفحات تشغيلية/تفصيلية داخل نفس النظام.
  - `outbox events` للأحداث المهمة.
  - اختبارات تكامل وتشغيل أساسية.
- `Control Center` يعرض بطاقات جميع الأنظمة مع حالة الجاهزية وروابط الدخول السريع.

## الترتيب التنفيذي

| الترتيب | النظام | الحالة | المخرجات المطلوبة |
|---------|--------|--------|-------------------|
| 1 | Tendering | Completed | dashboard real + tenders workspace + award flow + tests |
| 2 | Subcontractors | Completed | contracts/IPC/payments + dashboard real + payable integration + tests |
| 3 | Site Operations | Pending | daily log + attendance + materials + dashboard real |
| 4 | Printing | Pending | templates + export jobs + dashboard real |
| 5 | Budgeting | Pending | scenarios + variance + forecast + dashboard real |
| 6 | Quality | Pending | inspections + NCR + incidents + dashboard real |
| 7 | Maintenance | Pending | preventive/corrective orders + spare usage + dashboard real |
| 8 | Risk | Pending | risk register + mitigation follow-up + dashboard real |
| 9 | Scheduling | Pending | gantt/tasks/dependencies + dashboard real |
| 10 | Analytics | Pending | read models + executive packs + scheduled reporting |

## الأنظمة الجاهزة جزئيًا

- `Control Center`: dashboard موحدة + بطاقات أنظمة + تنبيهات + queues
- `Accounting`: dashboard real
- `CRM`: dashboard real
- `HR`: dashboard real
- `Projects`: dashboard real
- `Procurement`: dashboard real
- `Inventory`: dashboard real
- `Assets`: dashboard real
- `Documents`: dashboard real
- `Contracts`: dashboard real
- `Tendering`: dashboard real + tenders workspace + award flow
- `Subcontractors`: dashboard real + contracts/IPC/payments workspace + AP payment flow

## التركيز الحالي

- النظام الجاري استكماله الآن: `Site Operations`
- الهدف في هذه الدورة:
  - رفع `Control Center` كبوابة بطاقات للأنظمة.
  - إكمال `Site Operations` كنظام تشغيلي كامل داخل البوابة.
