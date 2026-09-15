import React from 'react';
import { FeedItem } from '../db';
import { VolumeX, Heart } from 'lucide-react';
import { TasteReactionBar } from './TasteReactionBar';

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
        className="group bg-white rounded-2xl sm:rounded-3xl overflow-hidden border border-amber-100/60 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_22px_rgba(245,158,11,0.08)] hover:border-amber-200/90 transition-all duration-200 active:scale-[0.98] flex flex-col text-right cursor-pointer"
      >
        {/* Thumbnail: dominant, fixed aspect-ratio with soft rounded top container */}
        <div className="relative aspect-video w-full bg-amber-50/50 overflow-hidden">
          <img
            src={thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
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
              className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-rose-500/95 text-white text-[11px] font-extrabold shadow-sm backdrop-blur-xs flex items-center gap-1 pointer-events-none z-10"
            >
              <Heart className="w-3 h-3 fill-white" />
              <span>مفضلة</span>
            </div>
          )}

          {/* Taste Shift "✨ جديد" Badge */}
          {!isFavorite && isTasteShiftTarget && (
            <div
              id={`taste-shift-badge-${video.videoId}`}
              className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-amber-400/95 text-amber-950 text-[11px] font-black shadow-sm backdrop-blur-xs border border-amber-200 pointer-events-none z-10 flex items-center gap-1"
            >
              <span>✨ جديد</span>
            </div>
          )}

          {/* Optional No Music Badge */}
          {video.hasMusic === false && (
            <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-stone-900/85 text-emerald-300 text-[10px] font-bold flex items-center gap-1 backdrop-blur-xs pointer-events-none z-10">
              <VolumeX className="w-3 h-3" />
              <span>بدون موسيقى</span>
            </div>
          )}
        </div>

        {/* Video Details: generous breathing room and clear hierarchy */}
        <div className="p-3.5 sm:p-4 flex flex-col justify-between grow space-y-2">
          <h3
            className={`text-sm sm:text-[15px] font-extrabold text-stone-850 line-clamp-2 leading-snug transition-colors duration-150 ${
              isFavorite ? 'group-hover:text-rose-600' : 'group-hover:text-amber-700'
            }`}
            title={video.title}
          >
            {video.title}
          </h3>

          <div className="flex items-center justify-between text-xs text-stone-400 font-medium pt-0.5">
            <span className="truncate max-w-[90%] text-stone-500 hover:text-stone-700 transition-colors">
              {channelTitle}
            </span>
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
      prev.channelTitle === next.channelTitle &&
      prev.isFavorite === next.isFavorite &&
      prev.isTasteShiftTarget === next.isTasteShiftTarget &&
      prev.activeTasteShiftCategory === next.activeTasteShiftCategory
    );
  }
);
