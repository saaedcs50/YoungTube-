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
import PinLockModal from '../components/PinLockModal';
import channelsSeed from '../../channels_seed.json';
import { recordChildReaction, logTasteEvent, applyLoggedTasteEvent } from '../tasteShiftStorage';
import db from '../db';

export interface QueuedVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId?: string;
}

const DEFAULT_PLAYLIST: QueuedVideo[] = [
  {
    videoId: 's6X_Q54_PBs',
    title: 'Alphablocks - مغامرة الحروف والكلمات الإنجليزية',
    channelTitle: 'Alphablocks',
    channelId: 'UC_qs3c0ehDvZkbiEbOj6Drg',
  },
  {
    videoId: 'u7e33WnUf0A',
    title: 'Numberblocks - أصدقاء الأرقام وتعلم الحساب للأطفال',
    channelTitle: 'Numberblocks',
    channelId: 'UCPlwvN0w4qFSP1FllALB92w',
  },
  {
    videoId: 'x1rB6E1oTss',
    title: 'Art for Kids Hub - تعلم رسم وتلوين الحيوانات بالريشة',
    channelTitle: 'Art for Kids Hub',
    channelId: 'UC5XMF3Inoi8R9nSI8ChOsdQ',
  },
  {
    videoId: 'w_gWvL8fN8g',
    title: 'Arabian Fairy Tales - حكاية الشجرة الحكيمة والطيور الملونة',
    channelTitle: 'Arabian Fairy Tales',
    channelId: 'UCazFScO30FKY3YoNNDfNY5g',
  },
  {
    videoId: '02E1468SdHg',
    title: 'Cosmic Kids Yoga - مغامرة الحركة واليوغا والنشاط الصحي',
    channelTitle: 'Cosmic Kids Yoga',
    channelId: 'UC5uIZ2KOZZeQDQo_Gsi_qbQ',
  },
  {
    videoId: 'UeF09e7hDbg',
    title: '5-Minute Crafts PLAY - أفكار أشغال يدوية وابتكارات بالورق',
    channelTitle: '5-Minute Crafts PLAY',
    channelId: 'UC57XAjJ04TY8gNxOWf-Sy0Q',
  },
  {
    videoId: 'tbCjkPlsaes',
    title: 'AllAttack - مهارات وتحديات رياضية ممتعة للأبطال',
    channelTitle: 'AllAttack',
    channelId: 'UC0Ik25PHaiHCbfGrzu-lBFQ',
  },
];

interface PlayerViewProps {
  videoId: string;
  videoTitle?: string;
  channelTitle?: string;
  channelId?: string;
  onVideoHidden?: (videoId: string) => void;
  onChannelBlocked?: () => void;
  onRefreshHomeFeed?: () => void;
  onClose: () => void;
  onEnded: () => void;
  forceStop?: boolean;
  isFullscreen?: boolean;
  onEnterFullscreen?: () => void;
  onExitFullscreen?: () => void;
  isMinimized?: boolean;
  onEnterMinimized?: () => void;
  onExitMinimized?: () => void;
  isSheetOpen?: boolean;
  onOpenSheet?: () => void;
  onCloseSheet?: () => void;
  onPlayingChange?: (playing: boolean) => void;
}

