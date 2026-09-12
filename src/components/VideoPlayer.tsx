import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
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
import type { useGoogleCast } from '../hooks/useGoogleCast';
import { castService } from '../services/castService';

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

export interface VideoPlayerHandle {
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

export interface VideoPlayerProps {
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
  /** Mini-Player mode: hides all full player overlay controls and click shields */
  isMinimized?: boolean;
  /** Playback state change callback */
  onPlayStateChange?: (isPlaying: boolean) => void;
  /** Google Cast integration passed down from parent PlayerView */
  cast?: ReturnType<typeof useGoogleCast>;
}

const DEFAULT_CAST_STATE: ReturnType<typeof useGoogleCast> = {
  isSdkLoaded: false,
  isAvailable: false,
  isConnected: false,
  isConnecting: false,
  castState: 'NO_DEVICES_AVAILABLE',
  deviceName: null,
  currentTime: 0,
  duration: 0,
  isPaused: false,
  requestSession: async () => false,
  endSession: async () => {},
  loadVideo: () => {},
  playOrPause: () => {},
  seek: () => {},
};

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
const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function VideoPlayer(
  {
    videoId,
    onEnded,
    className = '',
    title,
    channelTitle,
    autoplay = false,
    onAutoplayChange,
    onRequestReport,
    onRequestBlockChannel,
    isMinimized = false,
    onPlayStateChange,
    cast: castProp,
  },
  ref
) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const progressTrackRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const progressHandleRef = useRef<HTMLDivElement>(null);
  const timeTextRef = useRef<HTMLSpanElement>(null);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);

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

  const cast = castProp || DEFAULT_CAST_STATE;

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

  // Subscribe to remote Cast video end event
  useEffect(() => {
    const unsub = castService.onVideoEnd(() => {
      onEndedRef.current?.();
    });
    return unsub;
  }, []);

  // When cast connects or changes, pause local player
  useEffect(() => {
    if (cast.isConnected) {
      try {
        playerRef.current?.pauseVideo?.();
        setIsPlaying(false);
      } catch {
        // ignore
      }
    }
  }, [cast.isConnected]);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsOpenRef = useRef(optionsOpen);
  useEffect(() => {
    optionsOpenRef.current = optionsOpen;
    if (optionsOpen) {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }
  }, [optionsOpen]);

  const updateProgressDom = useCallback((curr: number, dur: number) => {
    currentTimeRef.current = curr;
    if (dur > 0) durationRef.current = dur;

    const currentDur = dur > 0 ? dur : durationRef.current;
    const ratio = currentDur > 0 ? Math.min(1, Math.max(0, curr / currentDur)) : 0;
    const pct = (ratio * 100).toFixed(2);

    if (progressFillRef.current) {
      progressFillRef.current.style.width = `${pct}%`;
    }
    if (progressHandleRef.current) {
      progressHandleRef.current.style.left = `${pct}%`;
    }
    if (timeTextRef.current) {
      timeTextRef.current.innerHTML = `${formatTime(curr)}<span class="text-white/45"> / ${formatTime(currentDur)}</span>`;
    }
  }, []);

  const bumpControls = useCallback(() => {
    setCurrentTime(currentTimeRef.current);
    setDuration(durationRef.current);
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
      if (cast.isConnected) {
        cast.playOrPause();
        bumpControls();
        return;
      }
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
    [cast, bumpControls]
  );

  const seekToRatio = useCallback(
    (ratio: number) => {
      const currentDur = cast.isConnected
        ? (cast.duration || durationRef.current || duration)
        : (playerRef.current?.getDuration?.() || durationRef.current || duration);
      if (!currentDur || !Number.isFinite(currentDur)) return;
      const t = Math.max(0, Math.min(1, ratio)) * currentDur;
      currentTimeRef.current = t;
      setCurrentTime(t);
      updateProgressDom(t, currentDur);

      if (cast.isConnected) {
        cast.seek(t);
        return;
      }
      const player = playerRef.current;
      if (!player) return;
      try {
        player.seekTo(t, true);
      } catch {
        // ignore
      }
    },
    [cast, duration, updateProgressDom]
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
      if (cast.isConnected) {
        const curr = castService.state.currentTime || 0;
        const dur = castService.state.duration || durationRef.current || 0;
        updateProgressDom(curr, dur);
        return;
      }
      const player = playerRef.current;
      if (!player) return;
      try {
        const t = player.getCurrentTime?.();
        const d = player.getDuration?.();
        if (typeof t === 'number' && Number.isFinite(t)) {
          const dur = typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : durationRef.current;
          updateProgressDom(t, dur);
        }
      } catch {
        // ignore
      }
    }, 500);
    return () => clearInterval(id);
  }, [isPlaying, isSeeking, cast.isConnected, updateProgressDom]);

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

  const handleCastClick = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      bumpControls();
      if (cast.isConnected) {
        await cast.endSession();
        return;
      }
      const ok = await cast.requestSession();
      if (ok) {
        cast.loadVideo(videoId, title, currentTimeRef.current);
      }
    },
    [cast, videoId, title, bumpControls]
  );

  // Cleanup player on component unmount
  useEffect(() => {
    return () => {
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
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function initOrUpdatePlayer() {
      if (!videoId) return;

      // Reset state for new video
      setError(null);
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

      currentTimeRef.current = 0;
      durationRef.current = 0;
      updateProgressDom(0, 0);

      // If player already exists and container is intact, reuse the existing player instance
      if (playerRef.current && typeof playerRef.current.loadVideoById === 'function' && containerRef.current) {
        setLoadingApi(false);
        try {
          if (cast.isConnected) {
            cast.loadVideo(videoId, title, 0);
          } else {
            playerRef.current.loadVideoById(videoId);
            setIsPlaying(true);
          }
          bumpControls();
          setTimeout(() => {
            if (!isCancelled) refreshAudioTracks();
          }, 1000);
          setTimeout(() => {
            if (!isCancelled) refreshAudioTracks();
          }, 3000);
          return;
        } catch (err) {
          console.warn('loadVideoById failed, re-creating player:', err);
        }
      }

      setLoadingApi(true);
      setIsPlaying(false);

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
                if (typeof d === 'number' && d > 0) {
                  durationRef.current = d;
                  setDuration(d);
                  updateProgressDom(0, d);
                }
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
                    currentTimeRef.current = 0;
                    setCurrentTime(0);
                    updateProgressDom(0, durationRef.current);
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
                  if (typeof d === 'number' && d > 0) {
                    durationRef.current = d;
                    setDuration(d);
                  }
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

    initOrUpdatePlayer();

    return () => {
      isCancelled = true;
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const activeIsPlaying = cast.isConnected ? !cast.isPaused : isPlaying;

  useEffect(() => {
    onPlayStateChange?.(activeIsPlaying);
  }, [activeIsPlaying, onPlayStateChange]);

  useImperativeHandle(
    ref,
    () => ({
      togglePlay: () => {
        togglePlay();
      },
      play: () => {
        if (cast.isConnected) {
          cast.play();
        } else {
          try {
            playerRef.current?.playVideo?.();
            setIsPlaying(true);
          } catch {
            // ignore
          }
        }
      },
      pause: () => {
        if (cast.isConnected) {
          cast.pause();
        } else {
          try {
            playerRef.current?.pauseVideo?.();
            setIsPlaying(false);
          } catch {
            // ignore
          }
        }
      },
      stop: () => {
        if (cast.isConnected) {
          cast.endSession();
        }
        try {
          playerRef.current?.stopVideo?.();
          setIsPlaying(false);
        } catch {
          // ignore
        }
      },
      get isPlaying() {
        return cast.isConnected ? !cast.isPaused : isPlaying;
      },
      get currentTime() {
        return cast.isConnected ? cast.currentTime : currentTimeRef.current;
      },
      get duration() {
        return cast.isConnected ? (cast.duration || durationRef.current) : (durationRef.current || duration);
      },
    }),
    [cast, isPlaying, duration, togglePlay]
  );

  const openOptions = () => {
    setCurrentTime(currentTimeRef.current);
    setDuration(durationRef.current);
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
        isFullscreen && !isMinimized
          ? '!aspect-auto !fixed !inset-0 !z-[100] !w-screen !h-screen'
          : ''
      } ${className}`}
      onClick={(e) => {
        if (isMinimized) return;
        if (optionsOpen) {
          closeOptions();
          return;
        }
        if (e.target === e.currentTarget) {
          bumpControls();
        }
      }}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 w-full h-full [&>div]:!w-full [&>div]:!h-full [&>iframe]:!w-full [&>iframe]:!h-full"
      />

      {/* Full Player Overlays - Hidden completely in Mini-Player mode */}
      {!isMinimized && (
        <>
          {/* Google Cast Connected TV Overlay */}
          {cast.isConnected && (
        <div
          id="video-player-casting-overlay"
          className="absolute inset-0 z-25 bg-slate-950/95 flex flex-col items-center justify-center text-center p-4 text-white select-none pointer-events-none"
        >
          <div className="w-16 h-16 rounded-3xl bg-sky-500/20 border border-sky-400/30 text-sky-400 flex items-center justify-center mb-3 shadow-lg ring-4 ring-sky-500/10 animate-pulse">
            <Cast className="w-8 h-8" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-white mb-1">
            بيشتغل على التلفزيون 📺
          </h3>
          {cast.deviceName && (
            <p className="text-xs sm:text-sm text-sky-300 font-medium">
              متصل بـ: {cast.deviceName}
            </p>
          )}
          <p className="text-[11px] text-white/50 mt-2 max-w-xs">
            يمكنك استخدام أزرار التحكم بالأسفل للتشغيل والإيقاف والتقديم والتأخير.
          </p>
        </div>
      )}

      {/* Phase 4 — anti-YouTube outbound click shields: blocks iframe clicks without eating child clicks */}
      {!optionsOpen && (
        <>
          {/* Top: channel title / avatar links */}
          <div
            className="absolute top-0 inset-x-0 h-14 z-20 pointer-events-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) bumpControls();
            }}
            aria-hidden
          />
          {/* Bottom strip: cards / logo / watch on YouTube */}
          <div
            className="absolute bottom-0 inset-x-0 h-[4.5rem] z-20 pointer-events-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) bumpControls();
            }}
            aria-hidden
          />
          {/* Corners — YouTube logo typically bottom-right */}
          <div
            className="absolute bottom-0 right-0 w-32 h-24 z-30 pointer-events-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) bumpControls();
            }}
            aria-hidden
          />
          <div
            className="absolute bottom-0 left-0 w-32 h-24 z-30 pointer-events-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) bumpControls();
            }}
            aria-hidden
          />
          {/* Top-right overflow menu / share if drawn by embed */}
          <div
            className="absolute top-0 right-0 w-24 h-16 z-30 pointer-events-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) bumpControls();
            }}
            aria-hidden
          />
        </>
      )}

      {/* Center play/pause background tap zone */}
      <button
        type="button"
        id="safe-play-toggle"
        className="absolute inset-0 z-10 flex items-center justify-center bg-transparent border-0 cursor-pointer"
        onClick={togglePlay}
        aria-label={activeIsPlaying ? 'إيقاف' : 'تشغيل'}
      >
        {showControls && !loadingApi && !error && !optionsOpen && (
          <span className="w-[4.5rem] h-[4.5rem] rounded-full bg-black/55 text-white flex items-center justify-center backdrop-blur-sm shadow-lg pointer-events-none ring-2 ring-white/20">
            {activeIsPlaying ? (
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
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              bumpControls();
            }
          }}
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

          {/* Force LTR: fill + handle must move the same direction (start → end) with 44px hit-target */}
          <div
            ref={progressTrackRef}
            id="player-progress-track"
            dir="ltr"
            className="relative h-11 flex items-center cursor-pointer touch-none select-none group"
            style={{ direction: 'ltr' }}
            onPointerDown={(e) => {
              e.preventDefault();
              isSeekingRef.current = true;
              setIsSeeking(true);
              setShowControls(true);
              setCurrentTime(currentTimeRef.current);
              setDuration(durationRef.current);
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
              className="absolute inset-x-0 h-1.5 group-hover:h-2 rounded-full bg-white/25 overflow-hidden transition-all pointer-events-none"
              style={{ direction: 'ltr' }}
            >
              <div
                ref={progressFillRef}
                className="h-full bg-red-500 rounded-full"
                style={{
                  marginInlineStart: 0,
                  marginLeft: 0,
                  float: 'left',
                }}
              />
            </div>
            <div
              ref={progressHandleRef}
              className="absolute top-1/2 left-0 w-3.5 h-3.5 rounded-full bg-red-500 shadow ring-2 ring-white/30 pointer-events-none transition-transform scale-90 group-hover:scale-110"
              style={{
                transform: 'translate(-50%, -50%)',
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-2 mt-0.5">
            <span
              ref={timeTextRef}
              className="text-[11px] font-semibold text-white/90 tabular-nums min-w-[3.5rem]"
            />

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
              {cast.isAvailable && (
                <button
                  type="button"
                  id="video-cast-btn"
                  onClick={handleCastClick}
                  className={`flex items-center justify-center w-11 h-11 rounded-full border cursor-pointer transition active:scale-95 ${
                    cast.isConnected
                      ? 'bg-sky-500 text-white border-sky-400 shadow-md ring-2 ring-sky-400/40'
                      : 'bg-white/10 text-white border-white/15 hover:bg-white/20'
                  }`}
                  title={cast.isConnected ? 'قطع الاتصال بالبث' : 'بث على التلفزيون'}
                  aria-label="Google Cast"
                >
                  <Cast className={`w-4 h-4 ${cast.isConnecting ? 'animate-pulse' : ''}`} />
                </button>
              )}
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
            if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('options-backdrop')) {
              closeOptions();
            }
          }}
        >
          {/* dimmed transparent backdrop */}
          <div className="options-backdrop absolute inset-0 bg-black/45 backdrop-blur-[2px]" />

          {/* side panel */}
          <div
            className="relative z-10 h-full w-[min(100%,20rem)] bg-black/70 backdrop-blur-md border-l border-white/10 flex flex-col text-white shadow-2xl animate-[slideInRight_0.2s_ease-out]"
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
        </>
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
});

export default VideoPlayer;
