import React, { useEffect, useState } from 'react';
import db, { FeedItem } from '../db';
import { WORKER_URL } from '../config';
import { VideoCard } from './VideoCard';
import { X, Tv, Film, Loader2 } from 'lucide-react';

export interface ChannelVideosModalProps {
  sourceId: string;
  channelTitle: string;
  onClose: () => void;
  onSelectVideo: (
    videoId: string,
    title: string,
    channelTitle: string,
    channelId?: string
  ) => void;
}

export default function ChannelVideosModal({
  sourceId,
  channelTitle,
  onClose,
  onSelectVideo,
}: ChannelVideosModalProps) {
  const [videos, setVideos] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function fetchChannelArchive() {
      setLoading(true);
      try {
        let res: Response;
        try {
          res = await fetch(
            `${WORKER_URL}/api/channel-archive?id=${encodeURIComponent(sourceId)}`
          );
        } catch {
          res = await fetch(
            `/api/channel-archive?id=${encodeURIComponent(sourceId)}`
          );
        }

        if (!res.ok) {
          if (isMounted) {
            setVideos([]);
            setLoading(false);
          }
          return;
        }

        const data = await res.json();
        const rawVideos = Array.isArray(data.videos) ? data.videos : [];

        // Read blacklist words from Dexie settings ('main')
        const settings = await db.settings.get('main');
        const blacklistWords: string[] = settings?.blacklistWords || [];

        // Exclude videos whose title matches any blacklist word
        const filtered: FeedItem[] = [];
        for (const raw of rawVideos) {
          if (!raw || !raw.videoId || !raw.title) continue;
          const titleLower = String(raw.title).toLowerCase();

          const isBlacklisted = blacklistWords.some((word) => {
            const w = word.trim().toLowerCase();
            return w ? titleLower.includes(w) : false;
          });

          if (!isBlacklisted) {
            filtered.push({
              videoId: String(raw.videoId),
              channelId: sourceId,
              title: String(raw.title),
              publishedAt: raw.publishedAt ? String(raw.publishedAt) : undefined,
              fetchedAt: Date.now(),
              hidden: false,
            });
          }
        }

        if (isMounted) {
          setVideos(filtered);
          setTotalCount(filtered.length);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to fetch channel archive:', err);
        if (isMounted) {
          setVideos([]);
          setLoading(false);
        }
      }
    }

    void fetchChannelArchive();

    return () => {
      isMounted = false;
    };
  }, [sourceId]);

  return (
    <div
      id="channel-videos-modal-backdrop"
      className="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-sm overflow-y-auto flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        id="channel-videos-modal"
        className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-stone-200/80 overflow-hidden flex flex-col max-h-[88vh] my-auto"
      >
        {/* Modal Header */}
        <div className="p-5 sm:p-6 bg-amber-500/10 border-b border-amber-200/60 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-900">
                  أرشيف القناة
                </span>
                {!loading && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-200/70 text-amber-900">
                    {totalCount} فيديو
                  </span>
                )}
              </div>
              <h2
                id="channel-videos-modal-title"
                className="text-lg sm:text-xl font-extrabold text-stone-900 leading-snug"
              >
                {channelTitle}
              </h2>
            </div>
          </div>

          <button
            id="close-channel-modal-btn"
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition cursor-pointer shrink-0 active:scale-95"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto grow">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-amber-600 animate-spin mx-auto" />
              <p className="text-sm font-bold text-stone-600">
                جاري تحميل أرشيف فيديوهات القناة...
              </p>
            </div>
          ) : videos.length === 0 ? (
            <div className="py-12 text-center space-y-3 max-w-sm mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto shadow-sm border border-amber-100">
                <Film className="w-7 h-7" />
              </div>
              <h3 className="text-base font-black text-stone-900">
                لا توجد فيديوهات متاحة حالياً في أرشيف هذه القناة
              </h3>
              <p className="text-xs text-stone-500 leading-relaxed font-medium">
                قد تكون الفيديوهات مستبعدة بناءً على تصفية الأمان أو لم يكتمل الأرشيف بعد.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
              {videos.map((video) => (
                <VideoCard
                  key={video.videoId}
                  video={video}
                  channelTitle={channelTitle}
                  onSelectVideo={(vId, vTitle, cTitle, cId) => {
                    onSelectVideo(vId, vTitle || video.title, cTitle || channelTitle, cId || sourceId);
                    onClose();
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
