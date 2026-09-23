import React, { useState, useEffect, useMemo } from 'react';
import { FeedItem } from '../db';
import { VolumeX, Heart, Play } from 'lucide-react';
import { TasteReactionBar } from './TasteReactionBar';
import { formatViewCount } from '../services/youtubeViewCounts';

export interface VideoCardProps {
  video: FeedItem;
  channelTitle: string;
  channelThumbnail?: string;
  isTasteShiftTarget?: boolean;
  activeTasteShiftCategory?: string;
  isFavorite?: boolean;
  onSelectVideo?: (
    videoId: string,
    title?: string,
    channelName?: string,
    channelId?: string
  ) => void;
  onChannelSelect?: (channelId: string, channelTitle: string) => void;
  onOpenDemoPlayer?: () => void;
  onTasteReacted?: () => void;
}

const THUMBNAIL_QUALITIES = ['mqdefault', 'hqdefault', 'sddefault', 'hq720'] as const;

export function getThumbnailCandidateUrls(videoId: string, customThumbnail?: string): string[] {
  const candidates: string[] = [];
  if (customThumbnail && typeof customThumbnail === 'string' && /^https:\/\//i.test(customThumbnail)) {
    candidates.push(customThumbnail);
  }
  for (const quality of THUMBNAIL_QUALITIES) {
    const url = `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
    if (!candidates.includes(url)) {
      candidates.push(url);
    }
  }
  return candidates;
}

function formatDuration(seconds?: number): string | null {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds <= 0) return null;
  const totalSec = Math.floor(seconds);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const h = Math.floor(m / 60);
  if (h > 0) {
    const remM = m % 60;
    return `${h}:${remM.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatRelativeDate(publishedAt?: string): string | null {
  if (!publishedAt) return null;
  const time = Date.parse(publishedAt);
  if (isNaN(time)) return null;
  const diffSec = Math.floor((Date.now() - time) / 1000);
  if (diffSec < 0) return null;
  if (diffSec < 60) return 'الآن';
  const diffHours = Math.floor(diffSec / 3600);
  if (diffHours < 24) {
    return diffHours <= 1
      ? 'منذ ساعة'
      : diffHours === 2
        ? 'منذ ساعتين'
        : diffHours <= 10
          ? `منذ ${diffHours} ساعات`
          : `منذ ${diffHours} ساعة`;
  }
  const diffDays = Math.floor(diffSec / 86400);
  if (diffDays < 30) {
    return diffDays <= 1
      ? 'منذ يوم'
      : diffDays === 2
        ? 'منذ يومين'
        : diffDays <= 10
          ? `منذ ${diffDays} أيام`
          : `منذ ${diffDays} يوماً`;
  }
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return diffMonths <= 1
      ? 'منذ شهر'
      : diffMonths === 2
        ? 'منذ شهرين'
        : diffMonths <= 10
          ? `منذ ${diffMonths} أشهر`
          : `منذ ${diffMonths} شهراً`;
  }
  const diffYears = Math.floor(diffDays / 365);
  return diffYears <= 1
    ? 'منذ سنة'
    : diffYears === 2
      ? 'منذ سنتين'
      : diffYears <= 10
        ? `منذ ${diffYears} سنوات`
        : `منذ ${diffYears} سنة`;
}

export const VideoCard = React.memo(
  function VideoCard({
    video,
    channelTitle,
    channelThumbnail,
    isTasteShiftTarget = false,
    activeTasteShiftCategory,
    isFavorite = false,
    onSelectVideo,
    onChannelSelect,
    onOpenDemoPlayer,
    onTasteReacted,
  }: VideoCardProps) {
    const candidates = useMemo(
      () => getThumbnailCandidateUrls(video.videoId, (video as any).thumbnail),
      [video.videoId, (video as any).thumbnail]
    );

    const [candidateIndex, setCandidateIndex] = useState(0);
    const [thumbFailed, setThumbFailed] = useState(false);

    useEffect(() => {
      setCandidateIndex(0);
      setThumbFailed(false);
    }, [video.videoId]);

    const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
      const img = e.currentTarget;
      if (!img || !img.src) return;

      setCandidateIndex((prevIndex) => {
        const nextIndex = prevIndex + 1;
        if (nextIndex >= candidates.length) {
          setThumbFailed(true);
          return prevIndex;
        }
        return nextIndex;
      });
    };

    const formattedViews = formatViewCount(video.viewCount);
    const formattedDuration = formatDuration(video.videoDuration);
    const formattedDate = formatRelativeDate(video.publishedAt);

    const channelAvatar =
      channelThumbnail ||
      (video as any).channelThumbnail ||
      (video as any).channelAvatar ||
      (video as any).avatar;
    const firstLetter = channelTitle?.trim()?.charAt(0) || 'ق';

    const handleClick = () => {
      if (onSelectVideo) {
        onSelectVideo(video.videoId, video.title, channelTitle, video.channelId);
      } else if (onOpenDemoPlayer) {
        onOpenDemoPlayer();
      }
    };

    const currentUrl = candidates[candidateIndex];

    return (
      <article
        id={isFavorite ? `favorite-card-${video.videoId}` : `video-card-${video.videoId}`}
        onClick={handleClick}
        className="group w-full flex flex-col text-right cursor-pointer select-none transition-opacity duration-150 active:opacity-90"
      >
        {/* Thumbnail: FULL WIDTH of feed column, 16:9, rounded-none, no outer card border or shadow */}
        <div
          className="relative aspect-video w-full bg-yt-surface-muted overflow-hidden"
          data-thumb-failed={thumbFailed ? 'true' : undefined}
        >
          {thumbFailed ? (
            <div className="w-full h-full bg-yt-surface-muted flex flex-col items-center justify-center text-yt-text-muted gap-1.5 select-none">
              <Play className="w-7 h-7 text-yt-text-muted/50" />
              <span className="text-[10px] font-bold text-yt-text-muted">معاينة غير متوفرة</span>
            </div>
          ) : (
            <img
              key={currentUrl}
              src={currentUrl}
              alt={video.title}
              className="w-full h-full object-cover rounded-none"
              referrerPolicy="no-referrer"
              loading="eager"
              decoding="async"
              width={320}
              height={180}
              onError={handleImageError}
            />
          )}

          {/* Duration badge: bottom-end of thumb (small dark pill) */}
          {formattedDuration && (
            <div className="absolute bottom-2 end-2 px-1.5 py-0.5 rounded-md bg-black/80 text-white text-[11px] font-semibold tracking-wide pointer-events-none z-10 font-mono">
              {formattedDuration}
            </div>
          )}

          {/* Favorite Minimal Corner Badge */}
          {isFavorite && (
            <div
              id={`favorite-badge-${video.videoId}`}
              className="absolute top-2 end-2 p-1.5 rounded-full bg-black/60 text-rose-400 backdrop-blur-xs pointer-events-none z-10"
              title="مفضلة"
            >
              <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
            </div>
          )}

          {/* Novel / Taste Shift "✨ جديد" Badge */}
          {!isFavorite && isTasteShiftTarget && (
            <div
              id={`taste-shift-badge-${video.videoId}`}
              className="absolute top-2 end-2 px-2 py-0.5 rounded-md bg-yt-brand text-yt-brand-text text-[10px] font-bold shadow-xs pointer-events-none z-10"
            >
              ✨ جديد
            </div>
          )}

          {/* Optional No Music Muted Badge */}
          {video.hasMusic === false && (
            <div className="absolute top-2 start-2 px-2 py-0.5 rounded-md bg-black/75 text-white text-[10px] font-medium flex items-center gap-1 backdrop-blur-xs pointer-events-none z-10">
              <VolumeX className="w-3 h-3 text-white/80" />
              <span>بدون موسيقى</span>
            </div>
          )}
        </div>

        {/* Below thumb: padding horizontal ~12–16px, vertical tight */}
        <div className="px-3 sm:px-4 pt-2.5 pb-1 flex flex-col gap-1.5">
          {/* Line 1: video title — 2 lines max, bold, text-yt-text, leading-snug */}
          <h3
            className="text-sm sm:text-base font-bold text-yt-text line-clamp-2 leading-snug group-hover:text-yt-brand transition-colors duration-150"
            title={video.title}
          >
            {video.title}
          </h3>

          {/* Line 2: row with channel avatar, channel name, separator dot, view count, optional relative date */}
          <div className="flex items-center flex-wrap gap-2 text-xs text-yt-text-muted">
            {/* Channel avatar (circle ~36px) */}
            <div
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-yt-surface-muted border border-yt-border/40 overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold text-yt-text-muted select-none"
              title={channelTitle}
              onClick={(e) => {
                if (onChannelSelect) {
                  e.stopPropagation();
                  onChannelSelect(video.channelId, channelTitle);
                }
              }}
            >
              {channelAvatar ? (
                <img
                  src={channelAvatar}
                  alt={channelTitle}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                />
              ) : (
                <span>{firstLetter}</span>
              )}
            </div>

            {/* Channel name (text-sm text-yt-text-muted) — tappable if onChannelSelect exists */}
            <span
              className={`text-sm text-yt-text-muted font-medium truncate max-w-[140px] sm:max-w-[200px] ${
                onChannelSelect ? 'hover:underline hover:text-yt-brand cursor-pointer' : ''
              }`}
              onClick={(e) => {
                if (onChannelSelect) {
                  e.stopPropagation();
                  onChannelSelect(video.channelId, channelTitle);
                }
              }}
            >
              {channelTitle}
            </span>

            {/* Separator dot */}
            {formattedViews && <span className="text-yt-text-muted/60 text-[10px]">•</span>}

            {/* View count via existing formatViewCount */}
            {formattedViews && (
              <span
                id={`view-count-${video.videoId}`}
                className="shrink-0 text-xs text-yt-text-muted font-medium"
              >
                {formattedViews}
              </span>
            )}

            {/* Optional relative date ONLY if data already exists on the item */}
            {formattedDate && (
              <>
                <span className="text-yt-text-muted/60 text-[10px]">•</span>
                <span className="shrink-0 text-xs text-yt-text-muted font-medium">
                  {formattedDate}
                </span>
              </>
            )}
          </div>

          {/* TasteReactionBar: placed BELOW the meta row */}
          {!isFavorite && isTasteShiftTarget && activeTasteShiftCategory && onTasteReacted && (
            <div className="pt-1" onClick={(e) => e.stopPropagation()}>
              <TasteReactionBar
                videoId={video.videoId}
                channelId={video.channelId}
                title={video.title}
                categoryId={activeTasteShiftCategory}
                onReacted={onTasteReacted}
              />
            </div>
          )}
        </div>
      </article>
    );
  },
  (prev, next) => {
    return (
      prev.video.videoId === next.video.videoId &&
      prev.video.title === next.video.title &&
      prev.video.hasMusic === next.video.hasMusic &&
      prev.video.viewCount === next.video.viewCount &&
      prev.video.videoDuration === next.video.videoDuration &&
      prev.video.publishedAt === next.video.publishedAt &&
      (prev.video as any).thumbnail === (next.video as any).thumbnail &&
      prev.channelTitle === next.channelTitle &&
      prev.channelThumbnail === next.channelThumbnail &&
      prev.isFavorite === next.isFavorite &&
      prev.isTasteShiftTarget === next.isTasteShiftTarget &&
      prev.activeTasteShiftCategory === next.activeTasteShiftCategory &&
      prev.onChannelSelect === next.onChannelSelect
    );
  }
);
