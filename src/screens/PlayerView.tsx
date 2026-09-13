import React from 'react';
import {
  ArrowRight,
  Play,
  SkipBack,
  SkipForward,
  Repeat,
  Gauge,
  Captions,
  Volume2,
  Settings,
  Heart,
  Maximize2,
  EyeOff,
  Ban,
  Bookmark,
} from 'lucide-react';

interface PlayerViewProps {
  onClose: () => void;
}

export const PlayerView: React.FC<PlayerViewProps> = ({ onClose }) => {
  return (
    <div
      id="youngtube-player-view"
      dir="rtl"
      className="fixed inset-0 z-50 bg-stone-950 text-white flex flex-col h-screen w-screen overflow-hidden select-none"
    >
      {/* ================= TOP HALF ================= */}
      <div className="flex-1 flex flex-col min-h-0 bg-stone-900 border-b border-stone-800">
        {/* Top Quarter (~25% of top half): Meta & Parent Actions */}
        <div className="h-[25%] p-3 sm:p-4 bg-stone-900 flex items-center justify-between border-b border-stone-800/80 gap-3">
          {/* Back/Close button (top-left / start in RTL) */}
          <button
            type="button"
            id="player-close-btn"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-stone-800 hover:bg-stone-700 flex items-center justify-center text-stone-300 transition shrink-0"
            aria-label="إغلاق المشغل"
          >
            <ArrowRight className="w-5 h-5" />
          </button>

          {/* Title & Channel Info */}
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-sm sm:text-base text-stone-100 truncate">
              عنوان الفيديو التجريبي
            </h2>
            <p className="text-xs text-stone-400 truncate">اسم القناة التجريبية</p>
          </div>

          {/* Parent Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              id="player-parent-hide-btn"
              onClick={() => {
                /* TODO: Hide video action */
              }}
              className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs text-rose-300 font-medium flex items-center gap-1 border border-stone-700/50 transition"
              title="إخفاء الفيديو من القائمة"
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">إخفاء الفيديو</span>
            </button>
            <button
              type="button"
              id="player-parent-disable-btn"
              onClick={() => {
                /* TODO: Disable channel action */
              }}
              className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs text-amber-300 font-medium flex items-center gap-1 border border-stone-700/50 transition"
              title="تعطيل القناة"
            >
              <Ban className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تعطيل القناة</span>
            </button>
            <button
              type="button"
              id="player-parent-save-btn"
              onClick={() => {
                /* TODO: Parent Save action */
              }}
              className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs text-indigo-300 font-medium flex items-center gap-1 border border-stone-700/50 transition"
              title="حفظ في المفضلة للأهل"
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>حفظ</span>
            </button>
          </div>
        </div>

        {/* Bottom Three-Quarters (~75% of top half): EDGE-TO-EDGE Video Area */}
        <div className="h-[75%] relative bg-black w-full flex items-center justify-center overflow-hidden">
          {/* Centered Video Placeholder */}
          <div className="flex flex-col items-center justify-center gap-2 text-stone-500 select-none">
            <div className="w-16 h-16 rounded-full bg-stone-900/80 border border-stone-800 flex items-center justify-center text-stone-400">
              <Play className="w-8 h-8 fill-current ml-1" />
            </div>
            <span className="text-sm font-medium text-stone-400">
              سيتم تحميل الفيديو هنا
            </span>
          </div>

          {/* Fullscreen Icon (Placeholder, Top-Right corner) */}
          <button
            type="button"
            id="player-fullscreen-placeholder-btn"
            className="absolute top-3 right-3 z-10 p-2.5 rounded-xl bg-black/60 hover:bg-black/80 text-stone-200 border border-stone-800 transition"
            aria-label="ملء الشاشة"
            onClick={() => {
              /* TODO: Fullscreen toggle in landscape phase */
            }}
          >
            <Maximize2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ================= BOTTOM HALF ================= */}
      <div className="flex-1 flex flex-col justify-between p-4 sm:p-6 bg-stone-950 min-h-0 overflow-y-auto gap-4">
        {/* Row 1: Seek bar & Time display */}
        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-2 bg-stone-800 rounded-full overflow-hidden relative cursor-pointer">
            <div className="w-0 h-full bg-red-600 rounded-full" />
          </div>
          <span className="text-xs font-mono text-stone-400 whitespace-nowrap">
            00:00 / 00:00
          </span>
        </div>

        {/* Row 2: Controls Row (Evenly spaced, min 44x44px targets) */}
        <div className="flex items-center justify-between gap-1 sm:gap-2 w-full my-auto py-2 overflow-x-auto">
          {/* Play / Pause */}
          <button
            type="button"
            id="player-control-play-pause"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-stone-800 hover:bg-stone-700 flex items-center justify-center text-stone-100 transition shrink-0"
            aria-label="تشغيل / إيقاف مؤقت"
            onClick={() => {
              /* TODO: Play/Pause */
            }}
          >
            <Play className="w-5 h-5 fill-current" />
          </button>

          {/* Previous */}
          <button
            type="button"
            id="player-control-prev"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-stone-900 hover:bg-stone-800 flex items-center justify-center text-stone-300 transition shrink-0"
            aria-label="السابق"
            onClick={() => {
              /* TODO: Previous */
            }}
          >
            <SkipBack className="w-5 h-5" />
          </button>

          {/* Next */}
          <button
            type="button"
            id="player-control-next"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-stone-900 hover:bg-stone-800 flex items-center justify-center text-stone-300 transition shrink-0"
            aria-label="التالي"
            onClick={() => {
              /* TODO: Next */
            }}
          >
            <SkipForward className="w-5 h-5" />
          </button>

          {/* Loop */}
          <button
            type="button"
            id="player-control-loop"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-stone-900 hover:bg-stone-800 flex items-center justify-center text-stone-300 transition shrink-0"
            aria-label="تكرار"
            onClick={() => {
              /* TODO: Loop */
            }}
          >
            <Repeat className="w-5 h-5" />
          </button>

          {/* Speed */}
          <button
            type="button"
            id="player-control-speed"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-stone-900 hover:bg-stone-800 flex items-center justify-center text-stone-300 transition shrink-0"
            aria-label="سرعة التشغيل"
            onClick={() => {
              /* TODO: Speed sheet */
            }}
          >
            <Gauge className="w-5 h-5" />
          </button>

          {/* CC */}
          <button
            type="button"
            id="player-control-cc"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-stone-900 hover:bg-stone-800 flex items-center justify-center text-stone-300 transition shrink-0"
            aria-label="الترجمة"
            onClick={() => {
              /* TODO: CC sheet */
            }}
          >
            <Captions className="w-5 h-5" />
          </button>

          {/* Audio track */}
          <button
            type="button"
            id="player-control-audio"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-stone-900 hover:bg-stone-800 flex items-center justify-center text-stone-300 transition shrink-0"
            aria-label="المسار الصوتي"
            onClick={() => {
              /* TODO: Audio sheet */
            }}
          >
            <Volume2 className="w-5 h-5" />
          </button>

          {/* Quality */}
          <button
            type="button"
            id="player-control-quality"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-stone-900 hover:bg-stone-800 flex items-center justify-center text-stone-300 transition shrink-0"
            aria-label="الجودة"
            onClick={() => {
              /* TODO: Quality sheet */
            }}
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* Love (Heart Icon) */}
          <button
            type="button"
            id="player-control-love"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/40 flex items-center justify-center text-rose-400 transition shrink-0 ml-auto"
            aria-label="مفضلة الطفل"
            onClick={() => {
              /* TODO: Love action */
            }}
          >
            <Heart className="w-5 h-5 fill-rose-500/20" />
          </button>
        </div>

        {/* Row 3: Up Next Strip */}
        <div className="space-y-2">
          <div className="text-xs font-bold text-stone-300">التالي</div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
            {[1, 2, 3, 4, 5].map((item) => (
              <div
                key={item}
                className="shrink-0 w-32 h-20 sm:w-36 sm:h-22 bg-stone-900 rounded-lg border border-stone-800 flex flex-col items-center justify-center gap-1 text-stone-600 select-none"
              >
                <div className="w-6 h-6 rounded-full bg-stone-800 flex items-center justify-center text-stone-500 text-xs">
                  {item}
                </div>
                <span className="text-[10px] text-stone-500">معاينة فيديو</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
