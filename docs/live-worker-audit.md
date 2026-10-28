# تدقيق الإصدار الحي لـ `youngtube-worker`

`npm run audit:worker:live` يشغّل فحصًا مستقلًا يقرأ حالة GitHub وCloudflare وواجهتي Worker العامتين، ثم يطبع تقرير JSON إلى `stdout`. لا يحتاج إلى أي اعتماد npm إضافي؛ يعتمد على APIs القياسية في Node.js.

## المتغيرات

المتغيران اللازمان لفحوص Cloudflare:

- `CLOUDFLARE_ACCOUNT_ID`: معرّف حساب Cloudflare.
- `CLOUDFLARE_API_TOKEN`: توكن Cloudflare للقراءة فقط.

المتغيرات الاختيارية:

- `GITHUB_REPOSITORY`: مستودع `owner/repo`؛ الافتراضي `saaedcs50/YoungTube-`.
- `GITHUB_REF`: الفرع أو المرجع المطلوب؛ الافتراضي `main`.
- `GITHUB_TOKEN`: اختياري للمستودعات الخاصة أو لتفادي حدود الطلبات غير الموثقة؛ لا يلزم للمستودع العام في الحالة الاعتيادية.
- `WORKER_BASE_URL`: عنوان Worker؛ الافتراضي `https://youngtube-worker.saaedbelal.workers.dev`.

مثال تشغيل من Bash:

```bash
export CLOUDFLARE_ACCOUNT_ID='your-account-id'
export CLOUDFLARE_API_TOKEN='your-read-only-token'
npm run audit:worker:live
```

لحفظ التقرير محليًا بدل عرضه فقط:

```bash
npm run audit:worker:live > live-worker-audit.json
```

لا تضع التوكن في الأمر نفسه أو في المستودع. لا يطبع السكربت قيم التوكن أو رؤوس التفويض أو محتويات KV أو قيم الـ secret bindings. يعرض فقط أدلة منقحة مثل أسماء وأنواع الـ bindings، ونتيجة مطابقة المورد، وتوزيع نسب حركة الإصدارات.

## أقل صلاحيات مطلوبة

أنشئ Cloudflare API Token بصلاحية **Workers Metadata Read-Only**، وقيّده على مورد Worker `youngtube-worker` إن كانت واجهة الصلاحيات المتاحة تسمح بتحديد Worker منفرد. عند تعذر النطاق الفردي، استخدم النطاق الحسابي مع الصلاحية نفسها فقط. لا تمنح `Edit` أو `Deploy` أو صلاحية كتابة. هذه الصلاحية تدعم قراءة metadata والإعدادات، بينما لا يحتاج الفحص إلى قراءة كود Worker أو قيم البيانات. انظر [Cloudflare Workers permissions](https://developers.cloudflare.com/workers/authorization/workers/) وواجهتي [List Worker Deployments](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/) و[Get Worker Script and Version Settings](https://developers.cloudflare.com/api/resources/workers/subresources/script_and_version_settings/methods/get/).

المستودع العام لا يتطلب عادة توكن GitHub. إذا كان خاصًا، استخدم توكن GitHub للقراءة فقط (صلاحية Contents: Read على المستودع المطلوب).

## ما الذي يتم فحصه؟

1. SHA كامل وحديث للمرجع المحدد عبر GitHub REST API.
2. آخر deployments في Cloudflare، ثم توزيع حركة أحدث deployment. ينجح فحص الحركة فقط عندما يوجه أحدث deployment نسبة 100% إلى إصدار واحد؛ أي تقسيم أو توزيع غير صالح يفشل الفحص.
3. مصدر الإصدار: تُقرأ قيمة annotation الخاصة بالنشر، ويُقبل SHA كامل أو بادئة من 7 إلى 40 حرفًا فقط إذا كانت بادئة فعلية من SHA الحالي. غياب annotation أو SHA قابل للقراءة ينتج `UNKNOWN`، ولا يُفسَّر كنجاح.
4. bindings المطلوبة في Cloudflare مقارنةً بإعلانات `wrangler.toml`: D1 `CATALOG_DB`، وKV `CHANNELS_ARCHIVE`، و`CATALOG_DISCOVERY_QUEUE` و`CATALOG_PROCESSING_QUEUE`. يقارن الفحص النوع وهوية D1/KV واسم الطابور، دون طباعة معرّفات الموارد أو قيم الأسرار.
5. طلبا GET عامان فقط: `/api/health` و`/api/categories`. عقد Health مأخوذ من `worker/routes/public-read.ts`، وعقد Categories من مسار `GET /api/categories` في `worker/routes/catalog-v2.ts`: المصفوفة المباشرة، وجود فئة `all`، معرّفات فريدة، واسم/عنوان غير فارغ لكل فئة.

لا يستدعي السكربت مسارات admin، ولا يقرأ محتوى KV أو صفوف D1، ولا يكتب إلى Cloudflare، ولا يغير إعدادات أو طوابير، ولا ينشر إصدارًا. جميع طلبات الشبكة التي ينفذها هذا الفحص هي `GET` فقط.

## معنى الحالات

- `PASS`: توجد أدلة كافية لاجتياز هذا الفحص تحديدًا.
- `FAIL`: الدليل المقروء يخالف العقد أو الإعداد المتوقع، مثل نسبة حركة منقسمة، SHA غير مطابق، أو binding مفقود.
- `UNKNOWN`: تعذر إثبات النتيجة بسبب غياب دليل أو timeout أو خطأ شبكة أو رد غير مفهوم. ليست نجاحًا.
- `BLOCKED`: تعذر إجراء فحص Cloudflare بسبب غياب صلاحيات/بيانات اعتماد لازمة. ليست نجاحًا.

الأولوية الإجمالية هي `FAIL` ثم `BLOCKED` ثم `UNKNOWN` ثم `PASS`. لا يخرج الأمر بكود نجاح إلا عندما تكون جميع الفحوص `PASS`؛ خلاف ذلك يكون رمز الخروج غير صفري.

## الاختبارات

```bash
node --test tests/audit-live-worker.test.mjs
```

الاختبارات تستخدم `fetch` مزيفًا لكل الطلبات، لذا لا تحتاج أسرارًا ولا اتصال إنترنت. تغطي مطابقة SHA كامل/بادئة صحيحة، عدم المطابقة وغياب annotation، تقسيم الحركة، bindings مفقودة أو غير مطابقة، API errors/timeouts، عقود Health وCategories، غياب بيانات Cloudflare، واستخدام GET فقط وعدم تسريب التوكن أو قيم سرية.
