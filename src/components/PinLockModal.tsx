import React, { useState, useEffect, useCallback } from 'react';
import db, { Settings } from '../db';
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
      // Rule: read settings.get('main') into a single variable first
      const currentSettings = await db.settings.get('main');
      if (!currentSettings || !currentSettings.pinHash) {
        setErrorMessage('لم يتم العثور على رمز PIN مُعد مسبقاً.');
        setIsVerifying(false);
        return;
      }

      // Read pinAttempts as a standard property
      const currentAttempts = currentSettings.pinAttempts || 0;

      if (currentAttempts >= 5) {
        setIsPermanentlyLocked(true);
        setIsVerifying(false);
        return;
      }

      const enteredPinHash = await sha256(pin);

      if (enteredPinHash === currentSettings.pinHash) {
        // PIN is correct! Reset attempts counter to 0
        await db.settings.update('main', { pinAttempts: 0 });
        setAttempts(0);
        setIsPermanentlyLocked(false);
        setIsVerifying(false);
        onUnlockSuccess();
      } else {
        // Failed attempt: increment counter
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
        // Answer is correct! Reset PIN and pinAttempts counter
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
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        id="pin-lock-modal"
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">قفل الوالدين</h3>
              <span className="text-[11px] text-slate-400">حماية لوحة التحكم</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 text-right">
          {/* CASE 1: Permanently Locked Screen (5 failed attempts) */}
          {isPermanentlyLocked && !showRecovery ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-red-950">
                  تم قفل لوحة التحكم تماماً
                </h4>
                <p className="text-xs text-red-800 leading-relaxed">
                  تم استنفاد 5 محاولات خاطئة متتالية لإدخال رمز PIN. تم إيقاف أي محاولات إضافية لحماية إعدادات الأطفال.
                </p>
              </div>

              {securityQuestion && (
                <div className="pt-2 text-center">
                  <button
                    id="open-recovery-btn"
                    onClick={() => setShowRecovery(true)}
                    className="text-xs font-semibold text-sky-600 hover:text-sky-800 underline inline-flex items-center gap-1"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>استعادة الوصول عبر سؤال الأمان السري</span>
                  </button>
                </div>
              )}

              <div className="pt-2 flex justify-center">
                <button
                  id="close-locked-modal-btn"
                  onClick={onClose}
                  className="px-6 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                >
                  إغلاق
                </button>
              </div>
            </div>
          ) : showRecovery ? (
            /* Recovery Flow */
            <form onSubmit={handleRecoverySubmit} className="space-y-4">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                <HelpCircle className="w-5 h-5 text-indigo-600 shrink-0" />
                <span>استعادة رمز PIN عبر سؤال الأمان</span>
              </div>

              {recoveryError && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                  {recoveryError}
                </div>
              )}

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <span className="text-slate-500 block mb-1">السؤال السري:</span>
                <span className="font-semibold text-slate-800">{securityQuestion}</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  إجابتك المسجلة:
                </label>
                <input
                  id="recovery-answer-input"
                  type="text"
                  value={recoveryAnswer}
                  onChange={(e) => setRecoveryAnswer(e.target.value)}
                  placeholder="أدخل الإجابة..."
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                  className="w-full text-center tracking-[0.8em] font-mono p-2.5 text-sm rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-2 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setShowRecovery(false)}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  إلغاء
                </button>
                <button
                  id="submit-recovery-btn"
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs"
                >
                  تعيين الرمز وفتح اللوحة
                </button>
              </div>
            </form>
          ) : (
            /* Normal PIN Entry Screen */
            <form onSubmit={handleVerifyPin} className="space-y-4">
              <div className="text-center space-y-1">
                <div className="w-10 h-10 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center mx-auto mb-2">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h4 className="text-base font-bold text-slate-900">أدخل رمز PIN</h4>
                <p className="text-xs text-slate-500">
                  أدخل رمز الوالدين المكون من 6 أرقام للمتابعة
                </p>
                <div className="text-[11px] text-slate-400 font-mono">
                  المحاولات الفاشلة: {attempts} / 5
                </div>
              </div>

              {errorMessage && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs text-center font-medium">
                  {errorMessage}
                </div>
              )}

              <div>
                <input
                  id="enter-pin-input"
                  type="password"
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  className="w-full text-center tracking-[1em] text-2xl font-mono p-3 rounded-2xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                  autoFocus
                />
              </div>

              <div className="pt-1 flex justify-between items-center">
                {securityQuestion ? (
                  <button
                    type="button"
                    onClick={() => setShowRecovery(true)}
                    className="text-xs text-sky-600 hover:underline"
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
                  className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50 shadow-xs"
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
