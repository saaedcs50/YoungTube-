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
  FastForward,
  Rewind,
  X,
} from 'lucide-react';
import { LandscapeShell } from './LandscapeShell';
import { PlayerSeekBar } from '../components/PlayerSeekBar';
import { PlayerSettingsSheet } from '../components/PlayerSettingsSheet';
import { recordChildReaction } from '../tasteShiftStorage';
import db from '../db';

export interface QueuedVideo {
  videoId: string;
  title: string;
  channelTitle: string;
}

const DEFAULT_PLAYLIST: QueuedVideo[] = [
  {
    videoId: 's6X_Q54_PBs',
    title: 'Alphablocks - مغامرة الحروف والكلمات الإنجليزية',
    channelTitle: 'Alphablocks',
  },
  {
    videoId: 'u7e33WnUf0A',
    title: 'Numberblocks - أصدقاء الأرقام وتعلم الحساب للأطفال',
    channelTitle: 'Numberblocks',
  },
  {
    videoId: 'x1rB6E1oTss',
    title: 'Art for Kids Hub - تعلم رسم وتلوين الحيوانات بالريشة',
    channelTitle: 'Art for Kids Hub',
  },
  {
    videoId: 'w_gWvL8fN8g',
    title: 'Arabian Fairy Tales - حكاية الشجرة الحكيمة والطيور الملونة',
    channelTitle: 'Arabian Fairy Tales',
  },
  {
    videoId: 'X_1g1z1b0a8',
    title: 'Puffin Rock - حكايات الطبيعة الهادئة والمغامرات الودية',
    channelTitle: 'Puffin Rock',
  },
  {
    videoId: '02E1468SdHg',
    title: 'Cosmic Kids Yoga - مغامرة الحركة واليوغا والنشاط الصحي',
    channelTitle: 'Cosmic Kids Yoga',
  },
  {
    videoId: 'UeF09e7hDbg',
    title: '5-Minute Crafts PLAY - أفكار أشغال يدوية وابتكارات بالورق',
    channelTitle: '5-Minute Crafts PLAY',
  },
  {
    videoId: 'tbCjkPlsaes',
    title: 'AllAttack - مهارات وتحديات رياضية ممتعة للأبطال',
    channelTitle: 'AllAttack',
  },
];

interface PlayerViewProps {
  videoId: string;
  videoTitle?: string;
  channelTitle?: string;
  onClose: () => void;
  onEnded: () => void;
  forceStop?: boolean;
  isFullscreen?: boolean;
  onEnterFullscreen?: () => void;
  onExitFullscreen?: () => void;
  isMinimized?: boolean;
  onEnterMinimized?: () => void;
  onExitMinimized?: () => void;
}

