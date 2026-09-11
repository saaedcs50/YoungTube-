import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  AlertTriangle,
  Loader2,
  Maximize,
  Minimize,
  Settings,
  Repeat,
  Check,
  X,
  Cast,
} from 'lucide-react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
    cast?: any;
    chrome?: any;
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
  if (window.YT && window.YT.Player) return Promise.resolve();

  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve) => {
      const existingScript = document.querySelector(
        'script[src*="youtube.com/iframe_api"]'
      );
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        if (firstScriptTag?.parentNode) {
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        } else {
          document.head.appendChild(tag);
        }
      }

      const previousCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof previousCallback === 'function') previousCallback();
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
    if (orientation?.lock) await orientation.lock('landscape');
  } catch {
    // ignore
  }
}

function unlockOrientation() {
  try {
    (screen.orientation as ScreenOrientation | undefined)?.unlock?.();
  } catch {
    // ignore
  }
}

let castLoaderPromise: Promise<boolean> | null = null;

/** Load Google Cast sender framework (best-effort). */
function loadCastFramework(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.cast?.framework) return Promise.resolve(true);

  if (!castLoaderPromise) {
    castLoaderPromise = new Promise((resolve) => {
      const previous = window.__onGCastApiAvailable;
      window.__onGCastApiAvailable = (isAvailable: boolean) => {
        if (typeof previous === 'function') previous(isAvailable);
        if (!isAvailable) {
          resolve(false);
          return;
        }
        try {
          const ctx = window.cast.framework.CastContext.getInstance();
          ctx.setOptions({
            // Default media receiver — best-effort for discovery/session
            receiverApplicationId:
              window.chrome?.cast?.media?.DEFAULT_MEDIA_RECEIVER_APP_ID ||
              'CC1AD845',
            autoJoinPolicy:
              window.chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED ||
              'origin_scoped',
          });
          resolve(true);
        } catch {
          resolve(false);
        }
      };

      if (!document.querySelector('script[src*="cast_sender.js"]')) {
        const s = document.createElement('script');
        s.src =
          'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
        s.async = true;
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
      }

      // Timeout if Cast never becomes available (desktop without Cast, iOS, etc.)
      setTimeout(() => resolve(!!window.cast?.framework), 5000);
    });
  }

  return castLoaderPromise;
}

