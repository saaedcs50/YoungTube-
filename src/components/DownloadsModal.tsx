import React, { useState, useEffect, useCallback, useMemo } from 'react';
import db, { DownloadItem } from '../db';
import {
  listDownloads,
  removeDownloads,
  startDownload,
} from '../services/downloadManager';
import {
  Download,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Loader2,
  CheckSquare,
  Square,
  ArrowRight,
  Play,
  RotateCw,
  FolderDown,
  X,
} from 'lucide-react';
import { getThumbnailCandidateUrls } from './VideoCard';

export interface DownloadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVideo?: (
    videoId: string,
    title?: string,
    channelName?: string,
    channelId?: string
  ) => void;
}

function formatBytes(bytes?: number | null): string {
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const DownloadRowThumbnail: React.FC<{
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
        <div className="w-full h-full bg-yt-surface-muted flex flex-col items-center justify-center text-yt-text-muted gap-1 select-none">
          <Play className="w-4 h-4 text-yt-text-muted/50" />
        </div>
      ) : (
        <img
          key={currentUrl}
          src={currentUrl}
          alt={title}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          onError={handleImageError}
        />
      )}
    </div>
  );
};

export const DownloadsModal: React.FC<DownloadsModalProps> = ({
  isOpen,
  onClose,
  onSelectVideo,
}) => {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchDownloads = useCallback(async () => {
    try {
      const items = await listDownloads();
      setDownloads(items);
    } catch (err) {
      console.warn('Failed to load downloads list:', err);
    }
  }, []);

  // Poll / refresh downloads when modal is open
  useEffect(() => {
    if (!isOpen) return;
    fetchDownloads();
    const interval = setInterval(fetchDownloads, 1000);
    return () => clearInterval(interval);
  }, [isOpen, fetchDownloads]);

  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  // Close modal on escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleToggleSelectVideo = (videoId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedVideoIds((prev) =>
      prev.includes(videoId) ? prev.filter((id) => id !== videoId) : [...prev, videoId]
    );
  };

  const handleSelectAll = () => {
    if (selectedVideoIds.length === downloads.length) {
      setSelectedVideoIds([]);
    } else {
      setSelectedVideoIds(downloads.map((d) => d.videoId));
    }
  };

  const handleSingleDelete = async (item: DownloadItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await removeDownloads([item.videoId]);
      await fetchDownloads();
      showFeedback(`تم حذف "${item.title.slice(0, 20)}..."`);
    } catch (err) {
      console.error('Failed to delete download:', err);
      showFeedback('فشل حذف الفيديو');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedVideoIds.length === 0) return;
    setIsDeleting(true);
    try {
      const count = selectedVideoIds.length;
      await removeDownloads(selectedVideoIds);
      setSelectedVideoIds([]);
      setIsSelectionMode(false);
      await fetchDownloads();
      showFeedback(`تم حذف ${count} فيديو من التحميلات`);
    } catch (err) {
      console.error('Failed bulk delete:', err);
      showFeedback('فشل حذف الفيديوهات المحددة');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRetryDownload = async (item: DownloadItem, e: React.MouseEvent) => {
    e.stopPropagation();
    showFeedback('جاري إعادة محاولة التحميل...');
    try {
      await startDownload({
        videoId: item.videoId,
        title: item.title,
        thumbnailUrl: item.thumbnailUrl,
        channelTitle: item.channelTitle,
        channelId: item.channelId,
      });
    } catch (err: any) {
      showFeedback(err?.message || 'فشلت إعادة التحميل');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="downloads-modal-backdrop"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-fade-in"
      dir="rtl"
      onClick={onClose}
    >
      <div
        id="downloads-modal-dialog"
        className="w-full max-w-2xl max-h-[88vh] bg-yt-bg border border-yt-border rounded-3xl shadow-2xl flex flex-col overflow-hidden text-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-yt-border flex items-center justify-between gap-3 shrink-0 bg-yt-surface">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-yt-brand-soft text-yt-brand flex items-center justify-center shrink-0 border border-yt-brand/20">
              <FolderDown className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-extrabold text-yt-text">
                  قائمة التنزيلات
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-yt-brand-soft text-yt-brand text-xs font-bold border border-yt-brand/30">
                  {downloads.length}
                </span>
              </div>
              <p className="text-xs text-yt-text-muted">
                الفيديوهات المحملة للمشاهدة بدون إنترنت (بجودة 360p)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {downloads.length > 0 && (
              <button
                type="button"
                id="downloads-toggle-selection-btn"
                onClick={() => {
                  setIsSelectionMode((prev) => !prev);
                  setSelectedVideoIds([]);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                  isSelectionMode
                    ? 'bg-yt-brand text-yt-brand-text border-yt-brand'
                    : 'bg-yt-surface-muted hover:bg-yt-border/50 text-yt-text border-yt-border'
                }`}
              >
                {isSelectionMode ? 'إلغاء التحديد' : 'تحديد'}
              </button>
            )}

            <button
              type="button"
              id="downloads-modal-close-btn"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-yt-surface-muted hover:bg-yt-border/50 text-yt-text flex items-center justify-center transition cursor-pointer"
              title="إغلاق"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback Message Notification */}
        {feedbackMessage && (
          <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs font-bold text-center animate-fade-in shrink-0">
            {feedbackMessage}
          </div>
        )}

        {/* Selection Bar in Selection Mode */}
        {isSelectionMode && downloads.length > 0 && (
          <div className="p-3 bg-yt-surface-muted border-b border-yt-border flex items-center justify-between gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSelectAll}
              className="px-3 py-1 rounded-lg bg-yt-surface hover:bg-yt-surface-muted border border-yt-border text-xs font-bold text-yt-text flex items-center gap-1.5 cursor-pointer"
            >
              {selectedVideoIds.length === downloads.length ? (
                <CheckSquare className="w-3.5 h-3.5 text-yt-brand" />
              ) : (
                <Square className="w-3.5 h-3.5 text-yt-text-muted" />
              )}
              <span>
                {selectedVideoIds.length === downloads.length ? 'إلغاء الكل' : 'تحديد الكل'}
              </span>
            </button>

            <button
              type="button"
              id="downloads-bulk-delete-btn"
              disabled={selectedVideoIds.length === 0 || isDeleting}
              onClick={handleBulkDelete}
              className="px-3 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-yt-danger border border-yt-danger/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف ({selectedVideoIds.length})</span>
            </button>
          </div>
        )}

        {/* Content Body: Scrollable list */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5">
          {downloads.length === 0 ? (
            <div
              id="downloads-empty-state"
              className="py-12 px-6 rounded-2xl bg-yt-surface border border-yt-border text-center space-y-3"
            >
              <div className="w-12 h-12 rounded-2xl bg-yt-surface-muted text-yt-text-muted flex items-center justify-center mx-auto border border-yt-border">
                <FolderDown className="w-6 h-6 text-yt-text-muted/60" />
              </div>
              <h4 className="text-sm font-bold text-yt-text">لا توجد تحميلات بعد</h4>
              <p className="text-xs text-yt-text-muted max-w-sm mx-auto">
                يمكنك تحميل الفيديوهات من زر التنزيل داخل شاشة تشغيل الفيديو لمشاهدتها بدون إنترنت.
              </p>
            </div>
          ) : (
            downloads.map((item) => {
              const isSelected = selectedVideoIds.includes(item.videoId);
              return (
                <div
                  key={item.videoId}
                  id={`download-row-${item.videoId}`}
                  onClick={() => {
                    if (isSelectionMode) {
                      handleToggleSelectVideo(item.videoId);
                    } else if (item.status === 'done') {
                      onSelectVideo?.(item.videoId, item.title, item.channelTitle, item.channelId);
                      onClose();
                    }
                  }}
                  className={`p-3 sm:p-3.5 rounded-2xl border transition flex items-center justify-between gap-3 group ${
                    isSelectionMode ? 'cursor-pointer' : item.status === 'done' ? 'cursor-pointer hover:bg-yt-surface' : ''
                  } ${
                    isSelected
                      ? 'bg-yt-brand-soft/40 border-yt-brand/50'
                      : 'bg-yt-surface border-yt-border'
                  }`}
                >
                  {/* Left (Selection Box if mode active) */}
                  {isSelectionMode && (
                    <div
                      className="shrink-0 p-1 cursor-pointer"
                      onClick={(e) => handleToggleSelectVideo(item.videoId, e)}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-yt-brand" />
                      ) : (
                        <Square className="w-5 h-5 text-yt-text-muted" />
                      )}
                    </div>
                  )}

                  {/* Thumbnail & Title/Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <DownloadRowThumbnail
                      videoId={item.videoId}
                      initialThumbnail={item.thumbnailUrl}
                      title={item.title}
                    />

                    <div className="min-w-0 flex-1 space-y-1">
                      <h4
                        className="text-xs sm:text-sm font-bold text-yt-text truncate group-hover:text-yt-brand transition"
                        title={item.title}
                      >
                        {item.title}
                      </h4>

                      {/* Channel and Status Details */}
                      <div className="flex items-center flex-wrap gap-2 text-[11px] text-yt-text-muted">
                        <span className="truncate max-w-[120px]">{item.channelTitle || 'قناة أطفال'}</span>

                        {/* Status Badge */}
                        {item.status === 'done' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            <span>تم التحميل</span>
                          </span>
                        )}

                        {item.status === 'downloading' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yt-brand-soft text-yt-brand font-bold border border-yt-brand/30">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>
                              {item.percent !== null && item.percent !== undefined
                                ? `${item.percent}%`
                                : 'جاري التحميل...'}
                            </span>
                          </span>
                        )}

                        {item.status === 'queued' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 font-bold border border-amber-200">
                            <span>في الانتظار...</span>
                          </span>
                        )}

                        {item.status === 'failed' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-yt-danger font-bold border border-yt-danger/30">
                            <AlertTriangle className="w-3 h-3" />
                            <span>فشل</span>
                          </span>
                        )}

                        {/* Size Indicator */}
                        {item.status === 'downloading' && (
                          <span className="text-[10px] text-yt-text-muted font-mono">
                            {formatBytes(item.bytesDownloaded)}
                            {item.totalBytes ? ` / ${formatBytes(item.totalBytes)}` : ''}
                          </span>
                        )}
                      </div>

                      {/* Progress Bar for Downloading status */}
                      {item.status === 'downloading' && (
                        <div className="w-full h-1.5 bg-yt-surface-muted rounded-full overflow-hidden border border-yt-border mt-1">
                          {item.percent !== null && item.percent !== undefined ? (
                            <div
                              className="h-full bg-yt-brand transition-all duration-300 rounded-full"
                              style={{ width: `${Math.max(4, Math.min(100, item.percent))}%` }}
                            />
                          ) : (
                            <div className="h-full bg-yt-brand/60 animate-pulse rounded-full w-2/3" />
                          )}
                        </div>
                      )}

                      {/* Error text if failed */}
                      {item.status === 'failed' && item.errorMessage && (
                        <p className="text-[10px] text-yt-danger font-medium truncate" title={item.errorMessage}>
                          {item.errorMessage}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions column (Retry if failed, Trash to delete single) */}
                  {!isSelectionMode && (
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {item.status === 'failed' && (
                        <button
                          type="button"
                          onClick={(e) => handleRetryDownload(item, e)}
                          className="w-8 h-8 rounded-xl bg-yt-surface-muted hover:bg-yt-brand-soft text-yt-text hover:text-yt-brand flex items-center justify-center transition border border-yt-border cursor-pointer shadow-2xs"
                          title="إعادة المحاولة"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        id={`delete-download-${item.videoId}-btn`}
                        onClick={(e) => handleSingleDelete(item, e)}
                        className="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 text-yt-danger flex items-center justify-center transition border border-yt-danger/30 cursor-pointer shadow-2xs"
                        title="حذف من التنزيلات"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
export default DownloadsModal;
