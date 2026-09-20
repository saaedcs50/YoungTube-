import React, { useState } from 'react';
import db from '../db';
import { sha256 } from '../crypto';
import { KeyRound, HelpCircle, Sparkles, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import AdBlockNotice from './AdBlockNotice';
import PinOtpInput from './PinOtpInput';

interface OnboardingProps {
  onComplete: () => void;
}

const COMMON_SECURITY_QUESTIONS = [
  'ما هو اسم أول مدرسة التحقت بها؟',
  'ما هي مدينتك أو قريتك المفضلة؟',
  'ما هو اسم حيوانك الأليف الأول أو المفضل؟',
  'ما هو الكتاب أو القصة المفضلة لديك في الطفولة؟',
];

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState(COMMON_SECURITY_QUESTIONS[0]);
  const [customQuestion, setCustomQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSettingsSaved, setIsSettingsSaved] = useState(false);

  // Step 1: Validate PIN
  const handlePinNext = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      setError('يجب أن يتكون رمز PIN من 6 أرقام بالضبط.');
      return;
    }
    if (pin !== confirmPin) {
      setError('رمزا PIN غير متطابقين، يرجى إعادة التأكيد.');
      return;
    }
    setStep(2);
  };

  // Step 2: Validate Security Question
  const handleQuestionNext = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const finalQuestion = customQuestion.trim() || selectedQuestion;
    if (!finalQuestion) {
      setError('يرجى اختيار أو كتابة سؤال الأمان.');
      return;
    }
    if (!securityAnswer.trim()) {
      setError('يرجى كتابة إجابة السؤال السري.');
      return;
    }
    setStep(3);
  };

  // Helper to persist settings
  const saveSettingsToDb = async () => {
    const pinHash = await sha256(pin);
    const securityAnswerHash = await sha256(securityAnswer.trim().toLowerCase());
    const finalQuestion = customQuestion.trim() || selectedQuestion;

    await db.settings.put({
      id: 'main',
      pinHash,
      securityQuestion: finalQuestion,
      securityAnswerHash,
      blacklistWords: [],
      scheduleWindow: { start: '00:00', end: '23:59' },
      sessionLimitMinutes: 60,
      pinAttempts: 0,
      preloadedListVersion: 1,
    });
    setIsSettingsSaved(true);
  };

  // Step 3 -> Step 4: Save settings and advance to Ad-blocking notice
  const handleAdvanceToStep4 = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await saveSettingsToDb();
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ الإعدادات.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 4 Completion (Skip or Done)
  const handleFinalFinish = async () => {
    if (!isSettingsSaved) {
      setIsSubmitting(true);
      try {
        await saveSettingsToDb();
      } catch (err) {
        console.error('Error saving settings on final finish:', err);
      } finally {
        setIsSubmitting(false);
      }
    }
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#FAF8F5] overflow-y-auto flex items-center justify-center p-4 sm:p-6" dir="rtl">
      <div
        id="onboarding-modal"
        className="w-full max-w-lg bg-white rounded-3xl shadow-xl border border-stone-200/80 overflow-hidden flex flex-col my-auto"
      >
        {/* Modal Header */}
        <div className="bg-amber-500/10 border-b border-amber-200/60 p-6 text-right">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-amber-600 text-white shadow-2xs">
              خطوة {step} من 4
            </span>
            <span className="text-xs font-bold text-amber-900">
              {step <= 2
                ? 'حماية أمان الوالدين'
                : step === 3
                ? 'تطوير ذوق واهتمامات الطفل'
                : 'حجب الإعلانات المدمجة'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-stone-900 mt-3">
            {step === 1 && 'إنشاء رمز PIN للوالدين'}
            {step === 2 && 'سؤال الأمان السري'}
            {step === 3 && 'توجيه المحتوى والهوايات'}
            {step === 4 && 'حماية إضافية من الإعلانات'}
          </h2>
          <p className="text-xs sm:text-sm text-stone-700 mt-1.5 leading-relaxed font-medium">
            {step === 1 && 'لنقم بإعداد رمز مرور سري من 6 أرقام للتحكم في لوحة الأهل وإعدادات الأطفال.'}
            {step === 2 && 'في حال نسيت رمز PIN، سيساعدك هذا السؤال على استعادة الوصول بأمان.'}
            {step === 3 && 'توجيه وتطوير اهتمامات طفلك نحو محتوى هادف وبنّاء وفق قيمكم العائلية.'}
            {step === 4 && 'إرشادات مجانية وفعالة لحجب معظم إعلانات يوتيوب على مستوى الجهاز.'}
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold">
              {error}
            </div>
          )}

          {/* STEP 1: PIN Setup */}
          {step === 1 && (
            <form onSubmit={handlePinNext} className="space-y-5 text-right">
              <div className="flex items-center gap-2 text-stone-900 font-extrabold text-sm">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 border border-amber-300">
                  <KeyRound className="w-4.5 h-4.5" />
                </div>
                <span>أدخل رمز PIN المكون من 6 أرقام</span>
              </div>
              <p className="text-xs text-stone-600 leading-relaxed font-medium">
                يتم تشفير هذا الرمز تلقائياً ولا يُحفظ برقم خام، ليضمن عدم تمكن الأبناء من تعديل فلترة أو أوقات الشاشة.
              </p>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-stone-700">
                  أدخل رمز PIN (6 أرقام):
                </label>
                <PinOtpInput
                  idPrefix="onboarding-pin"
                  value={pin}
                  onChange={setPin}
                  autoFocus
                  theme="amber"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-stone-700">
                  تأكيد رمز PIN:
                </label>
                <PinOtpInput
                  idPrefix="onboarding-confirm-pin"
                  value={confirmPin}
                  onChange={setConfirmPin}
                  theme="amber"
                />
              </div>

              <div className="pt-2">
                <button
                  id="onboarding-step1-btn"
                  type="submit"
                  disabled={pin.length !== 6 || confirmPin.length !== 6}
                  className="w-full min-h-[48px] rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold flex items-center justify-center gap-2 transition disabled:opacity-40 shadow-sm shadow-amber-600/20 cursor-pointer"
                >
                  <span>التالي</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Security Question */}
          {step === 2 && (
            <form onSubmit={handleQuestionNext} className="space-y-5 text-right">
              <div className="flex items-center gap-2 text-stone-900 font-extrabold text-sm">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 border border-amber-300">
                  <HelpCircle className="w-4.5 h-4.5" />
                </div>
                <span>سؤال الأمان السري (لاستعادة الرمز)</span>
              </div>
              <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200/80 text-xs text-amber-950 leading-relaxed space-y-1">
                <p className="font-bold text-amber-900">
                  الاسترجاع عبر سؤال الأمان المحفوظ على هذا الجهاز فقط
                </p>
                <p className="text-stone-600 text-[11px]">
                  تُحفظ الإجابة بشكل مشفر (Hash) محلياً. تنبيه: مسح بيانات الموقع أو ذاكرة المتصفح يفقد الرمز والاسترجاع.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="onboarding-question-select" className="block text-xs font-bold text-stone-700">
                  اختر سؤالاً أو اكتب سؤالك الخاص:
                </label>
                <select
                  id="onboarding-question-select"
                  value={selectedQuestion}
                  onChange={(e) => {
                    setSelectedQuestion(e.target.value);
                    if (e.target.value !== 'custom') setCustomQuestion('');
                  }}
                  className="w-full min-h-[44px] p-2.5 text-xs sm:text-sm rounded-xl border border-stone-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 font-medium text-stone-800"
                >
                  {COMMON_SECURITY_QUESTIONS.map((q, idx) => (
                    <option key={idx} value={q}>
                      {q}
                    </option>
                  ))}
                  <option value="custom">كتابة سؤال مخصص...</option>
                </select>

                {selectedQuestion === 'custom' && (
                  <input
                    id="onboarding-custom-question-input"
                    type="text"
                    value={customQuestion}
                    onChange={(e) => setCustomQuestion(e.target.value)}
                    placeholder="اكتب سؤال الأمان الخاص بك هنا..."
                    className="w-full min-h-[44px] p-2.5 text-xs sm:text-sm rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-white focus:bg-white text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition mt-2"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="onboarding-answer-input" className="block text-xs font-bold text-stone-700">
                  إجابة السؤال السري:
                </label>
                <input
                  id="onboarding-answer-input"
                  type="text"
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  placeholder="اكتب إجابتك هنا..."
                  className="w-full min-h-[44px] p-2.5 text-xs sm:text-sm rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-white focus:bg-white text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition"
                  autoFocus
                />
              </div>

              <div className="pt-2 flex flex-col gap-2.5">
                <button
                  id="onboarding-step2-btn"
                  type="submit"
                  disabled={!securityAnswer.trim()}
                  className="w-full min-h-[48px] rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold flex items-center justify-center gap-2 transition disabled:opacity-40 shadow-sm shadow-amber-600/20 cursor-pointer"
                >
                  <span>التالي</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-full min-h-[44px] rounded-xl border border-stone-200/80 text-stone-600 hover:bg-stone-50 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>رجوع</span>
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: Taste Shift Explanation & Save */}
          {step === 3 && (
            <div className="space-y-5 text-right">
              <div className="flex items-center gap-2 text-stone-900 font-extrabold text-sm">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 border border-amber-300">
                  <Sparkles className="w-4.5 h-4.5" />
                </div>
                <span>رؤية وتطوير المحتوى الهادف (Taste Shift)</span>
              </div>

              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-stone-800 text-xs sm:text-sm leading-relaxed space-y-2">
                <p>
                  سيتمكن التطبيق مستقبلاً من توجيه وتطوير ذوق واهتمامات طفلك تدريجياً وبأمان فائق، وفقاً للقيم والمجالات التي تختارها بعناية.
                </p>
                <p>
                  هذه الميزة تأتي لضمان بيئة رقمية هادفة وممتعة تنمو مع طفلك دون أي تشتيت أو خوارزميات عشوائية.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80 text-xs text-stone-600 space-y-1.5">
                <div className="font-bold text-stone-900">ملخص إعدادات الحماية:</div>
                <div className="flex items-center gap-2 text-emerald-700 font-bold">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>رمز PIN مشفر بـ SHA-256 (6 أرقام)</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-700 font-bold">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>سؤال أمان سري مع إجابة مشفرة</span>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2.5">
                <button
                  id="onboarding-step3-btn"
                  type="button"
                  onClick={handleAdvanceToStep4}
                  disabled={isSubmitting}
                  className="w-full min-h-[48px] rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold flex items-center justify-center gap-2 transition disabled:opacity-40 shadow-sm shadow-amber-600/20 cursor-pointer"
                >
                  <span>{isSubmitting ? 'جاري الحفظ...' : 'متابعة وإدخال إعدادات الإعلانات'}</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-full min-h-[44px] rounded-xl border border-stone-200/80 text-stone-600 hover:bg-stone-50 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>رجوع</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Ad-blocking DNS Notice */}
          {step === 4 && (
            <AdBlockNotice
              mode="onboarding"
              onSkip={handleFinalFinish}
              onFinish={handleFinalFinish}
              onBack={() => setStep(3)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

