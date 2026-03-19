# ERP Qween

نظام ERP داخلي لشركة واحدة.

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

## Workspaces والبوابة المركزية

- البوابة الجديدة: `apps/control-center`
- الأنظمة المنفصلة: `apps/*`
- الحزم المشتركة: `packages/*`

أوامر مفيدة:

- تشغيل الـ API فقط:
`npm run dev:api`

- تشغيل البوابة المركزية:
`npm run dev:portal`

- بناء كل تطبيقات الواجهة:
`npm run build:apps`

- بناء الـ API وكل التطبيقات:
`npm run build:all`

- فحص guardrails للمعمارية متعددة الأنظمة:
`npm run check:modular`

## فحص ترميز العربية

قبل النشر أو الدمج يمكنك تشغيل:

`npm run check:encoding`

هذا الفحص يتحقق من عدم وجود نصوص تالفة مثل `???` أو mojibake داخل `frontend/**`.

## Skill التطوير المحلية

تمت إضافة skill محلية للمشروع في:

`.codex/skills/erp-qween-development`

وتُستخدم كمرجع تشغيل أثناء التطوير لإلزام:

- حدود الأنظمة `apps/*`
- الملكية الخلفية `src/modules/*`
- منع الرجوع إلى `apps/web` أو `legacy-ops-runtime`
- تحديث توثيق `docs/restructure/*`
- تشغيل فحص `npm run check:modular`

## المسارات
- API: `http://localhost:3000/api`
- Health: `http://localhost:3000/api/health`
- Root redirect: `http://localhost:3000/` -> `/portal`
- Portal: `http://localhost:3000/portal`
- Systems: `http://localhost:3000/systems/<system-key>`
