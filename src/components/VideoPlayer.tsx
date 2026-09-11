import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  AlertTriangle,
  Loader2,
  Maximize,
  Minimize,
} from 'lucide-react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
  interface ScreenOrientation {
    lock?: (orientation: string) => Promise<void>;
  }
}

interface VideoPlayerProps {
  videoId: string;
  onEnded: () => void;
  className?: string;
}

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  if (window.YT && window.YT.Player) {
    return Promise.resolve();
  }

  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve) => {
      const existingScript = document.querySelector(
        'script[src*="youtube.com/iframe_api"]'
      );
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        if (firstScriptTag && firstScriptTag.parentNode) {
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        } else {
          document.head.appendChild(tag);
        }
      }

      const previousCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof previousCallback === 'function') {
          previousCallback();
        }
        resolve();
      };

      const interval = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }

  return ytApiPromise;
}

async function lockLandscape() {
  try {
    const orientation = screen.orientation as ScreenOrientation | undefined;
    if (orientation?.lock) {
      await orientation.lock('landscape');
    }
  } catch {
    // Not supported or requires gesture / fullscreen — ignore
  }
}

function unlockOrientation() {
  try {
    const orientation = screen.orientation as ScreenOrientation | undefined;
    orientation?.unlock?.();
  } catch {
    // ignore
  }
}

/**
 * Safe kids player with custom fullscreen → landscape.
 * Native YouTube controls disabled to prevent outbound links.
 */
