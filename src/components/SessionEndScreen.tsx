import React from 'react';
import { Moon, Sparkles, Clock, Lock, RotateCcw, Home } from 'lucide-react';

interface SessionEndScreenProps {
  isLimitReached: boolean;
  isWithinScheduleWindow: boolean;
  onParentUnlock?: () => void;
  onResetForTesting?: () => void;
}

export default function SessionEndScreen({
  isLimitReached,
  isWithinScheduleWindow,
  onParentUnlock,
  onResetForTesting,
}: SessionEndScreenProps) {
  return (
    <div
      id="session-end-screen"
      dir="rtl"
      className="fixed inset-0 z-50 bg-gradient-to-b from-indigo-950 via-slate-900 to-indigo-950 text-white flex flex-col items-center justify-between p-6 sm:p-10 select-none overflow-y-auto"
    >
      {/* Top ambient stars & decor */}
      <div className="w-full max-w-md flex items-center justify-between opacity-90 pt-2">
        <div className="flex items-center gap-2 text-amber-300 text-xs font-bold bg-yt-brand-soft/20 px-3 py-1.5 rounded-full border border-yt-brand/30">
          <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
          <span>وقت الراحة والاسترخاء</span>
        </div>
        <div className="flex items-center gap-1.5 text-indigo-200 text-xs font-bold">
          <Clock className="w-4 h-4 text-sky-400" />
          <span>يونج تيوب</span>
        </div>
      </div>

      {/* Main Friendly Center Message */}
      <div className="w-full max-w-lg mx-auto text-center space-y-6 my-auto py-8">
        {/* Friendly Illustration / Night Sky Theme */}
        <div className="relative inline-flex items-center justify-center">
          <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-gradient-to-tr from-indigo-800/60 to-yt-brand/20 border-2 border-yt-brand/30 flex items-center justify-center shadow-2xl shadow-indigo-950">
            <div className="text-5xl sm:text-6xl animate-bounce" style={{ animationDuration: '3s' }}>
              🌙
            </div>
          </div>
          <span className="absolute -top-1 -right-2 text-2xl animate-pulse">✨</span>
          <span className="absolute -bottom-1 -left-2 text-2xl animate-pulse" style={{ animationDelay: '1s' }}>⭐</span>
        </div>

        {/* Short, Kind Title */}
        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-white leading-tight">
            خلص وقت المشاهدة 👏
          </h1>
          <p className="text-sm sm:text-base text-indigo-100/90 max-w-md mx-auto leading-relaxed font-medium">
            {isLimitReached
              ? 'أحسنت اليوم! انتهى الوقت المخصص للشاشات. حان الآن وقت القراءة واللعب الحركي والتواصل مع العائلة.'
              : !isWithinScheduleWindow
              ? 'نحن الآن خارج أوقات المشاهدة المحددة. حان وقت النوم والراحة للاستعداد ليوم جديد مليء بالنشاط.'
              : 'حان وقت أخذ استراحة ممتعة وصحية بعيداً عن الشاشات.'}
          </p>
        </div>

        {/* Time / Clock Card */}
        <div className="p-4 sm:p-5 rounded-3xl bg-white/10 border border-white/15 backdrop-blur-md max-w-sm mx-auto text-xs text-indigo-100 space-y-2 shadow-lg">
          <div className="flex items-center justify-center gap-2 text-amber-300 font-bold text-sm">
            <Moon className="w-4 h-4" />
            <span>نوم هادئ وصحة أفضل</span>
          </div>
          <p className="text-xs text-indigo-200 leading-relaxed">
            انتهى وقت الجلسة المسموح به اليوم. التطبيق مغلق لحماية صحة عينيك ونشاطك.
          </p>
        </div>

        {/* Main Actions */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-sm mx-auto w-full">
          {/* Primary: Parent PIN button */}
          {onParentUnlock && (
            <button
              id="session-end-parent-unlock-btn"
              type="button"
              onClick={onParentUnlock}
              className="w-full min-h-[48px] px-6 py-3 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-md cursor-pointer"
              title="دخول الوالدين بالـ PIN"
            >
              <Lock className="w-4 h-4" />
              <span>لوحة تحكم الوالدين (PIN)</span>
            </button>
          )}

          {/* Secondary: العودة للشاشة الرئيسية / Reset button */}
          {onResetForTesting ? (
            <button
              id="session-end-reset-test-btn"
              type="button"
              onClick={onResetForTesting}
              className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-indigo-100 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer"
              title="تصفير عداد الاستخدام لاختبار التطبيق مجدداً"
            >
              <RotateCcw className="w-4 h-4 text-amber-300" />
              <span>العودة للشاشة الرئيسية (تصفير العداد)</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-indigo-100 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Home className="w-4 h-4 text-sky-300" />
              <span>العودة للشاشة الرئيسية</span>
            </button>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="w-full max-w-md mx-auto text-center text-xs text-indigo-300/60 pt-4 border-t border-white/10">
        <span>أمان الطفل وصحته أولويتنا دائماً</span>
      </div>
    </div>
  );
}
