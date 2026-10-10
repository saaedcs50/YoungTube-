# تقرير تنفيذ صندوق رسائل الأهل — YoungTube

**تاريخ التنفيذ:** 10 أكتوبر 2026  
**المخرجات:** سورس YoungTube المعدّل، سورس admin-youngtube المعدّل، تقرير واختبارات وملف فروقات.  
**النشر الحي:** لم يتم.  
**GitHub push/commit:** لم يتم.

## الخلاصة

تم تعديل السورس الأصلي المتاح للمشروعين وربط ميزة صندوق رسائل الأهل على نفس Worker المعرّف في المشروع باسم `youngtube-worker`. أُضيف مخزن مستقل للرسائل باستخدام SQLite-backed Durable Object جديد باسم `ParentInboxStore` مع migration جديدة `v2`، مع الإبقاء على `TelemetryAggregator` وmigration `v1` ومساحة KV الخاصة بأرشيف القنوات دون حذف أو إعادة تسمية.

**تنبيه إصدار مهم:** السورس المعدّل متاح، لكن لم أتمكن من إكمال بناء Vite أو `cap sync` أو بناء APK في هذه البيئة بسبب تعذّر تحميل الاعتماديات من npm registry (`EAI_AGAIN`) وعدم وجود Vite في البيئة. لذلك ملفات Android Web Assets الموجودة داخل الأرشيف لم تُجَدَّد ولا تحتوي بالضرورة واجهة صندوق الرسائل الجديدة. كما لم يتم نشر Worker حي أو التحقق من binding/migration في Cloudflare الفعلي. لا تعتبر هذه الحزمة إصدارًا إنتاجيًا جاهزًا للتثبيت قبل تنفيذ خطوات البناء والتحقق الموضّحة أدناه.

## جرد المصادر

- تم استخدام أرشيف YoungTube الخارجي `devscope (71).zip` كسورس الأساس، مع اعتبار النسخة التي داخله `youngtube-fixed-source-after-7f0ef49-prompts-android-synced.zip` نسخة أقدم احتياطيّة لا مصدرًا أحدث.
- يحتوي `admin-youngtube (28).zip` على سورس React/TypeScript قابل للتعديل، وليس bundle مبنيًا فقط.
- توفر ملفا الخطة والإصلاح الأساسيان في المصادر المحلية. ملف منفصل باسم `youngtube-parent-inbox-execution-plan.md` لم يكن ضمن الملفات المرفوعة المتاحة في بيئة التنفيذ هذه؛ استُخدمت متطلبات خطة `youngtube-parent-inbox-plan.md` ونص برومبت التنفيذ الذي قدمه المستخدم.
- احتُفظ بنسخ أصلية غير معدّلة خارج الحزم النهائية أثناء التنفيذ.

## ما تغير

### مشروع YoungTube

- `worker/parent_inbox_do.ts`: تخزين SQLite للرسائل مع تحديثات معاملية وحد احتفاظ لآخر 500 رسالة، و5 رسائل لكل جهاز خلال نافذة متحركة 24 ساعة، والحالات والرد والتثبيت والملاحظة والأرشفة.
- `worker/routes/parent-inbox.ts`: مسارات إنشاء الرسائل وقراءتها حسب الجهاز وواجهات الأدمن، والتحقق من Bearer، والتحقق من الجسم والأطوال، واستجابة عامة لا تكشف `adminNote` أو الاستثناءات الداخلية.
- `worker/index.ts`: وصل الراوت ومحدّد إضافي للطلبات السريعة على POST، وإبقاء بقية الراوتس كما هي.
- `worker/lib/types.ts` و`worker/lib/cors.ts`: bindings وأسرار Telegram الاختيارية وقواعد المسارات.
- `wrangler.toml`: الحفاظ على migration `v1` للـ `TelemetryAggregator` وإضافة migration `v2` مستقلة للـ `ParentInboxStore`، مع استخدام نفس Worker ونفس KV binding القائم.
- `src/services/parentInbox.ts`: عميل API يستخدم `WORKER_URL` الحالي، ومعرّف الجهاز المحلي `yt_parent_device_id`، وإرسال الإصدار والمنصة، ورسائل خطأ عربية.
- `src/components/dashboard/ParentInboxSection.tsx`، و`src/components/dashboard/DashboardNav.tsx`، و`src/components/dashboard/DashboardShell.tsx`، و`src/App.tsx`: إضافة تاب «راسلنا» داخل لوحة الأهل المفتوحة بعد PIN فقط، فورم وقائمة رسائل وردود وتحديث يدوي، وإلغاء الطلبات عند فك تركيب المكوّن. لم يتم إدخال هذا التاب في وضع الطفل أو وضع أدوات التطوير غير المفتوح بالـ PIN.
- `tests/parent-inbox-routes.test.mjs`، `tsconfig.worker.json`، و`worker/PARENT_INBOX.md`: اختبارات محلية وإرشادات الـ Worker.
- أضيفت أوامر اختبار وفحص TypeScript الخاصة بالميزة في `package.json`.

