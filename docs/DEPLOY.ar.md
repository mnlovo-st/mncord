# تشغيل سيرفر mncord مجانًا على Oracle Cloud

الدليل خطوة بخطوة. التكلفة: **صفر**. أي كلمة مرور أو مفتاح تكتبه بنفسك في ملف `.env` على السيرفر،
ولا ترسله لأحد.

## 1) سيرفر Oracle المجاني

1. ادخل Oracle Cloud ← **Compute → Instances → Create instance**.
2. Image: **Ubuntu 24.04**. Shape: **Ampere (VM.Standard.A1.Flex)**، خذ أعلى حد مجاني يسمح به حسابك (مثلًا 2 OCPU و12 GB).
3. أضف مفتاح SSH (يسويه لك الموقع، احفظ الملف الخاص عندك).
4. Boot volume: خلّه 100 GB أو أكثر، ضمن الـ200 GB المجانية.
5. بعد الإنشاء انسخ **Public IP**.

### افتح المنافذ في Oracle (مهم)
Networking ← Virtual Cloud Networks ← الشبكة ← Security List ← Add Ingress Rules (Source `0.0.0.0/0`). الصوت والفيديو ما يمرون على هذا السيرفر (يمرون على كلاودفلير)، فيكفي:

| البروتوكول | المنفذ | لماذا |
| --- | --- | --- |
| TCP | 80, 443 | الموقع وشهادة HTTPS |
| UDP | 443 | HTTP/3 |

## 2) دومين مجاني (DuckDNS)

1. ادخل duckdns.org بحساب Google الجديد.
2. أنشئ اسمًا، مثل `mncord`، فيصير عندك `mncord.duckdns.org`.
3. انسخ **token** من الصفحة. لا تشاركه مع أحد.

## 3) الصوت والفيديو والبث (Cloudflare Realtime، مجاني)

1. سوِّ حسابًا في dash.cloudflare.com (مجاني).
2. من القائمة: **Realtime ← Serverless SFU ← Create** وسمّه `mncord`.
3. انسخ **App ID** و **App Token**. الثاني سر: يتحط في `.env` على السيرفر بس، والتطبيق ما يشوفه أبدًا.
4. الحد المجاني 1000 GB بالشهر. السيرفر يوقف الفيديو والبث تلقائيًا عند 950 GB ويخلي الصوت شغال لين 995 GB، فما ينخصم منك شي.
5. (اختياري) **Realtime ← TURN ← Create key** للناس اللي شبكاتهم مقيّدة جدًا: انسخ Key ID و API Token.

## 4) الإيميل (رسائل التأكيد واستعادة كلمة المرور)

1. من حساب Google الجديد: **Security ← 2-Step Verification** وفعّله.
2. ثم **App passwords**: أنشئ واحدًا باسم `mncord`، وانسخ الـ16 حرفًا.
3. صيغة السطر في `.env`:
   `SMTP_URL=smtps://العنوان%40gmail.com:كلمة_التطبيق@smtp.gmail.com:465`
   (الـ`@` داخل الإيميل تُكتب `%40`.) الحد المجاني: حوالي 500 رسالة يوميًا.

## 5) تجهيز السيرفر

ادخل بالـSSH:
```bash
ssh -i مفتاحك ubuntu@IP
git clone https://github.com/mnlovo-st/mncord.git /opt/mncord
bash /opt/mncord/infra/setup-oracle.sh
```
السكربت يحدّث النظام ويثبت Docker ويقفل الجدار الناري ويمنع الدخول بكلمة مرور. اخرج وادخل مرة ثانية بعدها.

## 6) الأسرار والتشغيل
```bash
cd /opt/mncord/infra
cp .env.example .env
docker run --rm -v "$PWD":/w -w /w node:24-alpine node gen-secrets.mjs >> .env
nano .env        # عدّل: DOMAIN و CF_REALTIME_APP_ID و CF_REALTIME_APP_SECRET و SMTP_URL و MAIL_FROM و DUCKDNS_TOKEN
bash update-dns.sh
docker compose --env-file .env up -d --build
```
افتح `https://mncord.duckdns.org/health`. إذا ظهرت `{"ok":true}` فالسيرفر شغال، وشهادة HTTPS تنعمل تلقائيًا.

## 7) النسخ الاحتياطي والتحديث التلقائي للـIP
```bash
age-keygen -o ~/backup.key && age-keygen -y ~/backup.key > /opt/mncord/infra/backup.pub
# انقل ~/backup.key إلى جهازك واحذفه من السيرفر: هو الوحيد اللي يفك النسخ الاحتياطية
crontab -e
# 0 4 * * *  /opt/mncord/infra/backup.sh
# */5 * * * * /opt/mncord/infra/update-dns.sh
```

## 8) إصدار التطبيق للناس

1. في GitHub ← Settings ← **Variables** أضف:
   `MNCORD_DOMAIN = mncord.duckdns.org`
2. سوِّ tag للإصدار: `git tag v1.0.0 && git push --tags`.
3. GitHub Actions يبني `mncord-Setup-1.0.0.exe` وينشره في **Releases**، والنسخ المثبتة تتحدث تلقائيًا بعدها.

## ملاحظات
- **السعة المجانية:** الرسائل والملفات على Oracle (حوالي 10 TB بالشهر). الصوت والبث على Cloudflare (1000 GB بالشهر). البث ما يُرسَل لأحد إلا لما يضغط «شاهد البث»، عشان نوفّر السعة.
- **أول تشغيل للتطبيق** يطلع فيه تحذير "ناشر غير معروف" من ويندوز لين نوقّع الملف. التوقيع مجاني عبر SignPath Foundation للمشاريع المفتوحة.
- **الوضع القانوني:** في الإمارات خدمات الاتصال الصوتي تحتاج ترخيصًا، فاستشر مختصًا قبل طرح التطبيق للعامة.
