# ERP Qween

نظام ERP داخلي لشركة واحدة.

## بنية المشروع

- `frontend/`
  الواجهة النشطة الوحيدة للتطبيق، وهي التي يخدمها الخادم حاليًا.

- `src/`
  الخادم وواجهات الـ API والوحدات الخلفية.

- `prisma/`
  مخطط قاعدة البيانات والترحيلات والبيانات الأولية.

## التشغيل السريع

1. نسخ الإعدادات:
`cp .env.example .env`

2. تشغيل PostgreSQL:
`docker compose up -d postgres`

3. تثبيت الحزم:
`npm install`

4. توليد Prisma:
`npm run prisma:generate`

5. ترحيل قاعدة البيانات:
`npm run prisma:migrate`

6. إدخال بيانات أولية:
`npm run prisma:seed`

7. تشغيل التطبيق:
`npm run dev`

## إعدادات المرحلة الأساسية

- يدعم المشروع الآن Event Outbox مع RabbitMQ بشكل اختياري.
- إذا لم تُفعّل RabbitMQ فالتطبيق سيبقى يعمل، لكن الأحداث ستبقى محفوظة داخل `OutboxEvent` حتى يتم نشرها.

## شريحة المرحلة التالية المنفذة

- تم تفعيل تدفق `Opportunity -> Contract -> Project` عبر المسار:
  - `POST /api/crm/opportunities/:id/award`

- تم تفعيل سجل الوقت وتوزيع تكلفة العمالة على المشاريع عبر المسارات:
  - `GET /api/hr/timesheets`
  - `GET /api/hr/timesheets/:id`
  - `POST /api/hr/timesheets`
  - `POST /api/hr/timesheets/:id/approve`
  - `POST /api/hr/payroll/:id/distribute`

- تم توسيع النماذج التشغيلية في `Prisma` لتشمل:
  - `Attendance`
  - `Timesheet`
  - `UserBranchAccess`
  - `Project.contractId`
  - `PayrollRun.branchId`
  - `PayrollLine.branchId`

متغيرات البيئة الجديدة:

- `RABBITMQ_ENABLED`
- `RABBITMQ_URL`
- `RABBITMQ_EXCHANGE`
- `OUTBOX_POLL_INTERVAL_MS`
- `OUTBOX_BATCH_SIZE`
- `OBJECT_STORAGE_PROVIDER`
- `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_BUCKET`
- `OBJECT_STORAGE_REGION`

## فحص ترميز العربية

قبل النشر أو الدمج يمكنك تشغيل:

`npm run check:encoding`

هذا الفحص يتحقق من عدم وجود نصوص تالفة مثل `???` أو mojibake داخل `frontend/**`.

## ملاحظة تنظيمية

لم يعد هناك أكثر من مصدر فعال للفرونت داخل الجذر. إذا كنت تطور الواجهة أو تختبرها فاعمل داخل `frontend/` فقط، ولا تضف `node_modules` أو حزمًا مستقلة داخل المجلدات الفرعية.

## المسارات
- API: `http://localhost:3000/api`
- Health: `http://localhost:3000/api/health`
- Frontend: `http://localhost:3000/`
