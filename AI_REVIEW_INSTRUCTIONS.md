# YoungTube — AI Review & Operating Instructions

## 1. ترتيب الأولوية (Priority Order)

عند وجود تعارض:

1. **الكود الفعلي الموجود في المشروع** هو source of truth للحالة الحالية.
2. `PROJECT_CONTEXT.md` يشرح الـ architecture والـ business rules.
3. `HANDOFF.md` يشرح آخر حالة تنفيذية وما تم عمله وما لم يتم.
4. `WORKER_CLOUDFLARE.md` هو المرجع الخاص بالـ Cloudflare Worker.
5. `AI_REVIEW_INSTRUCTIONS.md` يحتوي قواعد التعامل والفحص والتوثيق.

لا تعتمد على ذاكرة المحادثة وحدها.

---

## 2. قبل أي تعديل مستقبلي

في كل مرة يُطلب منك تعديل هذا المشروع:

- اقرأ `PROJECT_CONTEXT.md`.
- اقرأ `HANDOFF.md`.
- افحص الملفات الفعلية التي لها علاقة بالمطلوب.
- لا تفترض أن feature غير موجودة لمجرد أنك لا تتذكرها.
- لا تعيد تنفيذ feature موجودة بالفعل.
- لا تحذف existing behavior بدون سبب تقني واضح.
- لا تنشئ implementation بديلة بجانب implementation الحالية.
- لا تغيّر architecture لمجرد أن هناك طريقة أخرى تعجبك.
- حافظ على existing APIs و business rules ما لم يُطلب تغييرها.

---

## 3. أهمية ملفات التشغيل والتوثيق

هذه الملفات ليست Documentation عادية.  
هي جزء من آلية إدارة المشروع بين عدة AI agents وحسابات مختلفة.  
لذلك يجب أن تبقى محدثة أثناء التطوير.

---

## 4. قاعدة إلزامية دائمة (Mandatory Invariant)

أي تعديل فعلي في الكود يجب أن ينعكس في ملفات المشروع هذه قبل إنهاء المهمة.

بعد كل تعديل:

### `HANDOFF.md`
حدّثه ليشمل:
- ماذا تم تغييره.
- لماذا تم تغييره.
- الملفات التي تم تعديلها.
- الحالة الحالية.
- ما الذي تم اختباره.
- ما الذي لم يتم اختباره.
- أي مشكلة متبقية.
- الخطوة التالية المقترحة.

### `PROJECT_CONTEXT.md`
حدّثه فقط عندما يتغير:
- Architecture.
- Business logic.
- Permanent feature behavior.
- API contract.
- Security rule.
- Storage / data model.
- Important project decision.

### `WORKER_CLOUDFLARE.md`
حدّثه عند تغيير:
- Worker routes.
- Bindings.
- KV behavior.
- Durable Objects.
- Deployment configuration.
- Cloudflare integration.
- Worker security / authentication behavior.

### `AI_REVIEW_INSTRUCTIONS.md`
لا تعدّل قواعد التشغيل فيه إلا إذا طلب المستخدم تغييرها صراحة.

---

## 5. معايير نتائج الاختبارات (Testing Evidence Labels)

ممنوع وصف شيء بأنه PASS بدون evidence.  
استخدم دائمًا:

- **PASS**: تم الاختبار فعليًا ونجح بالدليل.
- **SOURCE-OK**: تم التحقق من الكود فقط (Static / Source inspection).
- **BLOCKED**: تعذر الاختبار بسبب البيئة أو صلاحيات أو network.
- **FAIL**: الاختبار تم وفشل.

---

## 6. محظورات قطعية (Strictly Forbidden)

- GitHub push (إلا إذا طلب المستخدم ذلك صراحة).
- Git commit (إلا إذا طلب المستخدم ذلك صراحة).
- تغيير Cloudflare production resources بدون طلب صريح.
- تغيير أو تدوير secrets.
- طباعة secrets أو عرض قيم حساسة في المخرجات.
- اختراع credentials أو mock fallbacks عند توفر تكامل حقيقي.
- اختراع API keys.
- استخدام بيانات دفع حقيقية داخل source.
- اعتبار code inspection اختبارًا runtime.
- توليد أو إعادة إنشاء ملفات `bun.lock` أو `bun.lockb`.
