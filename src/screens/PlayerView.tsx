import React, { useRef, useEffect, useState, useCallback } from 'react';
import YouTube, { YouTubeProps } from 'react-youtube';
import type { YouTubePlayer } from 'react-youtube';
import {
  ArrowRight,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Settings,
  Heart,
  SquarePlay,
  Maximize2,
  EyeOff,
  Ban,
  Bookmark,
} from 'lucide-react';
import { LandscapeShell } from './LandscapeShell';

interface PlayerViewProps {
  videoId: string;
  videoTitle?: string;
  channelTitle?: string;
  onClose: () => void;
  onEnded: () => void;
  forceStop?: boolean;
}

export const PlayerView: React.FC<PlayerViewProps> = ({
  videoId,
  videoTitle,
  channelTitle,
  onClose,
  onEnded,
  forceStop,
}) => {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [testForceStop, setTestForceStop] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLooping, setIsLooping] = useState(false);

  const effectiveForceStop = forceStop || testForceStop;

  const handleTogglePlay = useCallback(() => {
    if (!playerRef.current) return;
    try {
      if (isPlaying) {
        playerRef.current.pauseVideo?.();
        setIsPlaying(false);
      } else {
        playerRef.current.playVideo?.();
        setIsPlaying(true);
      }
    } catch (err) {
      console.warn('handleTogglePlay failed:', err);
    }
  }, [isPlaying]);

  const handleToggleLoop = useCallback(() => {
    setIsLooping((prev) => !prev);
  }, []);

  const handleExitFullscreen = useCallback(async () => {
    setIsFullscreen(false);

    try {
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        if (typeof document.exitFullscreen === 'function') {
          await document.exitFullscreen().catch(() => {});
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('exitFullscreen error:', err);
    }

    try {
      if (screen.orientation && typeof (screen.orientation as any).unlock === 'function') {
        (screen.orientation as any).unlock();
      }
    } catch (err) {
      console.warn('screen.orientation.unlock not supported:', err);
    }
  }, []);

  const handleEnterFullscreen = useCallback(async () => {
    setIsFullscreen(true);
    const el = videoContainerRef.current;
    if (el) {
      try {
        if (typeof el.requestFullscreen === 'function' && !document.fullscreenElement) {
          await el.requestFullscreen().catch(() => {});
        } else if ((el as any).webkitRequestFullscreen && !(document as any).webkitFullscreenElement) {
          (el as any).webkitRequestFullscreen();
        }
      } catch (err) {
        console.warn('requestFullscreen error:', err);
      }
    }

    // Orientation lock attempt (landscape) - wrap in try/catch without visible errors
    try {
      if (screen.orientation && typeof (screen.orientation as any).lock === 'function') {
        await (screen.orientation as any).lock('landscape').catch(() => {});
      }
    } catch (err) {
      console.warn('screen.orientation.lock not supported:', err);
    }
  }, []);

  // Listen to fullscreen changes, Escape key, and orientation changes
  useEffect(() => {
    const onFullscreenChange = () => {
      const isNowFs = Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement);
      if (!isNowFs) {
        setIsFullscreen(false);
        try {
          if (screen.orientation && typeof (screen.orientation as any).unlock === 'function') {
            (screen.orientation as any).unlock();
          }
        } catch {
          // ignore
        }
      } else {
        setIsFullscreen(true);
      }
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        handleExitFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const handleOrientationChange = () => {
      if (screen.orientation?.type?.startsWith('portrait') && isFullscreen) {
        handleExitFullscreen();
      }
    };
    screen.orientation?.addEventListener?.('change', handleOrientationChange);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
      screen.orientation?.removeEventListener?.('change', handleOrientationChange);
    };
  }, [isFullscreen, handleExitFullscreen]);

  // Force stop video playback immediately when forceStop turns true, and exit fullscreen if active
  useEffect(() => {
    if (effectiveForceStop) {
      if (playerRef.current) {
        try {
          playerRef.current.stopVideo?.();
        } catch (err) {
          console.warn('Failed to stop video on forceStop signal:', err);
        }
      }
      if (isFullscreen) {
        handleExitFullscreen();
      }
    }
  }, [effectiveForceStop, isFullscreen, handleExitFullscreen]);

  // Clean up playback and fullscreen on unmount
  useEffect(() => {
    return () => {
      try {
        playerRef.current?.stopVideo?.();
      } catch {
        // ignore
      }
      try {
        if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
          document.exitFullscreen().catch(() => {});
        }
      } catch {
        // ignore
      }
    };
  }, []);

  const handleReady: YouTubeProps['onReady'] = (event) => {
    playerRef.current = event.target;
  };

  const handleStateChange: YouTubeProps['onStateChange'] = (event) => {
    // 1: PLAYING
    if (event.data === 1) {
      setIsPlaying(true);
    }
    // 2: PAUSED
    else if (event.data === 2) {
      setIsPlaying(false);
    }
    // 0: ENDED
    else if (event.data === 0) {
      if (isLooping) {
        try {
          event.target?.seekTo?.(0, true);
          event.target?.playVideo?.();
          setIsPlaying(true);
        } catch {
          // ignore
        }
      } else {
        setIsPlaying(false);
        try {
          event.target?.stopVideo?.();
        } catch {
          // ignore
        }
        onEnded();
      }
    }
  };

  const handleClose = () => {
    if (isFullscreen) {
      handleExitFullscreen();
    }
    onClose();
  };

  return (
    <div
      id="youngtube-player-view"
      dir="rtl"
      className="fixed inset-0 z-50 bg-stone-950 text-white flex flex-col h-screen w-screen overflow-hidden select-none"
    >
      {/* ================= TOP HALF / VIDEO AREA ================= */}
      <div
        className={
          isFullscreen
            ? 'fixed inset-0 z-50 w-full h-full bg-black overflow-hidden'
            : 'flex-1 flex flex-col min-h-0 bg-stone-900 border-b border-stone-800'
        }
      >
        {/* Top Quarter (~25% of top half): Meta & Parent Actions (Portrait only) */}
        {!isFullscreen && (
          <div className="h-[25%] p-3 sm:p-4 bg-stone-900 flex items-center justify-between border-b border-stone-800/80 gap-3">
            {/* Back/Close button (top-left / start in RTL) */}
            <button
              type="button"
              id="player-close-btn"
              onClick={handleClose}
              className="w-10 h-10 rounded-full bg-stone-800 hover:bg-stone-700 flex items-center justify-center text-stone-300 transition shrink-0 cursor-pointer"
              aria-label="إغلاق المشغل"
            >
              <ArrowRight className="w-5 h-5" />
            </button>

            {/* Title & Channel Info */}
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-sm sm:text-base text-stone-100 truncate">
                {videoTitle || 'فيديو أطفال ممتع'}
              </h2>
              <p className="text-xs text-stone-400 truncate">
                {channelTitle || 'قناة أطفال موثوقة'}
              </p>
            </div>

            {/* Parent Action Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                id="player-parent-hide-btn"
                onClick={() => {
                  /* TODO: Hide video action */
                }}
                className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs text-rose-300 font-medium flex items-center gap-1 border border-stone-700/50 transition cursor-pointer"
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
                className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs text-amber-300 font-medium flex items-center gap-1 border border-stone-700/50 transition cursor-pointer"
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
                className="px-2.5 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs text-indigo-300 font-medium flex items-center gap-1 border border-stone-700/50 transition cursor-pointer"
                title="حفظ في المفضلة للأهل"
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>حفظ</span>
              </button>
              <button
                type="button"
                id="player-test-forcestop-btn"
                onClick={() => {
                  const nextState = !testForceStop;
                  setTestForceStop(nextState);
                  if (nextState && playerRef.current) {
                    try {
                      playerRef.current.stopVideo?.();
                    } catch (e) {
                      console.warn(e);
                    }
                  }
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 border transition cursor-pointer shrink-0 ${
                  effectiveForceStop
                    ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-500 shadow-md'
                    : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/50'
                }`}
                title="اختبار إيقاف الفيديو الفوري عبر خاصية forceStop"
              >
                <span>{effectiveForceStop ? '⛔ تم إيقاف المشغل (forceStop)' : '⚡ تجربة forceStop'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Video Area: The ONE persistent video container in DOM */}
        <div
          ref={videoContainerRef}
          id="player-video-container"
          className={
            isFullscreen
              ? 'w-full h-full relative bg-black flex items-center justify-center overflow-hidden'
              : 'h-[75%] relative bg-black w-full flex items-center justify-center overflow-hidden'
          }
        >
          {/* Exactly ONE YouTube Video Instance across entire lifetime */}
          <YouTube
            videoId={videoId}
            className="w-full h-full"
            iframeClassName="w-full h-full object-cover border-0 block"
            opts={{
              host: 'https://www.youtube-nocookie.com',
              width: '100%',
              height: '100%',
              playerVars: {
                rel: 0,
                modestbranding: 1,
                autoplay: 1,
                controls: 0,
                disablekb: 1,
                playsinline: 1,
              },
            }}
            onReady={handleReady}
            onStateChange={handleStateChange}
            onEnd={() => {
              if (isLooping) {
                try {
                  playerRef.current?.seekTo?.(0, true);
                  playerRef.current?.playVideo?.();
                  setIsPlaying(true);
                } catch {
                  // ignore
                }
              } else {
                setIsPlaying(false);
                try {
                  playerRef.current?.stopVideo?.();
                } catch {
                  // ignore
                }
                onEnded();
              }
            }}
          />

          {/* Landscape Shell Overlay when in Fullscreen */}
          {isFullscreen ? (
            <LandscapeShell
              isPlaying={isPlaying}
              isLooping={isLooping}
              onTogglePlay={handleTogglePlay}
              onToggleLoop={handleToggleLoop}
              onExitFullscreen={handleExitFullscreen}
            />
          ) : (
            /* Portrait Click-Shield & Fullscreen Button */
            <>
              <div
                id="player-click-shield"
                onClick={(e) => {
                  if (e.target !== e.currentTarget) return;
                }}
                className="absolute inset-0 z-10 bg-transparent cursor-pointer"
              />

              <button
                type="button"
                id="player-fullscreen-btn"
                className="absolute top-3 right-3 z-20 p-2.5 rounded-xl bg-black/60 hover:bg-black/80 text-stone-200 border border-stone-800 transition cursor-pointer"
                aria-label="ملء الشاشة"
                onClick={handleEnterFullscreen}
                title="عرض بملء الشاشة"
              >
                <Maximize2 className="w-5 h-5" />
              </button>
            </>
          )}

          {/* ForceStop Visual Banner */}
          {effectiveForceStop && (
            <div className="absolute inset-0 z-30 bg-black/80 flex flex-col items-center justify-center p-4 text-center select-none backdrop-blur-xs">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mb-2 border border-rose-500/40">
                <Ban className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-rose-200 mb-1">
                تم إيقاف الفيديو فورياً عبر إشارة الأمان (forceStop)
              </p>
              <p className="text-xs text-stone-400 mb-3 max-w-xs">
                تم استلام إشارة الإيقاف الإجباري وتم استدعاء stopVideo() بنجاح.
              </p>
              <button
                type="button"
                onClick={() => {
                  setTestForceStop(false);
                  try {
                    playerRef.current?.playVideo?.();
                    setIsPlaying(true);
                  } catch {
                    // ignore
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold border border-stone-600 transition cursor-pointer"
              >
                إلغاء فحص forceStop واستئناف الفيديو ▶
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ================= BOTTOM HALF (Portrait only) ================= */}
      {!isFullscreen && (
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

          {/* Controls Area: Two-tier hierarchy directly below the seek bar */}
          <div className="flex flex-col items-center justify-center gap-4 sm:gap-5 my-auto py-2">
            {/* Primary Row: Previous, Play/Pause, Next (visually grouped, Play/Pause dominant) */}
            <div
              dir="ltr"
              className="flex items-center justify-center gap-6 sm:gap-8"
            >
              {/* Previous (~32px icon, left) */}
              <button
                type="button"
                id="player-control-prev"
                className="w-12 h-12 min-w-[44px] min-h-[44px] rounded-full bg-stone-900/90 hover:bg-stone-800 flex items-center justify-center text-stone-300 hover:text-white transition active:scale-95 cursor-pointer shadow-sm"
                aria-label="السابق"
                onClick={() => {
                  /* TODO: Previous */
                }}
              >
                <SkipBack className="w-7 h-7 sm:w-8 sm:h-8" />
              </button>

              {/* Play/Pause (large ~64px circular button, visually dominant, center) */}
              <button
                type="button"
                id="player-control-play-pause"
                className="w-16 h-16 sm:w-20 sm:h-20 min-w-[64px] min-h-[64px] rounded-full bg-white hover:bg-stone-100 text-stone-950 flex items-center justify-center shadow-xl transition active:scale-95 cursor-pointer ring-4 ring-white/10 shrink-0"
                aria-label={isPlaying ? 'إيقاف مؤقت' : 'تشغيل'}
                onClick={handleTogglePlay}
              >
                {isPlaying ? (
                  <Pause className="w-8 h-8 sm:w-9 sm:h-9 fill-current" />
                ) : (
                  <Play className="w-8 h-8 sm:w-9 sm:h-9 fill-current ml-0.5" />
                )}
              </button>

              {/* Next (~32px icon, right) */}
              <button
                type="button"
                id="player-control-next"
                className="w-12 h-12 min-w-[44px] min-h-[44px] rounded-full bg-stone-900/90 hover:bg-stone-800 flex items-center justify-center text-stone-300 hover:text-white transition active:scale-95 cursor-pointer shadow-sm"
                aria-label="التالي"
                onClick={() => {
                  /* TODO: Next */
                }}
              >
                <SkipForward className="w-7 h-7 sm:w-8 sm:h-8" />
              </button>
            </div>

            {/* Secondary Row: Settings, Loop, Love, Autoplay (smaller, muted visual weight) */}
            <div className="flex items-center justify-center gap-6 sm:gap-8 text-stone-400">
              {/* Settings (consolidates quality, captions, speed) */}
              <button
                type="button"
                id="player-control-settings"
                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-stone-900/60 hover:bg-stone-800/80 hover:text-stone-200 flex items-center justify-center text-stone-400 transition cursor-pointer"
                aria-label="الإعدادات (السرعة، الجودة، الترجمة)"
                title="الإعدادات (السرعة، الجودة، الترجمة)"
                onClick={() => {
                  /* TODO: Settings sheet (Quality, Captions, Speed) */
                }}
              >
                <Settings className="w-5 h-5" />
              </button>

              {/* Loop Toggle */}
              <button
                type="button"
                id="player-control-loop"
                className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center transition cursor-pointer ${
                  isLooping
                    ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50 ring-2 ring-amber-400/20'
                    : 'bg-stone-900/60 hover:bg-stone-800/80 hover:text-stone-200 text-stone-400'
                }`}
                aria-label="تكرار التشغيل"
                title={isLooping ? 'تكرار التشغيل (مفعّل)' : 'تكرار التشغيل'}
                onClick={handleToggleLoop}
              >
                <Repeat className="w-5 h-5" />
              </button>

              {/* Love (Heart) */}
              <button
                type="button"
                id="player-control-love"
                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-stone-900/60 hover:bg-rose-950/40 hover:text-rose-400 flex items-center justify-center text-stone-400 transition cursor-pointer"
                aria-label="إعجاب / مفضلة"
                title="إعجاب / مفضلة"
                onClick={() => {
                  /* TODO: Love action */
                }}
              >
                <Heart className="w-5 h-5" />
              </button>

              {/* Autoplay Toggle */}
              <button
                type="button"
                id="player-control-autoplay"
                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-stone-900/60 hover:bg-stone-800/80 hover:text-stone-200 flex items-center justify-center text-stone-400 transition cursor-pointer"
                aria-label="التشغيل التلقائي"
                title="التشغيل التلقائي"
                onClick={() => {
                  /* TODO: Autoplay toggle */
                }}
              >
                <SquarePlay className="w-5 h-5" />
              </button>
            </div>
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
      )}
    </div>
  );
};
