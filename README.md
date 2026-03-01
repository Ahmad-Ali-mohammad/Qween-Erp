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

## فحص ترميز العربية

قبل النشر أو الدمج يمكنك تشغيل:

`npm run check:encoding`

هذا الفحص يتحقق من عدم وجود نصوص تالفة مثل `???` أو mojibake داخل `frontend/**`.

## المسارات
- API: `http://localhost:3000/api`
- Health: `http://localhost:3000/api/health`
- Frontend: `http://localhost:3000/`
