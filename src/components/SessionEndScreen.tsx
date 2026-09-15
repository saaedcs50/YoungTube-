import React from 'react';
import { Moon, Sparkles, Clock, Lock, RotateCcw } from 'lucide-react';

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
      className="fixed inset-0 z-50 bg-radial from-slate-900 via-indigo-950 to-slate-950 text-white flex flex-col items-center justify-between p-6 sm:p-10 select-none overflow-y-auto"
    >
      {/* Top ambient stars & decor */}
      <div className="w-full max-w-md flex items-center justify-between opacity-80 pt-2">
        <div className="flex items-center gap-1.5 text-sky-300 text-xs font-medium">
          <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
          <span>وقت الراحة والنوم</span>
        </div>
        <div className="flex items-center gap-1 text-slate-400 text-xs">
          <Clock className="w-3.5 h-3.5" />
          <span>يوتيوب الأطفال</span>
        </div>
      </div>

      {/* Main Friendly Center Message */}
      <div className="w-full max-w-lg mx-auto text-center space-y-6 my-auto py-6">
        {/* Friendly Illustration / Emoji Art */}
        <div className="relative inline-flex items-center justify-center">
          <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-gradient-to-tr from-indigo-500/30 to-amber-300/20 border border-indigo-400/30 flex items-center justify-center shadow-2xl shadow-indigo-900/50">
            <div className="text-5xl sm:text-6xl animate-bounce" style={{ animationDuration: '2.5s' }}>
              🌙
            </div>
          </div>
          <span className="absolute -top-2 -right-2 text-2xl animate-pulse">✨</span>
          <span className="absolute -bottom-1 -left-2 text-2xl animate-pulse" style={{ animationDelay: '0.8s' }}>⭐</span>
        </div>

        {/* Title */}
        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-white leading-tight">
            خلصنا وقت النهاردة، نشوفك بكرة! 👋
          </h1>
          <p className="text-sm sm:text-base text-slate-300 max-w-md mx-auto leading-relaxed">
            {isLimitReached
              ? 'أحسنت اليوم! انتهى الوقت المخصص للشاشة. حان الآن وقت اللعب الحركي، القراءة، أو الجلوس مع العائلة.'
              : !isWithinScheduleWindow
              ? 'نحن الآن خارج أوقات المشاهدة المحددة. حان وقت الراحة والاستعداد ليوم جديد مليء بالنشاط.'
              : 'حان وقت أخذ استراحة ممتعة بعيداً عن الشاشات.'}
          </p>
        </div>

        {/* Friendly Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md max-w-sm mx-auto text-xs text-slate-300 space-y-2">
          <div className="flex items-center justify-center gap-2 text-amber-300 font-semibold">
            <Moon className="w-4 h-4" />
            <span>نوم هادئ وأحلام سعيدة</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-normal">
            التطبيق مغلق حتى الغد لحماية عينيك وصحتك.
          </p>
        </div>
      </div>

      {/* Discreet Parent & Testing Controls at Bottom Corner */}
      <div className="w-full max-w-2xl mx-auto flex items-center justify-between text-xs text-slate-500 pt-4 border-t border-white/5">
        {onParentUnlock ? (
          <button
            id="session-end-parent-unlock-btn"
            type="button"
            onClick={onParentUnlock}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition text-[11px] cursor-pointer"
            title="دخول الوالدين بالـ PIN"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>لوحة تحكم الوالدين (PIN)</span>
          </button>
        ) : (
          <span />
        )}

        {onResetForTesting && (
          <button
            id="session-end-reset-test-btn"
            type="button"
            onClick={onResetForTesting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-amber-200 transition text-[11px] border border-amber-500/30 cursor-pointer"
            title="تصفير عداد الاستخدام لاختبار التطبيق مجدداً"
          >
            <RotateCcw className="w-3 h-3" />
            <span>تصفير العداد (وضع الاختبار)</span>
          </button>
        )}
      </div>
    </div>
  );
}
