# YoungTube — تقرير تنفيذ وإغلاق دفعة الإصلاح المدمجة (Stage D)

**تاريخ التنفيذ:** 2026-10-09 (Africa/Cairo)  
**المصدر الجاري تنفيذه:** `devscope (69).zip`  
**الحالة العامة:** إغلاق Stage D على مستوى المصدر والأدلة المتاحة فقط؛ **ليس تصريح إصدار، وليس تأكيدًا لاكتمال Stage E أو Stage F أو Stage G**.

## 1. الخلاصة التنفيذية

تم فتح وقراءة تعليمات التنفيذ الرئيسية، وحزمة الإصلاح المدمجة، وخطة الإصلاح، ثم فحص الأرشيف الفعلي والملفات المتأثرة. نُفّذ ترتيب العمل التسعة منطقيًا من تثبيت المصدر، ثم تدقيق H1–H5، والتحقق من بوابات H6–H11، وصولًا إلى إغلاق Stage D.

- **تصحيحات جديدة في كود التطبيق:** 0. هذا ليس تركًا للتنفيذ: لم يظهر في المصدر دليل مستقل يبرر تعديلًا آمنًا إضافيًا لـ H1–H5، أما H6/H10/H11 فتتطلب قرار منتج، وH7/H8/H9 تتطلب قياس/إعادة إنتاج. تعديل هذه البنود تخمينًا سيخالف تعليمات الملف.
- **بنود مصدرها صحيح / لا تحتاج Patch الآن:** 5 — H1 إلى H5 (ثقة مصدرية فقط، ولا يعني ذلك أن رحلات المستخدم مرّت بالكامل).
- **بنود إصلاح غير محسومة/موقوفة:** 6 — H6 إلى H11: ثلاثة تتطلب قرار منتج (H6/H10/H11)، وثلاثة تتطلب دليل جهاز/متصفح (H7/H8/H9).
- **سجل التحقق المجمع:** **PASS = 6، FAIL = 0، BLOCKED = 4، NOT RUN = 3**، بإجمالي 13 مسار تحقق موضحًا أدناه. لا تُساوي هذه الأرقام عدد رحلات المستخدم؛ مصفوفة QA وM منفصلة.
- `npm run test:navigation`: **نُفذ بالفعل ونجح 13/13، Exit code 0**.
- `npm run lint`: **لم يُنفذ** لأن `node_modules` غير موجودة، وسياسة التنفيذ تمنع تثبيت الاعتمادات من أجل الاختبار.
- `npm run build`: **لم يُنفذ** للسبب نفسه.
- Browser history harness: جرت محاولتان باستخدام Chromium 144 لكن المتصفح رفض الوصول للصفحة المحلية بـ `net::ERR_BLOCKED_BY_ADMINISTRATOR` قبل تشغيل الاختبارات؛ التصنيف **BLOCKED وليس FAIL**.
- Android/WebView: **لم يُنفذ**؛ `adb` و`emulator` غير موجودين في بيئة التنفيذ.
- لم يحدث `npm install` أو `npm ci` أو تحديث اعتماد، ولم يُنفذ push أو deploy أو publish أو تغيير خدمة إنتاج.
- **Git commit identity غير قابل للتحقق من الشجرة المسلّمة** لأن الأرشيف لا يحتوي على `.git`؛ لا ينسب هذا التقرير المصدر إلى commit غير مثبت.

## 2. سجل المصدر والـ Baseline

| المدخل | القيمة المثبتة |
|---|---|
| اسم الأرشيف الفعلي | `devscope (69).zip` |
| الحجم بالبايت | `5,403,695` |
| SHA-256 | `0b531109f895174215cae90cfdf672baea24cdeaa8c97a3d1d8ebafd7bad096a` |
| اختبار سلامة ZIP الأصلي | **PASS** — `unzip -t` بلا أخطاء |
| عدد أعضاء الأرشيف وفق الفحص | 378 عضوًا |
| `.git` في الشجرة المستخرجة | غير موجود |
| `node_modules` | غير موجودة |
| Node / npm | Node `v22.16.0` / npm `10.9.2` |
| `adb` / `emulator` | غير موجودين |
| مجلد العمل | `/tmp/yt69` |

### بصمات ملفات التعليمات

| الملف | البايتات | SHA-256 |
|---|---:|---|
| `youngtube-execute-merged-repair-batch-prompt.md` | 23,468 | `a099b31f434faaf82702b1aa03c55e6fe5733bfa68801f6a6b891d586f7d8091` |
| `youngtube-next-merged-repair-prompts.md` | 83,434 | `1f32eaff0b534b6527883856e1f7e6df2f20899d38cc2999b7143fac30374e1d` |
| `youngtube-repair-plan.md` | 147,921 | `9a9ee16dea1a754a16ab99c7ffd62f8b87ea45bd93dddaa50d01420340e660a8` |

> ملاحظة تدقيق: تم التمييز بين الأرشيف الموجود حاليًا `devscope (69).zip` وبين مرجع الخطة إلى `devscope (68).zip`. الخطة تسجل للأرشيف الأقدم بصمة `f45da638b1d73dc826d11bffb7f3463dda37163514d88e7b98f89a75861fcf1e`، وهي ليست بصمة الأرشيف الحالي. كما أن مستندات المصدر تذكر هويات commit مختلفة (`7a00cb81ad3491a977ff6642e3b93d63b10461f1` مقابل `096f950accb9b462deae95f4ef8bc7e4ad946ab9`)؛ غياب `.git` يمنع إثبات أي منهما لهذا الأرشيف. لا يُفترض تطابق الأرشيف كله مع commit بناءً على تطابق مجموعة ملفات فقط.

## 3. قواعد التنفيذ والنطاق

