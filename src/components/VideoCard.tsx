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
        className="group bg-white flex flex-col text-right cursor-pointer"
      >
        {/* Thumbnail: edge-to-edge, no rounded corners, no play overlay, fixed aspect-ratio */}
        <div className="relative aspect-video w-full bg-stone-100 overflow-hidden">
          <img
            src={thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-102 transition duration-300"
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
              className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-rose-500/90 text-white text-[10px] font-bold shadow-xs backdrop-blur-xs flex items-center gap-1 pointer-events-none z-10"
            >
              <Heart className="w-3 h-3 fill-white" />
              <span>مفضلة</span>
            </div>
          )}

          {/* Taste Shift "✨ جديد" Badge */}
          {!isFavorite && isTasteShiftTarget && (
            <div
              id={`taste-shift-badge-${video.videoId}`}
              className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-white/90 text-stone-800 text-[10px] font-bold shadow-xs backdrop-blur-xs border border-white/60 pointer-events-none z-10"
            >
              ✨ جديد
            </div>
          )}

          {/* Optional No Music Badge */}
          {video.hasMusic === false && (
            <div className="absolute bottom-2.5 right-2.5 px-2 py-1 rounded-md bg-stone-900/80 text-emerald-300 text-[10px] font-bold flex items-center gap-1 backdrop-blur-xs pointer-events-none z-10">
              <VolumeX className="w-3 h-3" />
              <span>بدون موسيقى</span>
            </div>
          )}
        </div>

        {/* Video Details: keep small internal padding so text isn't flush against the edges */}
        <div className="px-3.5 pt-2.5 pb-3 flex flex-col justify-between grow space-y-1.5">
          <h3
            className={`text-sm sm:text-base font-bold text-stone-800 line-clamp-2 leading-snug transition ${
              isFavorite ? 'group-hover:text-rose-700' : 'group-hover:text-amber-800'
            }`}
            title={video.title}
          >
            {video.title}
          </h3>

          <div className="flex items-center justify-between text-xs text-stone-500 font-medium pt-0.5">
            <span className="truncate max-w-[85%] text-stone-600">
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