### مشروع admin-youngtube

- `src/components/ParentInboxView.tsx`: شاشة وارد ورسائل مفصّلة، فلاتر الحالات والأرشيف، بحث ضمن آخر 200 رسالة، عداد الجديد، رد مع تأكيد، قوالب جاهزة قابلة للتعديل، قراءة وإغلاق/إعادة فتح، تثبيت، ملاحظة داخلية، وأرشفة.
- `src/types.ts`، و`src/components/Sidebar.tsx`، و`src/components/Header.tsx`، و`src/App.tsx`: وصل التاب والعداد في تنقل الأدمن.
- يعتمد الاتصال على `apiRequest` وآلية Bearer الحالية؛ لم تتم إضافة `ADMIN_KEY` إلى ملفات الواجهة أو قيم بناء عامة.
- `tests/parent-inbox-ui-contract.test.mjs` واختبار npm script خاص به.

## الاختبارات والفحوصات التي نُفذت

| الفحص | النتيجة | نطاق الإثبات |
|---|---|---|
| `node --test tests/navigation-history.test.mjs` | **13/13 ناجحة** | اختبارات التنقل وسجل المشاهدة الموجودة في سورس YoungTube |
| `NODE_PATH=/opt/nvm/versions/node/v22.16.0/lib/node_modules node --test tests/parent-inbox-routes.test.mjs` | **10/10 ناجحة** | تحقق من عقود الراوت والمصادقة وإسقاط الحقول العامة، ومحاكاة SQLite محلية للحصص والتحديثات والحالات والاحتفاظ والبحث |
| `node --test tests/parent-inbox-ui-contract.test.mjs` | **3/3 ناجحة** | فحوصات عقد المصدر لتسجيل تاب الأدمن واستخدام العميل الحالي ووجود الإجراءات المطلوبة |
| `/opt/nvm/versions/node/v22.16.0/bin/tsc -p tsconfig.worker.json` | **ناجح** | فحص TypeScript للـ Worker وشجرة الوحدات التي يستوردها |
| فحص TypeScript للملفات المتغيرة باستخدام shims مؤقتة في بيئة الفحص | **ناجح** | فحص أنواع مكوّنات الميزة وخدمتها؛ ملفات shims المؤقتة ليست ضمن حزم التسليم |
| محلل TypeScript | **146 ملفًا، 0 أخطاء تحليل** | ملفات `.ts` و`.tsx` تحت src وworker للمشروعين |
| تحليل `wrangler.toml` بواسطة Python `tomllib` | **ناجح** | اسم Worker وmain والـ bindings وتسلسل migration؛ ليس بديلًا عن Wrangler runtime validation |

اختبارات SQLite في Node تستخدم قاعدة SQLite محلية ومحاكاة لـ Durable Object؛ لذلك لا تثبت وحدها التنفيذ على Cloudflare Runtime. لا يوجد ادعاء بأن اختبارًا على جهاز حقيقي أو اختبار نشر حي قد حدث.

## ما لم يكتمل ولماذا