- الأرشيف الأصلي لم يُعدّل؛ تم الاستخراج إلى مجلد عمل منفصل.
- لا تثبيت اعتماد ولا تعديل lockfile ولا إعادة بناء أصول Android المجمعة يدويًا.
- لم تُغيّر ملفات من `src/` أو إعدادات المشروع أو `android/app/src/main/assets/public/assets/` في هذه الدفعة.
- أضيف هذا التقرير ومواد الأدلة فقط. وجود مجلد `repair-evidence/` داخل الأرشيف لا يغيّر كود التشغيل.
- لم يُنشر شيء؛ لا يوجد قرار GO/NO-GO للإصدار ضمن هذه المهمة.

## 4. سجل التحقق المجمع (13 مسارًا)

هذا الإجمالي يحصي **مسارات التحقق المجمعة** لا كل assertion ولا كل QA/M journey. يوجد تفصيل منفصل لحالات الاختبار أدناه.

| # | المسار | الحالة | الدليل/التفسير |
|---:|---|---|---|
| 1 | سلامة أرشيف المصدر الأصلي | PASS | `unzip -t` بلا أخطاء؛ البصمة والحجم مسجلان. |
| 2 | `npm run test:navigation` | PASS | 13 اختبارًا؛ 13 ناجحًا؛ 0 فشل؛ Exit 0. |
| 3 | تدقيق مصدر H1–H4 | PASS | ملكية History، Search restore، overflow mode وprop الخاص بالمساحة موجودة كما هو موضح أدناه؛ لا Patch مبرر. لا يدّعي هذا اختبار UI. |
| 4 | تدقيق مصدر H5 | PASS | مسار إغلاق X مميز عن توسيع mini؛ توقف الوسائط وتسجيل skip/taste محفوظان في المصدر؛ runtime لم ينفذ. |
| 5 | مراجعة مصادر H6/H10/H11 وبوابات المنتج | PASS | تم إثبات السلوك الموجود وتسجيل الاختيارات غير المحسومة؛ النجاح هنا يخص التدقيق لا اعتماد القرار. |
| 6 | تدقيق مصدر H7–H9 | PASS | تمت قراءة مسار safe-area/scroll/touch؛ لم يتم استنتاج عطل مرئي بلا قياس. |
| 7 | Browser history harness | BLOCKED | Chromium رفض التنقل المحلي بـ `net::ERR_BLOCKED_BY_ADMINISTRATOR` قبل تنفيذ الصفحة؛ لم تعمل assertions. |
| 8 | Android/WebView والجهاز | BLOCKED | لا `adb` ولا emulator؛ لا صور/قياسات/سجلات جهاز متاحة. |
| 9 | `npm run lint` | BLOCKED | لم يُنفّذ لعدم وجود `node_modules`؛ تنفيذ `npm install/ci` محظور في المهمة. |
| 10 | `npm run build` | BLOCKED | لم يُنفّذ لعدم وجود `node_modules`؛ لا ادعاء build ناجح. |
| 11 | React component/UI integration suite | NOT RUN | المشروع لا يوفّر test runner لهذه المجموعة بحسب scripts الحالية؛ لم يُضف framework أو dependency. |
| 12 | Stage F: جميع QA-01–QA-28 وM01–M51 | NOT RUN | ليس جزءًا من نجاح وحدة التنقل؛ لم تُنفذ الحملة كاملة. |
| 13 | Stage G: release approval | NOT RUN | خارج النطاق وبوابات المصدر/البناء/الجهاز لم تُغلق. |

**لا يوجد FAIL مسجل** لأن الاختبارات التي فشلت فعليًا لم تُنتج نتيجة فشل؛ العائق في Browser/Android/lint/build هو عائق تنفيذ محدد لا فشل assertion. هذا لا يعني أن السلوك غير المختبر سليم.

## 5. ناتج اختبار التنقل الفعلي

الأمر المنفذ من جذر المشروع:

```bash
npm run test:navigation
```

المخرج المحفوظ: `repair-evidence/navigation-test-output.txt`  
ملف exit code: `repair-evidence/navigation-test-exit-code.txt` (`navigation_test_exit_code=0`).

| # | اختبار Node الفعلي | النتيجة |
|---:|---|---|
| 1 | History state is namespaced and retains unrelated host fields | PASS |
| 2 | overlay and search-result entries record actual parent/query metadata | PASS |
| 3 | overlay-to-Watch handoff waits for popstate acknowledgements and truncates stale forward overlays | PASS |
| 4 | handoff from overlay above Watch converts Watch into a non-player anchor before opening new Watch | PASS |
| 5 | Back from Watch minimizes once and mini-player sentinel closes playback on next Back | PASS |
| 6 | Back decisions preserve fullscreen and settings one layer at a time | PASS |
| 7 | Back from overlay above Watch returns exact prior Watch entry without minimizing | PASS |
| 8 | malformed destination state normalizes without deleting unrelated state | PASS |
| 9 | duplicate delivery of same popstate event object is applied exactly once | PASS |
| 10 | closing player with settings/fullscreen traverses one acknowledged parent at a time | PASS |
| 11 | closing mini sentinel traverses to parent without inserting a Watch entry | PASS |
| 12 | Search query edits replace current results entry without changing identity/parent | PASS |
| 13 | Search restores query only from exact Search Results entry | PASS |

