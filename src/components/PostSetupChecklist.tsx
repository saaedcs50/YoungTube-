import React, { useState } from 'react';
import { Clock, Sliders, Smartphone, CheckCircle2, ArrowLeft, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import AdBlockNotice from './AdBlockNotice';

interface PostSetupChecklistProps {
  onFinish: () => void;
  onGoDashboard?: () => void;
}

export default function PostSetupChecklist({
  onFinish,
  onGoDashboard,
}: PostSetupChecklistProps) {
  const [showAdBlockModal, setShowAdBlockModal] = useState(false);

  return (
    <div
      id="post-setup-checklist-modal"
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs overflow-y-auto flex items-center justify-center p-4 sm:p-6"
      dir="rtl"
    >
      <div className="w-full max-w-lg bg-yt-surface rounded-3xl shadow-2xl border border-yt-border overflow-hidden flex flex-col my-auto text-right animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-emerald-500/10 border-b border-emerald-200/60 p-6 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md mb-3">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-yt-text tracking-tight">
            تم إعداد الحماية — نصائح سريعة للبدء
          </h2>
          <p className="text-xs sm:text-sm text-yt-text-muted mt-1.5 font-medium leading-relaxed max-w-md mx-auto">
            مرحباً بك في يونج تيوب! إليك نصائح وخطوات سريعة لضمان أفضل تجربة لطفلك:
          </p>
        </div>

        {/* Checklist / Guidance Rows */}
        <div className="p-5 sm:p-6 space-y-3.5">
          {/* Row 1: Session Time */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-yt-surface-muted border border-yt-border">
            <div className="w-9 h-9 rounded-xl bg-yt-brand-soft text-yt-brand flex items-center justify-center shrink-0 border border-yt-border mt-0.5">
              <Clock className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-yt-text">
                1. حدّد وقت المشاهدة اليومي من لوحة الأهل
              </h3>
              <p className="text-[11px] sm:text-xs text-yt-text-muted mt-0.5 leading-relaxed font-medium">
                اضبط حداً زمنياً يومياً وجدول ساعات المشاهدة لتفادي الاستخدام الزائد.
              </p>
            </div>
          </div>

          {/* Row 2: Categories, Channels & Interests */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-yt-surface-muted border border-yt-border">
            <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center shrink-0 border border-sky-300 mt-0.5">
              <Sliders className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-yt-text">
                2. راجع التصنيفات واهتمامات طفلك في لوحة الأهل
              </h3>
              <p className="text-[11px] sm:text-xs text-yt-text-muted mt-0.5 leading-relaxed font-medium">
                وجّه ذوق واهتمامات طفلك، وفَعّل أو عطّل مجالات المحتوى والقنوات المسموحة بما يناسب عمره وقيم عائلتكم.
              </p>
            </div>
          </div>

          {/* Row 3: PWA Install */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-yt-surface-muted border border-yt-border">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 border border-emerald-300 mt-0.5">
              <Smartphone className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs sm:text-sm font-bold text-yt-text">
                  3. ثبّت يونج تيوب على الشاشة الرئيسية (PWA)
                </h3>
              </div>
              <p className="text-[11px] sm:text-xs text-yt-text-muted mt-0.5 leading-relaxed font-medium mb-2">
                لتشغيل التطبيق بملء الشاشة وبدون شريط المتصفح وتجربة أكثر أماناً وسرعة.
              </p>
              <div className="pt-0.5">
                <PWAInstallButton />
              </div>
            </div>
          </div>

          {/* Row 4: Optional Ad-blocking tip */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-yt-surface-muted border border-yt-border">
            <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center shrink-0 border border-purple-300 mt-0.5">
              <ShieldCheck className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs sm:text-sm font-bold text-yt-text">
                  4. حماية إضافية من الإعلانات (اختياري)
                </h3>
              </div>
              <p className="text-[11px] sm:text-xs text-yt-text-muted mt-0.5 leading-relaxed font-medium">
                لحجب معظم إعلانات يوتيوب على مستوى الجهاز مجاناً، يمكنك الاستفادة من ميزة Private DNS.
              </p>
              <button
                id="checklist-adblock-btn"
                type="button"
                onClick={() => setShowAdBlockModal(true)}
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-purple-700 hover:text-purple-900 hover:underline cursor-pointer"
              >
                <span>عرض إرشادات حجب الإعلانات</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Buttons */}
          <div className="pt-3 space-y-2">
            <button
              id="enter-kids-ui-btn"
              type="button"
              onClick={onFinish}
              className="w-full py-3.5 px-6 rounded-2xl bg-yt-brand hover:bg-yt-brand-hover active:scale-[0.99] text-yt-brand-text font-bold text-sm sm:text-base transition shadow-md shadow-yt-brand/25 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>الدخول لواجهة الطفل</span>
              <ArrowLeft className="w-5 h-5" />
            </button>

            {onGoDashboard && (
              <button
                id="go-dashboard-btn"
                type="button"
                onClick={onGoDashboard}
                className="w-full py-2.5 px-4 rounded-xl text-yt-text-muted hover:text-yt-text hover:bg-yt-surface-muted text-xs sm:text-sm font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LayoutDashboard className="w-4 h-4 text-yt-text-muted" />
                <span>الانتقال للوحة الأهل أولاً</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {showAdBlockModal && (
        <AdBlockNotice mode="modal" onClose={() => setShowAdBlockModal(false)} />
      )}
    </div>
  );
}
