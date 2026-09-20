import React, { useEffect } from 'react';
import { Tv, ShieldCheck, Sparkles, ArrowLeft } from 'lucide-react';
import { trackFunnelEvent } from '../services/funnelTelemetry';

interface WelcomeValueScreenProps {
  onStartSetup: () => void;
}

export default function WelcomeValueScreen({ onStartSetup }: WelcomeValueScreenProps) {
  useEffect(() => {
    try {
      const sessionKey = 'yt_funnel_welcome_seen';
      if (!sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, '1');
        trackFunnelEvent('welcome_seen');
      }
    } catch {
      trackFunnelEvent('welcome_seen');
    }
  }, []);

  const handleStartSetup = () => {
    try {
      const sessionKey = 'yt_funnel_onboarding_started';
      if (!sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, '1');
        trackFunnelEvent('onboarding_started');
      }
    } catch {
      trackFunnelEvent('onboarding_started');
    }
    onStartSetup();
  };

  return (
    <div
      id="welcome-value-screen"
      className="fixed inset-0 z-50 bg-[#FAF8F5] overflow-y-auto flex items-center justify-center p-4 sm:p-6"
      dir="rtl"
    >
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl border border-stone-200/80 overflow-hidden flex flex-col my-auto text-right">
        {/* Brand Header */}
        <div className="bg-amber-500/10 border-b border-amber-200/60 p-6 sm:p-8 text-center">
          {/* Top Badge / Small Pills */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-600 text-white shadow-xs">
              للوالدين
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-stone-200/90 text-stone-600">
              للطفل بعد الإعداد
            </span>
          </div>

          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-3xl bg-amber-600 text-white flex items-center justify-center shadow-md mb-4">
            <Tv className="w-8 h-8 sm:w-10 sm:h-10" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
            يونج تيوب
          </h1>
          <p className="text-sm sm:text-base text-stone-800 mt-2 font-semibold leading-relaxed max-w-md mx-auto">
            فيديو للأطفال من قنوات مختارة — بدون خوارزمية يوتيوب
          </p>
          <p className="text-xs sm:text-sm text-stone-700 mt-2.5 font-medium leading-relaxed max-w-md mx-auto">
            هذه الشاشة للوالدين. بعد إنشاء رمز PIN تظهر واجهة بسيطة للطفل.
          </p>
        </div>

        {/* Three Benefit Rows */}
        <div className="p-6 sm:p-8 space-y-4">
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-stone-50 border border-stone-200/70">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 border border-amber-300 mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-900">
                قنوات مختارة بعناية
              </h2>
              <p className="text-xs text-stone-700 mt-0.5 leading-relaxed font-medium">
                مش اقتراحات عشوائية
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-stone-50 border border-stone-200/70">
            <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center shrink-0 border border-sky-300 mt-0.5">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-900">
                تحكم الأهل برمز PIN
              </h2>
              <p className="text-xs text-stone-700 mt-0.5 leading-relaxed font-medium">
                حدود وقت وإعدادات
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-stone-50 border border-stone-200/70">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 border border-emerald-300 mt-0.5">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-900">
                بدون تشتيت
              </h2>
              <p className="text-xs text-stone-700 mt-0.5 leading-relaxed font-medium">
                واجهة بسيطة للطفل
              </p>
            </div>
          </div>

          <p className="text-center text-xs text-stone-600 font-semibold pt-1">
            للأهل أولًا، ثم للطفل بعد الإعداد
          </p>

          <div className="pt-3">
            <button
              id="start-setup-btn"
              type="button"
              onClick={handleStartSetup}
              className="w-full py-3.5 px-6 rounded-2xl bg-amber-600 hover:bg-amber-700 active:scale-[0.99] text-white font-bold text-sm sm:text-base transition shadow-md shadow-amber-600/25 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>ابدأ الإعداد</span>
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
