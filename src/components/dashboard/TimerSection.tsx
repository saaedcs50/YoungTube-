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
    <div id="section-timer" className="space-y-6 max-w-4xl mx-auto">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-stone-200 mb-5">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-emerald-700" />
              </span>
              <span>مواعيد التشغيل والحد اليومي</span>
            </h3>
            <p className="text-xs sm:text-sm text-stone-500 mt-1">
              تحديد المدة اليومية القصوى المسموحة وساعات المشاهدة المصرح بها للطفل.
            </p>
          </div>
          {timerSettingsSaved && (
            <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 animate-fade-in self-start sm:self-auto">
              تم حفظ الإعدادات بنجاح ✅
            </span>
          )}
        </div>

        <form onSubmit={handleSaveTimerSettings} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Session Limit Minutes */}
            <div className="space-y-1.5">
              <label htmlFor="session-limit-input" className="text-xs font-bold text-stone-700 block">
                الحد اليومي (بالدقائق)
              </label>
              <input
                id="session-limit-input"
                type="number"
                min="1"
                max="720"
                value={timerLimitInput}
                onChange={(e) => setTimerLimitInput(Math.max(1, Number(e.target.value) || 1))}
                className="w-full p-2.5 text-xs rounded-xl bg-stone-50 border border-stone-200 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-stone-900"
              />
              <span className="text-[10px] text-stone-400">الافتراضي: 60 دقيقة</span>
            </div>

            {/* Window Start */}
            <div className="space-y-1.5">
              <label htmlFor="schedule-start-input" className="text-xs font-bold text-stone-700 block">
                بداية الوقت المسموح
              </label>
              <input
                id="schedule-start-input"
                type="time"
                value={scheduleStartInput}
                onChange={(e) => setScheduleStartInput(e.target.value)}
                className="w-full p-2.5 text-xs rounded-xl bg-stone-50 border border-stone-200 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-stone-900"
              />
              <span className="text-[10px] text-stone-400">مثل: 08:00</span>
            </div>

            {/* Window End */}
            <div className="space-y-1.5">
              <label htmlFor="schedule-end-input" className="text-xs font-bold text-stone-700 block">
                نهاية الوقت المسموح
              </label>
              <input
                id="schedule-end-input"
                type="time"
                value={scheduleEndInput}
                onChange={(e) => setScheduleEndInput(e.target.value)}
                className="w-full p-2.5 text-xs rounded-xl bg-stone-50 border border-stone-200 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono text-stone-900"
              />
              <span className="text-[10px] text-stone-400">مثل: 20:00</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              id="save-timer-settings-btn"
              type="submit"
              className="min-h-[38px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>حفظ إعدادات الوقت</span>
            </button>

            <button
              type="button"
              onClick={sessionTimer.resetTodayUsage}
              className="min-h-[38px] px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition cursor-pointer border border-stone-200 shadow-sm"
              title="تصفير عداد اليوم للاختبار"
            >
              تصفير استهلاك اليوم (الحالي: {sessionTimer.secondsUsedToday} ثانية)
            </button>
          </div>
        </form>

        {/* Phase 9: Ad-blocking DNS Notice Permanent Row */}
        <div className="mt-8 pt-5 border-t border-stone-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-stone-50 border border-stone-200">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-600" />
                <span>حجب إعلانات يوتيوب (Private DNS)</span>
              </h4>
              <p className="text-xs text-stone-600 leading-relaxed">
                حجب غالبية الإعلانات مجاناً على مستوى الجهاز بالكامل (أندرويد و iOS) بدون تطبيقات إضافية.
              </p>
            </div>
            <button
              id="open-adblock-notice-btn"
              type="button"
              onClick={onOpenAdBlockModal}
              className="min-h-[38px] px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold shrink-0 transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
            >
              <span>عرض إرشادات ورمز QR</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
