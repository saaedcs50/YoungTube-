import React, { useState, useEffect, useCallback, useMemo } from 'react';
import db, { Interaction } from '../db';
import channelsSeed from '../../channels_seed.json';
import { Bookmark, Play, Trash2, Film } from 'lucide-react';
import { getThumbnailCandidateUrls } from './VideoCard';

interface SavedVideoItem {
  videoId: string;
  channelId?: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  lastWatched?: number;
}

const SavedVideoRowThumbnail: React.FC<{
  videoId: string;
  initialThumbnail?: string;
  title: string;
}> = ({ videoId, initialThumbnail, title }) => {
  const candidates = useMemo(
    () => getThumbnailCandidateUrls(videoId, initialThumbnail),
    [videoId, initialThumbnail]
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [thumbFailed, setThumbFailed] = useState(false);

  useEffect(() => {
    setCandidateIndex(0);
    setThumbFailed(false);
  }, [videoId]);

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

  const currentUrl = candidates[candidateIndex];

  return (
    <div
      className="relative w-16 h-11 sm:w-20 sm:h-13 rounded-xl overflow-hidden shrink-0 bg-stone-200 border border-stone-200/80"
      data-thumb-failed={thumbFailed ? 'true' : undefined}
    >
      {thumbFailed ? (
        <div className="w-full h-full bg-stone-200 flex items-center justify-center text-stone-400">
          <Play className="w-4 h-4 fill-stone-400 text-stone-400 translate-x-0.5" />
        </div>
      ) : (
        <img
          key={currentUrl}
          src={currentUrl}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
          referrerPolicy="no-referrer"
          loading="eager"
          decoding="async"
          onError={handleImageError}
        />
      )}
      {/* Small Play Overlay on hover */}
      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 flex items-center justify-center transition">
        <div className="w-6 h-6 rounded-full bg-white/90 text-amber-600 flex items-center justify-center shadow-sm">
          <Play className="w-3 h-3 fill-current translate-x-0.2" />
        </div>
      </div>
    </div>
  );
};

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
      const videoIds = interactions.map((i) => i.videoId).filter(Boolean);
      const [customChannels, cachedFeed] = await Promise.all([
        db.channels.toArray(),
        videoIds.length > 0
          ? db.feedCache.where('videoId').anyOf(videoIds).toArray()
          : Promise.resolve([]),
      ]);

      const feedMap = new Map((cachedFeed || []).map((f) => [f.videoId, f]));
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
    <div id="saved-videos-tab" className="space-y-5 max-w-4xl mx-auto text-right" dir="rtl">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="text-base sm:text-lg font-extrabold text-stone-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Bookmark className="w-4 h-4" />
              </span>
              <span>الفيديوهات المحفوظة للأهل</span>
            </h4>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 text-xs font-bold border border-amber-200">
              {savedVideos.length} فيديو
            </span>
          </div>
          <p className="text-xs sm:text-sm text-stone-500">
            فيديوهات تم حفظها من شاشة المشغل للرجوع إليها أو مراجعتها في أي وقت.
          </p>
        </div>

        {feedbackMessage && (
          <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 animate-fade-in self-start sm:self-auto">
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
        <div className="rounded-2xl border border-stone-200/70 bg-white p-4 sm:p-5 shadow-sm">
          <div className="divide-y divide-stone-100 rounded-xl border border-stone-200/80 overflow-hidden bg-stone-50/50">
            {savedVideos.map((video) => (
              <div
                key={video.videoId}
                id={`saved-video-row-${video.videoId}`}
                onClick={() => onSelectVideo?.(video.videoId, video.title, video.channelTitle, video.channelId)}
                className="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-white transition cursor-pointer group"
                title="انقر لتشغيل الفيديو في المشغل"
              >
                {/* Thumbnail + Video Info */}
                <div className="flex items-center gap-3 min-w-0">
                  <SavedVideoRowThumbnail
                    videoId={video.videoId}
                    initialThumbnail={video.thumbnail}
                    title={video.title}
                  />

                  <div className="min-w-0">
                    <h5
                      className="text-xs sm:text-sm font-bold text-stone-900 truncate group-hover:text-amber-700 transition"
                      title={video.title}
                    >
                      {video.title}
                    </h5>
                    <div className="flex items-center gap-2 text-[11px] text-stone-500 mt-0.5">
                      <span className="truncate">{video.channelTitle}</span>
                      <span>•</span>
                      <span className="text-amber-700 font-bold text-[11px]">انقر للمشاهدة</span>
                    </div>
                  </div>
                </div>

                {/* Action: Remove Button (Destructive: Rose) */}
                <button
                  type="button"
                  id={`remove-saved-${video.videoId}-btn`}
                  onClick={(e) => handleRemoveSaved(e, video.videoId, video.title)}
                  className="min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 text-xs font-bold flex items-center gap-1.5 transition shrink-0 border border-rose-200/80 cursor-pointer shadow-2xs"
                  title="إزالة من المحفوظات"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>إزالة</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Empty State */
        <div
          id="saved-videos-empty-state"
          className="p-10 rounded-2xl bg-white border border-stone-200/70 shadow-sm text-center space-y-2"
        >
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-3 border border-amber-200/60">
            <Bookmark className="w-6 h-6" />
          </div>
          <h5 className="text-xs sm:text-sm font-bold text-stone-900">
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
