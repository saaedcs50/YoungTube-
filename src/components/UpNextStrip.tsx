import React, { useEffect, useRef } from 'react';
import type { FeedItem } from '../db';

interface UpNextStripProps {
  items: FeedItem[];
  currentVideoId: string;
  onSelect: (videoId: string) => void;
}

function formatDuration(sec?: number): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return '';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Phase 2 — horizontal safe "Up next" strip (YouTube Kids style).
 */
export default function UpNextStrip({
  items,
  currentVideoId,
  onSelect,
}: UpNextStripProps) {
  const currentRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [currentVideoId]);

  if (!items.length) return null;

  return (
    <div
      id="up-next-strip"
      className="shrink-0 w-full border-t border-white/10 bg-black"
    >
      <div className="px-3 pt-2 pb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-white/50">التالي</span>
        <span className="text-[10px] text-emerald-400/80 font-medium">
          قائمة آمنة فقط
        </span>
      </div>

      <div
        className="flex gap-2.5 overflow-x-auto overflow-y-hidden px-3 pb-3 snap-x snap-mandatory"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {items.map((video) => {
          const isCurrent = video.videoId === currentVideoId;
          const thumb = `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;
          const dur = formatDuration(video.videoDuration);

          return (
            <button
              key={video.videoId}
              ref={isCurrent ? currentRef : undefined}
              type="button"
              id={`up-next-${video.videoId}`}
              onClick={() => onSelect(video.videoId)}
              className={`relative shrink-0 w-[42vw] max-w-[180px] min-h-[44px] snap-center text-right cursor-pointer transition active:scale-[0.98] ${
                isCurrent ? 'opacity-100' : 'opacity-90 hover:opacity-100'
              }`}
            >
              <div
                className={`relative aspect-video overflow-hidden bg-zinc-900 ${
                  isCurrent
                    ? 'ring-2 ring-red-500 ring-offset-1 ring-offset-black'
                    : 'ring-1 ring-white/10'
                }`}
              >
                <img
                  src={thumb}
                  alt=""
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      `https://i.ytimg.com/vi/${video.videoId}/default.jpg`;
                  }}
                />
                {dur ? (
                  <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-bold text-white tabular-nums">
                    {dur}
                  </span>
                ) : null}
                {isCurrent ? (
                  <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-red-600 text-[9px] font-bold text-white">
                    الآن
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-[11px] font-semibold text-white/90 line-clamp-2 leading-snug">
                {video.title}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
