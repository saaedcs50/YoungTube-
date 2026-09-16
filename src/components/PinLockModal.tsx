import React, { useState, useEffect, useCallback } from 'react';
import db from '../db';
import { sha256 } from '../crypto';
import { Lock, ShieldAlert, KeyRound, HelpCircle, ArrowLeft, X } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4" dir="rtl">
      <div
        id="pin-lock-modal"
        className="w-full max-w-sm sm:max-w-md bg-white rounded-3xl shadow-xl border border-stone-200/80 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 border border-sky-100">
              <Lock className="w-4 h-4 text-sky-600" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-stone-900">رمز الدخول للأهل</h3>
              <span className="text-[11px] font-bold text-stone-400">حماية وتأمين لوحة التحكم</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 flex items-center justify-center transition cursor-pointer min-h-[44px]"
            title="إغلاق"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 sm:p-6 text-right">
          {/* CASE 1: Permanently Locked Screen (5 failed attempts) */}
          {isPermanentlyLocked && !showRecovery ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200/80 text-rose-950 text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h4 className="text-base font-extrabold text-rose-950">
                  تم قفل لوحة التحكم
                </h4>
                <p className="text-xs text-rose-800 leading-relaxed font-medium">
                  تم إدخال رمز PIN خاطئ 5 مرات متتالية. تم إيقاف المحاولات مؤقتاً لحماية الأجهزة وإعدادات الطفل.
                </p>
              </div>

              {securityQuestion && (
                <div className="pt-2 text-center">
                  <button
                    id="open-recovery-btn"
                    type="button"
                    onClick={() => setShowRecovery(true)}
                    className="min-h-[44px] text-xs font-bold text-sky-600 hover:text-sky-700 hover:underline inline-flex items-center gap-1.5"
                  >
                    <HelpCircle className="w-4 h-4 text-sky-600" />
                    <span>استعادة الوصول عبر سؤال الأمان السري</span>
                  </button>
                </div>
              )}

              <div className="pt-2 flex justify-center">
                <button
                  id="close-locked-modal-btn"
                  type="button"
                  onClick={onClose}
                  className="w-full min-h-[44px] px-6 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold transition cursor-pointer border border-stone-200/80"
                >
                  إغلاق
                </button>
              </div>
            </div>
          ) : showRecovery ? (
            /* Recovery Flow */
            <form onSubmit={handleRecoverySubmit} className="space-y-4">
              <div className="flex items-center gap-2 text-stone-900 font-extrabold text-sm">
                <HelpCircle className="w-5 h-5 text-sky-600 shrink-0" />
                <span>استعادة رمز PIN عبر سؤال الأمان</span>
              </div>

              {recoveryError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold">
                  {recoveryError}
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80 text-xs space-y-1">
                <span className="text-stone-400 block font-bold">السؤال السري المسجل:</span>
                <span className="font-bold text-stone-800 block text-sm">{securityQuestion}</span>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="recovery-answer-input" className="block text-xs font-bold text-stone-700">
                  إجابتك المسجلة:
                </label>
                <input
                  id="recovery-answer-input"
                  type="text"
                  value={recoveryAnswer}
                  onChange={(e) => setRecoveryAnswer(e.target.value)}
                  placeholder="أدخل الإجابة..."
                  className="w-full min-h-[44px] px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-white focus:bg-white text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="recovery-new-pin-input" className="block text-xs font-bold text-stone-700">
                  رمز PIN الجديد (6 أرقام):
                </label>
                <input
                  id="recovery-new-pin-input"
                  type="password"
                  maxLength={6}
                  inputMode="numeric"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  className="w-full min-h-[44px] text-center tracking-[0.8em] font-mono px-3.5 py-2.5 text-base rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-white focus:bg-white text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition"
                />
              </div>

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setShowRecovery(false)}
                  className="min-h-[44px] px-4 py-2 text-xs font-bold text-stone-500 hover:text-stone-800 transition"
                >
                  إلغاء
                </button>
                <button
                  id="submit-recovery-btn"
                  type="submit"
                  className="grow min-h-[44px] px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs sm:text-sm font-bold shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  تأكيد وإعادة تعيين الرمز
                </button>
              </div>
            </form>
          ) : (
            /* Normal PIN Entry Screen */
            <form onSubmit={handleVerifyPin} className="space-y-5">
              <div className="text-center space-y-1.5">
                <div className="w-11 h-11 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto mb-1 border border-sky-100">
                  <KeyRound className="w-5.5 h-5.5 text-sky-600" />
                </div>
                <h4 className="text-base font-extrabold text-stone-900">أدخل رمز PIN</h4>
                <p className="text-xs font-medium text-stone-500">
                  أدخل رمز الوالدين المكون من 6 أرقام للمتابعة
                </p>
                <div className="pt-1">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-mono font-bold bg-stone-100 text-stone-600 border border-stone-200/70">
                    المحاولات: {attempts}/5
                  </span>
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200/80 text-rose-900 text-xs text-center font-bold">
                  {errorMessage}
                </div>
              )}

              {/* 6 PIN Boxes Visual layout overlaying native input */}
              <div className="relative flex justify-center py-1">
                <input
                  id="enter-pin-input"
                  type="password"
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  autoFocus
                />
                <div className="flex items-center justify-center gap-2 sm:gap-2.5 dir-ltr">
                  {[0, 1, 2, 3, 4, 5].map((index) => {
                    const char = pin[index];
                    const isFilled = char !== undefined;
                    const isCurrent = pin.length === index;
                    return (
                      <div
                        key={index}
                        className={`w-11 h-12 sm:w-12 sm:h-13 rounded-xl border-2 flex items-center justify-center text-xl font-bold font-mono transition-all ${
                          isFilled
                            ? 'border-sky-500 bg-sky-50/60 text-sky-900 shadow-2xs'
                            : isCurrent
                            ? 'border-sky-400 bg-white ring-4 ring-sky-500/15'
                            : 'border-stone-200 bg-stone-50/50 text-stone-300'
                        }`}
                      >
                        {isFilled ? '•' : ''}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-1 flex items-center justify-between gap-3">
                {securityQuestion ? (
                  <button
                    id="open-recovery-btn"
                    type="button"
                    onClick={() => setShowRecovery(true)}
                    className="min-h-[44px] px-2 text-xs sm:text-sm font-bold text-sky-600 hover:text-sky-700 hover:underline flex items-center cursor-pointer"
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
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition disabled:opacity-40 shadow-sm cursor-pointer shrink-0"
                >
                  <span>{isVerifying ? 'جاري التحقق...' : 'تأكيد ودخول'}</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

