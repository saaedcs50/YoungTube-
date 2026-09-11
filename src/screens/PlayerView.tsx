import React, { useState, useEffect } from 'react';
import db, { FeedItem } from '../db';
import VideoPlayer from '../components/VideoPlayer';
import EndScreenSuggestions from '../components/EndScreenSuggestions';
import HideVideoButton from '../components/HideVideoButton';
import channelsSeed from '../../channels_seed.json';
import { ArrowRight, RotateCcw } from 'lucide-react';

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

  useEffect(() => {
    setCurrentVideoId(videoId);
    setIsEnded(false);
  }, [videoId]);

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
      className="fixed inset-0 z-50 bg-black text-white flex flex-col overflow-hidden select-none font-sans"
    >
      {/* Compact top bar — YouTube-style chrome */}
      <header className="shrink-0 flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4 bg-black/95 border-b border-white/10 z-20">
        <button
          id="player-back-btn"
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 min-h-10 px-3 rounded-full bg-white/10 hover:bg-white/15 active:scale-95 text-white text-sm font-semibold transition cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>رجوع</span>
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <HideVideoButton
            videoId={currentVideoId}
            onHidden={onVideoHidden}
            className="!bg-white/10 !text-white !border-white/15 hover:!bg-white/15"
          />
        </div>
      </header>

      {/* Main column: full-bleed player OR full-height suggestions */}
      <main className="grow min-h-0 flex flex-col overflow-y-auto">
        {isEnded ? (
          <div className="grow min-h-0 flex flex-col w-full">
            <EndScreenSuggestions
              excludeVideoId={currentVideoId}
              onPickVideo={handlePickSuggestion}
              className="grow"
            />

            <div className="shrink-0 py-3 px-4 text-center border-t border-white/10 bg-black">
              <button
                id="replay-current-video-btn"
                type="button"
                onClick={handleReplay}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-amber-300" />
                <span>إعادة مشاهدة الفيديو</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Full-width, edge-to-edge, sharp corners — portrait YouTube style */}
            <div
              id="player-stage"
              className="w-full bg-black shrink-0"
            >
              <div className="w-full aspect-video bg-black overflow-hidden rounded-none">
                <VideoPlayer
                  videoId={currentVideoId}
                  onEnded={handleVideoEnded}
                  className="w-full h-full !rounded-none !shadow-none"
                />
              </div>
            </div>

            {/* Title / channel under the player */}
            <div className="w-full px-3.5 py-3 sm:px-5 sm:py-4 space-y-1 text-right bg-black">
              <h2 className="text-[15px] sm:text-base font-bold text-white leading-snug line-clamp-2">
                {videoDetails?.title || 'جاري التحميل...'}
              </h2>
              {channelTitle ? (
                <p className="text-xs sm:text-sm text-white/60 font-medium">
                  {channelTitle}
                </p>
              ) : null}
              <p className="text-[11px] text-emerald-400/90 font-medium pt-0.5">
                مشاهدة آمنة — بدون إعلانات أو خوارزميات
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
