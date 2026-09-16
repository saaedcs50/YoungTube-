import React from 'react';
import { FeedItem } from '../db';
import { VolumeX, Heart } from 'lucide-react';
import { TasteReactionBar } from './TasteReactionBar';
import { formatViewCount } from '../services/youtubeViewCounts';

export interface VideoCardProps {
  video: FeedItem;
  channelTitle: string;
  isTasteShiftTarget?: boolean;
  activeTasteShiftCategory?: string;
  isFavorite?: boolean;
  onSelectVideo?: (
    videoId: string,
    title?: string,
    channelName?: string,
    channelId?: string
  ) => void;
  onOpenDemoPlayer?: () => void;
  onTasteReacted?: () => void;
}

export const VideoCard = React.memo(
  function VideoCard({
    video,
    channelTitle,
    isTasteShiftTarget = false,
    activeTasteShiftCategory,
    isFavorite = false,
    onSelectVideo,
    onOpenDemoPlayer,
    onTasteReacted,
  }: VideoCardProps) {
    const isNarrow = typeof window !== 'undefined' && window.innerWidth < 640;
    const thumbnailUrl = `https://i.ytimg.com/vi/${video.videoId}/${
      isNarrow ? 'mqdefault' : 'hqdefault'
    }.jpg`;

    const formattedViews = formatViewCount(video.viewCount);

    const handleClick = () => {
      if (onSelectVideo) {
        onSelectVideo(video.videoId, video.title, channelTitle, video.channelId);
      } else if (onOpenDemoPlayer) {
        onOpenDemoPlayer();
      }
    };

    return (
      <div
        id={isFavorite ? `favorite-card-${video.videoId}` : `video-card-${video.videoId}`}
        onClick={handleClick}
        className="group bg-white rounded-[28px] overflow-hidden border border-stone-100 shadow-sm hover:shadow-md transition-all duration-150 active:scale-[0.98] flex flex-col text-right cursor-pointer"
      >
        {/* Thumbnail: 16:9, object-cover, no padding on the image, rounded top only */}
        <div className="relative aspect-video w-full bg-stone-100 overflow-hidden">
          <img
            src={thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            width={320}
            height={180}
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;
            }}
          />

          {/* Favorite Badge */}
          {isFavorite && (
            <div
              id={`favorite-badge-${video.videoId}`}
              className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-rose-500 text-white text-[11px] font-bold shadow-sm flex items-center gap-1 pointer-events-none z-10"
            >
              <Heart className="w-3 h-3 fill-white" />
              <span>مفضلة</span>
            </div>
          )}

          {/* Novel / Taste Shift "✨ جديد" Badge */}
          {!isFavorite && isTasteShiftTarget && (
            <div
              id={`taste-shift-badge-${video.videoId}`}
              className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-amber-500 text-white text-[11px] font-bold shadow-sm pointer-events-none z-10 flex items-center gap-1"
            >
              <span>✨ جديد</span>
            </div>
          )}

          {/* Optional No Music Muted Badge (not a red alarm) */}
          {video.hasMusic === false && (
            <div className="absolute bottom-2.5 right-2.5 px-2.5 py-0.5 rounded-full bg-stone-800/75 text-stone-200 text-[10px] font-medium flex items-center gap-1 backdrop-blur-xs pointer-events-none z-10">
              <VolumeX className="w-3 h-3 text-stone-300" />
              <span>بدون موسيقى</span>
            </div>
          )}
        </div>

        {/* Video Details */}
        <div className="p-4 flex flex-col justify-between grow space-y-2.5 bg-white">
          <h3
            className="text-sm sm:text-base font-extrabold text-stone-900 line-clamp-2 leading-snug group-hover:text-amber-600 transition-colors duration-150"
            title={video.title}
          >
            {video.title}
          </h3>

          <div className="flex items-center justify-between text-xs font-medium text-stone-500 pt-0.5">
            <span className="truncate max-w-[65%]">
              {channelTitle}
            </span>
            {formattedViews && (
              <span
                id={`view-count-${video.videoId}`}
                className="shrink-0 text-[11px] text-stone-500 font-medium"
              >
                {formattedViews}
              </span>
            )}
          </div>

          {!isFavorite && isTasteShiftTarget && activeTasteShiftCategory && onTasteReacted && (
            <TasteReactionBar
              videoId={video.videoId}
              channelId={video.channelId}
              title={video.title}
              categoryId={activeTasteShiftCategory}
              onReacted={onTasteReacted}
            />
          )}
        </div>
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.video.videoId === next.video.videoId &&
      prev.video.title === next.video.title &&
      prev.video.hasMusic === next.video.hasMusic &&
      prev.video.viewCount === next.video.viewCount &&
      prev.channelTitle === next.channelTitle &&
      prev.isFavorite === next.isFavorite &&
      prev.isTasteShiftTarget === next.isTasteShiftTarget &&
      prev.activeTasteShiftCategory === next.activeTasteShiftCategory
    );
  }
);
