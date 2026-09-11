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
  Captions,
  Languages,
  FastForward,
  Flag,
  Ban,
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
    lock?(orientation: string): Promise<void>;
  }
}

interface VideoPlayerProps {
  videoId: string;
  onEnded: () => void;
  className?: string;
  title?: string;
  channelTitle?: string;
  /** Phase 3 — controlled autoplay (next video) */
  autoplay?: boolean;
  onAutoplayChange?: (value: boolean) => void;
  /** Phase 5 — parent safety tools */
  onRequestReport?: () => void;
  onRequestBlockChannel?: () => void;
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

const ALL_QUALITY_LEVELS = [
  'tiny',
  'small',
  'medium',
  'large',
  'hd720',
  'hd1080',
  'highres',
  'auto',
] as const;

type OptionsTab = 'main' | 'quality' | 'audio';

interface AudioTrackInfo {
  id: string;
  label: string;
  raw: any;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function trackLabel(t: any, index: number): string {
  if (!t) return `مسار ${index + 1}`;
  return (
    t.displayName ||
    t.name ||
    t.language ||
    t.languageCode ||
    t.id ||
    `مسار ${index + 1}`
  );
}

/**
 * Phase 1–3 player: Kids chrome + transparent options overlay.
 */
export default function VideoPlayer({
  videoId,
  onEnded,
  className = '',
  title,
  channelTitle,
  autoplay = false,
  onAutoplayChange,
  onRequestReport,
  onRequestBlockChannel,
}: VideoPlayerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const progressTrackRef = useRef<HTMLDivElement>(null);

  const [loadingApi, setLoadingApi] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [loopEnabled, setLoopEnabled] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [optionsTab, setOptionsTab] = useState<OptionsTab>('main');
  const [qualities, setQualities] = useState<string[]>([...ALL_QUALITY_LEVELS]);
  const [currentQuality, setCurrentQuality] = useState<string>('auto');
  const [audioTracks, setAudioTracks] = useState<AudioTrackInfo[]>([]);
  const [currentAudioId, setCurrentAudioId] = useState<string | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  type CastUiState = 'idle' | 'unavailable' | 'connecting' | 'connected' | 'error';
  const [castState, setCastState] = useState<CastUiState>('idle');
  const [castMessage, setCastMessage] = useState<string | null>(null);

  const onEndedRef = useRef(onEnded);
  const loopEnabledRef = useRef(loopEnabled);
  const preferredQualityRef = useRef<string>('auto');
  const isSeekingRef = useRef(false);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);
  useEffect(() => {
    loopEnabledRef.current = loopEnabled;
  }, [loopEnabled]);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsOpenRef = useRef(optionsOpen);
  useEffect(() => {
    optionsOpenRef.current = optionsOpen;
    if (optionsOpen) {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }
  }, [optionsOpen]);

