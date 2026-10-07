import React, { useEffect, useMemo, useState } from 'react';
import { MoreVertical, Play } from 'lucide-react';
import type { FeedItem } from '../db';
import { getThumbnailCandidateUrls } from './VideoCard';
import { formatViewCount } from '../services/youtubeViewCounts';

export interface YoungTubeVideoRowProps {
  video: FeedItem;
  channelTitle: string;
  channelThumbnail?: string;
  progress?: number;
  onSelect: () => void;
  onChannelSelect?: () => void;
  onOverflow?: () => void;
  showDragHandle?: boolean;
  trailing?: React.ReactNode;
}

function durationText(seconds?: number) {
  if (!Number.isFinite(seconds) || !seconds || seconds <= 0) return null;
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export const YoungTubeVideoRow: React.FC<YoungTubeVideoRowProps> = ({
  video,
  channelTitle,
  channelThumbnail,
  progress = 0,
  onSelect,
  onChannelSelect,
  onOverflow,
  showDragHandle = false,
  trailing,
}) => {
  const candidates = useMemo(() => getThumbnailCandidateUrls(video.videoId, (video as any).thumbnail), [video.videoId, (video as any).thumbnail]);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setIndex(0); setFailed(false); }, [video.videoId]);
  const duration = durationText(video.videoDuration);
  const views = formatViewCount(video.viewCount);
  const avatar = channelThumbnail || (video as any).channelThumbnail;

  return (
    <article className="flex items-center gap-3 py-2.5" dir="rtl">
      {showDragHandle && <span className="text-yt-text-muted cursor-grab text-lg px-1" aria-label="إعادة ترتيب">⋮⋮</span>}
      <button type="button" onClick={onSelect} className="relative shrink-0 w-32 sm:w-40 aspect-video overflow-hidden rounded-xl bg-yt-surface-muted cursor-pointer" aria-label={`تشغيل ${video.title}`}>
        {failed ? (
          <div className="w-full h-full flex items-center justify-center text-yt-text-muted"><Play className="w-6 h-6 opacity-50" /></div>
        ) : (
          <img
            key={candidates[index]}
            src={candidates[index]}
            alt={video.title}
            className="w-full h-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => {
              const next = index + 1;
              if (next >= candidates.length) setFailed(true);
              else setIndex(next);
            }}
          />
        )}
        {duration && <span className="absolute bottom-1 end-1 rounded bg-black/80 text-white px-1.5 py-0.5 text-[10px] font-mono">{duration}</span>}
        {progress > 0 && <span className="absolute inset-x-0 bottom-0 h-1 bg-white/25"><span className="block h-full bg-yt-brand" style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} /></span>}
      </button>

      <div className="min-w-0 flex-1 text-right">
        <button type="button" onClick={onSelect} className="block text-right w-full cursor-pointer">
          <h3 className="text-sm font-bold text-yt-text line-clamp-2 leading-snug">{video.title}</h3>
        </button>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-yt-text-muted min-w-0">
          <button type="button" onClick={(e) => { e.stopPropagation(); onChannelSelect?.(); }} className="flex items-center gap-1.5 min-w-0 cursor-pointer hover:text-yt-brand">
            <span className="w-6 h-6 rounded-full overflow-hidden bg-yt-surface-muted border border-yt-border shrink-0 flex items-center justify-center text-[9px] font-bold">
              {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : channelTitle.charAt(0)}
            </span>
            <span className="truncate max-w-[150px]">{channelTitle}</span>
          </button>
          {views && <><span>•</span><span>{views}</span></>}
        </div>
      </div>

      {trailing}
      {onOverflow && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onOverflow(); }} className="w-10 h-10 rounded-full flex items-center justify-center text-yt-text-muted hover:bg-yt-surface-muted cursor-pointer shrink-0" aria-label="المزيد" title="المزيد">
          <MoreVertical className="w-5 h-5" />
        </button>
      )}
    </article>
  );
};

export default YoungTubeVideoRow;
