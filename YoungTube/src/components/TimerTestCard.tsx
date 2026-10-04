import React, { useState } from 'react';
import { Clock, CheckCircle2, AlertTriangle, RotateCcw, FastForward, Calendar, ShieldCheck, SunDim } from 'lucide-react';

interface TimerTestCardProps {
  secondsUsedToday: number;
  sessionLimitMinutes: number;
  isLimitReached: boolean;
  isWithinScheduleWindow: boolean;
  scheduleWindow: { start: string; end: string };
  onResetToday: () => Promise<void>;
  onSimulateLimit?: () => Promise<void>;
}

export default function TimerTestCard({
  secondsUsedToday,
  sessionLimitMinutes,
  isLimitReached,
  isWithinScheduleWindow,
  scheduleWindow,
  onResetToday,
  onSimulateLimit,
}: TimerTestCardProps) {
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const formatSeconds = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    if (mins === 0) {
      return `${secs} ثانية`;
    }
    return `${mins} دقيقة و ${secs} ثانية (${totalSec} ثانية)`;
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await onResetToday();
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to reset today usage:', err);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div
      id="timer-test-card"
      className="rounded-2xl border border-yt-border bg-yt-surface p-5 sm:p-6 shadow-sm flex flex-col justify-between"
    >
      <div>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-yt-text">اختبار التايمر (Phase 8: Timers)</h2>
              <span className="text-xs text-yt-text-muted font-mono">db.usage & useSessionTimer</span>
            </div>
          </div>

          <button
            id="reset-timer-today-btn"
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-xl bg-yt-surface-muted hover:bg-yt-border text-yt-text text-xs font-semibold transition cursor-pointer disabled:opacity-50 self-start sm:self-auto border border-yt-border shadow-sm"
            title="تصفير عداد اليوم للاختبار فقط"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
            <span>{resetSuccess ? 'تم التصفير ✅' : 'تصفير عداد اليوم (اختبار فقط)'}</span>
          </button>
        </div>

        {/* Live Counters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {/* Seconds Used Today */}
          <div className="p-3.5 rounded-xl bg-yt-surface-muted/50 border border-yt-border space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-yt-text-muted font-medium">الوقت المستهلك اليوم (حي)</span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                Live +1s
              </span>
            </div>
            <div className="text-lg font-black text-yt-text font-mono">
              {formatSeconds(secondsUsedToday)}
            </div>
            <p className="text-[11px] text-yt-text-muted">
              يُحفظ في Dexie (جدول usage) كل 5 ثوانٍ، ويتوقف عند تصغير التطبيق.
            </p>
          </div>

          {/* Session Limit Minutes */}
          <div className="p-3.5 rounded-xl bg-yt-surface-muted/50 border border-yt-border space-y-1">
            <span className="text-xs text-yt-text-muted font-medium block">الحد اليومي المسموح به</span>
            <div className="text-lg font-black text-yt-text font-mono">
              {sessionLimitMinutes} دقيقة ({sessionLimitMinutes * 60} ثانية)
            </div>
            <p className="text-[11px] text-yt-text-muted">
              مأخوذ من <code className="font-mono bg-yt-surface-muted px-1 py-0.5 rounded text-yt-text">settings.main.sessionLimitMinutes</code>
            </p>
          </div>
        </div>

        {/* Two Boolean Flags */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {/* Flag 1: isLimitReached */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between ${
              isLimitReached
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-yt-surface-muted/50 border-yt-border text-yt-text'
            }`}
          >
            <div className="space-y-0.5">
              <span className="text-xs font-semibold block">هل تم بلوغ الحد اليومي؟ (isLimitReached)</span>
              <span className="text-[11px] text-yt-text-muted">
                {secondsUsedToday} / {sessionLimitMinutes * 60} ثانية
              </span>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                isLimitReached
                  ? 'bg-rose-200 text-rose-900'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {isLimitReached ? 'نعم (مغلق)' : 'لا (متاح)'}
            </span>
          </div>

          {/* Flag 2: isWithinScheduleWindow */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between ${
              !isWithinScheduleWindow
                ? 'bg-yt-brand-soft border-yt-brand/30 text-yt-text'
                : 'bg-yt-surface-muted/50 border-yt-border text-yt-text'
            }`}
          >
            <div className="space-y-0.5">
              <span className="text-xs font-semibold block">داخل نافذة التشغيل؟ (isWithinScheduleWindow)</span>
              <span className="text-[11px] text-yt-text-muted">
                النافذة: {scheduleWindow.start} إلى {scheduleWindow.end}
              </span>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                isWithinScheduleWindow
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-yt-brand/20 text-yt-brand'
              }`}
            >
              {isWithinScheduleWindow ? 'نعم (مسموح)' : 'لا (خارج الوقت)'}
            </span>
          </div>
        </div>

        {/* Developer Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-yt-surface-muted/50 border border-yt-border">
          <div className="text-xs text-yt-text flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>اختبار شاشة الإغلاق فوراً:</span>
          </div>

          <div className="flex items-center gap-2">
            {onSimulateLimit && (
              <button
                id="simulate-limit-btn"
                type="button"
                onClick={onSimulateLimit}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition cursor-pointer border border-indigo-200 shadow-sm"
                title="يضبط العداد فوراً على الحد الأقصى لتجربة شاشة الإغلاق"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>محاكاة بلوغ الحد الأقصى</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-yt-border">
        <div className="flex items-center justify-between text-[11px] text-yt-text-muted">
          <span className="flex items-center gap-1.5 text-yt-text font-medium">
            <Clock className="w-3.5 h-3.5 text-emerald-600" />
            <span>تتبع الوقت النشط + إيقاف عند حجب التاب (visibilityState)</span>
          </span>
          <span className="font-mono text-[10px] text-yt-text-muted">Phase 8</span>
        </div>
      </div>
    </div>
  );
}
