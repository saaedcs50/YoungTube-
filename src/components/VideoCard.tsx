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
        className="group bg-white rounded-2xl sm:rounded-3xl overflow-hidden border border-amber-100/80 hover:border-amber-300/90 shadow-[0_3px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_10px_25px_rgba(245,158,11,0.12)] transition-all duration-150 active:scale-[0.98] flex flex-col text-right cursor-pointer"
      >
        {/* Thumbnail: dominant, fixed aspect-ratio with soft rounded top container */}
        <div className="relative aspect-video w-full bg-amber-50/60 overflow-hidden">
          <img
            src={thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
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
              className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-rose-500/95 text-white text-[11px] font-extrabold shadow-sm backdrop-blur-sm flex items-center gap-1 pointer-events-none z-10 border border-white/30"
            >
              <Heart className="w-3 h-3 fill-white" />
              <span>مفضلة</span>
            </div>
          )}

          {/* Taste Shift "✨ جديد" Badge */}
          {!isFavorite && isTasteShiftTarget && (
            <div
              id={`taste-shift-badge-${video.videoId}`}
              className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-400 to-amber-300 text-amber-950 text-[11px] font-black shadow-sm backdrop-blur-sm border border-white/50 pointer-events-none z-10 flex items-center gap-1"
            >
              <span>✨ جديد</span>
            </div>
          )}

          {/* Optional No Music Badge */}
          {video.hasMusic === false && (
            <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-stone-900/85 text-emerald-300 text-[10px] font-bold flex items-center gap-1 backdrop-blur-sm pointer-events-none z-10 border border-emerald-500/30">
              <VolumeX className="w-3 h-3 text-emerald-400" />
              <span>بدون موسيقى</span>
            </div>
          )}
        </div>

        {/* Video Details: generous breathing room and clear hierarchy */}
        <div className="p-3.5 sm:p-4 flex flex-col justify-between grow space-y-2.5 bg-white">
          <h3
            className={`text-sm sm:text-[15px] font-extrabold text-stone-900 line-clamp-2 leading-snug transition-colors duration-150 ${
              isFavorite ? 'group-hover:text-rose-600' : 'group-hover:text-amber-600'
            }`}
            title={video.title}
          >
            {video.title}
          </h3>

          <div className="flex items-center justify-between text-xs font-medium pt-0.5 text-stone-500">
            <span className="truncate max-w-[65%] group-hover:text-stone-700 transition-colors">
              {channelTitle}
            </span>
            {formattedViews && (
              <span
                id={`view-count-${video.videoId}`}
                className="shrink-0 text-[11px] text-stone-400 font-medium font-sans flex items-center gap-1"
              >
                <span>{formattedViews}</span>
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
