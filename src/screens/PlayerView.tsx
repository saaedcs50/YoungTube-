import React, { useState, useEffect } from 'react';
import db, { FeedItem } from '../db';
import VideoPlayer from '../components/VideoPlayer';
import EndScreenSuggestions from '../components/EndScreenSuggestions';
import HideVideoButton from '../components/HideVideoButton';
import channelsSeed from '../../channels_seed.json';
import { ArrowRight, RotateCcw, Sparkles } from 'lucide-react';

interface PlayerViewProps {
  videoId: string;
  onBack: () => void;
  onVideoHidden?: () => void;
}

export default function PlayerView({
  videoId,
  onBack,
  onVideoHidden,
}: PlayerViewProps) {
  const [currentVideoId, setCurrentVideoId] = useState<string>(videoId);
  const [isEnded, setIsEnded] = useState(false);
  const [videoDetails, setVideoDetails] = useState<FeedItem | null>(null);

  // Sync state if initial prop changes
  useEffect(() => {
    setCurrentVideoId(videoId);
    setIsEnded(false);
  }, [videoId]);

  // Load video title and channel details from Dexie feedCache
  useEffect(() => {
    let isMounted = true;
    async function fetchDetails() {
      try {
        const item = await db.feedCache.get(currentVideoId);
        if (isMounted && item) {
          setVideoDetails(item);
        }
      } catch {
        // Fallback
      }
    }
    fetchDetails();
    return () => {
      isMounted = false;
    };
  }, [currentVideoId]);

  // Find channel title from seed
  const channelTitle = React.useMemo(() => {
    if (!videoDetails?.channelId) return '';
    const seed = (channelsSeed as any[]).find(
      (ch) => ch.sourceId === videoDetails.channelId
    );
    return seed?.title || seed?.originalName || '';
  }, [videoDetails]);

  const handleVideoEnded = () => {
    setIsEnded(true);
  };

  const handlePickSuggestion = (nextVideoId: string) => {
    setCurrentVideoId(nextVideoId);
    setIsEnded(false);
  };

  const handleReplay = () => {
    setIsEnded(false);
  };

  return (
    <div
      id="player-view-takeover"
      className="fixed inset-0 z-50 bg-stone-950 text-white flex flex-col justify-between overflow-y-auto select-none font-sans"
    >
      {/* 1. Top Bar: Back Button + Small Unobtrusive Hide Button */}
      <header className="flex items-center justify-between p-4 sm:p-6 z-20 max-w-6xl w-full mx-auto">
        <button
          id="player-back-btn"
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-stone-800/80 hover:bg-stone-800 active:scale-95 text-stone-200 hover:text-white text-xs sm:text-sm font-bold backdrop-blur-md border border-stone-700/60 transition cursor-pointer shadow-sm"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة للرئيسية</span>
        </button>

        <div className="flex items-center gap-3">
          {/* Small, Unobtrusive Hide Video Button */}
          <HideVideoButton
            videoId={currentVideoId}
            onHidden={() => {
              onVideoHidden?.();
            }}
            className="text-[11px] py-1.5 px-3 rounded-full bg-stone-900/80 hover:bg-stone-800 text-stone-400 hover:text-rose-300 border border-stone-800 transition"
          />
        </div>
      </header>

      {/* 2. Main Player Area: Full Screen / Centered Hero Video */}
      <main className="grow flex flex-col items-center justify-center p-3 sm:p-6 max-w-5xl w-full mx-auto my-auto">
        {isEnded ? (
          <div className="w-full space-y-4">
            {/* End Screen Suggestions Component (Phase 7) */}
            <EndScreenSuggestions
              excludeVideoId={currentVideoId}
              onPickVideo={handlePickSuggestion}
              className="w-full max-w-4xl mx-auto shadow-2xl"
            />

            {/* Replay current video action */}
            <div className="text-center">
              <button
                id="replay-current-video-btn"
                type="button"
                onClick={handleReplay}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-stone-800/90 hover:bg-stone-700 text-stone-300 hover:text-white text-xs font-semibold border border-stone-700 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>إعادة مشاهدة الفيديو الحالي</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full aspect-video rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl bg-black border border-stone-800">
            <VideoPlayer
              videoId={currentVideoId}
              onEnded={handleVideoEnded}
              className="w-full h-full rounded-2xl sm:rounded-3xl"
            />
          </div>
        )}

        {/* Video Info (Warm, Gentle, Non-intrusive) */}
        {videoDetails && (
          <div className="w-full max-w-5xl mt-3 px-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-right">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-stone-200 line-clamp-1">
                {videoDetails.title}
              </h2>
              {channelTitle && (
                <span className="text-xs text-stone-400 font-medium">
                  {channelTitle}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-stone-400 shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>مشاهدة آمنة</span>
            </div>
          </div>
        )}
      </main>

      {/* 3. Subtle Footer */}
      <footer className="p-3 text-center text-[11px] text-stone-600">
        مشغل آمن — يوتيوب الأطفال
      </footer>
    </div>
  );
}
