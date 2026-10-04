import React, { useState, useEffect, useCallback, useMemo } from 'react';
import db, { Interaction } from '../db';
import { listRegistryChannels } from '../data/channelRegistry';
import { Bookmark, Play, Trash2, Film, Download, CheckCircle, FileX } from 'lucide-react';
import { getThumbnailCandidateUrls } from './VideoCard';
import {
  isNativeDownloadAvailable,
  addDownloadProgressListener,
  type DownloadProgressPayload,
} from '../plugins/youngtubeDownloader';
import {
  startDownload,
  removeDownloads,
  getDownloadByVideoId,
} from '../services/downloadManager';

interface SavedVideoItem {
  videoId: string;
  channelId?: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  lastWatched?: number;
  localPath?: string;
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
      className="relative w-16 h-11 sm:w-20 sm:h-13 rounded-xl overflow-hidden shrink-0 bg-yt-surface-muted border border-yt-border"
      data-thumb-failed={thumbFailed ? 'true' : undefined}
    >
      {thumbFailed ? (
        <div className="w-full h-full bg-yt-surface-muted flex items-center justify-center text-yt-text-muted">
          <Play className="w-4 h-4 fill-yt-text-muted text-yt-text-muted translate-x-0.5" />
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
        <div className="w-6 h-6 rounded-full bg-yt-surface/90 text-yt-brand flex items-center justify-center shadow-sm">
          <Play className="w-3 h-3 fill-current translate-x-0.2" />
        </div>
      </div>
    </div>
  );
};

interface SavedVideosTabProps {
  onSelectVideo?: (
    videoId: string,
    title?: string,
    channelName?: string,
    channelId?: string,
    options?: { localPath?: string; fromDownloads?: boolean }
  ) => void;
}

export const SavedVideosTab: React.FC<SavedVideosTabProps> = ({ onSelectVideo }) => {
  const [savedVideos, setSavedVideos] = useState<SavedVideoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [downloadingVideoId, setDownloadingVideoId] = useState<string | null>(null);
  const [downloadProgressMap, setDownloadProgressMap] = useState<Record<string, { percent: number | null; bytes: number }>>({});

  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  // Subscribe to native download progress events
  useEffect(() => {
    let handlePromise = addDownloadProgressListener((progress: DownloadProgressPayload) => {
      if (progress && progress.videoId) {
        setDownloadProgressMap((prev) => ({
          ...prev,
          [progress.videoId]: {
            percent: progress.percent,
            bytes: progress.bytesDownloaded,
          },
        }));
      }
    });

    return () => {
      handlePromise.then((handle) => {
        handle?.remove();
      });
    };
  }, []);

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
      const [registryChannels, cachedFeed] = await Promise.all([
        listRegistryChannels(),
        videoIds.length > 0
          ? db.feedCache.where('videoId').anyOf(videoIds).toArray()
          : Promise.resolve([]),
      ]);

      const feedMap = new Map((cachedFeed || []).map((f) => [f.videoId, f]));
      const channelTitleMap = new Map<string, string>();

      for (const ch of registryChannels) {
        if (ch.sourceId) {
          channelTitleMap.set(ch.sourceId, ch.title || 'قناة أطفال');
        }
      }

      // Check for stored local file paths in localStorage
      let localPaths: Record<string, string> = {};
      try {
        const stored = localStorage.getItem('yt_downloaded_videos');
        if (stored) localPaths = JSON.parse(stored);
      } catch {}

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
          localPath: localPaths[inter.videoId],
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

  const handleDownload = async (e: React.MouseEvent, videoId: string, title: string) => {
    e.stopPropagation();
    if (!isNativeDownloadAvailable()) {
      showFeedback('متاح على تطبيق الأندرويد فقط');
      return;
    }

    if (downloadingVideoId) return; // prevent concurrent duplicate triggers

    setDownloadingVideoId(videoId);
    showFeedback('جاري استخراج وتحميل الفيديو (360p تجريبي)...');

    try {
      const result = await startDownload({ videoId, title });
      if (result.ok && result.path) {
        setSavedVideos((prev) =>
          prev.map((v) => (v.videoId === videoId ? { ...v, localPath: result.path } : v))
        );

        const pathNotice = result.path ? `تم الحفظ في: ${result.path.split('/').slice(-1)[0]}` : '';
        showFeedback(`${result.message || 'تم التحميل بنجاح'} (${pathNotice})`.trim());
      } else {
        showFeedback(result.message || 'تعذر استخراج أو تحميل الفيديو');
      }
    } catch (err: any) {
      showFeedback(err?.message || 'خطأ أثناء محاولة التنزيل');
    } finally {
      setDownloadingVideoId(null);
    }
  };

  const handleDeleteLocalFile = async (e: React.MouseEvent, videoId: string) => {
    e.stopPropagation();
    try {
      await removeDownloads([videoId]);
      setSavedVideos((prev) =>
        prev.map((v) => (v.videoId === videoId ? { ...v, localPath: undefined } : v))
      );
      showFeedback('تم حذف الملف المحلي بنجاح');
    } catch (err: any) {
      showFeedback(err?.message || 'خطأ أثناء محاولة حذف الملف');
    }
  };

  return (
    <div id="saved-videos-tab" className="space-y-5 max-w-4xl mx-auto text-right" dir="rtl">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-yt-border">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="text-base sm:text-lg font-extrabold text-yt-text flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-yt-brand text-yt-brand-text flex items-center justify-center shrink-0 shadow-sm">
                <Bookmark className="w-4 h-4" />
              </span>
              <span>الفيديوهات المحفوظة للأهل</span>
            </h4>
            <span className="px-2.5 py-0.5 rounded-full bg-yt-brand-soft text-yt-text text-xs font-bold border border-yt-brand/30">
              {savedVideos.length} فيديو
            </span>
          </div>
          <p className="text-xs sm:text-sm text-yt-text-muted">
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
        <div className="p-12 text-center text-xs text-yt-text-muted">
          جاري تحميل الفيديوهات المحفوظة...
        </div>
      ) : savedVideos.length > 0 ? (
        <div className="rounded-2xl border border-yt-border bg-yt-surface p-4 sm:p-5 shadow-sm">
          <div className="divide-y divide-yt-border rounded-xl border border-yt-border overflow-hidden bg-yt-surface-muted">
            {savedVideos.map((video) => (
              <div
                key={video.videoId}
                id={`saved-video-row-${video.videoId}`}
                onClick={() =>
                  onSelectVideo?.(video.videoId, video.title, video.channelTitle, video.channelId, {
                    localPath: video.localPath,
                    fromDownloads: Boolean(video.localPath),
                  })
                }
                className="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-yt-surface transition cursor-pointer group"
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
                      className="text-xs sm:text-sm font-bold text-yt-text truncate group-hover:text-yt-brand transition"
                      title={video.title}
                    >
                      {video.title}
                    </h5>
                    <div className="flex items-center gap-2 text-[11px] text-yt-text-muted mt-0.5">
                      <span className="truncate">{video.channelTitle}</span>
                      <span>•</span>
                      <span className="text-yt-brand font-bold text-[11px]">انقر للمشاهدة</span>
                    </div>
                  </div>
                </div>

                {/* Actions: Download (360p Progress / Done / Delete File) + Remove */}
                <div className="flex items-center gap-2 shrink-0">
                  {video.localPath ? (
                    <div className="flex items-center gap-1.5">
                      <span
                        className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold flex items-center gap-1.5 border border-emerald-200 shadow-2xs"
                        title={`محفوظ محلياً:\n${video.localPath}`}
                      >
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>محمل (360p)</span>
                      </span>

                      <button
                        type="button"
                        id={`delete-local-file-${video.videoId}-btn`}
                        onClick={(e) => handleDeleteLocalFile(e, video.videoId)}
                        className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold flex items-center gap-1 transition border border-amber-200 cursor-pointer shadow-2xs"
                        title="حذف ملف الفيديو المحلي لتوفير المساحة"
                      >
                        <FileX className="w-3.5 h-3.5" />
                        <span>حذف الملف</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      id={`download-saved-${video.videoId}-btn`}
                      onClick={(e) => handleDownload(e, video.videoId, video.title)}
                      disabled={downloadingVideoId === video.videoId}
                      className={`min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shrink-0 border border-yt-border cursor-pointer shadow-2xs ${
                        downloadingVideoId === video.videoId
                          ? 'bg-yt-brand-soft text-yt-brand opacity-90 cursor-wait'
                          : 'bg-yt-surface-muted hover:bg-yt-brand-soft text-yt-text hover:text-yt-brand'
                      }`}
                      title="تنزيل الفيديو بجودة 360p (متاح على تطبيق الأندرويد - تجريبي)"
                    >
                      {downloadingVideoId === video.videoId ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-yt-brand/20 border-t-yt-brand rounded-full animate-spin" />
                          <span>
                            {downloadProgressMap[video.videoId]?.percent !== null &&
                            downloadProgressMap[video.videoId]?.percent !== undefined
                              ? `جاري التحميل ${downloadProgressMap[video.videoId].percent}%`
                              : 'جاري التحميل...'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>تنزيل (360p تجريبي)</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    id={`remove-saved-${video.videoId}-btn`}
                    onClick={(e) => handleRemoveSaved(e, video.videoId, video.title)}
                    className="min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-yt-danger text-xs font-bold flex items-center gap-1.5 transition shrink-0 border border-yt-danger/30 cursor-pointer shadow-2xs"
                    title="إزالة من المحفوظات"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>إزالة</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Empty State */
        <div
          id="saved-videos-empty-state"
          className="p-10 rounded-2xl bg-yt-surface border border-yt-border shadow-sm text-center space-y-2"
        >
          <div className="w-12 h-12 rounded-2xl bg-yt-brand-soft text-yt-brand flex items-center justify-center mx-auto mb-3 border border-yt-border">
            <Bookmark className="w-6 h-6" />
          </div>
          <h5 className="text-xs sm:text-sm font-bold text-yt-text">
            لا توجد فيديوهات محفوظة بعد
          </h5>
          <p className="text-xs text-yt-text-muted max-w-sm mx-auto leading-relaxed">
            أثناء مشاهدة أي فيديو في المشغل، يمكنك الضغط على زر &quot;حفظ&quot; ليظهر هنا مباشرة لمراجعته في أي وقت.
          </p>
        </div>
      )}
    </div>
  );
};
