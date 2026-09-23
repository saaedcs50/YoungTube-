import React, { useState, useEffect } from 'react';
import { Clock, ShieldCheck } from 'lucide-react';
import db, { Settings } from '../../db';
import { SessionTimerState } from '../../hooks/useSessionTimer';

export interface TimerSectionProps {
  mainSettings: Settings | null;
  sessionTimer: SessionTimerState;
  onSettingsSaved?: () => void;
  onOpenAdBlockModal: () => void;
}

export const TimerSection: React.FC<TimerSectionProps> = ({
  mainSettings,
  sessionTimer,
  onSettingsSaved,
  onOpenAdBlockModal,
}) => {
  const [timerLimitInput, setTimerLimitInput] = useState<number>(
    () => mainSettings?.sessionLimitMinutes ?? 60
  );
  const [scheduleStartInput, setScheduleStartInput] = useState<string>(
    () => mainSettings?.scheduleWindow?.start || '00:00'
  );
  const [scheduleEndInput, setScheduleEndInput] = useState<string>(
    () => mainSettings?.scheduleWindow?.end || '23:59'
  );
  const [timerSettingsSaved, setTimerSettingsSaved] = useState(false);

  useEffect(() => {
    if (mainSettings) {
      setTimerLimitInput(mainSettings.sessionLimitMinutes ?? 60);
      setScheduleStartInput(mainSettings.scheduleWindow?.start || '00:00');
      setScheduleEndInput(mainSettings.scheduleWindow?.end || '23:59');
    }
  }, [mainSettings]);

  const handleSaveTimerSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mainSettings) return;
    const updated: Settings = {
      ...mainSettings,
      sessionLimitMinutes: Number(timerLimitInput) || 60,
      scheduleWindow: {
        start: scheduleStartInput || '00:00',
        end: scheduleEndInput || '23:59',
      },
    };
    await db.settings.put(updated);
    await sessionTimer.refreshSettings();
    setTimerSettingsSaved(true);
    setTimeout(() => setTimerSettingsSaved(false), 2000);
    onSettingsSaved?.();
  };

  return (
    <div id="section-timer" className="space-y-5 max-w-4xl mx-auto">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-yt-border">
        <div>
          <h3 className="text-base sm:text-lg font-extrabold text-yt-text flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-yt-brand text-yt-brand-text flex items-center justify-center shrink-0 shadow-sm">
              <Clock className="w-4 h-4" />
            </span>
            <span>مواعيد التشغيل والحد اليومي</span>
          </h3>
          <p className="text-xs sm:text-sm text-yt-text-muted mt-1">
            تحديد المدة اليومية القصوى المسموحة وساعات المشاهدة المصرح بها للطفل.
          </p>
        </div>
        {timerSettingsSaved && (
          <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 animate-fade-in self-start sm:self-auto">
            تم حفظ الإعدادات بنجاح ✅
          </span>
        )}
      </div>

      <div className="rounded-2xl border border-yt-border bg-yt-surface p-4 sm:p-5 shadow-sm space-y-4">
        <form onSubmit={handleSaveTimerSettings} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Session Limit Minutes */}
            <div className="space-y-1.5">
              <label htmlFor="session-limit-input" className="text-xs font-bold text-yt-text block">
                الحد اليومي (بالدقائق)
              </label>
              <input
                id="session-limit-input"
                type="number"
                min="1"
                max="720"
                value={timerLimitInput}
                onChange={(e) => setTimerLimitInput(Math.max(1, Number(e.target.value) || 1))}
                className="w-full min-h-[44px] px-3.5 py-2.5 text-xs sm:text-sm rounded-xl bg-yt-surface-muted border border-yt-border focus:bg-yt-surface focus:outline-hidden focus:ring-2 focus:ring-yt-brand/30 focus:border-yt-brand font-mono text-yt-text transition"
              />
              <span className="text-[11px] text-yt-text-muted block">الافتراضي: 60 دقيقة</span>
            </div>

            {/* Window Start */}
            <div className="space-y-1.5">
              <label htmlFor="schedule-start-input" className="text-xs font-bold text-yt-text block">
                بداية الوقت المسموح
              </label>
              <input
                id="schedule-start-input"
                type="time"
                value={scheduleStartInput}
                onChange={(e) => setScheduleStartInput(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 text-xs sm:text-sm rounded-xl bg-yt-surface-muted border border-yt-border focus:bg-yt-surface focus:outline-hidden focus:ring-2 focus:ring-yt-brand/30 focus:border-yt-brand font-mono text-yt-text transition"
              />
              <span className="text-[11px] text-yt-text-muted block">مثل: 08:00</span>
            </div>

            {/* Window End */}
            <div className="space-y-1.5">
              <label htmlFor="schedule-end-input" className="text-xs font-bold text-yt-text block">
                نهاية الوقت المسموح
              </label>
              <input
                id="schedule-end-input"
                type="time"
                value={scheduleEndInput}
                onChange={(e) => setScheduleEndInput(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 text-xs sm:text-sm rounded-xl bg-yt-surface-muted border border-yt-border focus:bg-yt-surface focus:outline-hidden focus:ring-2 focus:ring-yt-brand/30 focus:border-yt-brand font-mono text-yt-text transition"
              />
              <span className="text-[11px] text-yt-text-muted block">مثل: 20:00</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2">
            <button
              id="save-timer-settings-btn"
              type="submit"
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-yt-brand hover:bg-yt-brand-hover text-yt-brand-text text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition shadow-sm cursor-pointer"
            >
              <Clock className="w-4 h-4" />
              <span>حفظ إعدادات الوقت</span>
            </button>

            <button
              type="button"
              onClick={sessionTimer.resetTodayUsage}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-yt-surface-muted hover:bg-yt-border text-yt-text text-xs font-bold transition cursor-pointer border border-yt-border shadow-2xs"
              title="تصفير عداد اليوم للاختبار"
            >
              تصفير استهلاك اليوم (الحالي: {sessionTimer.secondsUsedToday} ثانية)
            </button>
          </div>
        </form>

        {/* Phase 9: Ad-blocking DNS Notice Permanent Row */}
        <div className="mt-6 pt-5 border-t border-yt-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-sky-50/60 border border-sky-200/70">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-sky-950 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-600" />
                <span>حجب إعلانات يوتيوب (Private DNS)</span>
              </h4>
              <p className="text-xs text-sky-800 leading-relaxed">
                حجب غالبية الإعلانات مجاناً على مستوى الجهاز بالكامل (أندرويد و iOS) بدون تطبيقات إضافية.
              </p>
            </div>
            <button
              id="open-adblock-notice-btn"
              type="button"
              onClick={onOpenAdBlockModal}
              className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shrink-0 transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
            >
              <span>عرض إرشادات ورمز QR</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
