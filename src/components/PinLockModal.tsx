import React, { useState, useEffect, useCallback } from 'react';
import db from '../db';
import { sha256 } from '../crypto';
import { Lock, ShieldAlert, KeyRound, HelpCircle, ArrowLeft, X, AlertCircle, Info } from 'lucide-react';
import PinOtpInput from './PinOtpInput';

interface PinLockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlockSuccess: () => void;
}

export default function PinLockModal({ isOpen, onClose, onUnlockSuccess }: PinLockModalProps) {
  const [pin, setPin] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [isPermanentlyLocked, setIsPermanentlyLocked] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Recovery question flow
  const [showRecovery, setShowRecovery] = useState(false);
  const [securityQuestion, setSecurityQuestion] = useState<string>('');
  const [recoveryAnswer, setRecoveryAnswer] = useState('');
  const [newPin, setNewPin] = useState('');
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  // Read current attempts on open
  const loadLockStatus = useCallback(async () => {
    try {
      const currentSettings = await db.settings.get('main');
      const currentAttempts = currentSettings?.pinAttempts || 0;
      setAttempts(currentAttempts);
      if (currentAttempts >= 5) {
        setIsPermanentlyLocked(true);
      } else {
        setIsPermanentlyLocked(false);
      }
      if (currentSettings?.securityQuestion) {
        setSecurityQuestion(currentSettings.securityQuestion);
      }
    } catch {
      // Fallback
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setErrorMessage(null);
      setShowRecovery(false);
      loadLockStatus();
    }
  }, [isOpen, loadLockStatus]);

  if (!isOpen) return null;

  const handleVerifyPin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isPermanentlyLocked || pin.length !== 6) return;

    setIsVerifying(true);
    setErrorMessage(null);

    try {
      const currentSettings = await db.settings.get('main');
      if (!currentSettings || !currentSettings.pinHash) {
        setErrorMessage('لم يتم العثور على رمز PIN مُعد مسبقاً.');
        setIsVerifying(false);
        return;
      }

      const currentAttempts = currentSettings.pinAttempts || 0;

      if (currentAttempts >= 5) {
        setIsPermanentlyLocked(true);
        setIsVerifying(false);
        return;
      }

      const enteredPinHash = await sha256(pin);

      if (enteredPinHash === currentSettings.pinHash) {
        await db.settings.update('main', { pinAttempts: 0 });
        setAttempts(0);
        setIsPermanentlyLocked(false);
        setIsVerifying(false);
        onUnlockSuccess();
      } else {
        const nextAttempts = currentAttempts + 1;
        await db.settings.update('main', { pinAttempts: nextAttempts });
        setAttempts(nextAttempts);
        setPin('');

        if (nextAttempts >= 5) {
          setIsPermanentlyLocked(true);
          setErrorMessage(null);
        } else {
          setErrorMessage(
            `رمز PIN غير صحيح. المحاولات المتبقية: ${5 - nextAttempts} من 5.`
          );
        }
        setIsVerifying(false);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'حدث خطأ أثناء التحقق.');
      setIsVerifying(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError(null);

    if (!recoveryAnswer.trim()) {
      setRecoveryError('يرجى كتابة إجابة سؤال الأمان.');
      return;
    }
    if (newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
      setRecoveryError('يجب إدخال رمز PIN جديد مكون من 6 أرقام.');
      return;
    }

    try {
      const currentSettings = await db.settings.get('main');
      if (!currentSettings || !currentSettings.securityAnswerHash) {
        setRecoveryError('لم يتم العثور على سؤال أمان محفوظ.');
        return;
      }

      const enteredAnswerHash = await sha256(recoveryAnswer.trim().toLowerCase());
      if (enteredAnswerHash === currentSettings.securityAnswerHash) {
        const newPinHash = await sha256(newPin);
        await db.settings.update('main', {
          pinHash: newPinHash,
          pinAttempts: 0,
        });

        setIsPermanentlyLocked(false);
        setAttempts(0);
        setShowRecovery(false);
        onUnlockSuccess();
      } else {
        setRecoveryError('إجابة سؤال الأمان غير صحيحة.');
      }
    } catch (err) {
      setRecoveryError(err instanceof Error ? err.message : 'حدث خطأ أثناء الاستعادة.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" dir="rtl">
      <div
        id="pin-lock-modal"
        className="w-full max-w-sm sm:max-w-md bg-yt-surface rounded-3xl shadow-xl border border-yt-border overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-yt-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-yt-brand-soft text-yt-brand flex items-center justify-center shrink-0 border border-yt-border">
              <Lock className="w-4 h-4 text-yt-brand" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-yt-text">رمز الدخول للأهل</h3>
              <span className="text-[11px] font-bold text-yt-text-muted">حماية وتأمين لوحة التحكم</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl text-yt-text-muted hover:text-yt-text hover:bg-yt-surface-muted flex items-center justify-center transition cursor-pointer min-h-[44px]"
            title="إغلاق"
            aria-label="إغلاق"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 sm:p-6 text-right">
          {/* CASE 1: Permanently Locked Screen (5 failed attempts) */}
          {isPermanentlyLocked && !showRecovery ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-rose-50 border border-yt-danger/40 text-yt-danger text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-rose-100 text-yt-danger flex items-center justify-center mx-auto">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h4 className="text-base font-extrabold text-yt-danger">
                  تم قفل لوحة التحكم
                </h4>
                <p className="text-xs text-yt-danger leading-relaxed font-medium">
                  تم إدخال رمز PIN خاطئ 5 مرات متتالية. تم إيقاف المحاولات لحماية إعدادات الطفل.
                </p>
                <div className="p-2.5 rounded-xl bg-rose-100/70 border border-yt-danger/30 text-[11px] text-yt-danger leading-relaxed text-right space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <Info className="w-3.5 h-3.5 text-yt-danger shrink-0" />
                    <span>الاسترجاع عبر سؤال الأمان المحفوظ على هذا الجهاز فقط</span>
                  </div>
                  <p className="text-yt-danger text-[10.5px]">
                    ملاحظة: مسح بيانات الموقع أو ذاكرة المتصفح يفقد الرمز وسؤال الأمان ويعيد ضبط الإعدادات.
                  </p>
                </div>
              </div>

              {securityQuestion && (
                <div className="pt-1 text-center">
                  <button
                    id="open-recovery-btn"
                    type="button"
                    onClick={() => setShowRecovery(true)}
                    className="min-h-[44px] text-xs font-bold text-yt-brand hover:text-yt-brand-hover hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <HelpCircle className="w-4 h-4 text-yt-brand" />
                    <span>استعادة الوصول عبر سؤال الأمان السري</span>
                  </button>
                </div>
              )}

              <div className="pt-1 flex justify-center">
                <button
                  id="close-locked-modal-btn"
                  type="button"
                  onClick={onClose}
                  className="w-full min-h-[44px] px-6 py-2.5 rounded-xl bg-yt-surface-muted hover:bg-yt-border text-yt-text text-xs font-bold transition cursor-pointer border border-yt-border"
                >
                  إغلاق
                </button>
              </div>
            </div>
          ) : showRecovery ? (
            /* Recovery Flow */
            <form onSubmit={handleRecoverySubmit} className="space-y-4">
              <div className="flex items-center gap-2 text-yt-text font-extrabold text-sm">
                <HelpCircle className="w-5 h-5 text-yt-brand shrink-0" />
                <span>استعادة رمز PIN عبر سؤال الأمان</span>
              </div>

              {/* Local Storage & Recovery Note */}
              <div className="p-3 rounded-xl bg-yt-brand-soft border border-yt-brand/30 text-[11px] text-yt-text space-y-1 leading-relaxed">
                <div className="font-bold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-yt-brand shrink-0" />
                  <span>الاسترجاع عبر سؤال الأمان المحفوظ على هذا الجهاز فقط</span>
                </div>
                <p className="text-yt-text-muted text-[10.5px]">
                  يتم التحقق محلياً بدون إرسال بياناتك لأي خادم. تنبيه: مسح بيانات الموقع يفقد الرمز والاسترجاع.
                </p>
              </div>

              {recoveryError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-yt-danger text-yt-danger text-xs font-bold">
                  {recoveryError}
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-yt-surface-muted border border-yt-border text-xs space-y-1">
                <span className="text-yt-text-muted block font-bold">السؤال السري المسجل:</span>
                <span className="font-bold text-yt-text block text-sm">{securityQuestion}</span>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="recovery-answer-input" className="block text-xs font-bold text-yt-text">
                  إجابتك المسجلة:
                </label>
                <input
                  id="recovery-answer-input"
                  type="text"
                  value={recoveryAnswer}
                  onChange={(e) => setRecoveryAnswer(e.target.value)}
                  placeholder="أدخل الإجابة..."
                  className="w-full min-h-[44px] px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-yt-border bg-yt-surface-muted hover:bg-yt-surface focus:bg-yt-surface text-yt-text focus:outline-hidden focus:ring-2 focus:ring-yt-brand/30 focus:border-yt-brand transition"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-yt-text">
                  رمز PIN الجديد (6 أرقام):
                </label>
                <PinOtpInput
                  idPrefix="recovery-pin"
                  value={newPin}
                  onChange={setNewPin}
                  theme="amber"
                  hasError={Boolean(recoveryError)}
                />
              </div>

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setShowRecovery(false)}
                  className="min-h-[44px] px-4 py-2 text-xs font-bold text-yt-text-muted hover:text-yt-text transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  id="submit-recovery-btn"
                  type="submit"
                  disabled={newPin.length !== 6}
                  className="grow min-h-[44px] px-5 py-2.5 rounded-xl bg-yt-brand hover:bg-yt-brand-hover text-yt-brand-text text-xs sm:text-sm font-bold shadow-sm transition disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
                >
                  تأكيد وإعادة تعيين الرمز
                </button>
              </div>
            </form>
          ) : (
            /* Normal PIN Entry Screen */
            <form onSubmit={handleVerifyPin} className="space-y-5">
              <div className="text-center space-y-1.5">
                <div className="w-11 h-11 rounded-2xl bg-yt-brand-soft text-yt-brand flex items-center justify-center mx-auto mb-1 border border-yt-border">
                  <KeyRound className="w-5.5 h-5.5 text-yt-brand" />
                </div>
                <h4 className="text-base font-extrabold text-yt-text">أدخل رمز PIN</h4>
                <p className="text-xs font-medium text-yt-text-muted">
                  أدخل رمز الوالدين المكون من 6 أرقام للمتابعة
                </p>
                <div className="pt-1 flex items-center justify-center gap-2">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                    attempts >= 3
                      ? 'bg-yt-brand-soft text-yt-brand border-yt-brand/30'
                      : 'bg-yt-surface-muted text-yt-text-muted border-yt-border'
                  }`}>
                    المحاولات: {attempts}/5
                  </span>
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-yt-danger/40 text-yt-danger text-xs text-center font-bold">
                  {errorMessage}
                </div>
              )}

              {/* 6 PIN OTP Boxes */}
              <div className="py-1">
                <PinOtpInput
                  idPrefix="pin-lock"
                  value={pin}
                  onChange={setPin}
                  autoFocus
                  theme="amber"
                  hasError={Boolean(errorMessage)}
                  disabled={isVerifying}
                />
              </div>

              <div className="pt-1 flex items-center justify-between gap-3">
                {securityQuestion ? (
                  <button
                    id="open-recovery-btn"
                    type="button"
                    onClick={() => setShowRecovery(true)}
                    className="min-h-[44px] px-2 text-xs sm:text-sm font-bold text-yt-brand hover:text-yt-brand-hover hover:underline flex items-center cursor-pointer"
                    title="الاسترجاع عبر سؤال الأمان المحفوظ على هذا الجهاز فقط"
                  >
                    نسيت الرمز؟
                  </button>
                ) : (
                  <div />
                )}

                <button
                  id="submit-pin-btn"
                  type="submit"
                  disabled={pin.length !== 6 || isVerifying}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-yt-brand hover:bg-yt-brand-hover text-yt-brand-text text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition disabled:opacity-40 shadow-sm cursor-pointer shrink-0"
                >
                  <span>{isVerifying ? 'جاري التحقق...' : 'تأكيد ودخول'}</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>

              {/* Local Security Footnote */}
              <p className="text-[10px] text-yt-text-muted text-center font-medium pt-1">
                الاسترجاع عبر سؤال الأمان المحفوظ على هذا الجهاز فقط • مسح بيانات الموقع يفقد الرمز والاسترجاع
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