export const PlayerView: React.FC<PlayerViewProps> = ({
  videoId,
  videoTitle,
  channelTitle,
  channelId: propChannelId,
  onVideoHidden,
  onChannelBlocked,
  onRefreshHomeFeed,
  onClose,
  onEnded,
  forceStop,
  isFullscreen: propIsFullscreen,
  onEnterFullscreen,
  onExitFullscreen,
  isMinimized: propIsMinimized,
  onEnterMinimized,
  onExitMinimized,
  isSheetOpen: propIsSheetOpen,
  onOpenSheet,
  onCloseSheet,
  onPlayingChange,
}) => {
  const playerRef = useRef<YouTubePlayer | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [testForceStop, setTestForceStop] = useState(false);

  // Minimized state (floating mini-player in bottom-right corner)
  const [isMinimizedLocal, setIsMinimizedLocal] = useState(false);
  const isMinimized = (propIsMinimized ?? false) || isMinimizedLocal;
  const isMinimizedRef = useRef(isMinimized);
  isMinimizedRef.current = isMinimized;

  // Primary Player State (declared early to prevent TDZ errors in callbacks & hooks)
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLooping, setIsLooping] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Video Queue & Current Video State
  const [currentVideo, setCurrentVideo] = useState<QueuedVideo>({
    videoId,
    title: videoTitle || 'فيديو أطفال ممتع',
    channelTitle: channelTitle || 'قناة أطفال موثوقة',
    channelId: propChannelId,
  });

  useEffect(() => {
    setCurrentVideo({
      videoId,
      title: videoTitle || 'فيديو أطفال ممتع',
      channelTitle: channelTitle || 'قناة أطفال موثوقة',
      channelId: propChannelId,
    });
  }, [videoId, videoTitle, channelTitle, propChannelId]);

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
    setIsMinimizedLocal(true);
    if (onEnterMinimized) {
      onEnterMinimized();
    } else if (typeof window !== 'undefined' && !window.history.state?.minimized) {
      window.history.pushState({ ytPlayer: true, fullscreen: false, minimized: true }, '');
    }
  }, [onEnterMinimized]);

  // Taste Shift phase D event logging refs
  const openedVideoIdsRef = useRef(new Set<string>());
  const completedVideoIdsRef = useRef(new Set<string>());
  const skippedVideoIdsRef = useRef(new Set<string>());

  const getCategoryForVideo = useCallback(
    async (vidId: string, chId?: string): Promise<string> => {
      if (chId) {
        const seedMatch = (channelsSeed as any[]).find((c) => c.sourceId === chId);
        if (seedMatch?.categories && seedMatch.categories.length > 0) {
          return seedMatch.categories[0];
        }
        const seedCatMatch = (channelsSeed as any[]).find(
          (c) => c.title === chId || c.originalName === chId
        );
        if (seedCatMatch?.categories && seedCatMatch.categories.length > 0) {
          return seedCatMatch.categories[0];
        }
        try {
          const dbChan = await db.channels.where('sourceId').equals(chId).first();
          if (dbChan?.category && dbChan.category.length > 0) {
            return dbChan.category[0];
          }
        } catch {}
      }
      try {
        const feedRow = await db.feedCache.get(vidId);
        if (feedRow?.channelId) {
          const seedMatch = (channelsSeed as any[]).find((c) => c.sourceId === feedRow.channelId);
          if (seedMatch?.categories && seedMatch.categories.length > 0) {
            return seedMatch.categories[0];
          }
          const dbChan = await db.channels.where('sourceId').equals(feedRow.channelId).first();
          if (dbChan?.category && dbChan.category.length > 0) {
            return dbChan.category[0];
          }
        }
      } catch {}
      return 'general';
    },
    []
  );

  const checkAndLogSkippedEarly = useCallback(
    (vId: string, cur: number, dur: number, chId?: string) => {
      if (dur > 0 && cur > 0 && cur / dur < 0.2 && !skippedVideoIdsRef.current.has(vId)) {
        skippedVideoIdsRef.current.add(vId);
        void (async () => {
          const catId = await getCategoryForVideo(vId, chId || propChannelId);
          await logTasteEvent(catId, 'skipped_early', vId, { watchMs: Math.round(cur * 1000) });
          await applyLoggedTasteEvent(catId, 'skipped_early');
        })();
      }
    },
    [getCategoryForVideo, propChannelId]
  );

  const handleMiniPlayerClose = useCallback(() => {
    checkAndLogSkippedEarly(currentVideo.videoId, currentTime, duration, currentVideo.channelId);
    try {
      playerRef.current?.stopVideo?.();
    } catch (err) {
      console.warn('stopVideo on mini-close failed:', err);
    }
    setIsPlaying(false);
    setIsMinimizedLocal(false);
    onExitMinimized?.();
    onClose();
  }, [checkAndLogSkippedEarly, currentVideo, currentTime, duration, onClose, onExitMinimized]);

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
  // - isFullscreenActive comes strictly from document.fullscreenElement / webkitFullscreenElement
  // Physical device landscape alone does NOT auto-switch to LandscapeShell
  const isFullscreen =
    (propIsFullscreen ?? false) ||
    isFullscreenActive;

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

  const [playlist, setPlaylist] = useState<QueuedVideo[]>(() => {
    const list = [...DEFAULT_PLAYLIST];
    if (!list.some((v) => v.videoId === videoId)) {
      list.unshift({
        videoId,
        title: videoTitle || 'فيديو أطفال ممتع',
        channelTitle: channelTitle || 'قناة أطفال موثوقة',
        channelId: propChannelId,
      });
    }
    return list;
  });

  // Merge with bounded cached feed if present in Dexie (excluding hidden videos)
  useEffect(() => {
    let isCancelled = false;
    async function loadFeedQueue() {
      try {
        const currentItem: QueuedVideo = {
          videoId,
          title: videoTitle || 'فيديو أطفال ممتع',
          channelTitle: channelTitle || 'قناة أطفال موثوقة',
          channelId: propChannelId,
        };

        const channelIdToQuery = propChannelId;
        let sameChannelItems: QueuedVideo[] = [];

        // 1. Fetch videos from the same channel if channelId is available, sorted by fetchedAt desc
        if (channelIdToQuery) {
          try {
            const rawSame = await db.feedCache
              .where('channelId')
              .equals(channelIdToQuery)
              .toArray();
            (rawSame || []).sort((a, b) => (b.fetchedAt || 0) - (a.fetchedAt || 0));
            sameChannelItems = (rawSame || [])
              .filter((f) => !f.hidden)
              .slice(0, 20)
              .map((f) => ({
                videoId: f.videoId,
                title: f.title,
                channelTitle: channelTitle || 'قناة أطفال موثوقة',
                channelId: f.channelId,
              }));
          } catch (e) {
            console.warn('Channel query fallback:', e);
          }
        }

        // 2. Fetch up to 30 recent items from feedCache using orderBy('fetchedAt').reverse().limit(30)
        let recentFeedItems: QueuedVideo[] = [];
        try {
          const rawRecent = await db.feedCache.orderBy('fetchedAt').reverse().limit(30).toArray();
          recentFeedItems = (rawRecent || [])
            .filter((f) => !f.hidden)
            .map((f) => ({
              videoId: f.videoId,
              title: f.title,
              channelTitle: 'قناة أطفال موثوقة',
              channelId: f.channelId,
            }));
        } catch (e) {
          console.warn('Recent feed query fallback:', e);
        }

        if (isCancelled) return;

        const seen = new Set<string>();
        const merged: QueuedVideo[] = [];
        for (const item of [
          currentItem,
          ...sameChannelItems,
          ...recentFeedItems,
          ...DEFAULT_PLAYLIST,
        ]) {
          if (!seen.has(item.videoId)) {
            seen.add(item.videoId);
            merged.push(item);
          }
        }
        setPlaylist(merged.slice(0, 50));
      } catch (err) {
        console.warn('Failed to load bounded feed queue:', err);
      }
    }
    loadFeedQueue();
    return () => {
      isCancelled = true;
    };
  }, [videoId, videoTitle, channelTitle, propChannelId]);

  // Current Time & Duration tracking (optimizing re-renders: setState at most once per second or on seek/change)
  const lastSecondRef = useRef(-1);

  useEffect(() => {
    const timer = setInterval(() => {
      if (playerRef.current) {
        try {
          const cur = playerRef.current.getCurrentTime?.() || 0;
          const dur = playerRef.current.getDuration?.() || 0;
          const sec = Math.floor(cur);

          if (sec !== lastSecondRef.current) {
            lastSecondRef.current = sec;
            setCurrentTime(cur);
          }
          if (dur > 0 && Math.abs(dur - duration) > 0.5) {
            setDuration(dur);
          }
          if (dur > 0 && cur / dur >= 0.8) {
            const vId = currentVideo.videoId;
            if (!completedVideoIdsRef.current.has(vId)) {
              completedVideoIdsRef.current.add(vId);
              void (async () => {
                const catId = await getCategoryForVideo(vId, currentVideo.channelId || propChannelId);
                await logTasteEvent(catId, 'completed', vId, { watchMs: Math.round(cur * 1000) });
                await applyLoggedTasteEvent(catId, 'completed');
              })();
            }
          }
        } catch {}
      }
    }, 350);
    return () => clearInterval(timer);
  }, [duration]);

  const handleSeek = useCallback((targetSeconds: number) => {
    if (!playerRef.current) return;
    try {
      if (typeof playerRef.current.seekTo === 'function') {
        playerRef.current.seekTo(targetSeconds, true);
      }
      lastSecondRef.current = Math.floor(targetSeconds);
      setCurrentTime(targetSeconds);
    } catch (err) {
      console.warn('Seek failed:', err);
    }
  }, []);

  // Video switching via loadVideoById (no black flash, same instance)
  const handlePlayQueuedVideo = useCallback((item: QueuedVideo) => {
    checkAndLogSkippedEarly(currentVideo.videoId, currentTime, duration, currentVideo.channelId);
    setCurrentVideo(item);
    lastSecondRef.current = 0;
    setCurrentTime(0);
    try {
      playerRef.current?.loadVideoById?.(item.videoId);
      setIsPlaying(true);
    } catch (err) {
      console.warn('loadVideoById failed:', err);
    }
  }, [checkAndLogSkippedEarly, currentVideo, currentTime, duration]);

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

  // Helper: Resolve channelId robustly
  const resolveChannelId = useCallback(
    async (vidId: string, chTitle?: string, fallbackId?: string): Promise<string> => {
      if (fallbackId) return fallbackId;
      if (currentVideo.channelId) return currentVideo.channelId;
      try {
        const feedRow = await db.feedCache.get(vidId);
        if (feedRow?.channelId) return feedRow.channelId;
        const inter = await db.interactions.get(vidId);
        if (inter?.channelId) return inter.channelId;
        const foundInPlaylist = playlist.find((p) => p.videoId === vidId);
        if (foundInPlaylist?.channelId) return foundInPlaylist.channelId;
        if (chTitle) {
          const ch = await db.channels.where('title').equals(chTitle).first();
          if (ch?.sourceId) return ch.sourceId;
          const seedMatch = (channelsSeed as any[]).find(
            (c) => c.title === chTitle || c.originalName === chTitle
          );
          if (seedMatch?.sourceId) return seedMatch.sourceId;
        }
      } catch (err) {
        console.warn('resolveChannelId error:', err);
      }
      return chTitle || vidId;
    },
    [currentVideo.channelId, playlist]
  );

  // Love / Favorite state (persisted via Dexie interactions parentRating: 'liked')
  const [isLoved, setIsLoved] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function checkLoved() {
      try {
        const interaction = await db.interactions.get(currentVideo.videoId);
        if (isMounted) {
          setIsLoved(Boolean(interaction?.childLoved || interaction?.parentRating === 'liked'));
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
      const existing = await db.interactions.get(currentVideo.videoId);
      if (existing) {
        await db.interactions.update(currentVideo.videoId, {
          childLoved: nextLoved,
          ...(existing.parentRating === 'liked' ? { parentRating: undefined } : {}),
          lastWatched: Date.now(),
        });
      } else {
        const targetChannelId = await resolveChannelId(
          currentVideo.videoId,
          currentVideo.channelTitle,
          propChannelId
        );
        await db.interactions.put({
          videoId: currentVideo.videoId,
          channelId: targetChannelId,
          title: currentVideo.title,
          thumbnail: `https://i.ytimg.com/vi/${currentVideo.videoId}/hqdefault.jpg`,
          watchTime: 0,
          videoDuration: 0,
          completed: false,
          lastWatched: Date.now(),
          childLoved: nextLoved,
        });
      }

      if (nextLoved) {
        const realCat = await getCategoryForVideo(currentVideo.videoId, currentVideo.channelId || propChannelId);
        void recordChildReaction({
          categoryId: realCat,
          videoId: currentVideo.videoId,
          channelId: currentVideo.channelId || propChannelId,
          title: currentVideo.title,
          reaction: 'liked',
        });
      }
    } catch (err) {
      console.warn('Failed to record love reaction:', err);
    }
  }, [isLoved, currentVideo, propChannelId, resolveChannelId, getCategoryForVideo]);

  // Save (Parent Bookmark) state (persisted via Dexie interactions.savedByParent)
  const [isSavedByParent, setIsSavedByParent] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function checkSaved() {
      try {
        const interaction = await db.interactions.get(currentVideo.videoId);
        if (isMounted) {
          setIsSavedByParent(Boolean(interaction?.savedByParent));
        }
      } catch (err) {
        console.warn('Failed to check saved interaction:', err);
      }
    }
    checkSaved();
    return () => {
      isMounted = false;
    };
  }, [currentVideo.videoId]);

  const handleToggleSave = useCallback(async () => {
    const nextSaved = !isSavedByParent;
    setIsSavedByParent(nextSaved);

    try {
      const existing = await db.interactions.get(currentVideo.videoId);
      if (existing) {
        await db.interactions.update(currentVideo.videoId, {
          savedByParent: nextSaved,
          lastWatched: Date.now(),
        });
      } else {
        const targetChannelId = await resolveChannelId(
          currentVideo.videoId,
          currentVideo.channelTitle,
          propChannelId
        );
        await db.interactions.put({
          videoId: currentVideo.videoId,
          channelId: targetChannelId,
          title: currentVideo.title,
          thumbnail: `https://i.ytimg.com/vi/${currentVideo.videoId}/hqdefault.jpg`,
          watchTime: 0,
          videoDuration: 0,
          completed: false,
          lastWatched: Date.now(),
          savedByParent: nextSaved,
        });
      }
    } catch (err) {
      console.warn('Failed to update savedByParent interaction:', err);
    }
  }, [isSavedByParent, currentVideo, propChannelId, resolveChannelId]);

  const effectiveForceStop = forceStop || testForceStop;

  // Settings Bottom Sheet State (delegated to App.tsx history manager when provided)
  const [isSettingsOpenLocal, setIsSettingsOpenLocal] = useState(false);
  const isSettingsOpen = (propIsSheetOpen !== undefined) ? propIsSheetOpen : isSettingsOpenLocal;

  const handleOpenSettings = useCallback(() => {
    if (onOpenSheet) {
      onOpenSheet();
    } else {
      if (typeof window !== 'undefined' && !window.history.state?.sheetOpen) {
        window.history.pushState({ ...window.history.state, ytPlayer: true, sheetOpen: true }, '');
      }
      setIsSettingsOpenLocal(true);
    }
  }, [onOpenSheet]);

  const handleCloseSettings = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.state?.sheetOpen) {
      window.history.back();
    } else {
      setIsSettingsOpenLocal(false);
      onCloseSheet?.();
    }
  }, [onCloseSheet]);

  // Close sheet if video enters fullscreen, is minimized, or receives forceStop
  useEffect(() => {
    if ((isFullscreen || isMinimized || effectiveForceStop) && isSettingsOpen) {
      if (typeof window !== 'undefined' && window.history.state?.sheetOpen) {
        window.history.back();
      } else {
        setIsSettingsOpenLocal(false);
        onCloseSheet?.();
      }
    }
  }, [isFullscreen, isMinimized, effectiveForceStop, isSettingsOpen, onCloseSheet]);

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
      // Device rotation alone does NOT auto-enter fullscreen or switch to LandscapeShell
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
      onPlayingChange?.(false);
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
  }, [effectiveForceStop, isFullscreen, isMinimized, handleExitFullscreen, handleMiniPlayerClose, onPlayingChange]);

  // Clean up playback and fullscreen on unmount
  useEffect(() => {
    return () => {
      onPlayingChange?.(false);
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
  }, [onPlayingChange]);

  const handleReady: YouTubeProps['onReady'] = (event) => {
    playerRef.current = event.target;
  };

  const handleStateChange: YouTubeProps['onStateChange'] = (event) => {
    // 1: PLAYING
    if (event.data === 1) {
      setIsPlaying(true);
      onPlayingChange?.(true);
      const vId = currentVideo.videoId;
      if (!openedVideoIdsRef.current.has(vId)) {
        openedVideoIdsRef.current.add(vId);
        void (async () => {
          const catId = await getCategoryForVideo(vId, currentVideo.channelId || propChannelId);
          await logTasteEvent(catId, 'opened', vId);
        })();
      }
    }
    // 2: PAUSED
    else if (event.data === 2) {
      setIsPlaying(false);
      onPlayingChange?.(false);
    }
    // 0: ENDED
    else if (event.data === 0) {
      if (isLooping) {
        try {
          event.target?.seekTo?.(0, true);
          event.target?.playVideo?.();
          setIsPlaying(true);
          onPlayingChange?.(true);
        } catch {
          // ignore
        }
      } else {
        setIsPlaying(false);
        onPlayingChange?.(false);
        const vId = currentVideo.videoId;
        if (!completedVideoIdsRef.current.has(vId)) {
          completedVideoIdsRef.current.add(vId);
          void (async () => {
            const catId = await getCategoryForVideo(vId, currentVideo.channelId || propChannelId);
            await logTasteEvent(catId, 'completed', vId, { watchMs: Math.round(currentTime * 1000) });
            await applyLoggedTasteEvent(catId, 'completed');
          })();
        }
        try {
          event.target?.stopVideo?.();
        } catch {
          // ignore
        }
        onEnded();
      }
    }
  };

  const handleClose = useCallback(() => {
    checkAndLogSkippedEarly(currentVideo.videoId, currentTime, duration, currentVideo.channelId);
    if (isFullscreen) {
      handleExitFullscreen();
    } else {
      if (typeof window !== 'undefined' && window.history.state?.ytPlayer) {
        window.history.back();
      } else {
        onClose();
      }
    }
  }, [checkAndLogSkippedEarly, currentVideo, currentTime, duration, isFullscreen, handleExitFullscreen, onClose]);

  // Hide Video state & handler
  const [hideConfirmed, setHideConfirmed] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setHideConfirmed(false);
  }, [currentVideo.videoId]);

  const handleHideVideo = useCallback(async () => {
    if (hideConfirmed) return;
    setHideConfirmed(true);

    try {
      const existing = await db.feedCache.get(currentVideo.videoId);
      if (existing) {
        await db.feedCache.update(currentVideo.videoId, { hidden: true });
      } else {
        const targetChannelId = await resolveChannelId(
          currentVideo.videoId,
          currentVideo.channelTitle,
          propChannelId
        );
        await db.feedCache.put({
          videoId: currentVideo.videoId,
          channelId: targetChannelId,
          title: currentVideo.title,
          fetchedAt: Date.now(),
          hidden: true,
        });
      }

      // Remove from local playlist immediately
      setPlaylist((prev) => prev.filter((v) => v.videoId !== currentVideo.videoId));

      onVideoHidden?.(currentVideo.videoId);
      onRefreshHomeFeed?.();
    } catch (err) {
      console.error('Failed to hide video:', err);
    }

    hideTimerRef.current = setTimeout(() => {
      handleClose();
    }, 1500);
  }, [hideConfirmed, currentVideo, propChannelId, resolveChannelId, onVideoHidden, onRefreshHomeFeed, handleClose]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  // Block Channel PIN Gate & handler
  const [showBlockChannelPinModal, setShowBlockChannelPinModal] = useState(false);

  const handleBlockChannelClick = useCallback(() => {
    setShowBlockChannelPinModal(true);
  }, []);

  const handleBlockChannelCancel = useCallback(() => {
    setShowBlockChannelPinModal(false);
  }, []);

  const handleBlockChannelUnlocked = useCallback(async () => {
    setShowBlockChannelPinModal(false);

    try {
      const targetChannelId = await resolveChannelId(
        currentVideo.videoId,
        currentVideo.channelTitle,
        propChannelId
      );

      // 1. db.channels: find row or create with enabled: false
      const existing = await db.channels.where('sourceId').equals(targetChannelId).first();
      if (existing && existing.id) {
        await db.channels.update(existing.id, { enabled: false });
      } else {
        const seedMatch = (channelsSeed as any[]).find((c) => c.sourceId === targetChannelId);
        await db.channels.add({
          sourceType: 'channel',
          sourceId: targetChannelId,
          title: seedMatch?.title || currentVideo.channelTitle || 'قناة محجوبة',
          thumbnail: seedMatch?.thumbnail,
          category: seedMatch?.category || seedMatch?.categories || [],
          isPreloaded: true,
          enabled: false,
        });
      }

      // 2. Mark all cached videos for this channel as hidden
      const cachedVideos = await db.feedCache.where('channelId').equals(targetChannelId).toArray();
      if (cachedVideos.length > 0) {
        await Promise.all(
          cachedVideos.map((v) => db.feedCache.update(v.videoId, { hidden: true }))
        );
      }

      // Remove any video from this channel from local playlist
      setPlaylist((prev) => prev.filter((v) => v.channelId !== targetChannelId));

      onChannelBlocked?.();
      onRefreshHomeFeed?.();
      handleClose();
    } catch (err) {
      console.error('Failed to block channel:', err);
      handleClose();
    }
  }, [currentVideo, propChannelId, resolveChannelId, onChannelBlocked, onRefreshHomeFeed, handleClose]);

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
      {/* ================= TOP HALF / VIDEO AREA (Portrait: 50% height) ================= */}
      <div
        className={
          isFullscreen
            ? 'fixed inset-0 z-50 w-full h-full bg-black overflow-hidden'
            : isMinimized
            ? 'fixed bottom-5 right-5 z-50 pointer-events-auto w-[160px] h-[90px] sm:w-[200px] sm:h-[112px] rounded-2xl shadow-2xl shadow-black/90 ring-1 ring-white/20 bg-black flex items-center justify-center transition-all duration-300'
            : 'w-full h-1/2 flex flex-col bg-stone-900 border-b border-stone-800'
        }
      >
        {/* Top Quarter (25% of top half): Meta & Parent Actions (Portrait only) */}
        {!isFullscreen && !isMinimized && (
          <div className="h-[25%] px-3.5 pt-3 bg-stone-900 flex items-center justify-between border-b border-stone-800/80 gap-2 shrink-0">
            {/* Back/Close button (top-left / start in RTL) */}
            <button
              type="button"
              id="player-close-btn"
              onClick={handleClose}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center text-white transition shrink-0 cursor-pointer active:scale-95"
              aria-label="إغلاق المشغل"
            >
              <ArrowRight className="w-5 h-5" />
            </button>

            {/* Title & Channel Info (1 line) */}
            <div className="flex-1 min-w-0 px-1">
              <h2 className="font-bold text-xs sm:text-sm text-stone-100 truncate">
                {currentVideo.title}
              </h2>
              <p className="text-[11px] text-stone-400 truncate">
                {currentVideo.channelTitle}
              </p>
            </div>

            {/* Parent Action Pill Container */}
            <div className="flex items-center gap-1 shrink-0 bg-white/5 border border-white/10 rounded-full px-2.5 py-1">
              <span className="text-amber-400 text-xs shrink-0">🔒</span>
              <button
                type="button"
                id="player-parent-hide-btn"
                onClick={handleHideVideo}
                disabled={hideConfirmed}
                className="hover:text-amber-300 active:scale-95 transition-colors px-1 text-[11px] font-bold text-white/80 cursor-pointer"
                title="إخفاء الفيديو من القائمة"
              >
                {hideConfirmed ? 'تم الإخفاء ✅' : 'إخفاء'}
              </button>
              <span className="text-white/20 text-xs">·</span>
              <button
                type="button"
                id="player-parent-disable-btn"
                onClick={handleBlockChannelClick}
                className="hover:text-rose-300 active:scale-95 transition-colors px-1 text-[11px] font-bold text-white/80 cursor-pointer"
                title="تعطيل القناة (يتطلب رمز الدخول)"
              >
                تعطيل القناة
              </button>
              <span className="text-white/20 text-xs">·</span>
              <button
                type="button"
                id="player-parent-save-btn"
                onClick={handleToggleSave}
                className="hover:text-emerald-300 active:scale-95 transition-colors px-1 text-[11px] font-bold text-white/80 cursor-pointer"
                title={isSavedByParent ? 'إلغاء الحفظ' : 'حفظ في المفضلة للأهل'}
              >
                {isSavedByParent ? 'محفوظ' : 'حفظ'}
              </button>
            </div>
          </div>
        )}

        {/* Video Area Stage (75% of top half): Full width, no padding, no border-radius */}
        <div
          ref={videoContainerRef}
          id="player-video-container"
          className={
            isFullscreen
              ? 'w-full h-full relative bg-black flex items-center justify-center overflow-hidden'
              : isMinimized
              ? 'w-full h-full relative bg-black rounded-2xl overflow-hidden flex items-center justify-center'
              : 'h-[75%] relative bg-black w-full p-0 rounded-none flex items-center justify-center overflow-hidden'
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
                fs: 0,
                iv_load_policy: 3,
                cc_load_policy: 0,
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

          {/* Soft top & bottom cinematic ambient gradient overlays on video */}
          <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/50 to-transparent pointer-events-none z-10" />
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/70 to-transparent pointer-events-none z-10" />

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
            /* Portrait Gesture Layer & Single Fullscreen Button on stage */
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

              {/* Portrait Fullscreen Button: Backdrop-blur circular button */}
              <button
                type="button"
                id="player-fullscreen-btn"
                className={`absolute top-3 left-3 z-20 w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white flex items-center justify-center hover:bg-black/80 active:scale-90 transition-all shadow-md cursor-pointer ${
                  showPortraitControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                aria-label="تكبير الشاشة بالكامل"
                onClick={handleEnterFullscreen}
                title="عرض بملء الشاشة"
              >
                <Maximize2 className="w-5 h-5 text-white" />
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
            <div className="absolute inset-0 z-30 bg-black/80 flex flex-col items-center justify-center p-4 text-center select-none backdrop-blur-sm">
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

      {/* ================= BOTTOM HALF (Portrait only: 50% height, stone-950) ================= */}
      {!isFullscreen && !isMinimized && (
        <div className="h-1/2 flex flex-col justify-between p-4 sm:p-5 bg-stone-950 min-h-0 overflow-y-auto overscroll-contain gap-3">
          {/* 1) Seek bar dir="ltr" + remaining / total time */}
          <div className="w-full">
            <PlayerSeekBar
              id="portrait-player-seek-bar"
              currentTime={currentTime}
              duration={duration}
              onSeek={handleSeek}
            />
          </div>

          {/* 2) Primary group centered (not spread full width): Prev small · Play/Pause 64px circle · Next small */}
          <div className="flex flex-col items-center justify-center gap-3 my-auto py-1">
            <div
              dir="ltr"
              className="flex items-center justify-center gap-6 sm:gap-8"
            >
              {/* Previous Button (Secondary small rounded icon) */}
              <button
                type="button"
                id="player-control-prev"
                className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/15 text-white flex items-center justify-center active:scale-90 transition-all border border-white/5 cursor-pointer shadow-sm"
                aria-label="السابق"
                onClick={handlePrev}
              >
                <SkipBack className="w-6 h-6" />
              </button>

              {/* Play/Pause Button: 64px Dominant Amber/Golden Control */}
              <button
                type="button"
                id="player-control-play-pause"
                className="w-16 h-16 rounded-full bg-gradient-to-b from-amber-400 to-amber-600 text-stone-950 flex items-center justify-center shadow-[0_8px_24px_rgba(255,159,28,0.45)] border-b-[3px] border-amber-700 active:scale-95 active:translate-y-0.5 transition-transform shrink-0 cursor-pointer"
                aria-label={isPlaying ? 'إيقاف مؤقت' : 'تشغيل'}
                onClick={handleTogglePlay}
              >
                {isPlaying ? (
                  <Pause className="w-8 h-8 fill-stone-950 text-stone-950" />
                ) : (
                  <Play className="w-8 h-8 fill-stone-950 text-stone-950 ml-0.5" />
                )}
              </button>

              {/* Next Button (Secondary small rounded icon) */}
              <button
                type="button"
                id="player-control-next"
                className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/15 text-white flex items-center justify-center active:scale-90 transition-all border border-white/5 cursor-pointer shadow-sm"
                aria-label="التالي"
                onClick={handleNext}
              >
                <SkipForward className="w-6 h-6" />
              </button>
            </div>

            {/* 3) Secondary group (lower opacity): settings · loop · love with text labels */}
            <div className="flex items-center justify-around px-4 border-t border-white/5 pt-2 w-full max-w-xs mx-auto">
              {/* Loop Toggle */}
              <button
                type="button"
                id="player-control-loop"
                onClick={handleToggleLoop}
                className="flex flex-col items-center gap-1 text-white/70 hover:text-white active:scale-95 transition-all cursor-pointer"
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    isLooping
                      ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                      : 'bg-white/5 hover:bg-white/10 text-white/80'
                  }`}
                >
                  <Repeat className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-semibold text-white/60">تكرار</span>
              </button>

              {/* Settings */}
              <button
                type="button"
                id="player-control-settings"
                onClick={handleOpenSettings}
                className="flex flex-col items-center gap-1 text-white/70 hover:text-white active:scale-95 transition-all cursor-pointer"
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    isSettingsOpen
                      ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                      : 'bg-white/5 hover:bg-white/10 text-white/80'
                  }`}
                >
                  <Settings className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-semibold text-white/60">الإعدادات</span>
              </button>

              {/* Love / Favorite */}
              <button
                type="button"
                id="player-control-love"
                onClick={handleToggleLove}
                className="flex flex-col items-center gap-1 text-white/70 hover:text-white active:scale-95 transition-all cursor-pointer"
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    isLoved
                      ? 'bg-rose-500/25 text-rose-400 border border-rose-500/40'
                      : 'bg-white/5 hover:bg-white/10 text-white/80'
                  }`}
                >
                  <Heart
                    className={`w-5 h-5 ${
                      isLoved ? 'fill-rose-500 text-rose-500' : 'text-white/80'
                    }`}
                  />
                </div>
                <span className="text-[11px] font-semibold text-white/60">المفضلة</span>
              </button>
            </div>
          </div>

          {/* 4) Label "التالي في قائمة الأمان" + existing UpNextStrip */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span className="text-xs font-bold text-white">التالي في قائمة الأمان</span>
              </div>
              <span className="text-[10px] text-white/40">
                {Math.max(0, playlist.length - 1)} مقاطع معتمدة
              </span>
            </div>
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

      {/* PIN Lock Modal for Disabling / Blocking Channel */}
      <PinLockModal
        isOpen={showBlockChannelPinModal}
        onClose={handleBlockChannelCancel}
        onUnlockSuccess={handleBlockChannelUnlocked}
      />
    </div>
  );
};
