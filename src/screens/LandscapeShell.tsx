import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Repeat, Minimize2 } from 'lucide-react';

export interface LandscapeShellProps {
  children?: React.ReactNode;
  isPlaying: boolean;
  isLooping: boolean;
  onTogglePlay: () => void;
  onToggleLoop: () => void;
  onExitFullscreen: () => void;
}

export const LandscapeShell: React.FC<LandscapeShellProps> = ({
  children,
  isPlaying,
  isLooping,
  onTogglePlay,
  onToggleLoop,
  onExitFullscreen,
}) => {
  const [showOverlay, setShowOverlay] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      setShowOverlay(false);
    }, 3500);
  }, []);

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

      {/* Transparent Click-Shield Layer: anti-leak protection + tap to toggle overlay */}
      <div
        id="landscape-click-shield"
        onClick={handleShieldClick}
        className="absolute inset-0 z-10 bg-transparent cursor-pointer"
        aria-label="تبديل عناصر التحكم"
      />

      {/* Minimal Overlay: exactly 3 things */}
      {showOverlay && (
        <div
          id="landscape-controls-overlay"
          className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-between p-4 sm:p-6 bg-gradient-to-b from-black/60 via-transparent to-black/60 transition-opacity duration-200"
        >
          {/* Top Bar: Exit Fullscreen button (corner) */}
          <div className="flex items-center justify-between w-full pointer-events-auto">
            <button
              type="button"
              id="landscape-exit-fullscreen-btn"
              onClick={(e) => {
                e.stopPropagation();
                onExitFullscreen();
              }}
              className="p-3 rounded-2xl bg-black/60 hover:bg-black/80 text-stone-200 border border-stone-700/60 shadow-lg transition active:scale-95 cursor-pointer flex items-center gap-2 text-xs font-semibold"
              aria-label="إنهاء ملء الشاشة"
              title="إنهاء ملء الشاشة"
            >
              <Minimize2 className="w-5 h-5 text-stone-200" />
              <span className="hidden sm:inline">إنهاء العرض الكامل</span>
            </button>
          </div>

          {/* Center: Play/Pause button (large, center) */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <button
              type="button"
              id="landscape-play-pause-btn"
              onClick={(e) => {
                e.stopPropagation();
                resetHideTimer();
                onTogglePlay();
              }}
              className="w-18 h-18 sm:w-20 sm:h-20 min-w-[64px] min-h-[64px] rounded-full bg-white/95 hover:bg-white text-stone-950 flex items-center justify-center shadow-2xl transition active:scale-95 cursor-pointer ring-4 ring-white/20 pointer-events-auto"
              aria-label={isPlaying ? 'إيقاف مؤقت' : 'تشغيل'}
              title={isPlaying ? 'إيقاف مؤقت' : 'تشغيل'}
            >
              {isPlaying ? (
                <Pause className="w-9 h-9 fill-current" />
              ) : (
                <Play className="w-9 h-9 fill-current ml-1" />
              )}
            </button>
          </div>

          {/* Bottom Bar: Loop Toggle (small) */}
          <div className="flex items-center justify-end w-full pointer-events-auto">
            <button
              type="button"
              id="landscape-loop-toggle-btn"
              onClick={(e) => {
                e.stopPropagation();
                resetHideTimer();
                onToggleLoop();
              }}
              className={`p-3 rounded-2xl border transition active:scale-95 cursor-pointer flex items-center gap-2 text-xs font-semibold ${
                isLooping
                  ? 'bg-amber-500/30 text-amber-300 border-amber-400 shadow-md ring-2 ring-amber-400/30'
                  : 'bg-black/60 hover:bg-black/80 text-stone-300 border-stone-700/60'
              }`}
              aria-label="تكرار الفيديو"
              title={isLooping ? 'التكرار مفعل' : 'تفعيل التكرار'}
            >
              <Repeat className="w-5 h-5" />
              <span className="text-xs">{isLooping ? 'التكرار: مفعل' : 'تكرار'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandscapeShell;
