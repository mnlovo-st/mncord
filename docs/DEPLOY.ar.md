# تشغيل سيرفر mncord على كلاودفلير (مجانًا)

السيرفر كله على كلاودفلير، والخطة المجانية تكفيه. ما في سيرفر تصونه، وما يحتاج جهازك شغال.
إذا وصلنا أي حد مجاني، العملية **توقف وما ينخصم شي**.

## الأجزاء
| الجزء | وش هو | الحد المجاني |
| --- | --- | --- |
| Worker | يستقبل الطلبات ويوصلها | 100 ألف طلب باليوم |
| Durable Object واحد (`MncordHub`) | قاعدة البيانات (SQLite) والاتصال المباشر، قريب من الإمارات | 100 ألف طلب باليوم، 5 GB تخزين |
| R2 (`mncord-files`) | الصور والمقاطع والملفات | 10 GB، والتنزيل مجاني |
| Realtime SFU | الصوت والفيديو والبث | 1000 GB بالشهر |

حمايات داخل السيرفر عشان ما نتعدى الحد:
- **الملفات:** حد الملف 200 MB، والصور والمقاطع تنحذف تلقائيًا بعد 14 يوم (كل يوم الساعة 3:17 فجرًا بتوقيت UTC)، والرفع يوقف عند 9 GB.
- **البث:** الجودة تنزل خطوة خطوة إذا قرّب استهلاك اليوم من حصته. الفيديو يوقف عند 950 GB والصوت عند 995 GB بالشهر.

## أول تشغيل (مرة وحدة)
1. حساب كلاودفلير ← فعّل **Realtime SFU** وأنشئ تطبيق باسم `mncord`، وفعّل **R2**.
2. من مجلد المشروع:
   ```powershell
   cd apps/edge
   npx wrangler login
   npx wrangler r2 bucket create mncord-files
   ```
3. الأسرار، كل وحدة على حدة. القيم موجودة في `mncord-files\backup\server-production.env`:
   ```powershell
   npx wrangler secret put JWT_PRIVATE_JWK
   npx wrangler secret put SECRETS_KEY
   npx wrangler secret put FILES_SIGNING_KEY
   npx wrangler secret put CF_REALTIME_APP_ID
   npx wrangler secret put CF_REALTIME_APP_SECRET
   npx wrangler secret put SMTP_URL
   npx wrangler secret put MAIL_FROM
   ```
   ⚠️ لا تغيّر `JWT_PRIVATE_JWK` ولا `SECRETS_KEY` بعد التشغيل. لو تغيروا، الكل يطلع من حسابه، والتحقق بخطوتين يتعطل.
4. النشر:
   ```powershell
   npx wrangler deploy
   ```
   السيرفر على: `https://mncord.mncord-edge.workers.dev`، وللفحص افتح `/health`.

## التحديثات
- **السيرفر:** `npm run deploy -w @mncord/edge`
- **التطبيق:** `git tag v1.0.1` ثم `git push --tags`. GitHub يختبر ويبني ملف التثبيت وينشره في Releases، والنسخ المثبتة تتحدث تلقائيًا.
- **سجل السيرفر المباشر:** `npx wrangler tail mncord` (من مجلد `apps/edge`)

## ملاحظات
- **التحذير عند أول تشغيل:** ويندوز يطلّع تحذير «ناشر غير معروف» لين نوقّع التطبيق. التوقيع مجاني للمشاريع المفتوحة عن طريق SignPath Foundation.
- **الوضع القانوني:** خدمات الاتصال الصوتي في الإمارات تحتاج ترخيص قبل طرحها للعامة.
