# تشغيل نافذ على هوستنجر

يعمل النظام كاملًا (البوابة، والنظام، ومواقع الجهات، والتطبيق، والبيانات) على استضافة هوستنجر بخادم Node.js واحد، ويشغّل `src/Code.gs` نفسه دون Google.

## المتطلبات
- خطة هوستنجر تدعم تطبيقات Node.js (Business أو Cloud).
- قاعدة بيانات MySQL من hPanel ← قواعد البيانات.

## الإعداد في hPanel
1. **مواقع إلكترونية ← إضافة موقع ← تطبيق Node.js**، واربطه بمستودع GitHub `benmakkh-crypto/doctor-system` (الفرع main).
   - إصدار Node: 22.
   - ملف الدخول: `hostinger/server.js`، أو أمر التشغيل `npm start`.
2. **متغيرات البيئة:**
   | المتغير | القيمة |
   |---|---|
   | `PUBLIC_URL` | `https://nafithapp.com` |
   | `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | من صفحة قاعدة البيانات |
   | `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` | `smtp.hostinger.com`، `465`، `info@nafithapp.com`، كلمة مرور الصندوق (لإرسال بيانات الدخول والتنبيهات) |
   | `NAFITH_IMPORT` | لمرة واحدة: بيانات Google Sheets المصدَّرة (gzip + base64) |
3. اربط الدومين `nafithapp.com` بالتطبيق.

## المسارات
| المسار | المحتوى |
|---|---|
| `/` | بوابة نافذ: دليل الجهات |
| `/?org=CODE` | موقع الجهة |
| `/system/` | النظام وشاشة الدخول |
| `/app/` | تطبيق الجوال |
| `/demo/` | النسخة التجريبية |
| `/docs/` | الأدلة |
| `/api/public` | واجهة JSON عامة |
| `/health` | فحص الحالة |

## التشغيل
- **أول تشغيل دون `NAFITH_IMPORT`:** ينشئ حساب المشرف العام `zubair` بكلمة مرور مؤقتة تظهر في سجل التطبيق.
- **أول تشغيل مع `NAFITH_IMPORT`:** ينقل البيانات والحسابات بكلمات مرورها الحالية، ويرحّلها تلقائيًا إلى المخطط الحالي.
- **النسخ الاحتياطي:** يومي في جدول `nafith_backups`، وتُحفظ آخر 30 نسخة.
- **التجربة محليًا:** `PORT=3000 DATA_DIR=./data node hostinger/server.js`، فتُحفظ البيانات في ملف JSON بدل MySQL.
- **الاختبار:** `node tests/host.test.js`.