الإجمالي الظاهر في إخراج Node: `tests 13`, `pass 13`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0`, `duration_ms 68.878007` (تقريبًا 69ms حسب سجل الاختبار). هذه اختبارات تنقل على مستوى Node وليست تشغيل React/Capacitor ولا إثباتًا لسلوك زر X في جهاز فعلي.

## 6. إغلاق التنفيذ بالتسعة Prompts بالترتيب

| Prompt | ما أُنجز | النتيجة |
|---|---|---|
| 1 — تثبيت baseline وH1–H4 | بصمة/سلامة الأرشيف، غياب Git/dependencies، فحص callers ومصدر History/Search/Channels/sheet، تشغيل اختبار التنقل | اكتمل على مستوى المصدر والاختبار المتاح؛ Browser UI ما زال BLOCKED. |
| 2 — H5 | تتبع X/body handlers، skip/taste logging، stopVideo، onClose وonExitMinimized، ربط History close | SOURCE-OK / NO PATCH REQUIRED؛ runtime QA-06 لم ينفذ. |
| 3 — H6 | تتبع فتح Dashboard وPIN success/lock ورسم PlayerView | BLOCKED — PRODUCT DECISION REQUIRED. |
| 4 — H7 | مراجعة edge-to-edge وsystem bars وSettings sheet | BLOCKED — DEVICE EVIDENCE REQUIRED؛ لا CSS تخميني. |
| 5 — H8 | مراجعة actual implementation لحركة PullToRefresh والحواجز | BLOCKED — DEVICE EVIDENCE REQUIRED؛ لا تغيير threshold دون reproduction. |
| 6 — H9 | مراجعة scroll wrappers في Search وAppShell | BLOCKED — BROWSER/DEVICE EVIDENCE REQUIRED؛ لا اختيار scroll owner دون القياس. |
| 7 — H10 | مراجعة بطاقة القائمة و«عرض الكل» وroute contract | BLOCKED — PRODUCT DECISION REQUIRED. |
| 8 — H11 | مراجعة grip/`cursor-grab` وأزرار الأسهم ومستودع الترتيب | BLOCKED — PRODUCT DECISION REQUIRED. |
| 9 — إغلاق Stage D | فصل Repair عن Verification، بناء QA/M matrices، وتحديد بوابات E/F/G | هذا التقرير هو ناتج الإغلاق؛ مراحل E/F/G لم تُنفذ. |

## 7. مصفوفة H1–H11 وT01–T12

`Repair status` و`Verification status` متغيران مستقلان؛ `SOURCE-OK` لا يعني أن اختبار المستخدم نجح، كما أن `BLOCKED` لا يعني أن إصلاحًا قد فشل.

| ID | Repair status (independent) | Verification status (independent) | Current-source evidence / finding | Next action / required evidence | Rollback |
|---|---|---|---|---|---|
| H1 / T01 — History coordinator | SOURCE-OK / NO PATCH REQUIRED | PASS — source ownership audit; PASS — scoped navigation unit suite; browser journey BLOCKED | `src/shell/historyCoordinator.js` is the sole source owner found for direct browser `pushState`, `replaceState`, traversal and `popstate`. State is namespaced under `youngtubeHistory` and tracks entry identity/parent/kind. `AppShell` uses acknowledged handoff rather than inferring history distance from overlay count. | Execute QA-01–QA-07/M15/M16/M18/M19/M25/M26/M27/M28/M43 on browser and Android; record each Back step and `history.state`. | No code patch; no code rollback. Keep the coordinator unchanged unless a failing reproduction shows a narrow defect. |
| H2 / T03 — Channels overflow mode | SOURCE-OK / NO PATCH REQUIRED | PASS — source mapping inspection; NOT RUN — UI QA-10 | `src/features/channels/ChannelsScreen.tsx` stores `overflowMode`; ListPlus selects `playlist`, overflow menu selects `menu`, and `initialMode` is passed to `VideoOverflowSheet`. | Run QA-10/M04/M13; fast-switch between videos and check Home/Search/Channel callers. | No code patch; no code rollback. |
| H3 / T02 — Search restoration | SOURCE-OK / NO PATCH REQUIRED | PASS — source/helper review and relevant existing unit coverage; NOT RUN — React integration | `src/features/search/searchHistoryState.js` restores only an exact `search-results` entry with `searchStage === 'results'` and a string query. Query edits replace the current entry without changing its identity/parent. | Run QA-08/QA-09/M14/M34/M49 in browser; verify A→Channel/Playlist→Back, then new query B isolation. | No code patch; no code rollback. |
| H4 / T04 — bottom-nav avoidance in sheet | SOURCE-OK / NO PATCH REQUIRED | PASS — source prop inspection; NOT RUN — visual QA-11 | Channels passes `avoidBottomNav` and `initialMode`; `VideoOverflowSheet` applies bottom padding when requested. Home path also has intentional usage. | Run QA-11/M05/M39 on short/tall viewports and Android safe area; check no global padding regression. | No code patch; no code rollback. |
| H5 / T05 — mini-player close vs expand | SOURCE-OK / NO PATCH REQUIRED | PASS — source callback-graph inspection; NOT RUN — component/UI QA-06 | `PlayerView.tsx` close handler retains skip/taste logging, safely stops video, clears local minimized/playing UI state and calls `onClose()` without `onExitMinimized()`. X click stops propagation; mini body has the distinct expansion callback. App close path delegates to `closePlayerHistory`. | Run QA-06, M24/M31 and QA-24 queue guard; confirm X closes once, body expands, no extra Watch history entry, playback/queue cleanup. | No code patch; no code rollback. |
| H6 / T06 — Player visibility on parent Dashboard | BLOCKED — PRODUCT DECISION REQUIRED | NOT RUN — expected behavior is undefined; QA-12/QA-19/M32/M40/M46/M47 remain | PIN handlers gate Dashboard entry; successful unlock opens it and lock returns to Kids. Player render condition is based on active playback / demo player rather than `viewMode`, but source does not define whether playback should continue hidden, pause, or stop. | Product owner must approve Option A/B/C below, including audio and resume semantics. Preserve active media, local path, downloads, playlist context and queue. Then run QA-12/QA-19 and related M journeys. | No code patch. After any approved change, rollback only the dedicated Player visibility/lifecycle change; never clear media/download persistence as rollback. |
| H7 / T07 — Player Settings safe-area/pointer | BLOCKED — DEVICE EVIDENCE REQUIRED | BLOCKED — Android/WebView measurements unavailable | `MainActivity.java` enables edge-to-edge with transparent bars; `android/variables.gradle` target SDK 36. Settings sheet has a scrollable body but the inspected body lacks local safe-area padding. `index.html` lacks `viewport-fit=cover`. These facts do not demonstrate clipping. | Run QA-13/M23 on a supported Android/WebView; capture device, Android/WebView versions, navigation mode, viewport, final-control visibility, computed insets, scroll bounds, drag and Back behavior. | No speculative CSS patch to roll back. If a measured defect justifies a patch, isolate it in the Settings sheet and revert only that patch if regression occurs. |
| H8 / T08 — Pull-to-refresh | BLOCKED — DEVICE EVIDENCE REQUIRED | BLOCKED — touch/scroll runtime unavailable | `PullToRefresh.tsx` uses document scrolling element fallback, top check `scrollTop > 1`, vertical/downward/single-touch guard and player-surface exemptions; it handles touchcancel in termination flow. No measured failing path exists here. | Run QA-14/15 and M06/M07/M45 at top/mid-feed, horizontal movement, card/button, 1/2 touches, mini and full player; record actual scroll owner and refresh count. | No speculative threshold/gesture patch. Revert only any future isolated H8 change; preserve player exemptions. |
| H9 / T09 — Search scroll ownership | BLOCKED — DEVICE/BROWSER EVIDENCE REQUIRED | BLOCKED — Chromium blocked local harness; Android unavailable | `AppShell.tsx` overlay wrapper and `SearchScreen.tsx` root can both be scrollable; source shape alone does not prove a user-visible defect. | Run QA-16 and M14/M34/M38/M49 with long results, sticky header and route return; capture outer/inner `scrollTop`, `window.scrollY`, computed overflow and viewport geometry. Choose one owner only if reproduced. | No CSS patch made. Revert a future scroll-owner-only patch if results/sticky header/restoration regress. |
| H10 / T10 — You playlist preview cards | BLOCKED — PRODUCT DECISION REQUIRED | NOT RUN — QA-17/M29/M35 not run pending interaction contract | `YouScreen.tsx` renders up to three playlist previews as static `<div>`s; separate “عرض الكل” action opens playlist overview. No source-backed selected-ID route requirement authorizes direct-open. | Approve Option A (static preview + view all) or B (accessible card control opens the exact clicked playlist ID). Then test click/tap/keyboard behavior and ID correctness. | No code patch. Roll back only approved card callback/route change if it opens a wrong playlist or breaks “view all”. |
| H11 / T11 — Playlist reordering | BLOCKED — PRODUCT DECISION REQUIRED | NOT RUN — QA-18/M28/M36/M43/M48 not completed | `PlaylistDetailScreen.tsx` shows `GripVertical`/`cursor-grab`, but actual reorder uses up/down controls and `reorderPlaylistItem(playlistId,itemId,target)`. Repository persists reorder in a Dexie transaction with ordered items, `bulkPut`, and timestamp update. No drag handlers were found. | Approve Option A (arrows canonical, clean misleading drag affordance) or separate Option B (full DnD interaction/accessibility spec). Test boundaries, reopen persistence and queue next/previous/repeat. | No code patch. If later making affordance-only edit, revert that presentation change alone; never revert unrelated stored order/data. |
| T12 — broad regression | NOT FIXED / NO SOURCE CHANGE; regression framework not expanded | NOT RUN — Stage F QA-01–QA-28 and M01–M51 | Existing `test:navigation` is the available repeatable Node suite. `package.json` does not provide a broader React component/browser suite. Adding a test framework or dependencies is not authorized by the no-install policy/environment. | After dependency provisioning is separately approved, add/choose a maintained test runner and execute QA-01–QA-28/M01–M51; separately execute Stage E device tests. This report does not claim release readiness. | No dependency/source change. Revert any future test-harness infrastructure independently from application repairs. |

## 8. قرارات المنتج المطلوبة صراحةً

### H6 — Player عند دخول Dashboard

المصدر يضمن أن دخول Dashboard يمر ببوابة PIN، لكن لا يحدد سياسة ظهور/استمرار Player. مطلوب اختيار واحد مع تعريف واضح للاستئناف:

- **الخيار A — إخفاء بصري فقط:** إخفاء UI عن Dashboard مع بقاء playback/الصوت مستمرًا. يلزم تحديد رجوع العرض وكيف يُمنع تفاعل الطبقة المخفية مع Dashboard.
- **الخيار B — Pause ثم إخفاء:** إيقاف مؤقت عند دخول لوحة الأهل، مع الاحتفاظ بـ `activePlaybackVideo` و`localPath` و`playlistContext` والـ queue وسجلات التنزيل؛ تحديد استئناف التشغيل عند الرجوع.
- **الخيار C — Stop ثم إخفاء:** إيقاف الوسائط دون حذف البيانات أو ملف التنزيل أو playlist context؛ تحديد هل الاستئناف تلقائي أم يدوي.

حتى تُحسم السياسة، لا يُمسح سجل الوسائط/التحميلات لتعديل العرض، ولا يُعتبر هذا السلوك مثبتًا. يلزم بعدها QA-12 وQA-19 مع تجربة YouTube وlocal file/playlist حسب السياسة.

### H10 — بطاقات قوائم You

- **الخيار A:** تبقى بطاقات المعاينة غير تفاعلية؛ «عرض الكل» هو المدخل المعتمد لقوائم التشغيل.
- **الخيار B:** تتحول البطاقة إلى عنصر تفاعلي دلالي قابل للوحة المفاتيح/قارئ الشاشة، مع فتح **معرّف القائمة التي تم الضغط عليها تحديدًا**، لا أول قائمة أو صفحة النظرة العامة.

لا يوجد قرار معتمد في المدخلات يحسم A أو B؛ لم يُضف `onClick` إلى البطاقات.

### H11 — ترتيب عناصر Playlist

- **الخيار A:** الأسهم أعلى/أسفل هي الآلية الرسمية؛ توافق الواجهة معناها ويُزال لاحقًا الإيحاء البصري بالسحب فقط بعد الموافقة.
- **الخيار B:** إضافة drag-and-drop في عمل منفصل ذي مواصفة تشمل pointer/touch cancel، سلوك scroll، RTL، لوحة المفاتيح وقارئ الشاشة، حدود أول/آخر عنصر، الحفظ، وPlaylist queue next/previous/repeat.

الموجود فعليًا هو reorder عبر الأسهم وDexie transaction؛ لم يُدخل DnD أو تعديل affordance من دون القرار المطلوب.

## 9. بروتوكول الأدلة المفقودة للجهاز/المتصفح

### الهوية المطلوبة لكل تجربة

يجب أن تسجل التجربة التالية عند استكمالها: طراز الجهاز أو اسم emulator، إصدار Android، إصدار Android System WebView/Chrome، build/source SHA ثابت، viewport/density، إيماءات النظام أو 3-button navigation، حالة الشبكة/الملف المحلي، خطوات إعادة الإنتاج، expected/actual، سجلات وصور وقياسات. لا توجد هذه البيانات في تشغيل اليوم لأن Android tooling غير متوفر.

### H7 — Settings/safe area (QA-13/M23)

افتح Player بوضع portrait على جهاز edge-to-edge، افتح Settings، مرّر إلى آخر قسم واضغط آخر عنصر قرب navigation/system region. اختبر viewport قصير وطويل، إغلاق sheet بزرها وبـ Android Back، وسلوك drag مقابل scroll. سجل `env(safe-area-inset-bottom)` وviewport/scroll bounds/مكان آخر عنصر وصورة شاشة. عدم وجود padding محلي وحده لا يثبت clipping.

### H8 — Pull-to-refresh (QA-14/15 وM06/M07/M45)

اختبر عند القمة بسحب قصير ثم فوق threshold، من منتصف feed، أفقيًا، فوق card/button، بلمسة واحدة ولمستين، مع mini-player ثم player كامل، وفي refreshing/disabled states. سجل scrolling element و`scrollTop` وعدد callback refresh. حافظ على شرط القمة واستثناءات player حتى يثبت اختبار خللًا.

### H9 — Search scroll (QA-16 وM14/M34/M38/M49)

استخدم نتائج طويلة؛ مرر أعلى/أسفل عدة مرات؛ افحص header الثابت وfocus/اقتراحات البحث؛ افتح Channel/Playlist ثم Back. سجل `scrollTop` لعنصر Search وwrapper الخارجي و`window.scrollY` مع computed `overflow` وأبعاد wrappers. لا تختَر مالك تمرير واحدًا من قراءة CSS وحدها.

### H1/H3/H5 — History / Player

نفّذ Search A → results → Channel/Playlist → Back؛ افتح فيديو من مصادر overlay المختلفة؛ Watch → Back/minimize → X؛ انقر جسم mini للتوسيع؛ اختبر fullscreen وSettings والعودة طبقة بطبقة. سجّل كل خطوة Back وحالة `history.state` وentry identity؛ افصل اختبار X عن النقر على جسم mini؛ تحقق من عدم إضافة Watch entry جديد ومن حماية queue.

## 10. QA-01–QA-28: حالة التنفيذ الفعلية

هذه المصفوفة لا تنسخ تقييمات الخطة السابقة كأنها نتائج تشغيل؛ كل `PASS` أدناه يخص ما نُفذ فعلًا فقط.

| ID | Case | This-run status | Evidence / limitation |
|---|---|---|---|
| QA-01 | Player History / Home → Watch → mini → close | NOT RUN | Full user journey not executed; coordinator unit cases are not equivalent to UI/Android Back. |
| QA-02 | Search → Player and repeated Back | NOT RUN | Browser harness was blocked before assertions; full UI flow not run. |
| QA-03 | Player launch from each content source | NOT RUN | M01–M51 source inspection does not count as executing each source journey. |
| QA-04 | Player → Channel → different Video | NOT RUN | No browser integration / Android runtime execution. |
| QA-05 | History coordinator unit cases | PASS — scoped suite only | `npm run test:navigation`: 13/13 passed, exit 0. This status applies only to the existing navigation unit suite, not every other QA case. |
| QA-06 | Mini-player X vs body callbacks | NOT RUN | Source callback graph inspected; React component behavior not exercised. |
| QA-07 | fromPlayer Search/Channel return | NOT RUN | No browser integration execution. |
| QA-08 | Search results restore query A | NOT RUN — runtime | Existing unit suite has exact-entry restoration tests; Search→Channel/Playlist browser interaction not run. |
| QA-09 | New query B does not restore old A | NOT RUN — runtime | Unit tests cover query entry identity; new-search UI journey not run. |
| QA-10 | ListPlus vs overflow menu mode | NOT RUN — runtime | Source state/prop mapping inspected; UI switching and cross-caller regression not run. |
| QA-11 | Overflow sheet above BottomNav/safe area | BLOCKED | Visual runtime measurements unavailable; browser navigation blocked, Android tooling absent. |
| QA-12 | Dashboard + mini playback policy | NOT RUN — product gate | No explicit hide/pause/stop and resume contract; do not test against an invented requirement. |
| QA-13 | Player Settings safe area and Back | BLOCKED | Requires actual Android WebView/viewport measurements; `adb` and emulator absent. |
| QA-14 | Pull-to-refresh at top | BLOCKED | Requires runtime gestures/refresh callback count; Android tooling absent. |
| QA-15 | Pull-to-refresh mid-scroll/player exclusions | BLOCKED | Requires touch/device evidence; do not adjust threshold speculatively. |
| QA-16 | Search long-results scroll/sticky header | BLOCKED | Browser harness could not execute; no Android WebView scroll-owner metrics. |
| QA-17 | You playlist preview interaction | NOT RUN — product gate | Static preview vs direct-open clicked playlist has no approved product contract. |
| QA-18 | Playlist reorder persistence/queue | NOT RUN — product gate + runtime | Arrow order persistence appears implemented in source; affordance contract and full runtime queue regression remain unapproved/unrun. |
| QA-19 | Android Back with parent PIN modal | BLOCKED | Requires Android system Back execution; no device/emulator available. |
| QA-20 | Fullscreen + orientation | BLOCKED | Requires Android device/emulator and orientation/system-UI observations. |
| QA-21 | Portrait player gestures | BLOCKED | Requires device touch/seek/RTL gesture testing. |
| QA-22 | Download/share native system UI | BLOCKED | Requires Android native share/download runtime. |
| QA-23 | Offline and missing/empty local file playback | BLOCKED | Requires local files and Android offline run; no device environment. |
| QA-24 | Queue next/previous/repeat | NOT RUN | Navigation unit suite has limited player-history guard coverage; queue playback and repeat acceptance not run. |
| QA-25 | Overflow component accessibility | NOT RUN | No component/browser accessibility test runner executed. |
| QA-26 | Regression M01–M12 | NOT RUN | Full core regression batch not executed. |
| QA-27 | Regression M21–M33 | NOT RUN | Full Player/You/overlay/PIN regression not executed. |
| QA-28 | Regression M37–M51 | NOT RUN | Full feed, playlist, Dashboard, gestures and offline campaign not executed. |

## 11. M01–M51: حالة الرحلات في هذا التنفيذ

عمود «الخطة» يكرر تصنيف الخطة المرجعية فقط لتوضيح أن تصنيف الخطة ليس نتيجة تنفيذ. العمود الأخير هو حالة التنفيذ الحالية لكل رحلة. لم تُعلن أي رحلة منتج كاملة PASS اعتمادًا على فحص المصدر وحده.

| Journey | Name from repair plan | Classification recorded in plan (not this-run result) | This-run execution status |
|---|---|---|---|
| M01 | صورة القناة في الرئيسية / Home | OK (سورس) | NOT RUN — Stage F user journey; source inspection only. |
| M02 | اسم القناة في الرئيسية / Home | OK (سورس) | NOT RUN — Stage F user journey; source inspection only. |
| M03 | جسم كارت الفيديو / Home | OK (سورس) | NOT RUN — Stage F user journey; source inspection only. |
| M04 | ListPlus مقابل ⋮ في الرئيسية | OK (سورس) | NOT RUN — runtime switching/UI checks unavailable; source mode wiring inspected. |
| M05 | مشاركة الرئيسية أمام BottomNav | OK (سورس) | NOT RUN — visual layout/safe-area runtime check not executed. |
| M06 | السحب للتحديث عند قمة Home | LIKELY / جهاز | BLOCKED — DEVICE EVIDENCE REQUIRED |
| M07 | السحب للتحديث في منتصف Home | OK (سورس) | BLOCKED — DEVICE EVIDENCE REQUIRED |
| M08 | اختيار تصنيف Home | OK (سورس) | NOT RUN — Stage F regression journey. |
| M09 | فتح Channels ثم Home | OK (سورس) | NOT RUN — Stage F regression journey. |
| M10 | فتح Channel من تبويب القنوات | OK (سورس) | NOT RUN — browser/device journey not executed. |
| M11 | تمرير صفحة Channel الطويلة | OK (سورس)؛ اللمس يحتاج فحصًا | NOT RUN — touch/scroll runtime journey not executed. |
| M12 | تشغيل فيديو من صفحة Channel / overlay | OK للظهور (سورس) | NOT RUN — user-visible Watch/history journey not executed. |
| M13 | ListPlus مقابل ⋮ في تبويب Channels | CONFIRMED | NOT RUN — source mapping inspected; UI acceptance QA-10 not run. |
| M14 | Search: كتابة، Enter، Back | OK (سورس) | NOT RUN — runtime Search/Back journey not executed; helper tests are narrower. |
| M15 | تشغيل فيديو من Search | CONFIRMED | NOT RUN — unit navigation cases passed; full Search-to-player user journey not run. |
| M16 | ثلاث ضغطات Back بعد M15 | CONFIRMED | NOT RUN — unit history transitions passed; actual repeated Back UI sequence not run. |
| M17 | Search من Player ثم Back دون اختيار | OK (سورس) | NOT RUN — runtime fromPlayer flow not executed. |
| M18 | Search من Player ثم اختيار فيديو جديد | CONFIRMED | NOT RUN — unit history tests do not substitute for UI handoff journey. |
| M19 | فتح Channel من Player ثم Video | CONFIRMED | NOT RUN — Channel/Player user journey not executed. |
| M20 | Mini → expand → Search → Back | NEEDS DEVICE | BLOCKED — DEVICE EVIDENCE REQUIRED |
| M21 | أزرار الأهل مقابل عنوان القناة داخل Player | OK (سورس) | NOT RUN — layout/user journey not executed. |
| M22 | Fullscreen ثم Back | NEEDS DEVICE | BLOCKED — DEVICE EVIDENCE REQUIRED |
| M23 | Player settings sheet ثم Back | LIKELY / جهاز | BLOCKED — DEVICE EVIDENCE REQUIRED |
| M24 | الضغط على mini وزر X | LIKELY | NOT RUN — H5 source callback path inspected, but component/browser runtime not executed. |
| M25 | تشغيل فيديو/فتح قناة من Favorites | CONFIRMED للفيديو عبر H1 | NOT RUN — full Favorites journey not executed. |
| M26 | تشغيل فيديو من History | CONFIRMED | NOT RUN — full History journey not executed. |
| M27 | تشغيل ملف Download محليًا | مسار المصدر موجود؛ playback NEEDS DEVICE | BLOCKED — DEVICE EVIDENCE REQUIRED |
| M28 | Playlist ثم تشغيل فيديو | CONFIRMED | NOT RUN — source shows playlist handoff; full playlist-to-player journey not executed. |
| M29 | صفوف تبويب You | OK (سورس) | NOT RUN — You row journey not executed. |
| M30 | BottomNav مع وجود overlay | OK (سورس) | NOT RUN — overlay/BottomNav UI regression not executed. |
| M31 | BottomNav مع mini ظاهر | OK (سورس) | NOT RUN — mini/BottomNav layout regression not executed. |
| M32 | PIN: إلغاء/نجاح | OK (سورس) | NOT RUN — PIN success/cancel UI journey not executed. |
| M33 | الحالات الفارغة | OK (سورس) | NOT RUN — empty-state regression not executed. |
| M34 | Search → Channel/Playlist → Back إلى Search | CONFIRMED | NOT RUN — source restoration helper and navigation unit tests passed, but React/browser journey not executed. |
| M35 | بطاقات معاينة القوائم في You | LIKELY / قرار منتج | NOT RUN — PRODUCT DECISION REQUIRED (H10) |
| M36 | مقبض ترتيب قائمة Playlist | LIKELY / قرار منتج | NOT RUN — PRODUCT DECISION REQUIRED (H11) |
| M37 | انكماش Header في Home | OK (سورس) | NOT RUN — feed-header runtime regression not executed. |
| M38 | تمرير Search | LIKELY / جهاز | BLOCKED — BROWSER/DEVICE EVIDENCE REQUIRED |
| M39 | مشاركة من Channels مقارنة بالشريط | CONFIRMED | NOT RUN — H4 props inspected; share-sheet layout QA not executed. |
| M40 | فتح Dashboard مع mini ظاهر | LIKELY / جهاز + قرار منتج | NOT RUN — PRODUCT DECISION REQUIRED (H6) + runtime evidence |
| M41 | الضغط مجددًا على التبويب المحدد | OK (سورس) | NOT RUN — tab reselect UI journey not executed. |
| M42 | تنزيل/مشاركة من VideoOverflowSheet | NEEDS DEVICE | BLOCKED — DEVICE EVIDENCE REQUIRED |
| M43 | Channel → Playlist الخاصة بالقناة → تشغيل | CONFIRMED | NOT RUN — source History test subset passed; channel-playlist playback journey not executed. |
| M44 | Android Back عندما PIN مفتوح | NEEDS DEVICE | BLOCKED — DEVICE EVIDENCE REQUIRED |
| M45 | Pull-to-refresh مع mini | OK (سورس) | BLOCKED — DEVICE EVIDENCE REQUIRED |
| M46 | Dashboard tabs ثم Lock | OK (سورس) | NOT RUN — Dashboard tab/lock UI journey not executed. |
| M47 | تعطيل Channel من Player مع PIN | OK (سورس) | NOT RUN — parent PIN/channel-disable regression not executed. |
| M48 | التالي/السابق/تكرار Playlist | NEEDS DEVICE | BLOCKED — DEVICE EVIDENCE REQUIRED |
| M49 | اقتراحات البحث ومسح الاستعلام | OK (سورس) | NOT RUN — Search recents UI journey not executed. |
| M50 | إيماءات Portrait Player | NEEDS DEVICE | BLOCKED — DEVICE EVIDENCE REQUIRED |
| M51 | تشغيل أوفلاين/ملف محلي | NEEDS DEVICE | BLOCKED — DEVICE EVIDENCE REQUIRED |

## 12. بصمات SHA-256 لملفات المصدر الحساسة التي تمت مراجعتها

البصمات أدناه تخص الشجرة الأولية قبل إضافة التقرير/الأدلة. جميع هذه الملفات بقيت دون تغيير في هذه الدفعة.

| الملف | SHA-256 قبل التنفيذ |
|---|---|
| `src/shell/historyCoordinator.js` | `c4bded6d37184b881817a8acc845493f9a8ed4a8b8c35561e3375ff4d83811fb` |
| `src/shell/historyCoordinator.d.ts` | `c3357341168b521e0b1e96394627bec419a2195653d069f6e2d74f9ba8ebd245` |
| `src/shell/navigationStore.ts` | `572422f8b3e3d66c03b83ed3422ad34f20bcb72fa46819b162d19d04adec2378` |
| `src/features/search/searchHistoryState.js` | `fc374285b58de7fe8a5640a19a445d8ed4ffd7cb3e02f90d4e303080dc198fed` |
| `src/features/search/SearchScreen.tsx` | `aa5d73ec88d10b88dbb7db4e51cf166d9141049179c90cb895757b1a43c1a2cd` |
| `src/features/channels/ChannelsScreen.tsx` | `e175d772f03ce98c9256d712ca197a9fe70f94c63409c61a163183709eb8e15e` |
| `src/components/VideoOverflowSheet.tsx` | `7bbdfc1e9901a400710a4634562a930de6680f2e58e8d220252ac47e4a0006c1` |
| `src/features/feed/KidHomeScreen.tsx` | `eaea5e966341c8abd451293e95284db51672a927cfe0bb9840d89387f40ee653` |
| `src/screens/PlayerView.tsx` | `eab765aa63e40b1db7ce6540edfcea46f4c02b780475a58346a7d92c89cdcadd` |
| `src/App.tsx` | `cd62513777085d11a9878fbd8ef71703becaeef38050ed2793e362c76d1a78fb` |
| `src/components/PlayerSettingsSheet.tsx` | `b2d6c355297b6afa176f290b6a15c7e89256ddb5d6ce63e9250f8a000492ebae` |
| `src/components/PullToRefresh.tsx` | `00df0855bba87b314472d042307ed4507dac4cd83899a9f56d465d30b66aea07` |
| `src/shell/AppShell.tsx` | `d8d486db2f7841abbadb20b7192c7994edfda90b9bd057b973cc0e2985de450f` |
| `src/features/you/YouScreen.tsx` | `e9a906339d02b60736cc0c9705ffc221c8cbb064ae4e34a21af34067e92f23f6` |
| `src/features/playlists/PlaylistDetailScreen.tsx` | `902ba2afc0efe0ce7fd61a8b429d234e0f19878b4af21dc6e90336862be1e860` |
| `src/services/playlists/playlistRepository.ts` | `2a420778c4f25c9a5f5c5a688283ad717f6f26e16bf9b16fb306271a2e8d4d23` |
| `android/app/src/main/java/app/youngtube/app/MainActivity.java` | `ee129efb10989becc9214e8119e7c11b2f475b43c998eb6b01c05de357b4ede8` |
| `android/variables.gradle` | `83d502c9ed8fcf1dd4791482067abeedbebae49fafe9cd14a8a1f5891deb0d88e` |
| `capacitor.config.ts` | `3a4bff88769bfa58c1cd6df7243a76b82c4cd79a05c102388ac67940bf1d5c89` |
| `index.html` | `94105bf1c31ce6df0a8057c2e92e859a64417378ed104a879ae2945374c8ffb9` |

## 13. الفحوصات الأمنية والنزاهة

- جرى فحص ثابت لأنماط مفاتيح خاصة/توكنات وملفات أسرار واضحة؛ لم تظهر مطابقة واضحة لمفتاح خاص أو secret مضمّن، ولم تُعثر على ملفات مفاتيح خاصة. ` .env.example` يحتوي placeholders (`MY_GEMINI_API_KEY`, `MY_APP_URL`) وليس قيمة تشغيلية.
- أبقينا إعدادات Worker/KV الحالية كما هي؛ لم تُمس خدمات الإنتاج أو credential stores، ولم يُحاول النشر.
- لم تُعدّل أصول Android compiled يدويًا.
- هذا فحص أولي لأنماط معروفة، وليس مسحًا أمنيًا شاملًا أو ضمانًا بعدم وجود أسرار من كل الأنواع.

## 14. الملفات المضافة وخطة التراجع

الملفات التي أضيفت في الشجرة/الأرشيف لهذه الدفعة:

- `YOUNGTUBE_REPAIR_EXECUTION_REPORT.md` — هذا التقرير الكامل.
- `repair-evidence/baseline-fingerprints.txt` — بصمات المدخلات وشروط بيئة الاختبار.
- `repair-evidence/navigation-test-output.txt` — المخرج الفعلي لاختبار التنقل.
- `repair-evidence/navigation-test-exit-code.txt` — قيمة الخروج الفعلية.
- `repair-evidence/browser-harness-attempt.json` — المحاولتان المحظورتان ونتيجتهما الدقيقة.

لا توجد تغييرات على تطبيق/إعدادات/lockfile، ولذلك لا يوجد Patch كود لإرجاعه. إذا لزم الرجوع إلى الحالة الأصلية، أعد الاستخراج من `devscope (69).zip` الأصلي؛ ويمكن حذف التقرير ومجلد `repair-evidence/` فقط لإزالة إضافات التوثيق. لا تعتمد على Git rollback لأن `.git` غير موجود.

## 15. قرار الإغلاق والاستعداد للمراحل التالية

### Stage D

اكتمل **إغلاق التحليل والتنفيذ المتاح من Stage D**: فحص المصدر، فحص H1–H11، تشغيل وحدة التنقل، توثيق فشل الوصول إلى browser harness، وتثبيت بوابات المنتج والجهاز. لا توجد إصلاحات كود جديدة مبررة في المصدر الحالي ضمن الأدلة المتاحة. H1–H5 هي `SOURCE-OK / NO PATCH REQUIRED` مع حدود التحقق الموضحة؛ H6/H10/H11 تنتظر قرار المنتج؛ H7/H8/H9 تنتظر القياس/إعادة الإنتاج.

### Stage E — Android/WebView

**NOT CLEARED.** يتطلب جهازًا/محاكيًا ودليلًا فعليًا لـ QA-11–QA-23 وما تقرره الخطة للـ Back/safe-area/gestures/share/download/local media/orientation. لا يمكن ترقية هذه البنود إلى PASS في هذه البيئة.

### Stage F — Regression M01–M51 وQA-01–QA-28

**NOT RUN / NOT CLEARED.** يجب أن تُنفذ كل رحلة بالأدلة، بما فيها الرحلات التي كانت موسومة `OK (source)` في الخطة؛ تصنيف المصدر القديم لا يُعد نتيجة تشغيل.

### Stage G — Release approval

**NOT RUN — لا Go.** لا يوجد بناء ناجح مثبت، ولا lint ناجح، ولا اكتمال Android/Stage F أو حسم قرارات المنتج. هذا الأرشيف الكامل للتنفيذ والتسليم، لكنه ليس إعلان جاهزية إنتاج.

---

**نهاية التقرير.**
