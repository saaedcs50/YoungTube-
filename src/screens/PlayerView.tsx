import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import db, { FeedItem } from '../db';
import VideoPlayer from '../components/VideoPlayer';
import EndScreenSuggestions from '../components/EndScreenSuggestions';
import HideVideoButton from '../components/HideVideoButton';
import PlayerParentActions, { type PlayerParentActionsHandle } from '../components/PlayerParentActions';
import UpNextStrip from '../components/UpNextStrip';
import channelsSeed from '../../channels_seed.json';
import { ArrowRight, RotateCcw, ChevronRight, ChevronLeft } from 'lucide-react';

interface PlayerViewProps {
  videoId: string;
  onBack: () => void;
  onVideoHidden?: () => void;
}

const MAX_QUEUE = 24;

/**
 * Phase 1 + 2 — YouTube Kids style player:
 * Top bar, centered player, progress (in VideoPlayer),
 * large Prev/Next, horizontal Up-next strip.
 */
export default function PlayerView({
  videoId,
  onBack,
  onVideoHidden,
}: PlayerViewProps) {
  const [currentVideoId, setCurrentVideoId] = useState<string>(videoId);
  const [isEnded, setIsEnded] = useState(false);
  const [videoDetails, setVideoDetails] = useState<FeedItem | null>(null);
  const [queue, setQueue] = useState<FeedItem[]>([]);
  const [autoplay, setAutoplay] = useState(false);
  const parentActionsRef = useRef<PlayerParentActionsHandle>(null);

  useEffect(() => {
    setCurrentVideoId(videoId);
    setIsEnded(false);
  }, [videoId]);

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

  // Build safe up-next queue from feedCache
  useEffect(() => {
    let cancelled = false;
    async function loadQueue() {
      try {
        const current = await db.feedCache.get(currentVideoId);
        const all = await db.feedCache
          .filter((item) => item.hidden !== true)
          .toArray();

        if (cancelled) return;

        // Prefer same channel, then fill with others
        const sameChannel = current?.channelId
          ? all.filter((v) => v.channelId === current.channelId)
          : [];
        const others = all.filter((v) => v.channelId !== current?.channelId);

        const merged: FeedItem[] = [];
        const seen = new Set<string>();

        const push = (list: FeedItem[]) => {
          for (const v of list) {
            if (seen.has(v.videoId)) continue;
            seen.add(v.videoId);
            merged.push(v);
            if (merged.length >= MAX_QUEUE) break;
          }
        };

        // Ensure current is first if present
        if (current && !current.hidden) {
          seen.add(current.videoId);
          merged.push(current);
        }

        push(sameChannel);
        push(others);

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

  const channelTitle = useMemo(() => {
    if (!videoDetails?.channelId) return '';
    const seed = (channelsSeed as any[]).find(
      (ch) => ch.sourceId === videoDetails.channelId
    );
    return seed?.title || seed?.originalName || '';
  }, [videoDetails]);

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
    // Phase 3: Autoplay → jump to next safe video when enabled
    if (autoplay && currentIndex >= 0 && currentIndex < queue.length - 1) {
      setCurrentVideoId(queue[currentIndex + 1].videoId);
      setIsEnded(false);
      return;
    }
    setIsEnded(true);
  }, [autoplay, currentIndex, queue]);

  const handlePickSuggestion = useCallback((nextVideoId: string) => {
    goTo(nextVideoId);
  }, [goTo]);

  const handleReplay = useCallback(() => {
    setIsEnded(false);
  }, []);

  const videoTitle = videoDetails?.title || 'جاري التحميل...';

  return (
    <div
      id="player-view-takeover"
      className="fixed inset-0 z-50 bg-black text-white flex flex-col overflow-hidden select-none font-sans"
    >
      {/* Top bar */}
      <header className="shrink-0 z-20 flex items-center gap-2 px-2.5 py-2 sm:px-4 bg-black border-b border-white/10">
        <button
          id="player-back-btn"
          type="button"
          onClick={onBack}
          className="flex items-center justify-center w-11 h-11 shrink-0 rounded-full bg-white/10 hover:bg-white/15 active:scale-95 text-white transition cursor-pointer"
          aria-label="رجوع"
        >
          <ArrowRight className="w-5 h-5" />
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
            <p className="text-[11px] text-emerald-400/80 font-medium mt-0.5">
              مشاهدة آمنة
            </p>
          )}
        </div>

        <PlayerParentActions
          ref={parentActionsRef}
          videoId={currentVideoId}
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
            // Phase 4: remove from up-next queue and play neighbor (or exit)
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
                onVideoHidden?.();
              });
              return nextQueue;
            });
          }}
        />
      </header>

      <main className="grow min-h-0 flex flex-col overflow-hidden">
        {isEnded ? (
          <div
            id="safe-end-screen-root"
            className="grow min-h-0 flex flex-col w-full bg-black relative z-30"
          >
            {/* Phase 4: fully covers any residual YouTube end UI */}
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
        ) : (
          <>
            {/* Player area with side Prev/Next */}
            <div className="grow min-h-0 w-full flex flex-col justify-center relative">
              <div id="player-stage" className="w-full bg-black shrink-0 relative">
                <div className="w-full aspect-video bg-black overflow-hidden rounded-none relative">
                  <VideoPlayer
                    videoId={currentVideoId}
                    onEnded={handleVideoEnded}
                    title={videoTitle}
                    channelTitle={channelTitle}
                    autoplay={autoplay}
                    onAutoplayChange={setAutoplay}
                    onRequestReport={() => parentActionsRef.current?.report()}
                    onRequestBlockChannel={() => parentActionsRef.current?.block()}
                    className="w-full h-full !rounded-none !shadow-none"
                  />

                  {/* Phase 2 — large side navigation (Kids style) */}
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
                </div>
              </div>
            </div>

            {/* Phase 2 — Up next strip */}
            <UpNextStrip
              items={queue}
              currentVideoId={currentVideoId}
              onSelect={goTo}
            />
          </>
        )}
      </main>
    </div>
  );
}