  const bumpControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (optionsOpenRef.current || isSeekingRef.current) return;
      setShowControls(false);
    }, 4500);
  }, []);

  const refreshAudioTracks = useCallback(() => {
    const player = playerRef.current;
    if (!player) {
      setAudioTracks([]);
      return;
    }
    try {
      const rawList: any[] =
        player.getAvailableAudioTracks?.() ||
        player.getAudioTracks?.() ||
        [];
      if (!Array.isArray(rawList) || rawList.length === 0) {
        setAudioTracks([]);
        return;
      }
      const mapped: AudioTrackInfo[] = rawList.map((t, i) => ({
        id: String(t?.id ?? t?.languageCode ?? t?.language ?? i),
        label: trackLabel(t, i),
        raw: t,
      }));
      setAudioTracks(mapped);
      const current =
        player.getAudioTrack?.() ||
        player.getActiveAudioTrack?.() ||
        null;
      if (current) {
        setCurrentAudioId(
          String(current?.id ?? current?.languageCode ?? current?.language ?? '')
        );
      }
    } catch {
      setAudioTracks([]);
    }
  }, []);

  const applyCaptions = useCallback((on: boolean) => {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (on) {
        player.loadModule?.('captions');
        player.setOption?.('captions', 'track', { languageCode: 'ar' });
        // Fallback: reload with cc_load_policy isn't possible mid-play; try en too
        player.setOption?.('captions', 'reload', true);
      } else {
        player.unloadModule?.('captions');
        player.setOption?.('captions', 'track', {});
      }
    } catch {
      // Captions API is best-effort on embeds
    }
  }, []);

  const setAudioTrack = useCallback((track: AudioTrackInfo) => {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (typeof player.setAudioTrack === 'function') {
        player.setAudioTrack(track.raw);
      } else if (typeof player.setOption === 'function') {
        player.setOption('audio', 'track', track.raw);
      }
      setCurrentAudioId(track.id);
    } catch {
      // ignore
    }
    setOptionsTab('main');
  }, []);

  const applyQualityToPlayer = useCallback((q: string) => {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (q === 'auto' || q === 'default') {
        player.setPlaybackQuality?.('default');
        player.setPlaybackQualityRange?.('tiny', 'highres');
        return;
      }
      player.setPlaybackQuality?.(q);
      player.setPlaybackQualityRange?.(q, q);
    } catch {
      // YT may ignore
    }
  }, []);

  const setQuality = useCallback(
    (q: string) => {
      preferredQualityRef.current = q;
      setCurrentQuality(q);
      applyQualityToPlayer(q);
      setOptionsTab('main');
      bumpControls();
    },
    [applyQualityToPlayer, bumpControls]
  );

  const toggleLoop = useCallback(() => {
    setLoopEnabled((v) => !v);
    bumpControls();
  }, [bumpControls]);

  const toggleCaptions = useCallback(() => {
    setCaptionsOn((prev) => {
      const next = !prev;
      applyCaptions(next);
      return next;
    });
    bumpControls();
  }, [applyCaptions, bumpControls]);

  const toggleAutoplay = useCallback(() => {
    onAutoplayChange?.(!autoplay);
    bumpControls();
  }, [autoplay, onAutoplayChange, bumpControls]);

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

  const seekToRatio = useCallback(
    (ratio: number) => {
      const player = playerRef.current;
      if (!player) return;
      try {
        const dur = player.getDuration?.() || duration;
        if (!dur || !Number.isFinite(dur)) return;
        const t = Math.max(0, Math.min(1, ratio)) * dur;
        player.seekTo(t, true);
        setCurrentTime(t);
      } catch {
        // ignore
      }
    },
    [duration]
  );

  const onProgressPointer = useCallback(
    (clientX: number) => {
      const track = progressTrackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = (clientX - rect.left) / rect.width;
      seekToRatio(ratio);
    },
    [seekToRatio]
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

  useEffect(() => {
    if (!isPlaying || isSeeking) return;
    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      try {
        const t = player.getCurrentTime?.();
        const d = player.getDuration?.();
        if (typeof t === 'number' && Number.isFinite(t)) setCurrentTime(t);
        if (typeof d === 'number' && Number.isFinite(d) && d > 0) setDuration(d);
      } catch {
        // ignore
      }
    }, 500);
    return () => clearInterval(id);
  }, [isPlaying, isSeeking]);

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
    let cancelled = false;
    (async () => {
      const ok = await loadCastFramework();
      if (cancelled) return;
      setCastState(ok ? 'idle' : 'unavailable');
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
        setCastMessage('البث غير متاح على هذا الجهاز/المتصفح.');
        return;
      }
      const ctx = window.cast.framework.CastContext.getInstance();
      const existing = ctx.getCurrentSession?.();
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
        setCastState('connected');
        setCastMessage('تم الاتصال بجهاز البث');
        try {
          playerRef.current?.pauseVideo?.();
          setIsPlaying(false);
        } catch {
          // ignore
        }
      } catch {
        setCastState('idle');
      }
    },
    [bumpControls]
  );

  useEffect(() => {
    let isCancelled = false;

    async function initPlayer() {
      if (!videoId) return;
      setLoadingApi(true);
      setError(null);
      setIsPlaying(false);
      setShowControls(true);
      setOptionsOpen(false);
      setOptionsTab('main');
      setQualities([...ALL_QUALITY_LEVELS]);
      preferredQualityRef.current = 'auto';
      setCurrentQuality('auto');
      setCurrentTime(0);
      setDuration(0);
      setAudioTracks([]);
      setCurrentAudioId(null);
      setCaptionsOn(false);

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
                const d = event.target.getDuration?.();
                if (typeof d === 'number' && d > 0) setDuration(d);
                event.target.playVideo();
                setIsPlaying(true);
                bumpControls();
                setTimeout(() => refreshAudioTracks(), 1000);
                setTimeout(() => refreshAudioTracks(), 3000);
              } catch {
                setShowControls(true);
              }
            },
            onStateChange: (event: any) => {
              if (isCancelled) return;
              const YT = window.YT?.PlayerState;
              const data = event.data;

              if (data === 0 || data === YT?.ENDED) {
                if (loopEnabledRef.current) {
                  try {
                    event.target.seekTo(0, true);
                    event.target.playVideo();
                    setIsPlaying(true);
                    setCurrentTime(0);
                  } catch {
                    onEndedRef.current?.();
                  }
                  return;
                }
                setIsPlaying(false);
                // Phase 4: leave fullscreen immediately so our safe end-screen owns the UI
                if (document.fullscreenElement) {
                  void document.exitFullscreen?.();
                  unlockOrientation();
                  setIsFullscreen(false);
                }
                // Stop embed so YouTube end-cards / related strip cannot be interacted with
                try {
                  event.target.stopVideo?.();
                } catch {
                  // ignore
                }
                onEndedRef.current?.();
                return;
              }
              if (data === 1 || data === YT?.PLAYING) {
                setIsPlaying((prev) => (prev ? prev : true));
                const pref = preferredQualityRef.current;
                if (pref && pref !== 'auto' && pref !== 'default') {
                  try {
                    event.target.setPlaybackQuality?.(pref);
                    event.target.setPlaybackQualityRange?.(pref, pref);
                  } catch {
                    // ignore
                  }
                }
                try {
                  const d = event.target.getDuration?.();
                  if (typeof d === 'number' && d > 0) setDuration(d);
                } catch {
                  // ignore
                }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const progressRatio =
    duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  const openOptions = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOptionsTab('main');
    setOptionsOpen(true);
    setShowControls(true);
    refreshAudioTracks();
  };

  const closeOptions = () => {
    setOptionsOpen(false);
    setOptionsTab('main');
  };

  return (
    <div
      ref={wrapperRef}
      id="video-player-wrapper"
      className={`relative w-full h-full min-h-0 aspect-video overflow-hidden bg-black rounded-none shadow-none ${
        isFullscreen
          ? '!aspect-auto !fixed !inset-0 !z-[100] !w-screen !h-screen'
          : ''
      } ${className}`}
      onClick={() => {
        if (optionsOpen) {
          closeOptions();
          return;
        }
        bumpControls();
      }}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 w-full h-full [&>div]:!w-full [&>div]:!h-full [&>iframe]:!w-full [&>iframe]:!h-full"
      />

      {/* Phase 4 — anti-YouTube outbound click shields */}
      {!optionsOpen && (
        <>
          {/* Top: channel title / avatar links */}
          <div
            className="absolute top-0 inset-x-0 h-14 z-20"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            aria-hidden
          />
          {/* Bottom strip: cards / logo / watch on YouTube */}
          <div
            className="absolute bottom-0 inset-x-0 h-[4.5rem] z-20"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            aria-hidden
          />
          {/* Corners — YouTube logo typically bottom-right */}
          <div
            className="absolute bottom-0 right-0 w-32 h-24 z-30"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            aria-hidden
          />
          <div
            className="absolute bottom-0 left-0 w-32 h-24 z-30"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            aria-hidden
          />
          {/* Top-right overflow menu / share if drawn by embed */}
          <div
            className="absolute top-0 right-0 w-24 h-16 z-30"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            aria-hidden
          />
        </>
      )}

      {/* Center play/pause */}
      <button
        type="button"
        id="safe-play-toggle"
        className="absolute inset-0 z-10 flex items-center justify-center bg-transparent border-0 cursor-pointer"
        onClick={togglePlay}
        aria-label={isPlaying ? 'إيقاف' : 'تشغيل'}
      >
        {showControls && !loadingApi && !error && !optionsOpen && (
          <span className="w-[4.5rem] h-[4.5rem] rounded-full bg-black/55 text-white flex items-center justify-center backdrop-blur-sm shadow-lg pointer-events-none ring-2 ring-white/20">
            {isPlaying ? (
              <Pause className="w-8 h-8 fill-current" />
            ) : (
              <Play className="w-8 h-8 fill-current translate-x-0.5" />
            )}
          </span>
        )}
      </button>

      {/* Bottom chrome */}
      {showControls && !loadingApi && !error && (
        <div
          className="absolute bottom-0 inset-x-0 z-40 px-3 pt-8 pb-2.5 bg-gradient-to-t from-black/90 via-black/50 to-transparent"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {(title || channelTitle) && isFullscreen && (
            <div className="mb-2 text-right px-0.5">
              {title && (
                <p className="text-sm font-bold text-white line-clamp-1">{title}</p>
              )}
              {channelTitle && (
                <p className="text-xs text-white/60 line-clamp-1">{channelTitle}</p>
              )}
            </div>
          )}

          {/* Force LTR: fill + handle must move the same direction (start → end) */}
          <div
            ref={progressTrackRef}
            id="player-progress-track"
            dir="ltr"
            className="relative h-8 flex items-center cursor-pointer touch-none"
            style={{ direction: 'ltr' }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              isSeekingRef.current = true;
              setIsSeeking(true);
              setShowControls(true);
              onProgressPointer(e.clientX);
              const onMove = (ev: PointerEvent) => onProgressPointer(ev.clientX);
              const onUp = () => {
                isSeekingRef.current = false;
                setIsSeeking(false);
                bumpControls();
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
              };
              window.addEventListener('pointermove', onMove);
              window.addEventListener('pointerup', onUp);
            }}
          >
            <div
              className="absolute inset-x-0 h-1 rounded-full bg-white/25 overflow-hidden"
              style={{ direction: 'ltr' }}
            >
              <div
                className="h-full bg-red-500 rounded-full"
                style={{
                  width: `${progressRatio * 100}%`,
                  marginInlineStart: 0,
                  marginLeft: 0,
                  float: 'left',
                }}
              />
            </div>
            <div
              className="absolute top-1/2 w-3.5 h-3.5 rounded-full bg-red-500 shadow ring-2 ring-white/30 pointer-events-none"
              style={{
                left: `${progressRatio * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-2 mt-0.5">
            <span className="text-[11px] font-semibold text-white/90 tabular-nums min-w-[3.5rem]">
              {formatTime(currentTime)}
              <span className="text-white/45"> / {formatTime(duration)}</span>
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleLoop}
                className={`flex items-center justify-center w-11 h-11 rounded-full border cursor-pointer transition ${
                  loopEnabled
                    ? 'bg-sky-500/90 text-white border-sky-400'
                    : 'bg-white/10 text-white border-white/15'
                }`}
                title="تكرار"
              >
                <Repeat className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleCastClick}
                className={`flex items-center justify-center w-11 h-11 rounded-full border cursor-pointer ${
                  castState === 'connected'
                    ? 'bg-sky-500/90 text-white border-sky-400'
                    : 'bg-white/10 text-white border-white/15'
                }`}
                title="Cast"
              >
                <Cast className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={openOptions}
                className="flex items-center justify-center w-11 h-11 rounded-full bg-white/10 text-white border border-white/15 cursor-pointer"
                title="الخيارات"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={toggleFullscreen}
                className="flex items-center justify-center w-11 h-11 rounded-full bg-white/10 text-white border border-white/15 cursor-pointer"
                title="ملء الشاشة"
              >
                {isFullscreen ? (
                  <Minimize className="w-4 h-4" />
                ) : (
                  <Maximize className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 3 — transparent options overlay (YouTube Kids style) */}
      {optionsOpen && (
        <div
          id="video-options-overlay"
          className="absolute inset-0 z-[90] flex justify-end"
          onClick={(e) => {
            e.stopPropagation();
            closeOptions();
          }}
        >
          {/* dimmed transparent backdrop */}
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />

          {/* side panel */}
          <div
            className="relative z-10 h-full w-[min(100%,20rem)] bg-black/70 backdrop-blur-md border-l border-white/10 flex flex-col text-white shadow-2xl animate-[slideInRight_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <button
                type="button"
                onClick={closeOptions}
                className="p-1.5 rounded-full hover:bg-white/10 cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-base font-bold">
                {optionsTab === 'main' && 'خيارات الفيديو'}
                {optionsTab === 'quality' && 'الجودة'}
                {optionsTab === 'audio' && 'مسار الصوت'}
              </h3>
            </div>

            <div className="grow overflow-y-auto overscroll-contain py-1">
              {optionsTab === 'main' && (
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => setOptionsTab('quality')}
                    className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[48px] text-right hover:bg-white/10 active:bg-white/15 cursor-pointer transition-colors"
                  >
                    <Settings className="w-5 h-5 text-white/70 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">الجودة</div>
                      <div className="text-xs text-white/50">
                        {QUALITY_LABELS[currentQuality] || currentQuality}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={toggleCaptions}
                    className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[48px] text-right hover:bg-white/10 active:bg-white/15 cursor-pointer transition-colors"
                  >
                    <Captions className="w-5 h-5 text-white/70 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">الترجمة</div>
                      <div className="text-xs text-white/50">
                        {captionsOn ? 'تشغيل' : 'إيقاف'}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      refreshAudioTracks();
                      setOptionsTab('audio');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[48px] text-right hover:bg-white/10 active:bg-white/15 cursor-pointer transition-colors"
                  >
                    <Languages className="w-5 h-5 text-white/70 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">مسار الصوت</div>
                      <div className="text-xs text-white/50">
                        {audioTracks.length
                          ? audioTracks.find((t) => t.id === currentAudioId)
                              ?.label || 'اختر اللغة'
                          : 'غير متاح لهذا الفيديو'}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={toggleAutoplay}
                    className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[48px] text-right hover:bg-white/10 active:bg-white/15 cursor-pointer transition-colors"
                  >
                    <FastForward className="w-5 h-5 text-white/70 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">تشغيل تلقائي</div>
                      <div className="text-xs text-white/50">
                        {autoplay ? 'تشغيل — للفيديو التالي' : 'إيقاف'}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={toggleLoop}
                    className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[48px] text-right hover:bg-white/10 active:bg-white/15 cursor-pointer transition-colors"
                  >
                    <Repeat className="w-5 h-5 text-white/70 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">تكرار الفيديو</div>
                      <div className="text-xs text-white/50">
                        {loopEnabled ? 'تشغيل' : 'إيقاف'}
                      </div>
                    </div>
                  </button>

                  <div className="mx-4 my-2 border-t border-white/10" />

                  <button
                    type="button"
                    onClick={() => {
                      closeOptions();
                      onRequestReport?.();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[48px] text-right hover:bg-white/10 active:bg-white/15 cursor-pointer transition-colors"
                  >
                    <Flag className="w-5 h-5 text-amber-300 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">إبلاغ عن الفيديو</div>
                      <div className="text-xs text-white/50">إخفاء من قائمة الطفل</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      closeOptions();
                      onRequestBlockChannel?.();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[48px] text-right hover:bg-white/10 active:bg-white/15 cursor-pointer transition-colors"
                  >
                    <Ban className="w-5 h-5 text-rose-300 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">حظر القناة</div>
                      <div className="text-xs text-white/50">يتطلب رمز PIN للأهل</div>
                    </div>
                  </button>
                </div>
              )}

              {optionsTab === 'quality' && (
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => setOptionsTab('main')}
                    className="w-full px-4 py-2 text-xs text-sky-300 text-right hover:bg-white/5 cursor-pointer"
                  >
                    ← رجوع
                  </button>
                  {qualities.map((q) => {
                    const active = q === currentQuality;
                    return (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setQuality(q)}
                        className={`w-full flex items-center justify-between gap-2 px-4 py-3 text-sm text-right cursor-pointer ${
                          active
                            ? 'bg-sky-500/20 text-sky-300'
                            : 'text-white hover:bg-white/10'
                        }`}
                      >
                        <span className="font-semibold">
                          {QUALITY_LABELS[q] || q}
                        </span>
                        {active && <Check className="w-4 h-4 text-sky-400" />}
                      </button>
                    );
                  })}
                  <p className="px-4 py-2 text-[10px] text-white/40 leading-relaxed">
                    يوتيوب قد يتجاهل اختيار الجودة حسب سرعة النت.
                  </p>
                </div>
              )}

              {optionsTab === 'audio' && (
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => setOptionsTab('main')}
                    className="w-full px-4 py-2 text-xs text-sky-300 text-right hover:bg-white/5 cursor-pointer"
                  >
                    ← رجوع
                  </button>
                  {audioTracks.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-white/50 text-center leading-relaxed">
                      لا يوجد مسار صوت إضافي لهذا الفيديو.
                      <br />
                      <span className="text-xs text-white/35">
                        الميزة تظهر فقط إذا وفّر يوتيوب أكثر من لغة للصوت.
                      </span>
                    </p>
                  ) : (
                    audioTracks.map((t) => {
                      const active = t.id === currentAudioId;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setAudioTrack(t)}
                          className={`w-full flex items-center justify-between gap-2 px-4 py-3 text-sm text-right cursor-pointer ${
                            active
                              ? 'bg-sky-500/20 text-sky-300'
                              : 'text-white hover:bg-white/10'
                          }`}
                        >
                          <span className="font-semibold">{t.label}</span>
                          {active && <Check className="w-4 h-4 text-sky-400" />}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {castMessage && (
        <div
          className="absolute top-3 inset-x-3 z-[55] px-3 py-2 rounded-xl bg-zinc-900/95 border border-white/10 text-[11px] text-white/90 text-center"
          onClick={(e) => {
            e.stopPropagation();
            setCastMessage(null);
          }}
        >
          {castMessage}
        </div>
      )}

      {loadingApi && (
        <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center text-white gap-2 pointer-events-none z-[60]">
          <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
          <span className="text-xs text-slate-300">جاري تجهيز المشغل...</span>
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
