import React, { useState, useEffect } from 'react';
import db from '../db';
import { sha256 } from '../crypto';
import { KeyRound, HelpCircle, ArrowLeft } from 'lucide-react';
import PinOtpInput from './PinOtpInput';
import { trackFunnelEvent } from '../services/funnelTelemetry';

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
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState(COMMON_SECURITY_QUESTIONS[0]);
  const [customQuestion, setCustomQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    try {
      const sessionKey = 'yt_funnel_onboarding_started';
      if (!sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, '1');
        trackFunnelEvent('onboarding_started');
      }
    } catch {
      trackFunnelEvent('onboarding_started');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      setError('يجب أن يتكون رمز PIN من 6 أرقام بالضبط.');
      return;
    }

    if (pin !== confirmPin) {
      setError('رمزا PIN غير متطابقين، يرجى التأكد من تطابقهما.');
      return;
    }

    const finalQuestion = customQuestion.trim() || selectedQuestion;
    if (!finalQuestion) {
      setError('يرجى اختيار أو كتابة سؤال الأمان.');
      return;
    }

    if (!securityAnswer.trim()) {
      setError('يرجى كتابة إجابة السؤال السري.');
      return;
    }

    setIsSubmitting(true);
    try {
      const pinHash = await sha256(pin);
      const securityAnswerHash = await sha256(securityAnswer.trim().toLowerCase());

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

      trackFunnelEvent('onboarding_completed');
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ الإعدادات.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid =
    pin.length === 6 &&
    confirmPin.length === 6 &&
    securityAnswer.trim().length > 0 &&
    (selectedQuestion !== 'custom' || customQuestion.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 bg-yt-bg overflow-y-auto flex items-center justify-center p-4 sm:p-6" dir="rtl">
      <div
        id="onboarding-modal"
        className="w-full max-w-lg bg-yt-surface rounded-3xl shadow-xl border border-yt-border overflow-hidden flex flex-col my-auto"
      >
        {/* Modal Header */}
        <div className="bg-yt-brand-soft border-b border-yt-border p-5 sm:p-6 text-right">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-yt-brand text-yt-brand-text shadow-2xs">
              خطوة 1 من 1
            </span>
            <span className="text-xs font-bold text-yt-brand">
              حماية أمان الوالدين
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-yt-text mt-2.5">
            إعداد رمز PIN وسؤال الأمان
          </h2>
          <p className="text-xs sm:text-sm text-yt-text-muted mt-1.5 leading-relaxed font-medium">
            أنشئ رمز مرور سري لحماية لوحة التحكم وأوقات الشاشة، مع سؤال أمان لاستعادة الرمز بسهولة في حال نسيانه.
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6">
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-yt-danger text-xs font-bold text-right">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6 text-right">
            {/* SECTION 1: PIN Setup */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-yt-text font-extrabold text-sm pb-1.5 border-b border-yt-border">
                <div className="w-8 h-8 rounded-xl bg-yt-brand-soft text-yt-brand flex items-center justify-center shrink-0 border border-yt-border">
                  <KeyRound className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-yt-text">1. رمز PIN للوالدين (6 أرقام)</h3>
                  <p className="text-[11px] text-yt-text-muted font-medium">مشفر بتقنية SHA-256 لمنع تعديل أوقات الشاشة أو الفلاتر</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-yt-text">
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
                <label className="block text-xs font-bold text-yt-text">
                  تأكيد رمز PIN:
                </label>
                <PinOtpInput
                  idPrefix="onboarding-confirm-pin"
                  value={confirmPin}
                  onChange={setConfirmPin}
                  theme="amber"
                />
              </div>
            </div>

            {/* SECTION 2: Security Question */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2 text-yt-text font-extrabold text-sm pb-1.5 border-b border-yt-border">
                <div className="w-8 h-8 rounded-xl bg-yt-brand-soft text-yt-brand flex items-center justify-center shrink-0 border border-yt-border">
                  <HelpCircle className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-yt-text">2. سؤال الأمان السري (لاستعادة الرمز)</h3>
                  <p className="text-[11px] text-yt-text-muted font-medium">تُحفظ إجابته مشفرة محلياً لاسترجاع الرمز في حال نسيانه</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="onboarding-question-select" className="block text-xs font-bold text-yt-text">
                  اختر سؤال الأمان أو اكتب سؤالك الخاص:
                </label>
                <select
                  id="onboarding-question-select"
                  value={selectedQuestion}
                  onChange={(e) => {
                    setSelectedQuestion(e.target.value);
                    if (e.target.value !== 'custom') setCustomQuestion('');
                  }}
                  className="w-full min-h-[44px] p-2.5 text-xs sm:text-sm rounded-xl border border-yt-border bg-yt-surface focus:outline-hidden focus:ring-2 focus:ring-yt-brand/30 focus:border-yt-brand font-medium text-yt-text"
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
                    className="w-full min-h-[44px] p-2.5 text-xs sm:text-sm rounded-xl border border-yt-border bg-yt-surface-muted hover:bg-yt-surface focus:bg-yt-surface text-yt-text focus:outline-hidden focus:ring-2 focus:ring-yt-brand/30 focus:border-yt-brand transition mt-2"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="onboarding-answer-input" className="block text-xs font-bold text-yt-text">
                  إجابة السؤال السري:
                </label>
                <input
                  id="onboarding-answer-input"
                  type="text"
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  placeholder="اكتب إجابتك هنا..."
                  className="w-full min-h-[44px] p-2.5 text-xs sm:text-sm rounded-xl border border-yt-border bg-yt-surface-muted hover:bg-yt-surface focus:bg-yt-surface text-yt-text focus:outline-hidden focus:ring-2 focus:ring-yt-brand/30 focus:border-yt-brand transition"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                id="onboarding-submit-btn"
                type="submit"
                disabled={!isFormValid || isSubmitting}
                className="w-full min-h-[48px] rounded-xl bg-yt-brand hover:bg-yt-brand-hover text-yt-brand-text text-sm font-bold flex items-center justify-center gap-2 transition disabled:opacity-40 shadow-sm shadow-yt-brand/20 cursor-pointer"
              >
                <span>{isSubmitting ? 'جاري حفظ الإعدادات...' : 'حفظ وإكمال الإعداد'}</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

