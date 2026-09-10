import React, { useState } from 'react';
import db from '../db';
import { sha256 } from '../crypto';
import { KeyRound, HelpCircle, Sparkles, ArrowLeft, ArrowRight, Check } from 'lucide-react';

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
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState(COMMON_SECURITY_QUESTIONS[0]);
  const [customQuestion, setCustomQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // Step 3: Complete and save to DB
  const handleFinish = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const pinHash = await sha256(pin);
      const securityAnswerHash = await sha256(securityAnswer.trim().toLowerCase());
      const finalQuestion = customQuestion.trim() || selectedQuestion;

      // Save the single fixed 'main' settings record
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

      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ الإعدادات.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        id="onboarding-modal"
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col"
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-l from-sky-600 to-indigo-700 p-6 text-white text-right">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/20 text-white">
              الخطوة {step} من 3
            </span>
            <span className="text-xs text-sky-100">تهيئة أمان الوالدين</span>
          </div>
          <h2 className="text-xl font-bold mt-2">مرحباً بك في يوتيوب الأطفال</h2>
          <p className="text-xs text-sky-100 mt-1">
            لنقم بإعداد قفل الوالدين لضمان تحكم آمن وسري بالكامل.
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
              {error}
            </div>
          )}

          {/* STEP 1: PIN Setup */}
          {step === 1 && (
            <form onSubmit={handlePinNext} className="space-y-4 text-right">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                <KeyRound className="w-5 h-5 text-sky-600 shrink-0" />
                <span>إنشاء رمز PIN للوالدين (6 أرقام)</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                يُستخدم هذا الرمز لقفل لوحة التحكم ومنع الأطفال من تغيير الإعدادات. يتم تشفيره تلقائياً ولا يُحفظ كرقم خام في المتصفح.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  أدخل رمز PIN المكون من 6 أرقام:
                </label>
                <input
                  id="onboarding-pin-input"
                  type="password"
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  className="w-full text-center tracking-[1em] text-2xl font-mono p-3 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  تأكيد رمز PIN:
                </label>
                <input
                  id="onboarding-pin-confirm-input"
                  type="password"
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  className="w-full text-center tracking-[1em] text-2xl font-mono p-3 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  id="onboarding-step1-btn"
                  type="submit"
                  disabled={pin.length !== 6 || confirmPin.length !== 6}
                  className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold flex items-center gap-2 transition disabled:opacity-50 shadow-xs"
                >
                  <span>التالي</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Security Question */}
          {step === 2 && (
            <form onSubmit={handleQuestionNext} className="space-y-4 text-right">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                <HelpCircle className="w-5 h-5 text-indigo-600 shrink-0" />
                <span>سؤال الأمان السري (لاستعادة الرمز)</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                في حال نسيت رمز PIN، سيساعدك هذا السؤال على استعادة الوصول للوحة التحكم. تُحفظ الإجابة مشفرة (Hash) أيضاً.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  اختر سؤالاً أو اكتب سؤالك الخاص:
                </label>
                <select
                  id="onboarding-question-select"
                  value={selectedQuestion}
                  onChange={(e) => {
                    setSelectedQuestion(e.target.value);
                    if (e.target.value !== 'custom') setCustomQuestion('');
                  }}
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 mb-2"
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
                    className="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 mb-2"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  إجابة السؤال السري:
                </label>
                <input
                  id="onboarding-answer-input"
                  type="text"
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  placeholder="اكتب إجابتك هنا..."
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>

              <div className="pt-2 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold flex items-center gap-1.5"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>رجوع</span>
                </button>
                <button
                  id="onboarding-step2-btn"
                  type="submit"
                  disabled={!securityAnswer.trim()}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center gap-2 transition disabled:opacity-50 shadow-xs"
                >
                  <span>التالي</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: Promise / Future Direction & Completion */}
          {step === 3 && (
            <div className="space-y-5 text-right">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                <Sparkles className="w-5 h-5 text-amber-500 shrink-0" />
                <span>رؤية وتطوير المحتوى الهادف</span>
              </div>

              {/* Exact 2 lines promise as required */}
              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-slate-700 text-xs leading-relaxed space-y-2">
                <p>
                  سيتمكن التطبيق مستقبلاً من توجيه وتطوير ذوق واهتمامات طفلك تدريجياً وبأمان فائق، وفقاً للقيم والمجالات التي تختارها بعناية.
                </p>
                <p>
                  هذه الميزة تأتي لضمان بيئة رقمية هادفة وممتعة تنمو مع طفلك دون أي تشتيت أو خوارزميات عشوائية.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
                <div className="font-semibold text-slate-800">ملخص الإعداد:</div>
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <Check className="w-3.5 h-3.5" />
                  <span>رمز PIN مشفر بـ SHA-256 (6 أرقام)</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <Check className="w-3.5 h-3.5" />
                  <span>سؤال أمان سري مع إجابة مشفرة</span>
                </div>
              </div>

              <div className="pt-2 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold flex items-center gap-1.5"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>رجوع</span>
                </button>
                <button
                  id="onboarding-complete-btn"
                  type="button"
                  onClick={handleFinish}
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center gap-2 transition disabled:opacity-50 shadow-xs"
                >
                  <span>{isSubmitting ? 'جاري الحفظ...' : 'إتمام وتفعيل القفل'}</span>
                  <Check className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