const QUALITY_LABELS: Record<string, string> = {
  highres: 'عالية جدًا',
  hd1080: '1080p',
  hd720: '720p',
  large: '480p',
  medium: '360p',
  small: '240p',
  tiny: '144p',
  auto: 'تلقائي',
  default: 'تلقائي',
};

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

  // Loop + quality
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [qualities, setQualities] = useState<string[]>([]);
  const [currentQuality, setCurrentQuality] = useState<string>('auto');

  // Cast
  type CastUiState = 'idle' | 'unavailable' | 'connecting' | 'connected' | 'error';
  const [castState, setCastState] = useState<CastUiState>('idle');
  const [castMessage, setCastMessage] = useState<string | null>(null);

  const onEndedRef = useRef(onEnded);
  const loopEnabledRef = useRef(loopEnabled);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);
  useEffect(() => {
    loopEnabledRef.current = loopEnabled;
  }, [loopEnabled]);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bumpControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    // Don't auto-hide while settings panel is open
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls((prev) => {
        // settingsOpen read via closure — panel keeps controls visible via separate effect
        return prev;
      });
      setShowControls(false);
    }, 4000);
  }, []);

  // Keep controls visible while settings open
  useEffect(() => {
    if (settingsOpen) {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }
  }, [settingsOpen]);

  const refreshQualities = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    try {
      const levels: string[] =
        player.getAvailableQualityLevels?.() || [];
      if (levels.length) {
        // Put auto first if present
        const sorted = [...levels];
        setQualities(sorted);
      }
      const q = player.getPlaybackQuality?.() || 'auto';
      setCurrentQuality(q);
    } catch {
      // Quality API may be unavailable
    }
  }, []);

  const setQuality = useCallback((q: string) => {
    const player = playerRef.current;
    if (!player) return;
    try {
      // setPlaybackQuality is soft-deprecated but still works on many devices
      player.setPlaybackQuality?.(q);
      // Preferred on newer API when available
      player.setPlaybackQualityRange?.(q, q);
      setCurrentQuality(q);
    } catch {
      // ignore
    }
    setSettingsOpen(false);
    bumpControls();
  }, [bumpControls]);

  const toggleLoop = useCallback(() => {
    setLoopEnabled((v) => !v);
    bumpControls();
  }, [bumpControls]);

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
      if (document.fullscreenElement) await document.exitFullscreen();
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
      if (el.requestFullscreen) await el.requestFullscreen();
      else if ((el as any).webkitRequestFullscreen) {
        await (el as any).webkitRequestFullscreen();
      }
      setIsFullscreen(true);
      await lockLandscape();
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
      if (document.fullscreenElement) await exitFullscreen();
      else await enterFullscreen();
    },
    [enterFullscreen, exitFullscreen]
  );

  // Probe Cast availability once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await loadCastFramework();
      if (cancelled) return;
      if (!ok) {
        setCastState('unavailable');
        return;
      }
      try {
        const ctx = window.cast.framework.CastContext.getInstance();
        const state = ctx.getCastState?.();
        // NO_DEVICES_AVAILABLE = 'NO_DEVICES_AVAILABLE'
        if (state === 'NO_DEVICES_AVAILABLE') {
          setCastState('unavailable');
        } else {
          setCastState('idle');
        }
        const onCastState = () => {
          const s = ctx.getCastState?.();
          const session = ctx.getCurrentSession?.();
          if (session) setCastState('connected');
          else if (s === 'NO_DEVICES_AVAILABLE') setCastState('unavailable');
          else setCastState('idle');
        };
        ctx.addEventListener(
          window.cast.framework.CastContextEventType.CAST_STATE_CHANGED,
          onCastState
        );
        ctx.addEventListener(
          window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
          onCastState
        );
      } catch {
        setCastState('unavailable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCastClick = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      setCastMessage(null);
      bumpControls();

      const ok = await loadCastFramework();
      if (!ok || !window.cast?.framework) {
        setCastState('unavailable');
        setCastMessage(
          'البث غير متاح على هذا الجهاز/المتصفح. جرّب Chrome على Android مع جهاز Chromecast أو تلفاز Google.'
        );
        return;
      }

      const ctx = window.cast.framework.CastContext.getInstance();
      const existing = ctx.getCurrentSession?.();

      // If already connected → end session
      if (existing) {
        try {
          await existing.endSession(true);
        } catch {
          // ignore
        }
        setCastState('idle');
        setCastMessage('تم إيقاف البث');
        return;
      }

      setCastState('connecting');
      try {
        await ctx.requestSession();
        const session = ctx.getCurrentSession();
        if (!session) {
          setCastState('idle');
          setCastMessage('لم يتم اختيار جهاز');
          return;
        }

        setCastState('connected');

        // Best-effort: load YouTube watch URL on the receiver.
        // Official YouTube Cast receiver is restricted to Google apps;
        // Default Media Receiver may reject this — we still try and report status.
        const chromeCast = window.chrome?.cast;
        if (chromeCast?.media && videoId) {
          try {
            const mediaInfo = new chromeCast.media.MediaInfo(
              `https://www.youtube.com/watch?v=${videoId}`,
              'video/mp4'
            );
            mediaInfo.metadata = new chromeCast.media.GenericMediaMetadata();
            mediaInfo.metadata.title = 'يوتيوب الأطفال — مشاهدة آمنة';
            mediaInfo.metadata.images = [
              {
                url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              },
            ];
            const request = new chromeCast.media.LoadRequest(mediaInfo);
            request.autoplay = true;
            await session.loadMedia(request);
            setCastMessage('جاري البث على التلفاز...');
            // Pause local playback to avoid double audio when cast works
            try {
              playerRef.current?.pauseVideo?.();
              setIsPlaying(false);
            } catch {
              // ignore
            }
          } catch (loadErr) {
            console.warn('Cast loadMedia failed:', loadErr);
            setCastMessage(
              'تم الاتصال بالجهاز. بث يوتيوب المباشر من المتصفح محدود من جوجل — إن لم يظهر الفيديو على التلفاز، هذا قيد من يوتيوب وليس من التطبيق.'
            );
          }
        } else {
          setCastMessage('تم الاتصال بجهاز البث');
        }
      } catch (err: any) {
        // User cancelled device picker, or no devices
        const cancelled =
          err === 'cancel' ||
          err?.code === 'cancel' ||
          String(err?.description || err?.message || err)
            .toLowerCase()
            .includes('cancel');
        setCastState('idle');
        if (!cancelled) {
          setCastMessage(
            'تعذر بدء البث. تأكد أن التلفاز/Chromecast على نفس الشبكة.'
          );
          setCastState('error');
        }
      }
    },
    [bumpControls, videoId]
  );

  useEffect(() => {
    const onFsChange = () => {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);
      if (!active) unlockOrientation();
      else void lockLandscape();
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
      setSettingsOpen(false);
      setQualities([]);
      setCurrentQuality('auto');

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
                // Quality levels often available shortly after ready
                setTimeout(() => refreshQualities(), 500);
                setTimeout(() => refreshQualities(), 1500);
              } catch {
                setShowControls(true);
              }
            },
            onStateChange: (event: any) => {
              if (isCancelled) return;
              const YT = window.YT?.PlayerState;
              const data = event.data;

              if (data === 0 || data === YT?.ENDED) {
                // Loop: replay same video instead of leaving to suggestions
                if (loopEnabledRef.current) {
                  try {
                    event.target.seekTo(0, true);
                    event.target.playVideo();
                    setIsPlaying(true);
                    bumpControls();
                  } catch {
                    onEndedRef.current?.();
                  }
                  return;
                }

                setIsPlaying(false);
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
                refreshQualities();
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
  }, [videoId, bumpControls, refreshQualities]);

  return (
    <div
      ref={wrapperRef}
      id="video-player-wrapper"
      className={`relative w-full h-full min-h-0 aspect-video overflow-hidden bg-black rounded-none shadow-none ${
        isFullscreen ? '!aspect-auto !fixed !inset-0 !z-[100] !w-screen !h-screen' : ''
      } ${className}`}
      onClick={() => {
        if (settingsOpen) setSettingsOpen(false);
        else bumpControls();
      }}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 w-full h-full [&>div]:!w-full [&>div]:!h-full [&>iframe]:!w-full [&>iframe]:!h-full"
      />

      {/* Click shields against outbound YouTube UI */}
      <div
        className="absolute top-0 inset-x-0 h-14 z-20"
        onClick={(e) => e.stopPropagation()}
        aria-hidden
      />
      <div
        className="absolute bottom-0 inset-x-0 h-14 z-20"
        onClick={(e) => e.stopPropagation()}
        aria-hidden
      />
      <div
        className="absolute bottom-0 right-0 w-28 h-20 z-30"
        onClick={(e) => e.stopPropagation()}
        aria-hidden
      />
      <div
        className="absolute bottom-0 left-0 w-28 h-20 z-30"
        onClick={(e) => e.stopPropagation()}
        aria-hidden
      />

      {/* Center play/pause */}
      <button
        type="button"
        id="safe-play-toggle"
        className="absolute inset-0 z-10 flex items-center justify-center bg-transparent border-0 cursor-pointer"
        onClick={togglePlay}
        aria-label={isPlaying ? 'إيقاف' : 'تشغيل'}
      >
        {showControls && !loadingApi && !error && !settingsOpen && (
          <span className="w-16 h-16 rounded-full bg-black/55 text-white flex items-center justify-center backdrop-blur-sm shadow-lg pointer-events-none">
            {isPlaying ? (
              <Pause className="w-7 h-7 fill-current" />
            ) : (
              <Play className="w-7 h-7 fill-current translate-x-0.5" />
            )}
          </span>
        )}
      </button>

      {/* Bottom control bar */}
      {showControls && !loadingApi && !error && (
        <div
          className="absolute bottom-0 inset-x-0 z-40 flex items-center justify-between gap-2 px-3 py-2.5 bg-gradient-to-t from-black/80 to-transparent"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Loop toggle */}
          <button
            type="button"
            id="safe-loop-btn"
            onClick={toggleLoop}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold border cursor-pointer transition ${
              loopEnabled
                ? 'bg-sky-500/90 text-white border-sky-400'
                : 'bg-black/55 text-white border-white/15 hover:bg-black/70'
            }`}
            aria-pressed={loopEnabled}
            title="تكرار الفيديو"
          >
            <Repeat className="w-4 h-4" />
            <span>{loopEnabled ? 'تكرار: تشغيل' : 'تكرار'}</span>
          </button>

          <div className="flex items-center gap-2">
            {/* Cast */}
            <button
              type="button"
              id="safe-cast-btn"
              onClick={handleCastClick}
              disabled={castState === 'connecting'}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold border cursor-pointer transition disabled:opacity-60 ${
                castState === 'connected'
                  ? 'bg-sky-500/90 text-white border-sky-400'
                  : castState === 'unavailable'
                    ? 'bg-black/40 text-white/50 border-white/10'
                    : 'bg-black/55 hover:bg-black/70 text-white border-white/15'
              }`}
              aria-label="بث إلى التلفاز"
              title={
                castState === 'unavailable'
                  ? 'البث غير متاح على هذا الجهاز'
                  : castState === 'connected'
                    ? 'إيقاف البث'
                    : 'Cast / بث'
              }
            >
              <Cast className={`w-4 h-4 ${castState === 'connecting' ? 'animate-pulse' : ''}`} />
              <span className="hidden sm:inline">
                {castState === 'connecting'
                  ? 'جاري الاتصال...'
                  : castState === 'connected'
                    ? 'متصل'
                    : 'Cast'}
              </span>
            </button>

            {/* Settings (quality) */}
            <button
              type="button"
              id="safe-settings-btn"
              onClick={(e) => {
                e.stopPropagation();
                refreshQualities();
                setSettingsOpen((v) => !v);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-black/55 hover:bg-black/70 text-white text-xs font-semibold border border-white/15 cursor-pointer"
              aria-label="الإعدادات"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">
                {QUALITY_LABELS[currentQuality] || currentQuality}
              </span>
            </button>

            {/* Fullscreen landscape */}
            <button
              type="button"
              id="safe-fullscreen-btn"
              onClick={toggleFullscreen}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-black/55 hover:bg-black/70 text-white text-xs font-semibold border border-white/15 cursor-pointer"
              aria-label={isFullscreen ? 'خروج من ملء الشاشة' : 'ملء الشاشة أفقي'}
            >
              {isFullscreen ? (
                <Minimize className="w-4 h-4" />
              ) : (
                <Maximize className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">
                {isFullscreen ? 'تصغير' : 'ملء الشاشة'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Settings panel — quality only (safe, no YouTube links) */}
      {settingsOpen && (
        <div
          id="safe-settings-panel"
          className="absolute bottom-14 inset-x-3 sm:inset-x-auto sm:right-3 sm:w-64 z-50 rounded-2xl bg-zinc-900/95 border border-white/10 shadow-2xl backdrop-blur-md overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/10">
            <span className="text-sm font-bold text-white">جودة الفيديو</span>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 cursor-pointer"
              aria-label="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="max-h-52 overflow-y-auto py-1">
            {qualities.length === 0 ? (
              <p className="px-3.5 py-3 text-xs text-white/50">
                الجودة تُضبط تلقائيًا حسب سرعة النت. القائمة هتظهر بعد بدء التشغيل إن دعمها الجهاز.
              </p>
            ) : (
              qualities.map((q) => {
                const active = q === currentQuality;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuality(q)}
                    className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm text-right cursor-pointer transition ${
                      active
                        ? 'bg-sky-500/20 text-sky-300'
                        : 'text-white/90 hover:bg-white/5'
                    }`}
                  >
                    <span className="font-medium">
                      {QUALITY_LABELS[q] || q}
                    </span>
                    {active && <Check className="w-4 h-4 text-sky-400 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          <div className="px-3.5 py-2 border-t border-white/10 flex items-center justify-between">
            <span className="text-[11px] text-white/45">تكرار الفيديو</span>
            <button
              type="button"
              onClick={toggleLoop}
              className={`relative w-11 h-6 rounded-full transition cursor-pointer ${
                loopEnabled ? 'bg-sky-500' : 'bg-white/20'
              }`}
              aria-pressed={loopEnabled}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition ${
                  loopEnabled ? 'right-0.5' : 'right-5'
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {castMessage && (
        <div
          className="absolute top-3 inset-x-3 z-[55] px-3 py-2 rounded-xl bg-zinc-900/95 border border-white/10 text-[11px] sm:text-xs text-white/90 text-center shadow-lg"
          onClick={(e) => {
            e.stopPropagation();
            setCastMessage(null);
          }}
          role="status"
        >
          {castMessage}
        </div>
      )}

      {loadingApi && (
        <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center text-white gap-2 pointer-events-none z-[60]">
          <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
          <span className="text-xs font-medium text-slate-300">
            جاري تجهيز المشغل الآمن...
          </span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center text-white p-4 text-center gap-2 z-[60]">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
          <p className="text-xs text-amber-200">{error}</p>
        </div>
      )}
    </div>
  );
}
