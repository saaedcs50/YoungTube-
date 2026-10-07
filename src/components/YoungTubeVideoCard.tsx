import React, { useEffect, useMemo, useState } from 'react';
import { ListPlus, MoreVertical, Play, VolumeX } from 'lucide-react';
import type { FeedItem } from '../db';
import { getThumbnailCandidateUrls } from './VideoCard';
import { formatViewCount } from '../services/youtubeViewCounts';
import db from '../db';

export interface YoungTubeVideoCardProps {
  video: FeedItem;
  channelTitle: string;
  channelThumbnail?: string;
  onSelectVideo?: () => void;
  onChannelSelect?: () => void;
  onAddToPlaylist?: (video: FeedItem) => void;
  onOverflow?: (video: FeedItem) => void;
  isTasteShiftTarget?: boolean;
  activeTasteShiftCategory?: string;
  onTasteReacted?: () => void;
}

function durationText(seconds?: number) {
  if (!Number.isFinite(seconds) || !seconds || seconds <= 0) return null;
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function relativeTime(date?: string) {
  if (!date) return null;
  const ts = Date.parse(date);
  if (!Number.isFinite(ts)) return null;
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return 'الآن';
  const h = Math.floor(diff / 3600);
  if (h < 24) return `منذ ${h} ساعة`;
  const d = Math.floor(diff / 86400);
  if (d < 30) return `منذ ${d} يوم`;
  const m = Math.floor(d / 30);
  if (m < 12) return `منذ ${m} شهر`;
  return `منذ ${Math.floor(d / 365)} سنة`;
}

export const YoungTubeVideoCard: React.FC<YoungTubeVideoCardProps> = ({
  video,
  channelTitle,
  channelThumbnail,
  onSelectVideo,
  onChannelSelect,
  onAddToPlaylist,
  onOverflow,
  isTasteShiftTarget = false,
  activeTasteShiftCategory,
  onTasteReacted,
}) => {
  const candidates = useMemo(() => getThumbnailCandidateUrls(video.videoId, (video as any).thumbnail), [video.videoId, (video as any).thumbnail]);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [resumeProgress, setResumeProgress] = useState(0);

  useEffect(() => {
    setIndex(0);
    setFailed(false);
  }, [video.videoId]);

  useEffect(() => {
    let mounted = true;
    void db.interactions.get(video.videoId).then((interaction) => {
      if (!mounted) return;
      const total = interaction?.videoDuration || video.videoDuration || 0;
      const progress = total > 0 ? (interaction?.watchTime || 0) / total : 0;
      setResumeProgress(progress > 0.03 && progress < 0.95 ? progress : 0);
    }).catch(() => {});
    return () => { mounted = false; };
  }, [video.videoId, video.videoDuration]);

  const currentUrl = candidates[index];
  const views = formatViewCount(video.viewCount);
  const duration = durationText(video.videoDuration);
  const time = relativeTime(video.publishedAt);
  const avatar = channelThumbnail || (video as any).channelThumbnail || (video as any).avatar;


  return (
    <article className="w-full px-0" dir="rtl">
      <button type="button" onClick={onSelectVideo} className="relative block w-full aspect-video rounded-2xl overflow-hidden bg-yt-surface-muted cursor-pointer focus:outline-none focus:ring-2 focus:ring-yt-brand/30">
        {failed ? (
          <div className="w-full h-full flex items-center justify-center text-yt-text-muted"><Play className="w-10 h-10 opacity-40" /></div>
        ) : (
          <img key={currentUrl} src={currentUrl} alt={video.title} className="w-full h-full object-cover" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => { const next = index + 1; if (next >= candidates.length) setFailed(true); else setIndex(next); }} />
        )}
        {duration && <span className="absolute bottom-2 end-2 rounded-md bg-black/80 text-white px-1.5 py-0.5 text-[11px] font-mono">{duration}</span>}
        {resumeProgress > 0 && <span className="absolute inset-x-0 bottom-0 h-1 bg-white/20"><span className="block h-full bg-yt-brand" style={{ width: `${Math.min(100, resumeProgress * 100)}%` }} /></span>}
        {isTasteShiftTarget && <span className="absolute top-2 start-2 rounded-md bg-yt-brand text-white px-2 py-1 text-[10px] font-bold">✨ جديد</span>}
        {video.hasMusic === false && <span className="absolute top-2 end-2 inline-flex items-center gap-1 rounded-md bg-black/75 px-2 py-1 text-[10px] font-semibold text-white"><VolumeX className="w-3 h-3" />بدون موسيقى</span>}
      </button>

      <div className="py-2.5 flex items-start gap-2.5">
        <button type="button" onClick={(e) => { e.stopPropagation(); onChannelSelect?.(); }} className="w-9 h-9 rounded-full bg-yt-surface-muted border border-yt-border overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold text-yt-text-muted cursor-pointer" aria-label={`فتح قناة ${channelTitle}`}>
          {avatar ? <img src={avatar} alt={channelTitle} className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : channelTitle.charAt(0)}
        </button>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onSelectVideo} className="block w-full text-right cursor-pointer">
            <h3 className="text-[15px] sm:text-base font-bold leading-snug text-yt-text line-clamp-2">{video.title}</h3>
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onChannelSelect?.(); }} className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-yt-text-muted hover:text-yt-brand text-right cursor-pointer">
            <span className="truncate max-w-[170px]">{channelTitle}</span>
            {views && <><span>•</span><span>{views}</span></>}
            {time && <><span>•</span><span>{time}</span></>}
          </button>
        </div>

        <div className="flex items-center shrink-0">
          {onAddToPlaylist && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onAddToPlaylist(video); }} className="w-10 h-10 rounded-full flex items-center justify-center text-yt-text-muted hover:bg-yt-surface-muted cursor-pointer" aria-label="إضافة إلى قائمة تشغيل" title="إضافة إلى قائمة تشغيل">
              <ListPlus className="w-5 h-5" />
            </button>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); onOverflow?.(video); }} className="w-10 h-10 rounded-full flex items-center justify-center text-yt-text-muted hover:bg-yt-surface-muted cursor-pointer" aria-label="المزيد" title="المزيد">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {onTasteReacted && isTasteShiftTarget && (
        <div className="pb-2" />
      )}

    </article>
  );
};

export default YoungTubeVideoCard;