export default function VideoPlayer({
  videoId,
  onEnded,
  className = '',
}: VideoPlayerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [loadingApi, setLoadingApi] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bumpControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3200);
  }, []);

  const togglePlay = useCallback(
    (e?: React.MouseEvent | React.SyntheticEvent) => {
      e?.stopPropagation();
      const player = playerRef.current;
      if (!player) return;
      try {
        const state = player.getPlayerState?.();
        if (state === 1) {
          player.pauseVideo();
          setIsPlaying(false);
          setShowControls(true);
        } else {
          player.playVideo();
          setIsPlaying(true);
          bumpControls();
        }
      } catch {
        // ignore
      }
    },
    [bumpControls]
  );

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
    unlockOrientation();
    setIsFullscreen(false);
  }, []);

  const enterFullscreen = useCallback(async () => {
    const el = wrapperRef.current;
    if (!el) return;
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if ((el as any).webkitRequestFullscreen) {
        await (el as any).webkitRequestFullscreen();
      }
      setIsFullscreen(true);
      // Lock to landscape after fullscreen (best effort on mobile)
      await lockLandscape();
      // Keep playing if it was playing
      try {
        playerRef.current?.playVideo?.();
        setIsPlaying(true);
      } catch {
        // ignore
      }
      bumpControls();
    } catch (err) {
      console.warn('Fullscreen failed:', err);
    }
  }, [bumpControls]);

  const toggleFullscreen = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (document.fullscreenElement) {
        await exitFullscreen();
      } else {
        await enterFullscreen();
      }
    },
    [enterFullscreen, exitFullscreen]
  );

  // Sync state with browser fullscreen changes (e.g. user presses Back)
  useEffect(() => {
    const onFsChange = () => {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);
      if (!active) {
        unlockOrientation();
      } else {
        void lockLandscape();
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange as any);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange as any);
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function initPlayer() {
      if (!videoId) return;
      setLoadingApi(true);
      setError(null);
      setIsPlaying(false);
      setShowControls(true);

      try {
        await loadYouTubeIframeApi();

        if (isCancelled || !containerRef.current) return;

        if (playerRef.current) {
          try {
            playerRef.current.destroy();
          } catch {
            // ignore
          }
          playerRef.current = null;
        }

        containerRef.current.innerHTML = '';
        const playerDiv = document.createElement('div');
        playerDiv.id = `yt-player-${videoId}-${Math.random().toString(36).slice(2, 7)}`;
        containerRef.current.appendChild(playerDiv);

        playerRef.current = new window.YT.Player(playerDiv.id, {
          height: '100%',
          width: '100%',
          videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            controls: 0,
            disablekb: 1,
            // Native YT fullscreen disabled — we use our own landscape fullscreen
            fs: 0,
            iv_load_policy: 3,
            rel: 0,
            modestbranding: 1,
            autoplay: 1,
            playsinline: 1,
            enablejsapi: 1,
            cc_load_policy: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (event: any) => {
              if (isCancelled) return;
              setLoadingApi(false);
              try {
                event.target.playVideo();
                setIsPlaying(true);
                bumpControls();
              } catch {
                setShowControls(true);
              }
            },
            onStateChange: (event: any) => {
              if (isCancelled) return;
              const YT = window.YT?.PlayerState;
              const data = event.data;

              if (data === 0 || data === YT?.ENDED) {
                setIsPlaying(false);
                // Exit fullscreen on end so our end-screen shows properly
                if (document.fullscreenElement) {
                  void document.exitFullscreen?.();
                  unlockOrientation();
                  setIsFullscreen(false);
                }
                onEndedRef.current?.();
                return;
              }
              if (data === 1 || data === YT?.PLAYING) {
                setIsPlaying(true);
                bumpControls();
              }
              if (data === 2 || data === YT?.PAUSED) {
                setIsPlaying(false);
                setShowControls(true);
              }
            },
            onError: (event: any) => {
              if (isCancelled) return;
              setLoadingApi(false);
              setError(`تعذر تشغيل الفيديو (رمز الخطأ: ${event.data})`);
            },
          },
        });
      } catch (err) {
        if (!isCancelled) {
          setLoadingApi(false);
          setError(
            err instanceof Error ? err.message : 'فشل تحميل مشغل يوتيوب'
          );
        }
      }
    }

    initPlayer();

    return () => {
      isCancelled = true;
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      unlockOrientation();
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }
    };
  }, [videoId, bumpControls]);

  return (
    <div
      ref={wrapperRef}
      id="video-player-wrapper"
      className={`relative w-full h-full min-h-0 aspect-video overflow-hidden bg-black rounded-none shadow-none ${
        isFullscreen ? '!aspect-auto !fixed !inset-0 !z-[100] !w-screen !h-screen' : ''
      } ${className}`}
      onClick={bumpControls}
    >
      {/* iframe mount */}
      <div
        ref={containerRef}
        className="absolute inset-0 w-full h-full [&>div]:!w-full [&>div]:!h-full [&>iframe]:!w-full [&>iframe]:!h-full"
      />

      {/* Click shields — block outbound YouTube UI */}
      <div
        className="absolute top-0 inset-x-0 h-14 z-20"
        style={{ pointerEvents: 'auto' }}
        onClick={(e) => e.stopPropagation()}
        aria-hidden
      />
      <div
        className="absolute bottom-0 inset-x-0 h-16 z-20"
        style={{ pointerEvents: 'auto' }}
        onClick={(e) => e.stopPropagation()}
        aria-hidden
      />
      <div
        className="absolute bottom-0 right-0 w-28 h-20 z-30"
        style={{ pointerEvents: 'auto' }}
        onClick={(e) => e.stopPropagation()}
        aria-hidden
      />
      <div
        className="absolute bottom-0 left-0 w-28 h-20 z-30"
        style={{ pointerEvents: 'auto' }}
        onClick={(e) => e.stopPropagation()}
        aria-hidden
      />

      {/* Center tap = play/pause */}
      <button
        type="button"
        id="safe-play-toggle"
        className="absolute inset-0 z-10 flex items-center justify-center bg-transparent border-0 cursor-pointer"
        onClick={togglePlay}
        aria-label={isPlaying ? 'إيقاف' : 'تشغيل'}
      >
        {showControls && !loadingApi && !error && (
          <span className="w-16 h-16 rounded-full bg-black/55 text-white flex items-center justify-center backdrop-blur-sm shadow-lg pointer-events-none">
            {isPlaying ? (
              <Pause className="w-7 h-7 fill-current" />
            ) : (
              <Play className="w-7 h-7 fill-current translate-x-0.5" />
            )}
          </span>
        )}
      </button>

      {/* Custom fullscreen → landscape button */}
      {showControls && !loadingApi && !error && (
        <button
          type="button"
          id="safe-fullscreen-btn"
          onClick={toggleFullscreen}
          className="absolute bottom-3 left-3 z-40 flex items-center gap-1.5 px-3 py-2 rounded-full bg-black/65 hover:bg-black/80 text-white text-xs font-semibold backdrop-blur-sm border border-white/15 cursor-pointer"
          aria-label={isFullscreen ? 'خروج من ملء الشاشة' : 'ملء الشاشة أفقي'}
        >
          {isFullscreen ? (
            <>
              <Minimize className="w-4 h-4" />
              <span>تصغير</span>
            </>
          ) : (
            <>
              <Maximize className="w-4 h-4" />
              <span>ملء الشاشة</span>
            </>
          )}
        </button>
      )}

      {loadingApi && (
        <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center text-white gap-2 pointer-events-none z-50">
          <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
          <span className="text-xs font-medium text-slate-300">
            جاري تجهيز المشغل الآمن...
          </span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center text-white p-4 text-center gap-2 z-50">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
          <p className="text-xs text-amber-200">{error}</p>
        </div>
      )}
    </div>
  );
}