1. `npm ci --offline` فشل برسالة `ENOTCACHED` لأن الاعتماديات غير موجودة في الكاش المحلي.
2. `npm ci --prefer-online` تعذّر تنزيل الحزم من `registry.npmjs.org` بأخطاء DNS من نوع `EAI_AGAIN`.
3. نتيجة `npm run build` في المشروعين: `vite: not found` بسبب فشل تثبيت الاعتماديات.
4. نتيجة `npm run lint` الكامل في المشروعين: تعذّر العثور على `vite/client` وفي YoungTube أيضًا `vite-plugin-pwa/client`؛ هذا ناتج عن الاعتماديات الناقصة، وليس تقريرًا بأن فحص TypeScript الكامل للمشروع نجح.
5. لم يتم تشغيل `npx cap sync android` أو إنتاج APK جديد؛ لا توجد إعدادات Android SDK في البيئة (`ANDROID_HOME` و`ANDROID_SDK_ROOT` غير معيّنين) ولا يمكن استكمال بناء الواجهة من دون npm dependencies.
6. لم يتوفر `wrangler` CLI في البيئة، ولم يُنفّذ `wrangler deploy --dry-run` أو نشر فعلي. لم يتم تعديل Worker حي أو secrets أو bindings حيّة.
7. ملفات `android/app/src/main/assets/public/` المضمنة هي الأصول السابقة الموجودة في المصدر، ولم يتم تعديل ملفات assets المولّدة يدويًا. يجب إعادة توليدها بـ `npm ci` ثم `npm run cap:sync` بعد توفر الشبكة والاعتماديات.

## خطوات إكمال البناء والتحقق عند توفر npm registry

من جذر YoungTube:

```sh
npm ci
npm run test:navigation
npm run test:parent-inbox
npm run typecheck:worker
npm run lint
npm run build
npm run cap:sync
```

ثم تحقّق من إعداد Worker في بيئة المشروع باستخدام Wrangler قبل أي نشر:

```sh
npx wrangler deploy --dry-run
```

إذا نجح ذلك فقط، راجع اسم Worker والـ bindings وmigration `v2`، ثم انشر إلى `youngtube-worker` الموجود وفق إجراء النشر المعتمد. لا تنشئ Worker آخر ولا تحذف migration `v1` أو بيانات القنوات أو `support_pay`.

من جذر admin-youngtube:

```sh
npm ci
npm run test:parent-inbox
npm run lint
npm run build
```

بعدها يجب اختبار دورة الرسالة كاملة على بيئة Worker حقيقية وموبايل فعلي: إنشاء رسالة، ظهورها في الأدمن، إرسال رد، ظهور الرد على الجهاز نفسه، ثم الإغلاق والأرشفة، واختبار حد 5 رسائل/24 ساعة.

## الأمان والنطاق

- لا `git push` ولا commit.
- لا نشر حي، ولا APK جديد، ولا تغيير أسرار حقيقية.
- لا توجد أسرار جديدة مضمنة عمدًا؛ إعدادات Telegram اختيارية ولا تعمل إلا عند ضبط `TELEGRAM_BOT_TOKEN` و`TELEGRAM_CHAT_ID` كـ Cloudflare secrets على Worker الحالي. لا تُضبط قيمهما في `VITE_*` أو داخل الكود.
- معرف الجهاز وسيلة ربط للرسائل وليس إثبات هوية قويًا؛ لا ينبغي إرسال بيانات حساسة أو بيانات مشاهدة الطفل في الرسالة.
- تم استخدام Durable Object مستقل بدل تخزين المصفوفة كلها في مفتاح KV واحد لتقليل خطر فقد التحديثات المتزامنة. الأرشفة حقل منفصل عن الحالة، وحد الاحتفاظ 500 يعني أن الأرشفة ليست احتفاظًا دائمًا.

## مرجعية تقنية خارجية

اخترت التخزين المعاملي المستقل بدل مصفوفة KV واحدة لتقليل مخاطر الكتابة المتزامنة. توثيق Cloudflare الرسمي يوضح أن SQLite-backed Durable Objects توفر SQL ومعاملات مثل `transactionSync`، وأن إضافة فئة جديدة في إعداد يستخدم `migrations` تحتاج migration جديدة من نوع `new_sqlite_classes`:

- [Cloudflare — SQLite-backed Durable Object Storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Cloudflare — Durable Object migrations (legacy migrations)](https://developers.cloudflare.com/durable-objects/reference/durable-object-class-migrations-legacy/)

هذا توثيق تصميم، وليس دليلًا على أن النشر الحي تم؛ التحقق من Wrangler على حساب المشروع ما زال غير منفّذ.

## الحكم النهائي

**السورس المعدّل والاختبارات المحلية المرفقة جاهزة للمراجعة والتنزيل؛ البناء الكامل والتسليم الإنتاجي لم يكتمل بسبب انقطاع الوصول إلى npm registry، والنشر لم يحدث.** يجب عدم تثبيت الأصول الحالية باعتبارها إصدار Inbox جديدًا قبل إعادة البناء وCapacitor sync والاختبار والنشر المصرّح به.
