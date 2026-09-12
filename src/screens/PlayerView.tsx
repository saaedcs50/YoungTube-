import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import db, { FeedItem } from '../db';
import VideoPlayer, { type VideoPlayerHandle } from '../components/VideoPlayer';
import EndScreenSuggestions from '../components/EndScreenSuggestions';
import HideVideoButton from '../components/HideVideoButton';
import PlayerParentActions, { type PlayerParentActionsHandle } from '../components/PlayerParentActions';
import UpNextStrip from '../components/UpNextStrip';
import channelsSeed from '../../channels_seed.json';
import { useGoogleCast } from '../hooks/useGoogleCast';
import {
  ArrowRight,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Maximize2,
  X,
  Cast,
  Play,
  Pause,
} from 'lucide-react';

interface PlayerViewProps {
  videoId: string;
  onBack: () => void;
  onVideoHidden?: (videoId?: string) => void;
}

const MAX_QUEUE = 24;

/**
 * YouTube Kids style player:
 * Top bar, centered player, progress (in VideoPlayer),
 * large Prev/Next, horizontal Up-next strip.
 * Supports swipe-down to minimize into floating mini-player with dedicated 3-button control bar.
 */
export default function PlayerView({
  videoId,
  onBack,
  onVideoHidden,
}: PlayerViewProps) {
  const [currentVideoId, setCurrentVideoId] = useState<string>(videoId);
  const [isEnded, setIsEnded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [swipeOffsetY, setSwipeOffsetY] = useState(0);
  const [videoDetails, setVideoDetails] = useState<FeedItem | null>(null);
  const [queue, setQueue] = useState<FeedItem[]>([]);
  const [autoplay, setAutoplay] = useState(false);

  const videoPlayerRef = useRef<VideoPlayerHandle>(null);
  const parentActionsRef = useRef<PlayerParentActionsHandle>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const cast = useGoogleCast();
  const activeIsPlaying = cast.isConnected ? !cast.isPaused : isPlaying;

  useEffect(() => {
    setCurrentVideoId(videoId);
    setIsEnded(false);
  }, [videoId]);

  // Touch gesture handlers for swipe down
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isMinimized) return;
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || isMinimized) return;
    const touch = e.touches[0];
    const deltaY = touch.clientY - touchStartRef.current.y;
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);

    // If gesture is mostly downward
    if (deltaY > 0 && deltaY > deltaX * 0.8) {
      setSwipeOffsetY(Math.min(deltaY, 200));
    } else if (deltaY < 0) {
      setSwipeOffsetY(0);
    }
  };

  const handleTouchEnd = () => {
    if (!touchStartRef.current || isMinimized) return;
    if (swipeOffsetY > 80) {
      setIsMinimized(true);
    }
    setSwipeOffsetY(0);
    touchStartRef.current = null;
  };

  // Keep history state in sync via replaceState (never pushState) when switching videos inside player
  useEffect(() => {
    try {
      const state = window.history.state;
      if (state?.ytPlayer) {
        window.history.replaceState(
          { ...state, ytPlayer: true, videoId: currentVideoId },
          '',
          window.location.href
        );
      }
    } catch {
      // ignore
    }
  }, [currentVideoId]);

  // Load current details
  useEffect(() => {
    let isMounted = true;
    async function fetchDetails() {
      try {
        const item = await db.feedCache.get(currentVideoId);
        if (isMounted) setVideoDetails(item ?? null);
      } catch {
        if (isMounted) setVideoDetails(null);
      }
    }
    fetchDetails();
    return () => {
      isMounted = false;
    };
  }, [currentVideoId]);

  // Build safe up-next queue from feedCache with bounded indexed queries
  useEffect(() => {
    let cancelled = false;
    async function loadQueue() {
      try {
        const [current, settings] = await Promise.all([
          db.feedCache.get(currentVideoId),
          db.settings.get('main'),
        ]);
        if (cancelled) return;

        const hideMusicVideos = settings?.hideMusicVideos === true;
        const merged: FeedItem[] = [];
        const seen = new Set<string>();

        // Ensure current is first if present and not hidden
        if (current && !current.hidden && (!hideMusicVideos || current.hasMusic !== true)) {
          seen.add(current.videoId);
          merged.push(current);
        }

        // 1. Query by current video's channelId first (capped at MAX_QUEUE)
        if (current?.channelId) {
          const sameChannelVideos = await db.feedCache
            .where('channelId')
            .equals(current.channelId)
            .toArray();

          if (cancelled) return;

          sameChannelVideos.sort((a, b) => {
            const ta = a.publishedAt ? Date.parse(String(a.publishedAt)) : a.fetchedAt || 0;
            const tb = b.publishedAt ? Date.parse(String(b.publishedAt)) : b.fetchedAt || 0;
            return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
          });

          for (const v of sameChannelVideos) {
            if (v.hidden === true) continue;
            if (hideMusicVideos && v.hasMusic === true) continue;
            if (!seen.has(v.videoId)) {
              seen.add(v.videoId);
              merged.push(v);
              if (merged.length >= MAX_QUEUE) break;
            }
          }
        }

        // 2. Only if that yields fewer than MAX_QUEUE items, fetch small additional batch from other enabled channels
        if (merged.length < MAX_QUEUE) {
          const storedChannels = await db.channels.toArray();
          if (cancelled) return;

          const disabledChannelIds = new Set(
            storedChannels.filter((c) => c.enabled === false).map((c) => c.sourceId)
          );

          const enabledChannelIds = Array.from(
            new Set([
              ...storedChannels.filter((c) => c.enabled !== false).map((c) => c.sourceId),
              ...(channelsSeed as any[]).map((c) => c.sourceId),
            ])
          ).filter((id) => id !== current?.channelId && !disabledChannelIds.has(id));

          if (enabledChannelIds.length > 0) {
            const needed = MAX_QUEUE - merged.length;
            const otherVideos = await db.feedCache
              .where('channelId')
              .anyOf(enabledChannelIds)
              .filter((item) => item.hidden !== true && (!hideMusicVideos || item.hasMusic !== true))
              .limit(needed * 2)
              .toArray();

            if (cancelled) return;

            for (const v of otherVideos) {
              if (!seen.has(v.videoId)) {
                seen.add(v.videoId);
                merged.push(v);
                if (merged.length >= MAX_QUEUE) break;
              }
            }
          }
        }

        // If still empty (fresh install edge case), keep at least current stub
        if (merged.length === 0 && currentVideoId) {
          merged.push({
            videoId: currentVideoId,
            channelId: current?.channelId || '',
            title: current?.title || 'فيديو',
            fetchedAt: Date.now(),
            hidden: false,
          });
        }

        setQueue(merged);
      } catch (err) {
        console.error('Failed to build up-next queue:', err);
        if (!cancelled) setQueue([]);
      }
    }
    loadQueue();
    return () => {
      cancelled = true;
    };
  }, [currentVideoId]);

  const seedById = useMemo(() => {
    const map = new Map<string, { title?: string; originalName?: string }>();
    for (const ch of channelsSeed as any[]) {
      if (ch.sourceId) map.set(ch.sourceId, ch);
    }
    return map;
  }, []);

  const channelTitle = useMemo(() => {
    if (!videoDetails?.channelId) return '';
    const seed = seedById.get(videoDetails.channelId);
    return seed?.title || seed?.originalName || '';
  }, [videoDetails, seedById]);

  const currentIndex = useMemo(() => {
    const idx = queue.findIndex((v) => v.videoId === currentVideoId);
    return idx;
  }, [queue, currentVideoId]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < queue.length - 1;

  const goTo = useCallback((id: string) => {
    setCurrentVideoId(id);
    setIsEnded(false);
  }, []);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      goTo(queue[currentIndex - 1].videoId);
    }
  }, [currentIndex, queue, goTo]);

  const goNext = useCallback(() => {
    if (currentIndex >= 0 && currentIndex < queue.length - 1) {
      goTo(queue[currentIndex + 1].videoId);
    }
  }, [currentIndex, queue, goTo]);

  const handleVideoEnded = useCallback(() => {
    // When Cast is active, do NOT auto-launch next video; show EndScreenSuggestions on phone
    if (cast.isConnected) {
      setIsEnded(true);
      return;
    }
    // Autoplay → jump to next safe video when enabled
    if (autoplay && currentIndex >= 0 && currentIndex < queue.length - 1) {
      setCurrentVideoId(queue[currentIndex + 1].videoId);
      setIsEnded(false);
      return;
    }
    setIsEnded(true);
  }, [cast.isConnected, autoplay, currentIndex, queue]);

  const handlePickSuggestion = useCallback((nextVideoId: string) => {
    goTo(nextVideoId);
  }, [goTo]);

  const handleReplay = useCallback(() => {
    setIsEnded(false);
  }, []);

  // Mini-player direct controls
  const handleMiniTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isEnded) {
      setIsEnded(false);
      videoPlayerRef.current?.play();
      return;
    }
    if (cast.isConnected) {
      cast.playOrPause();
    } else {
      videoPlayerRef.current?.togglePlay();
    }
  };

  const handleMiniClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      videoPlayerRef.current?.stop();
    } catch {
      // ignore
    }
    onBack();
  };

  const handleMiniExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMinimized(false);
  };

  const videoTitle = videoDetails?.title || 'جاري التحميل...';

  // Single unified render: VideoPlayer is mounted exactly ONCE at a fixed position in the React tree.
  return (
    <div
      id={isMinimized ? 'player-view-minimized' : 'player-view-takeover'}
      className={
        isMinimized
          ? 'fixed bottom-4 right-4 z-50 w-72 sm:w-80 shadow-2xl rounded-2xl bg-zinc-900 border border-white/20 overflow-hidden ring-4 ring-black/40 flex flex-col font-sans transition-all duration-300 animate-in fade-in zoom-in-95 select-none'
          : 'fixed inset-0 z-50 bg-black text-white flex flex-col overflow-hidden select-none font-sans'
      }
      style={
        !isMinimized && swipeOffsetY > 0
          ? {
              transform: `translateY(${swipeOffsetY}px) scale(${Math.max(0.85, 1 - swipeOffsetY * 0.0008)})`,
              opacity: Math.max(0.6, 1 - swipeOffsetY / 350),
              transition: 'none',
            }
          : !isMinimized
          ? { transition: 'transform 0.2s ease, opacity 0.2s ease' }
          : undefined
      }
    >
      {/* Full-screen top controls and headers */}
      {!isMinimized && (
        <>
          {/* Draggable handle for swipe-down minimize */}
          <div
            className="w-full flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none select-none bg-black shrink-0"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={() => setIsMinimized(true)}
            title="اسحب للأسفل لتصغير المشغل"
          >
            <div className="w-12 h-1.5 rounded-full bg-white/40 hover:bg-white/80 transition" />
          </div>

          {/* Top bar */}
          <header
            className="shrink-0 z-20 flex items-center gap-2 px-2.5 py-2 sm:px-4 bg-black border-b border-white/10"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <button
              id="player-back-btn"
              type="button"
              onClick={onBack}
              className="flex items-center justify-center w-11 h-11 shrink-0 rounded-full bg-white/10 hover:bg-white/15 active:scale-95 text-white transition cursor-pointer"
              aria-label="رجوع"
            >
              <ArrowRight className="w-5 h-5" />
            </button>

            {/* Minimize Button */}
            <button
              id="player-minimize-btn"
              type="button"
              onClick={() => setIsMinimized(true)}
              className="flex items-center justify-center w-11 h-11 shrink-0 rounded-full bg-white/10 hover:bg-white/15 active:scale-95 text-white transition cursor-pointer"
              title="تصغير المشغل (Mini-Player)"
              aria-label="تصغير المشغل"
            >
              <ChevronDown className="w-5 h-5" />
            </button>

            <div className="min-w-0 flex-1 text-right px-1">
              <h1 className="text-sm sm:text-[15px] font-bold text-white leading-snug line-clamp-1">
                {videoTitle}
              </h1>
              {channelTitle ? (
                <p className="text-[11px] sm:text-xs text-white/55 font-medium line-clamp-1 mt-0.5">
                  {channelTitle}
                </p>
              ) : (
                <p className="text-[11px] sm:text-xs text-white/40 line-clamp-1 mt-0.5">
                  فيديو آمن للأطفال
                </p>
              )}
            </div>

            <PlayerParentActions
              ref={parentActionsRef}
              videoId={currentVideoId}
              videoTitle={videoTitle}
              channelId={videoDetails?.channelId}
              channelTitle={channelTitle}
              onReported={(id) => {
                setQueue((prev) => {
                  const idx = prev.findIndex((v) => v.videoId === id);
                  const nextQueue = prev.filter((v) => v.videoId !== id);
                  const fallback =
                    (idx >= 0 && prev[idx + 1]?.videoId) ||
                    (idx > 0 && prev[idx - 1]?.videoId) ||
                    nextQueue[0]?.videoId ||
                    '';
                  Promise.resolve().then(() => {
                    if (fallback && fallback !== id) {
                      setCurrentVideoId(fallback);
                      setIsEnded(false);
                    } else {
                      onBack();
                    }
                  });
                  return nextQueue;
                });
                onVideoHidden?.(id);
              }}
              onBlocked={(blockedChannelId) => {
                setQueue((prev) => {
                  const nextQueue = prev.filter((v) => v.channelId !== blockedChannelId);
                  const fallback = nextQueue[0]?.videoId || '';
                  void Promise.resolve().then(() => {
                    if (fallback) {
                      setCurrentVideoId(fallback);
                      setIsEnded(false);
                    } else {
                      onBack();
                    }
                  });
                  return nextQueue;
                });
              }}
            />

            <HideVideoButton
              videoId={currentVideoId}
              compact
              onHidden={(id) => {
                setQueue((prev) => {
                  const idx = prev.findIndex((v) => v.videoId === id);
                  const nextQueue = prev.filter((v) => v.videoId !== id);
                  const fallback =
                    (idx >= 0 && prev[idx + 1]?.videoId) ||
                    (idx > 0 && prev[idx - 1]?.videoId) ||
                    nextQueue[0]?.videoId ||
                    '';
                  Promise.resolve().then(() => {
                    if (fallback && fallback !== id) {
                      setCurrentVideoId(fallback);
                      setIsEnded(false);
                    } else {
                      onBack();
                    }
                  });
                  return nextQueue;
                });
                onVideoHidden?.(id);
              }}
            />
          </header>

          {/* Google Cast Active Persistent Banner */}
          {cast.isConnected && (
            <div
              id="cast-active-persistent-banner"
              className="shrink-0 bg-sky-950 border-b border-sky-500/40 px-3.5 py-2 flex items-center justify-between gap-3 text-sky-100 z-30 shadow-md"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-full bg-sky-500/20 border border-sky-400/40 flex items-center justify-center shrink-0">
                  <Cast className="w-4 h-4 text-sky-400 animate-pulse" />
                </div>
                <div className="min-w-0 text-right">
                  <p className="text-xs sm:text-sm font-bold text-white truncate">
                    بيشتغل على التلفزيون 📺
                  </p>
                  {cast.deviceName && (
                    <p className="text-[10px] text-sky-300 font-medium truncate">
                      {cast.deviceName}
                    </p>
                  )}
                </div>
              </div>
              <button
                id="cast-banner-disconnect-btn"
                type="button"
                onClick={() => cast.endSession()}
                className="shrink-0 px-3 py-1 rounded-full bg-sky-500/20 hover:bg-sky-500/30 active:scale-95 border border-sky-400/40 text-xs font-bold text-white transition cursor-pointer"
              >
                قطع الاتصال
              </button>
            </div>
          )}
        </>
      )}

      {/* Main Container / Video Area */}
      <main
        className={
          isMinimized
            ? 'w-full flex flex-col overflow-hidden'
            : 'grow min-h-0 flex flex-col overflow-hidden relative'
        }
      >
        {/* End Screen Overlay when ended in full view */}
        {!isMinimized && isEnded && (
          <div
            id="safe-end-screen-root"
            className="absolute inset-0 z-40 flex flex-col w-full h-full bg-black"
          >
            <EndScreenSuggestions
              excludeVideoId={currentVideoId}
              onPickVideo={handlePickSuggestion}
              className="grow"
            />
            <div className="shrink-0 py-3 px-4 text-center border-t border-white/10 bg-black flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleReplay}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-amber-300" />
                <span>إعادة المشاهدة</span>
              </button>
              {hasNext && (
                <button
                  type="button"
                  onClick={goNext}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition cursor-pointer"
                >
                  <span>الفيديو التالي</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Video Player Stage: EXACT SAME DOM CONTAINER & COMPONENT INSTANCE AT ALL TIMES */}
        <div
          id="player-stage-wrapper"
          className={
            isMinimized
              ? 'w-full aspect-video bg-black relative cursor-pointer group overflow-hidden shrink-0'
              : 'grow min-h-0 w-full flex flex-col justify-center relative'
          }
          onTouchStart={!isMinimized ? handleTouchStart : undefined}
          onTouchMove={!isMinimized ? handleTouchMove : undefined}
          onTouchEnd={!isMinimized ? handleTouchEnd : undefined}
          onClick={isMinimized ? () => setIsMinimized(false) : undefined}
          title={isMinimized ? 'انقر لتكبير الفيديو' : undefined}
        >
          <div
            id="player-stage"
            className={
              isMinimized
                ? 'w-full h-full relative'
                : 'w-full bg-black shrink-0 relative'
            }
          >
            <div
              className={
                isMinimized
                  ? 'w-full h-full bg-black overflow-hidden relative'
                  : 'w-full aspect-video bg-black overflow-hidden rounded-none relative'
              }
            >
              <VideoPlayer
                ref={videoPlayerRef}
                videoId={currentVideoId}
                onEnded={handleVideoEnded}
                title={videoTitle}
                channelTitle={channelTitle}
                autoplay={autoplay}
                onAutoplayChange={setAutoplay}
                onRequestReport={() => parentActionsRef.current?.report()}
                onRequestBlockChannel={() => parentActionsRef.current?.block()}
                isMinimized={isMinimized}
                onPlayStateChange={setIsPlaying}
                cast={cast}
                className={
                  isMinimized
                    ? 'w-full h-full !rounded-none !shadow-none pointer-events-none'
                    : 'w-full h-full !rounded-none !shadow-none'
                }
              />

              {/* Minimized hover hint */}
              {isMinimized && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center pointer-events-none">
                  <div className="px-2.5 py-1 rounded-full bg-black/75 text-white text-[11px] font-semibold flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition shadow-md">
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>انقر للتكبير</span>
                  </div>
                </div>
              )}

              {/* Large side navigation buttons (only when full screen and not ended) */}
              {!isMinimized && !isEnded && (
                <>
                  {hasPrev && (
                    <button
                      type="button"
                      id="player-prev-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        goPrev();
                      }}
                      className="absolute left-1.5 top-1/2 -translate-y-1/2 z-[45] w-12 h-12 sm:w-14 sm:h-14 min-w-12 min-h-12 rounded-full bg-black/55 hover:bg-black/75 border border-white/20 text-white flex items-center justify-center shadow-lg cursor-pointer active:scale-95 transition"
                      aria-label="الفيديو السابق"
                    >
                      <ChevronLeft className="w-7 h-7 sm:w-8 sm:h-8" />
                    </button>
                  )}
                  {hasNext && (
                    <button
                      type="button"
                      id="player-next-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        goNext();
                      }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 z-[45] w-12 h-12 sm:w-14 sm:h-14 min-w-12 min-h-12 rounded-full bg-black/55 hover:bg-black/75 border border-white/20 text-white flex items-center justify-center shadow-lg cursor-pointer active:scale-95 transition"
                      aria-label="الفيديو التالي"
                    >
                      <ChevronRight className="w-7 h-7 sm:w-8 sm:h-8" />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Up next strip (only in full screen mode and not ended) */}
        {!isMinimized && !isEnded && (
          <UpNextStrip
            items={queue}
            currentVideoId={currentVideoId}
            onSelect={goTo}
          />
        )}
      </main>

      {/* Minimized 3-Button Control Bar */}
      {isMinimized && (
        <div
          id="mini-player-controls-bar"
          className="h-14 bg-zinc-900 border-t border-white/10 px-3 flex items-center justify-between gap-2 text-white shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Video Title & Channel Info */}
          <div
            className="min-w-0 flex-1 text-right pr-1 cursor-pointer"
            onClick={() => setIsMinimized(false)}
            title="انقر لتكبير الفيديو"
          >
            <p className="text-xs font-bold text-white truncate leading-tight">
              {videoTitle}
            </p>
            {channelTitle && (
              <p className="text-[10px] text-white/50 truncate font-medium mt-0.5">
                {channelTitle}
              </p>
            )}
          </div>

          {/* Controls: Play/Pause, Fullscreen (Expand), Close */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 1. Play / Pause Toggle */}
            <button
              type="button"
              id="mini-player-play-btn"
              onClick={handleMiniTogglePlay}
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-amber-500 hover:bg-amber-600 active:scale-95 text-white flex items-center justify-center shadow-md transition cursor-pointer"
              aria-label={activeIsPlaying ? 'إيقاف مؤقت' : 'تشغيل'}
              title={activeIsPlaying ? 'إيقاف مؤقت' : 'تشغيل'}
            >
              {activeIsPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current translate-x-0.5" />
              )}
            </button>

            {/* 2. Fullscreen / Expand */}
            <button
              type="button"
              id="mini-player-expand-btn"
              onClick={handleMiniExpand}
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition cursor-pointer"
              aria-label="تكبير المشغل"
              title="تكبير المشغل"
            >
              <Maximize2 className="w-5 h-5" />
            </button>

            {/* 3. Close (X) */}
            <button
              type="button"
              id="mini-player-close-btn"
              onClick={handleMiniClose}
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white/10 hover:bg-red-500/80 active:scale-95 text-white flex items-center justify-center transition cursor-pointer"
              aria-label="إغلاق المشغل"
              title="إغلاق المشغل"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