export const PlayerView: React.FC<PlayerViewProps> = ({
  videoId,
  videoTitle,
  channelTitle,
  onClose,
  onEnded,
  forceStop,
  isFullscreen: propIsFullscreen,
  onEnterFullscreen,
  onExitFullscreen,
  isMinimized: propIsMinimized,
  onEnterMinimized,
  onExitMinimized,
}) => {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [testForceStop, setTestForceStop] = useState(false);

  // Minimized state (floating mini-player in bottom-right corner)
  const [isMinimizedLocal, setIsMinimizedLocal] = useState(false);
  const isMinimized = (propIsMinimized ?? false) || isMinimizedLocal;
  const isMinimizedRef = useRef(isMinimized);
  isMinimizedRef.current = isMinimized;

  // Expanding from minimized back to portrait
  const performExpandFromMinimized = useCallback(() => {
    setIsMinimizedLocal(false);
    onExitMinimized?.();
    try {
      playerRef.current?.playVideo?.();
      setIsPlaying(true);
    } catch (err) {
      console.warn('playVideo on expand failed:', err);
    }
  }, [onExitMinimized]);

  const handleExpandFromMinimized = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.state?.minimized) {
      window.history.back();
    } else {
      performExpandFromMinimized();
    }
  }, [performExpandFromMinimized]);

  const handleEnterMinimized = useCallback(() => {
    if (typeof window !== 'undefined' && !window.history.state?.minimized) {
      window.history.pushState({ ytPlayer: true, fullscreen: false, minimized: true }, '');
    }
    setIsMinimizedLocal(true);
    onEnterMinimized?.();
  }, [onEnterMinimized]);

  const handleMiniPlayerClose = useCallback(() => {
    try {
      playerRef.current?.stopVideo?.();
    } catch (err) {
      console.warn('stopVideo on mini-close failed:', err);
    }
    setIsPlaying(false);
    setIsMinimizedLocal(false);
    onExitMinimized?.();
    onClose();
  }, [onClose, onExitMinimized]);

  // When isMinimized transitions from true -> false, auto-resume video
  const prevMinimizedRef = useRef(isMinimized);
  useEffect(() => {
    if (prevMinimizedRef.current && !isMinimized) {
      try {
        playerRef.current?.playVideo?.();
        setIsPlaying(true);
      } catch (err) {
        console.warn('playVideo on expand transition failed:', err);
      }
    }
    prevMinimizedRef.current = isMinimized;
  }, [isMinimized]);

  // Fix 1: Two independent facts
  const [isDeviceLandscape, setIsDeviceLandscape] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(orientation: landscape)').matches;
    }
    return false;
  });
  const [isFullscreenActive, setIsFullscreenActive] = useState(() => {
    if (typeof document !== 'undefined') {
      return Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement);
    }
    return false;
  });

  // Track if user manually exited fullscreen while device is physically landscape
  const [manuallyExitedInLandscape, setManuallyExitedInLandscape] = useState(false);

  // Reconciled effective fullscreen state:
  // - propIsFullscreen if controlled from App
  // - isFullscreenActive from document.fullscreenElement
  // - isDeviceLandscape if physically landscape (unless user manually exited)
  const isFullscreen =
    (propIsFullscreen ?? false) ||
    isFullscreenActive ||
    (isDeviceLandscape && !manuallyExitedInLandscape);

  const isFullscreenActiveRef = useRef(isFullscreen);
  isFullscreenActiveRef.current = isFullscreen;

  const isDeviceLandscapeRef = useRef(isDeviceLandscape);
  isDeviceLandscapeRef.current = isDeviceLandscape;

  const [showLandscapeControls, setShowLandscapeControls] = useState(true);

  useEffect(() => {
    if (isFullscreen) {
      setShowLandscapeControls(true);
    }
  }, [isFullscreen]);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isLooping, setIsLooping] = useState(false);

  // Video Queue & Current Video State
  const [currentVideo, setCurrentVideo] = useState<QueuedVideo>({
    videoId,
    title: videoTitle || 'فيديو أطفال ممتع',
    channelTitle: channelTitle || 'قناة أطفال موثوقة',
  });

  useEffect(() => {
    setCurrentVideo({
      videoId,
      title: videoTitle || 'فيديو أطفال ممتع',
      channelTitle: channelTitle || 'قناة أطفال موثوقة',
    });
  }, [videoId, videoTitle, channelTitle]);

  const [playlist, setPlaylist] = useState<QueuedVideo[]>(() => {
    const list = [...DEFAULT_PLAYLIST];
    if (!list.some((v) => v.videoId === videoId)) {
      list.unshift({
        videoId,
        title: videoTitle || 'فيديو أطفال ممتع',
        channelTitle: channelTitle || 'قناة أطفال موثوقة',
      });
    }
    return list;
  });

  // Merge with cached feed if present in Dexie
  useEffect(() => {
    async function loadFeedQueue() {
      try {
        const feedItems = await db.feedCache.toArray();
        if (feedItems && feedItems.length > 0) {
          const mapped: QueuedVideo[] = feedItems.map((f) => ({
            videoId: f.videoId,
            title: f.title,
            channelTitle: 'قناة أطفال موثوقة',
          }));
          const seen = new Set<string>();
          const merged: QueuedVideo[] = [];
          for (const item of [
            {
              videoId,
              title: videoTitle || 'فيديو أطفال ممتع',
              channelTitle: channelTitle || 'قناة أطفال موثوقة',
            },
            ...DEFAULT_PLAYLIST,
            ...mapped,
          ]) {
            if (!seen.has(item.videoId)) {
              seen.add(item.videoId);
              merged.push(item);
            }
          }
          setPlaylist(merged);
        }
      } catch (err) {
        console.warn('Failed to load feed queue:', err);
      }
    }
    loadFeedQueue();
  }, [videoId, videoTitle, channelTitle]);

  // Current Time & Duration tracking
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      if (playerRef.current) {
        try {
          const cur = playerRef.current.getCurrentTime?.() || 0;
          const dur = playerRef.current.getDuration?.() || 0;
          setCurrentTime(cur);
          if (dur > 0) {
            setDuration(dur);
          }
        } catch {}
      }
    }, 350);
    return () => clearInterval(timer);
  }, []);

  const handleSeek = useCallback((targetSeconds: number) => {
    if (!playerRef.current) return;
    try {
      if (typeof playerRef.current.seekTo === 'function') {
        playerRef.current.seekTo(targetSeconds, true);
      }
      setCurrentTime(targetSeconds);
    } catch (err) {
      console.warn('Seek failed:', err);
    }
  }, []);

  // Video switching via loadVideoById (no black flash, same instance)
  const handlePlayQueuedVideo = useCallback((item: QueuedVideo) => {
    setCurrentVideo(item);
    setCurrentTime(0);
    try {
      playerRef.current?.loadVideoById?.(item.videoId);
      setIsPlaying(true);
    } catch (err) {
      console.warn('loadVideoById failed:', err);
    }
  }, []);

  const handlePrev = useCallback(() => {
    if (playlist.length === 0) return;
    const curIdx = playlist.findIndex((v) => v.videoId === currentVideo.videoId);
    const prevIdx = curIdx > 0 ? curIdx - 1 : playlist.length - 1;
    const prevItem = playlist[prevIdx];
    if (prevItem) {
      handlePlayQueuedVideo(prevItem);
    }
  }, [playlist, currentVideo.videoId, handlePlayQueuedVideo]);

  const handleNext = useCallback(() => {
    if (playlist.length === 0) return;
    const curIdx = playlist.findIndex((v) => v.videoId === currentVideo.videoId);
    const nextIdx = curIdx >= 0 ? (curIdx + 1) % playlist.length : 0;
    const nextItem = playlist[nextIdx];
    if (nextItem) {
      handlePlayQueuedVideo(nextItem);
    }
  }, [playlist, currentVideo.videoId, handlePlayQueuedVideo]);

  // Love / Favorite state (persisted via Dexie interactions & taste shift)
  const [isLoved, setIsLoved] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function checkLoved() {
      try {
        const interaction = await db.interactions.get(currentVideo.videoId);
        if (isMounted) {
          setIsLoved(interaction?.childReaction === 'liked');
        }
      } catch (err) {
        console.warn('Failed to check interaction:', err);
      }
    }
    checkLoved();
    return () => {
      isMounted = false;
    };
  }, [currentVideo.videoId]);

  const handleToggleLove = useCallback(async () => {
    const nextLoved = !isLoved;
    setIsLoved(nextLoved);

    try {
      await recordChildReaction({
        categoryId: 'general',
        videoId: currentVideo.videoId,
        channelId: currentVideo.channelTitle,
        title: currentVideo.title,
        reaction: nextLoved ? 'liked' : 'disliked',
      });
      if (!nextLoved) {
        await db.interactions.update(currentVideo.videoId, {
          childReaction: undefined,
        });
      }
    } catch (err) {
      console.warn('Failed to record love reaction:', err);
    }
  }, [isLoved, currentVideo]);

  const effectiveForceStop = forceStop || testForceStop;

  // Settings Bottom Sheet State & History Stack Integration
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const isSettingsOpenRef = useRef(false);
  isSettingsOpenRef.current = isSettingsOpen;

  const handleOpenSettings = useCallback(() => {
    if (typeof window !== 'undefined' && !window.history.state?.sheetOpen) {
      window.history.pushState({ ...window.history.state, ytPlayer: true, sheetOpen: true }, '');
    }
    setIsSettingsOpen(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.state?.sheetOpen) {
      window.history.back();
    } else {
      setIsSettingsOpen(false);
    }
  }, []);

  // Hardware Back button dismisses the settings sheet
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (isSettingsOpenRef.current && !e.state?.sheetOpen) {
        setIsSettingsOpen(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Close sheet if video enters fullscreen, is minimized, or receives forceStop
  useEffect(() => {
    if ((isFullscreen || isMinimized || effectiveForceStop) && isSettingsOpen) {
      setIsSettingsOpen(false);
    }
  }, [isFullscreen, isMinimized, effectiveForceStop, isSettingsOpen]);

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

  const performExitFullscreen = useCallback(async () => {
    setIsFullscreenActive(false);
    setManuallyExitedInLandscape(true);
    onExitFullscreen?.();

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
  }, [onExitFullscreen]);

  const handleExitFullscreen = useCallback(() => {
    // Fix 2, Point 4: When exiting via in-app button, call history.back()
    // instead of directly calling exitFullscreen() yourself — let popstate handler
    // be the single place that actually performs the exit
    if (typeof window !== 'undefined' && window.history.state?.fullscreen) {
      window.history.back();
    } else {
      performExitFullscreen();
    }
  }, [performExitFullscreen]);

  const performEnterFullscreen = useCallback(async () => {
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

  const handleEnterFullscreen = useCallback(() => {
    setManuallyExitedInLandscape(false);
    setIsFullscreenActive(true);
    if (onEnterFullscreen) {
      onEnterFullscreen();
    } else if (typeof window !== 'undefined' && !window.history.state?.fullscreen) {
      window.history.pushState({ ytPlayer: true, fullscreen: true }, '');
    }
    performEnterFullscreen();
  }, [onEnterFullscreen, performEnterFullscreen]);

  // Sync if propIsFullscreen changes from outside
  useEffect(() => {
    if (propIsFullscreen === false && isFullscreenActiveRef.current) {
      performExitFullscreen();
    }
  }, [propIsFullscreen, performExitFullscreen]);

  // Listen to fullscreen changes, Escape key, and REAL orientation changes (Fix 1)
  useEffect(() => {
    const onFullscreenChange = () => {
      const isNowFs = Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreenActive(isNowFs);
      if (!isNowFs) {
        setManuallyExitedInLandscape(true);
        try {
          if (screen.orientation && typeof (screen.orientation as any).unlock === 'function') {
            (screen.orientation as any).unlock();
          }
        } catch {
          // ignore
        }
        // Sync history if needed
        if (typeof window !== 'undefined' && window.history.state?.fullscreen) {
          window.history.back();
        }
      }
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    // Fix 1, Point 1: Track REAL device orientation via matchMedia('(orientation: landscape)')
    const mql = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(orientation: landscape)') : null;
    const handleMediaChange = (e: MediaQueryListEvent | MediaQueryList) => {
      const isLandscapeNow = e.matches;
      setIsDeviceLandscape(isLandscapeNow);

      if (isLandscapeNow) {
        // Fix 1, Point 3: whenever isDeviceLandscape becomes true while playback is active,
        // if not already in fullscreen and NOT minimized, AUTOMATICALLY call enterFullscreen
        setManuallyExitedInLandscape(false);
        if (!isFullscreenActiveRef.current && !isMinimizedRef.current) {
          handleEnterFullscreen();
        }
      } else {
        // Fix 1, Point 4: whenever isDeviceLandscape becomes false while isFullscreenActive is still true,
        // AUTOMATICALLY call exitFullscreen
        setManuallyExitedInLandscape(false);
        if (isFullscreenActiveRef.current) {
          handleExitFullscreen();
        }
      }
    };

    if (mql) {
      if (mql.addEventListener) {
        mql.addEventListener('change', handleMediaChange);
      } else if ((mql as any).addListener) {
        (mql as any).addListener(handleMediaChange);
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreenActiveRef.current) {
        handleExitFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const handleScreenOrientationChange = () => {
      if (screen.orientation?.type?.startsWith('portrait') && isFullscreenActiveRef.current) {
        handleExitFullscreen();
      }
    };
    screen.orientation?.addEventListener?.('change', handleScreenOrientationChange);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      if (mql) {
        if (mql.removeEventListener) {
          mql.removeEventListener('change', handleMediaChange);
        } else if ((mql as any).removeListener) {
          (mql as any).removeListener(handleMediaChange);
        }
      }
      window.removeEventListener('keydown', handleKeyDown);
      screen.orientation?.removeEventListener?.('change', handleScreenOrientationChange);
    };
  }, [handleEnterFullscreen, handleExitFullscreen]);

  // Force stop video playback immediately when forceStop turns true, and exit fullscreen/minimized if active
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
      if (isMinimized) {
        handleMiniPlayerClose();
      }
    }
  }, [effectiveForceStop, isFullscreen, isMinimized, handleExitFullscreen, handleMiniPlayerClose]);

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
    } else {
      if (typeof window !== 'undefined' && window.history.state?.ytPlayer) {
        window.history.back();
      } else {
        onClose();
      }
    }
  };

  // ================= PORTRAIT GESTURE LAYER (Unified Pointer-Event State Machine) =================
  const [showPortraitControls, setShowPortraitControls] = useState(true);
  const [seekFeedback, setSeekFeedback] = useState<{
    direction: 'forward' | 'backward';
    key: number;
  } | null>(null);
  const seekFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activePointerRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startTime: number;
    lastX: number;
    lastY: number;
    hasMovedPastThreshold: boolean;
  } | null>(null);

  const lastTapRef = useRef<{
    x: number;
    y: number;
    time: number;
  } | null>(null);

  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSeekBy = useCallback((deltaSeconds: number) => {
    if (!playerRef.current) return;
    try {
      const currentTime =
        typeof playerRef.current.getCurrentTime === 'function'
          ? playerRef.current.getCurrentTime()
          : 0;
      const newTime = Math.max(0, currentTime + deltaSeconds);
      if (typeof playerRef.current.seekTo === 'function') {
        playerRef.current.seekTo(newTime, true);
      }

      if (seekFeedbackTimerRef.current) {
        clearTimeout(seekFeedbackTimerRef.current);
      }
      setSeekFeedback({
        direction: deltaSeconds > 0 ? 'forward' : 'backward',
        key: Date.now(),
      });
      seekFeedbackTimerRef.current = setTimeout(() => {
        setSeekFeedback(null);
      }, 700);
    } catch (err) {
      console.warn('Seek failed:', err);
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only handle primary pointer (first finger touch or left mouse click)
    if (!e.isPrimary) return;
    if (e.target !== e.currentTarget) return;

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture fails
    }

    activePointerRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTime: Date.now(),
      lastX: e.clientX,
      lastY: e.clientY,
      hasMovedPastThreshold: false,
    };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const session = activePointerRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    session.lastX = e.clientX;
    session.lastY = e.clientY;

    const dx = e.clientX - session.startX;
    const dy = e.clientY - session.startY;
    const dist = Math.hypot(dx, dy);

    // Movement threshold ~10px before committing to swipe-tracking
    if (!session.hasMovedPastThreshold && dist >= 10) {
      session.hasMovedPastThreshold = true;
      // Committed to swipe: cancel any pending single-tap and clear double-tap candidate
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapRef.current = null;
    }

    if (session.hasMovedPastThreshold && e.cancelable) {
      e.preventDefault();
    }
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const session = activePointerRef.current;
      if (!session || session.pointerId !== e.pointerId) return;

      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }

      activePointerRef.current = null;

      const endX = e.clientX;
      const endY = e.clientY;
      const deltaX = endX - session.startX;
      const deltaY = endY - session.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // CLASSIFY GESTURE ONLY AFTER COMPLETION (Unified Pointer State Machine)

      // 1. Swipe classification: movement >= 10px, net vertical displacement magnitude >= 80px, vertical dominant
      if (session.hasMovedPastThreshold && absY >= 80 && absY > absX) {
        if (e.cancelable) {
          e.preventDefault();
        }
        if (singleTapTimerRef.current) {
          clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = null;
        }
        lastTapRef.current = null;

        if (deltaY < -80) {
          // Gesture 1: Swipe UP on video area -> Fullscreen (when in Portrait)
          if (!isFullscreenActiveRef.current) {
            handleEnterFullscreen();
          }
          return;
        } else if (deltaY > 80) {
          // Gesture 2: Swipe DOWN
          // Branch on current mode (Landscape vs Portrait)
          if (isFullscreenActiveRef.current) {
            // Landscape/Fullscreen mode: swipe-down returns to Portrait player while continuing playback uninterrupted
            handleExitFullscreen();
          } else {
            // Portrait mode: swipe-down pauses playback and enters floating mini-player
            try {
              playerRef.current?.pauseVideo?.();
            } catch (err) {
              console.warn('pauseVideo on swipe-down failed:', err);
            }
            setIsPlaying(false);
            handleEnterMinimized();
          }
          return;
        }
      }

      // 2. Aborted / partial drag: moved > 10px but didn't reach 80px threshold -> discard (not a tap)
      if (session.hasMovedPastThreshold) {
        if (singleTapTimerRef.current) {
          clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = null;
        }
        lastTapRef.current = null;
        return;
      }

      // 3. Clean Tap Sequence: movement was < 10px
      const now = Date.now();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const clickX = endX - rect.left;
      const widthRatio = rect.width > 0 ? clickX / rect.width : 0.5;

      const lastTap = lastTapRef.current;
      const isDoubleTap =
        lastTap !== null &&
        now - lastTap.time <= 300 &&
        Math.hypot(endX - lastTap.x, endY - lastTap.y) < 40;

      if (isDoubleTap) {
        // Double-tap detected: cancel pending single tap
        if (singleTapTimerRef.current) {
          clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = null;
        }
        lastTapRef.current = null;

        // Double-tap classification by horizontal region
        if (widthRatio > 2 / 3) {
          // Gesture 3: Double-tap right third -> seek forward 10s
          handleSeekBy(10);
        } else if (widthRatio < 1 / 3) {
          // Gesture 4: Double-tap left third -> seek backward 10s
          handleSeekBy(-10);
        } else {
          // Middle third double-tap -> toggle controls
          if (isFullscreenActiveRef.current) {
            setShowLandscapeControls((prev) => !prev);
          } else {
            setShowPortraitControls((prev) => !prev);
          }
        }
      } else {
        // Potential single tap: record position and schedule single-tap action after 300ms window
        lastTapRef.current = { x: endX, y: endY, time: now };

        if (singleTapTimerRef.current) {
          clearTimeout(singleTapTimerRef.current);
        }

        singleTapTimerRef.current = setTimeout(() => {
          // Gesture 5: Single tap on video background -> toggle controls visibility
          if (isFullscreenActiveRef.current) {
            setShowLandscapeControls((prev) => !prev);
          } else {
            setShowPortraitControls((prev) => !prev);
          }
          lastTapRef.current = null;
          singleTapTimerRef.current = null;
        }, 300);
      }
    },
    [handleEnterFullscreen, handleExitFullscreen, handleEnterMinimized, handleSeekBy]
  );

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerRef.current?.pointerId === e.pointerId) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      activePointerRef.current = null;
    }
  }, []);

  // Clean up gesture timers on unmount
  useEffect(() => {
    return () => {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
      }
      if (seekFeedbackTimerRef.current) {
        clearTimeout(seekFeedbackTimerRef.current);
      }
    };
  }, []);

  return (
    <div
      id="youngtube-player-view"
      dir="rtl"
      className={
        isMinimized
          ? 'fixed inset-0 z-50 pointer-events-none bg-transparent select-none'
          : 'fixed inset-0 z-50 bg-stone-950 text-white flex flex-col h-screen w-screen overflow-hidden select-none'
      }
    >
      {/* ================= TOP HALF / VIDEO AREA ================= */}
      <div
        className={
          isFullscreen
            ? 'fixed inset-0 z-50 w-full h-full bg-black overflow-hidden'
            : isMinimized
            ? 'fixed bottom-5 right-5 z-50 pointer-events-auto w-[160px] h-[90px] sm:w-[200px] sm:h-[112px] rounded-2xl shadow-2xl shadow-black/90 ring-1 ring-white/20 bg-black flex items-center justify-center transition-all duration-300'
            : 'flex-1 flex flex-col min-h-0 bg-stone-900 border-b border-stone-800'
        }
      >
        {/* Top Quarter (~25% of top half): Meta & Parent Actions (Portrait only) */}
        {!isFullscreen && !isMinimized && (
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
                {currentVideo.title}
              </h2>
              <p className="text-xs text-stone-400 truncate">
                {currentVideo.channelTitle}
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
              : isMinimized
              ? 'w-full h-full relative bg-black rounded-2xl overflow-hidden flex items-center justify-center'
              : 'h-[75%] relative bg-black w-full flex items-center justify-center overflow-hidden'
          }
        >
          {/* Exactly ONE YouTube Video Instance across entire lifetime */}
          <YouTube
            videoId={currentVideo.videoId}
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
              isLoved={isLoved}
              currentTime={currentTime}
              duration={duration}
              videoTitle={currentVideo.title}
              channelTitle={currentVideo.channelTitle}
              onTogglePlay={handleTogglePlay}
              onToggleLoop={handleToggleLoop}
              onToggleLove={handleToggleLove}
              onPrev={handlePrev}
              onNext={handleNext}
              onSeek={handleSeek}
              onExitFullscreen={handleExitFullscreen}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              showOverlay={showLandscapeControls}
              setShowOverlay={setShowLandscapeControls}
            />
          ) : isMinimized ? (
            /* Minimized Mini-Player Body Tap Target */
            <div
              id="mini-player-body-tap"
              onClick={handleExpandFromMinimized}
              className="absolute inset-0 z-20 cursor-pointer flex items-center justify-center bg-black/20 hover:bg-black/35 transition group rounded-2xl"
              aria-label="تكبير واستئناف المشاهدة"
              title="انقر لاستئناف المشاهدة وتكبير المشغل"
            >
              <div className="w-9 h-9 rounded-full bg-black/60 border border-white/20 text-white flex items-center justify-center opacity-85 group-hover:opacity-100 group-hover:scale-105 transition shadow-md pointer-events-none">
                <Play className="w-4 h-4 fill-white text-white translate-x-0.5" />
              </div>
            </div>
          ) : (
            /* Portrait Gesture Layer & Fullscreen Button */
            <>
              {/* Unified Pointer-Event Gesture Layer for Portrait Mode */}
              <div
                id="player-portrait-gesture-layer"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                className="absolute inset-0 z-10 bg-transparent cursor-pointer touch-none select-none"
                aria-label="منطقة إيماءات مشغل الفيديو"
              />

              {/* Portrait Fullscreen Button: visibility toggled by showPortraitControls */}
              <button
                type="button"
                id="player-fullscreen-btn"
                className={`absolute top-3 right-3 z-20 p-2.5 rounded-xl bg-black/60 hover:bg-black/80 text-stone-200 border border-stone-800 transition-opacity duration-200 cursor-pointer ${
                  showPortraitControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                aria-label="ملء الشاشة"
                onClick={handleEnterFullscreen}
                title="عرض بملء الشاشة"
              >
                <Maximize2 className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Seek Feedback Indicators (Active in both Portrait and Landscape) */}
          {seekFeedback && (
            <div
              key={seekFeedback.key}
              className={`absolute top-0 bottom-0 z-40 flex items-center justify-center pointer-events-none transition-all duration-300 ${
                seekFeedback.direction === 'forward'
                  ? 'right-0 w-1/3 bg-white/10 rounded-l-3xl backdrop-blur-[1px]'
                  : 'left-0 w-1/3 bg-white/10 rounded-r-3xl backdrop-blur-[1px]'
              }`}
            >
              <div className="flex flex-col items-center justify-center gap-1.5 text-white bg-black/60 px-4 py-2.5 rounded-2xl border border-white/10 shadow-lg animate-in fade-in zoom-in-95 duration-150">
                {seekFeedback.direction === 'forward' ? (
                  <FastForward className="w-7 h-7 fill-white text-white" />
                ) : (
                  <Rewind className="w-7 h-7 fill-white text-white" />
                )}
                <span className="text-xs font-bold font-mono tracking-wide">
                  {seekFeedback.direction === 'forward' ? '+10s' : '-10s'}
                </span>
              </div>
            </div>
          )}

          {/* Mini-Player Close "X" Button placed at top-right of mini rectangle */}
          {isMinimized && (
            <button
              type="button"
              id="mini-player-close-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleMiniPlayerClose();
              }}
              className="absolute -top-2 -right-2 z-30 w-7 h-7 rounded-full bg-stone-900 border border-stone-600 hover:border-rose-400 text-stone-200 hover:text-white hover:bg-rose-600 shadow-lg flex items-center justify-center cursor-pointer transition"
              aria-label="إغلاق المشغل المصغر"
              title="إغلاق الفيديو"
            >
              <X className="w-3.5 h-3.5" />
            </button>
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
      {!isFullscreen && !isMinimized && (
        <div className="flex-1 flex flex-col justify-between p-4 sm:p-6 bg-stone-950 min-h-0 overflow-y-auto overscroll-contain gap-4">
          {/* Row 1: Seek bar & Time display */}
          <div className="w-full">
            <PlayerSeekBar
              id="portrait-player-seek-bar"
              currentTime={currentTime}
              duration={duration}
              onSeek={handleSeek}
            />
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
                onClick={handlePrev}
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
                onClick={handleNext}
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
                className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center transition cursor-pointer ${
                  isSettingsOpen
                    ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50 ring-2 ring-amber-400/20'
                    : 'bg-stone-900/60 hover:bg-stone-800/80 hover:text-stone-200 text-stone-400'
                }`}
                aria-label="الإعدادات (السرعة، الجودة، الترجمة)"
                title="الإعدادات (السرعة، الجودة، الترجمة)"
                onClick={handleOpenSettings}
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
                className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center transition cursor-pointer ${
                  isLoved
                    ? 'bg-rose-500/25 text-rose-400 border border-rose-500/50 ring-2 ring-rose-500/30'
                    : 'bg-stone-900/60 hover:bg-rose-950/40 hover:text-rose-400 text-stone-400'
                }`}
                aria-label={isLoved ? 'إلغاء الإعجاب' : 'إعجاب / مفضلة'}
                title={isLoved ? 'إلغاء الإعجاب' : 'إعجاب / مفضلة'}
                onClick={handleToggleLove}
              >
                <Heart
                  className={`w-5 h-5 ${
                    isLoved ? 'fill-rose-500 text-rose-500' : 'text-stone-400'
                  }`}
                />
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
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none overscroll-x-contain touch-pan-x">
              {playlist
                .filter((item) => item.videoId !== currentVideo.videoId)
                .map((item) => (
                  <button
                    key={item.videoId}
                    type="button"
                    onClick={() => handlePlayQueuedVideo(item)}
                    className="shrink-0 w-36 sm:w-44 bg-stone-900 hover:bg-stone-800 rounded-xl border border-stone-800 p-2 flex flex-col gap-1.5 text-right cursor-pointer transition active:scale-95 group focus:outline-none focus:ring-1 focus:ring-stone-600"
                  >
                    <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-stone-950">
                      <img
                        src={`https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-stone-200 line-clamp-1 group-hover:text-white">
                      {item.title}
                    </span>
                    <span className="text-[10px] text-stone-400 truncate">
                      {item.channelTitle}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Portrait Playback Settings Bottom Sheet */}
      {!isFullscreen && !isMinimized && (
        <PlayerSettingsSheet
          isOpen={isSettingsOpen}
          onClose={handleCloseSettings}
          player={playerRef.current}
        />
      )}
    </div>
  );
};
