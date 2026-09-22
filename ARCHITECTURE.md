# خريطة المشروع — فين أحط إيه؟

المرجع لتحديد مكان أي كود جديد. قبل إضافة ميزة، أجب على الأسئلة بالترتيب.

## قاعدة القرار

| السؤال | المكان |
|---|---|
| كلام مع YouTube API أو RSS؟ | `worker/lib/youtube-api.ts` (بعد إنشائه) |
| قراءة/كتابة KV؟ | عبر `worker/lib/kv-keys.ts` فقط — ممنوع اسم مفتاح خام جديد في ملفات أخرى |
| عملية admin طويلة (batch)؟ | فوق `worker/lib/batch-runner.ts` — ممنوع copy كامل لـ cursor/retry |
| route API جديد؟ | `worker/routes/` — و`worker/index.ts` توجيه فقط |
| شاشة/مكوّن طفل أو أهل؟ | `src/features/<اسم الميزة>/` |
| إيه القنوات المتاحة؟ | `src/data/channelRegistry.ts` فقط — ممنوع import channels_seed مباشرة في ملفات جديدة |
| إيه التصنيفات؟ | `src/data/categoryRegistry.ts` فقط |
| أداة batch في لوحة الأدمن؟ | `admin-youngtube` → hook موحّد + كارت رفيع |

## قاعدة ذهبية

كل مصدر بيانات خام يُقرأ من وحدة واحدة؛ الباقي يستورد منها.

## قيود refactor

- ممنوع تغيير النص الفعلي لأي مفتاح KV إنتاج إلا بـ migration موثّقة منفصلة.
- نقل كود = سلوك مطابق؛ تغيير المنطق = برومت/commit منفصل.
- أي batch جديد: عينة 2–3 عناصر (واحد كبير) قبل التشغيل الكامل.

## حالة الهجرة

- [ ] 0 ARCHITECTURE.md
- [ ] 1 worker/lib/kv-keys.ts
- [ ] 2 worker/routes/
- [ ] 3 batch-runner
- [x] 4 channelRegistry
- [x] 5 categoryRegistry
- [ ] 6 admin useBatchTool
- [x] 7 تفكيك الشاشات الكبيرة
