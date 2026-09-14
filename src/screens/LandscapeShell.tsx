import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  Repeat,
  Minimize2,
  SkipBack,
  SkipForward,
  Heart,
} from 'lucide-react';
import { PlayerSeekBar } from '../components/PlayerSeekBar';

export interface LandscapeShellProps {
  children?: React.ReactNode;
  isPlaying: boolean;
  isLooping: boolean;
  isLoved?: boolean;
  currentTime?: number;
  duration?: number;
  videoTitle?: string;
  channelTitle?: string;
  onTogglePlay: () => void;
  onToggleLoop: () => void;
  onToggleLove?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onSeek?: (time: number) => void;
  onExitFullscreen: () => void;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel?: (e: React.PointerEvent<HTMLDivElement>) => void;
  showOverlay?: boolean;
  setShowOverlay?: React.Dispatch<React.SetStateAction<boolean>>;
}

export const LandscapeShell: React.FC<LandscapeShellProps> = ({
  children,
  isPlaying,
  isLooping,
  isLoved = false,
  currentTime = 0,
  duration = 0,
  videoTitle,
  channelTitle,
  onTogglePlay,
  onToggleLoop,
  onToggleLove,
  onPrev,
  onNext,
  onSeek,
  onExitFullscreen,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  showOverlay: propShowOverlay,
  setShowOverlay: propSetShowOverlay,
}) => {
  const [internalShowOverlay, setInternalShowOverlay] = useState(true);
  const showOverlay = propShowOverlay !== undefined ? propShowOverlay : internalShowOverlay;
  const setShowOverlay = propSetShowOverlay || setInternalShowOverlay;

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      setShowOverlay(false);
    }, 3500);
  }, [setShowOverlay]);

  useEffect(() => {
    if (showOverlay) {
      resetHideTimer();
    }
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [showOverlay, resetHideTimer]);

  const handleShieldClick = (e: React.MouseEvent) => {
    // anti-leak protection: only toggle overlay when clicking the shield background itself
    if (e.target !== e.currentTarget) return;
    setShowOverlay((prev) => !prev);
  };

  return (
    <div
      id="youngtube-landscape-shell"
      className="absolute inset-0 z-30 w-full h-full bg-transparent flex items-center justify-center overflow-hidden select-none pointer-events-auto"
    >
      {/* Overlay only — video lives under this shell. Opaque bg would hide the iframe. */}
      {children}

      {/* Transparent Click-Shield Layer: anti-leak protection + gesture capture + tap to toggle overlay */}
      <div
        id="landscape-click-shield"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={!onPointerDown ? handleShieldClick : undefined}
        className="absolute inset-0 z-10 bg-transparent cursor-pointer touch-none select-none"
        aria-label="تبديل عناصر التحكم وإيماءات ملء الشاشة"
      />

      {/* Landscape Controls Overlay */}
      {showOverlay && (
        <div
          id="landscape-controls-overlay"
          className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-between p-3 sm:p-5 bg-gradient-to-b from-black/80 via-transparent to-black/85 transition-opacity duration-200"
        >
          {/* Top Bar: Title/Channel info & Exit Fullscreen button */}
          <div className="flex items-center justify-between w-full pointer-events-auto gap-4">
            <div className="flex flex-col min-w-0 max-w-[65%] text-right">
              {videoTitle && (
                <h2 className="text-xs sm:text-sm font-bold text-stone-100 truncate drop-shadow-md">
                  {videoTitle}
                </h2>
              )}
              {channelTitle && (
                <p className="text-[11px] text-stone-400 truncate drop-shadow-sm">
                  {channelTitle}
                </p>
              )}
            </div>

            <button
              type="button"
              id="landscape-exit-fullscreen-btn"
              onClick={(e) => {
                e.stopPropagation();
                onExitFullscreen();
              }}
              className="p-2.5 sm:p-3 min-w-[44px] min-h-[44px] rounded-2xl bg-black/60 hover:bg-black/80 text-stone-200 border border-stone-700/60 shadow-lg transition active:scale-95 cursor-pointer flex items-center gap-2 text-xs font-semibold shrink-0"
              aria-label="إنهاء ملء الشاشة"
              title="إنهاء ملء الشاشة"
            >
              <Minimize2 className="w-4 h-4 sm:w-5 sm:h-5 text-stone-200" />
              <span className="hidden sm:inline">إنهاء العرض الكامل</span>
            </button>
          </div>

          {/* Bottom Area: 2 thin rows (Seek Bar above Controls Row) */}
          <div className="w-full pointer-events-auto flex flex-col gap-1 sm:gap-1.5 pb-1">
            {/* Row 1: Seek Bar */}
            <div className="w-full">
              <PlayerSeekBar
                id="landscape-seek-bar"
                currentTime={currentTime}
                duration={duration}
                onSeek={(targetTime) => {
                  resetHideTimer();
                  onSeek?.(targetTime);
                }}
                onSeekStart={resetHideTimer}
                onSeekEnd={resetHideTimer}
              />
            </div>

            {/* Row 2: Controls Row (Prev / Play-Pause / Next / Love / Loop / Exit) */}
            <div className="flex items-center justify-between w-full pt-0.5">
              {/* Primary Playback controls (LTR order: Prev, Play/Pause, Next) */}
              <div dir="ltr" className="flex items-center gap-2 sm:gap-3">
                {/* Previous button */}
                <button
                  type="button"
                  id="landscape-prev-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    resetHideTimer();
                    onPrev?.();
                  }}
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-black/60 hover:bg-black/80 text-stone-200 hover:text-white border border-stone-700/60 flex items-center justify-center transition active:scale-95 cursor-pointer shadow-md"
                  aria-label="السابق"
                  title="السابق"
                >
                  <SkipBack className="w-5 h-5" />
                </button>

                {/* Play/Pause button */}
                <button
                  type="button"
                  id="landscape-play-pause-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    resetHideTimer();
                    onTogglePlay();
                  }}
                  className="w-12 h-12 sm:w-13 sm:h-13 min-w-[48px] min-h-[48px] rounded-full bg-white hover:bg-stone-100 text-stone-950 flex items-center justify-center shadow-xl transition active:scale-95 cursor-pointer ring-2 ring-white/20"
                  aria-label={isPlaying ? 'إيقاف مؤقت' : 'تشغيل'}
                  title={isPlaying ? 'إيقاف مؤقت' : 'تشغيل'}
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6 fill-current" />
                  ) : (
                    <Play className="w-6 h-6 fill-current ml-0.5" />
                  )}
                </button>

                {/* Next button */}
                <button
                  type="button"
                  id="landscape-next-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    resetHideTimer();
                    onNext?.();
                  }}
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-black/60 hover:bg-black/80 text-stone-200 hover:text-white border border-stone-700/60 flex items-center justify-center transition active:scale-95 cursor-pointer shadow-md"
                  aria-label="التالي"
                  title="التالي"
                >
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>

              {/* Secondary Controls: Love, Loop, Bottom Exit */}
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Love (Heart) button */}
                <button
                  type="button"
                  id="landscape-love-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    resetHideTimer();
                    onToggleLove?.();
                  }}
                  className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center transition active:scale-95 cursor-pointer border ${
                    isLoved
                      ? 'bg-rose-500/25 text-rose-400 border-rose-500/50 ring-2 ring-rose-500/30'
                      : 'bg-black/60 hover:bg-rose-950/40 hover:text-rose-400 text-stone-300 border-stone-700/60'
                  }`}
                  aria-label={isLoved ? 'إلغاء الإعجاب' : 'إعجاب / مفضلة'}
                  title={isLoved ? 'إلغاء الإعجاب' : 'إعجاب / مفضلة'}
                >
                  <Heart
                    className={`w-5 h-5 ${
                      isLoved ? 'fill-rose-500 text-rose-500' : 'text-stone-300'
                    }`}
                  />
                </button>

                {/* Loop toggle button */}
                <button
                  type="button"
                  id="landscape-loop-toggle-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    resetHideTimer();
                    onToggleLoop();
                  }}
                  className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-full border transition active:scale-95 cursor-pointer flex items-center justify-center ${
                    isLooping
                      ? 'bg-amber-500/30 text-amber-300 border-amber-400 shadow-md ring-2 ring-amber-400/30'
                      : 'bg-black/60 hover:bg-black/80 text-stone-300 border-stone-700/60'
                  }`}
                  aria-label="تكرار الفيديو"
                  title={isLooping ? 'التكرار مفعل' : 'تفعيل التكرار'}
                >
                  <Repeat className="w-5 h-5" />
                </button>

                {/* Bottom Exit Fullscreen shortcut */}
                <button
                  type="button"
                  id="landscape-exit-fullscreen-bottom-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExitFullscreen();
                  }}
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-black/60 hover:bg-black/80 text-stone-300 hover:text-white border border-stone-700/60 flex items-center justify-center transition active:scale-95 cursor-pointer"
                  aria-label="إنهاء ملء الشاشة"
                  title="إنهاء ملء الشاشة"
                >
                  <Minimize2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandscapeShell;
