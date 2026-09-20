import React from 'react';
import { Clock, Sliders, Smartphone, CheckCircle2, ArrowLeft, LayoutDashboard } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface PostSetupChecklistProps {
  onFinish: () => void;
  onGoDashboard?: () => void;
}

export default function PostSetupChecklist({
  onFinish,
  onGoDashboard,
}: PostSetupChecklistProps) {
  return (
    <div
      id="post-setup-checklist-modal"
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs overflow-y-auto flex items-center justify-center p-4 sm:p-6"
      dir="rtl"
    >
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-stone-200/80 overflow-hidden flex flex-col my-auto text-right animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-emerald-500/10 border-b border-emerald-200/60 p-6 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md mb-3">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
            تم الإعداد — ثلاث خطوات سريعة
          </h2>
          <p className="text-xs sm:text-sm text-stone-600 mt-1.5 font-medium leading-relaxed max-w-md mx-auto">
            مرحباً بك في يونج تيوب! إليك نصائح سريعة لضمان أفضل تجربة لطفلك:
          </p>
        </div>

        {/* 3 Checklist / Guidance Rows */}
        <div className="p-5 sm:p-6 space-y-3.5">
          {/* Row 1: Session Time */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-stone-50 border border-stone-200/70">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 border border-amber-300 mt-0.5">
              <Clock className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-stone-900">
                1. حدّد وقت المشاهدة اليومي من لوحة الأهل
              </h3>
              <p className="text-[11px] sm:text-xs text-stone-600 mt-0.5 leading-relaxed font-medium">
                اضبط حداً زمنياً يومياً وجدول ساعات المشاهدة لتفادي الاستخدام الزائد.
              </p>
            </div>
          </div>

          {/* Row 2: Categories & Channels */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-stone-50 border border-stone-200/70">
            <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center shrink-0 border border-sky-300 mt-0.5">
              <Sliders className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-stone-900">
                2. راجع التصنيفات والقنوات المسموحة
              </h3>
              <p className="text-[11px] sm:text-xs text-stone-600 mt-0.5 leading-relaxed font-medium">
                فَعّل أو عطّل التصنيفات حسب عمر واهتمامات طفلك مع إمكانية إضافة قنواتك.
              </p>
            </div>
          </div>

          {/* Row 3: PWA Install */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-stone-50 border border-stone-200/70">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 border border-emerald-300 mt-0.5">
              <Smartphone className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs sm:text-sm font-bold text-stone-900">
                  3. ثبّت يونج تيوب على الشاشة الرئيسية (PWA)
                </h3>
              </div>
              <p className="text-[11px] sm:text-xs text-stone-600 mt-0.5 leading-relaxed font-medium mb-2">
                لتشغيل التطبيق بملء الشاشة وبدون شريط المتصفح وتجربة أكثر أماناً وسرعة.
              </p>
              <div className="pt-0.5">
                <PWAInstallButton />
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="pt-3 space-y-2">
            <button
              id="enter-kids-ui-btn"
              type="button"
              onClick={onFinish}
              className="w-full py-3.5 px-6 rounded-2xl bg-amber-600 hover:bg-amber-700 active:scale-[0.99] text-white font-bold text-sm sm:text-base transition shadow-md shadow-amber-600/25 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>الدخول لواجهة الطفل</span>
              <ArrowLeft className="w-5 h-5" />
            </button>

            {onGoDashboard && (
              <button
                id="go-dashboard-btn"
                type="button"
                onClick={onGoDashboard}
                className="w-full py-2.5 px-4 rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-100 text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LayoutDashboard className="w-4 h-4 text-stone-500" />
                <span>الانتقال للوحة الأهل أولاً</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
