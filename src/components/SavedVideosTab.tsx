import React, { useState, useEffect, useCallback } from 'react';
import db, { Interaction } from '../db';
import channelsSeed from '../../channels_seed.json';
import { Bookmark, Play, Trash2, Film } from 'lucide-react';

interface SavedVideoItem {
  videoId: string;
  channelId?: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  lastWatched?: number;
}

interface SavedVideosTabProps {
  onSelectVideo?: (videoId: string, title?: string, channelName?: string, channelId?: string) => void;
}

export const SavedVideosTab: React.FC<SavedVideosTabProps> = ({ onSelectVideo }) => {
  const [savedVideos, setSavedVideos] = useState<SavedVideoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  const loadSavedVideos = useCallback(async () => {
    try {
      // 1. Query db.interactions where savedByParent === true
      const interactions = await db.interactions
        .filter((item: Interaction) => item.savedByParent === true)
        .toArray();

      // Sort by lastWatched descending
      interactions.sort((a, b) => (b.lastWatched || 0) - (a.lastWatched || 0));

      // 2. Build channel name resolver map
      const [customChannels, cachedFeed] = await Promise.all([
        db.channels.toArray(),
        db.feedCache.toArray(),
      ]);

      const feedMap = new Map(cachedFeed.map((f) => [f.videoId, f]));
      const channelTitleMap = new Map<string, string>();

      for (const ch of channelsSeed as any[]) {
        if (ch.sourceId) {
          channelTitleMap.set(ch.sourceId, ch.title || ch.originalName || 'قناة أطفال');
        }
      }
      for (const ch of customChannels) {
        if (ch.sourceId) {
          channelTitleMap.set(ch.sourceId, ch.title || 'قناة أطفال');
        }
      }

      const items: SavedVideoItem[] = interactions.map((inter) => {
        const cached = feedMap.get(inter.videoId);
        const resolvedChannelId = inter.channelId || cached?.channelId;
        const channelName =
          (resolvedChannelId ? channelTitleMap.get(resolvedChannelId) : undefined) ||
          inter.channelId ||
          'قناة أطفال';
        const title = inter.title || cached?.title || 'فيديو أطفال';
        const thumbnail =
          inter.thumbnail ||
          `https://i.ytimg.com/vi/${inter.videoId}/hqdefault.jpg`;

        return {
          videoId: inter.videoId,
          channelId: resolvedChannelId,
          title,
          channelTitle: channelName,
          thumbnail,
          lastWatched: inter.lastWatched,
        };
      });

      setSavedVideos(items);
    } catch (err) {
      console.error('Failed to load saved videos:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSavedVideos();
  }, [loadSavedVideos]);

  // Remove video from saved list (savedByParent: false)
  const handleRemoveSaved = async (e: React.MouseEvent, videoId: string, title: string) => {
    e.stopPropagation(); // prevent triggering row tap play
    try {
      await db.interactions.update(videoId, { savedByParent: false });
      setSavedVideos((prev) => prev.filter((v) => v.videoId !== videoId));
      showFeedback(`تمت إزالة "${title.slice(0, 25)}..." من المحفوظات`);
    } catch (err) {
      console.error('Failed to remove saved video:', err);
    }
  };

  return (
    <div id="saved-videos-tab" className="space-y-4 max-w-4xl mx-auto text-right" dir="rtl">
      {/* Header / Intro */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-stone-200">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="text-base sm:text-lg font-bold text-stone-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-800 flex items-center justify-center shrink-0">
                <Bookmark className="w-4 h-4 text-indigo-700" />
              </span>
              <span>الفيديوهات المحفوظة للأهل</span>
            </h4>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-800 text-xs font-bold border border-indigo-200">
              {savedVideos.length} فيديو
            </span>
          </div>
          <p className="text-xs sm:text-sm text-stone-500">
            فيديوهات تم حفظها من شاشة المشغل للرجوع إليها أو مراجعته في أي وقت.
          </p>
        </div>

        {feedbackMessage && (
          <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 animate-fade-in self-start sm:self-auto">
            {feedbackMessage}
          </span>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-stone-400">
          جاري تحميل الفيديوهات المحفوظة...
        </div>
      ) : savedVideos.length > 0 ? (
        <div className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-2xs">
          {savedVideos.map((video) => (
            <div
              key={video.videoId}
              id={`saved-video-row-${video.videoId}`}
              onClick={() => onSelectVideo?.(video.videoId, video.title, video.channelTitle, video.channelId)}
              className="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-stone-50/80 transition cursor-pointer group"
              title="انقر لتشغيل الفيديو في المشغل"
            >
              {/* Thumbnail + Video Info */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative w-16 h-11 sm:w-20 sm:h-13 rounded-xl overflow-hidden shrink-0 bg-stone-200 border border-stone-200">
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;
                    }}
                  />
                  {/* Small Play Overlay on hover */}
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/35 flex items-center justify-center transition">
                    <div className="w-6 h-6 rounded-full bg-white/90 text-indigo-600 flex items-center justify-center shadow-xs">
                      <Play className="w-3 h-3 fill-current translate-x-0.2" />
                    </div>
                  </div>
                </div>

                <div className="min-w-0">
                  <h5
                    className="text-xs sm:text-sm font-bold text-stone-900 truncate group-hover:text-indigo-600 transition"
                    title={video.title}
                  >
                    {video.title}
                  </h5>
                  <div className="flex items-center gap-2 text-[11px] text-stone-500 mt-0.5">
                    <span className="truncate">{video.channelTitle}</span>
                    <span>•</span>
                    <span className="text-indigo-600 font-medium text-[11px]">انقر للمشاهدة</span>
                  </div>
                </div>
              </div>

              {/* Action: Remove Button */}
              <button
                type="button"
                id={`remove-saved-${video.videoId}-btn`}
                onClick={(e) => handleRemoveSaved(e, video.videoId, video.title)}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-stone-100 hover:bg-rose-50 text-stone-600 hover:text-rose-700 text-xs font-semibold flex items-center gap-1.5 transition shrink-0 border border-stone-200 hover:border-rose-200 cursor-pointer shadow-2xs"
                title="إزالة من المحفوظات"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>إزالة</span>
              </button>
            </div>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div
          id="saved-videos-empty-state"
          className="p-10 rounded-2xl bg-stone-50 border border-stone-200 text-center space-y-2"
        >
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3 border border-indigo-100">
            <Bookmark className="w-6 h-6" />
          </div>
          <h5 className="text-xs sm:text-sm font-bold text-stone-800">
            لا توجد فيديوهات محفوظة بعد
          </h5>
          <p className="text-xs text-stone-500 max-w-sm mx-auto leading-relaxed">
            أثناء مشاهدة أي فيديو في المشغل، يمكنك الضغط على زر &quot;حفظ&quot; ليظهر هنا مباشرة لمراجعته في أي وقت.
          </p>
        </div>
      )}
    </div>
  );
};
