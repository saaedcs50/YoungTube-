import React, { useEffect, useState } from 'react';
import { Download, ListPlus, Share2, X } from 'lucide-react';
import type { FeedItem } from '../db';
import { getDownloadByVideoId, startDownload } from '../services/downloadManager';
import { PlaylistManager } from './PlaylistManager';

interface VideoOverflowSheetProps {
  video: FeedItem | null;
  channelTitle?: string;
  onClose: () => void;
  initialMode?: 'menu' | 'playlist';
  avoidBottomNav?: boolean;
}

export const VideoOverflowSheet: React.FC<VideoOverflowSheetProps> = ({ video, channelTitle, onClose, initialMode = 'menu', avoidBottomNav = false }) => {
  const [mode, setMode] = useState<'menu' | 'playlist'>(initialMode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setMode(initialMode);
    setMessage(null);
  }, [video?.videoId, initialMode]);

  if (!video) return null;

  const handleDownload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const existing = await getDownloadByVideoId(video.videoId);
      if (existing?.status === 'done') {
        setMessage('الفيديو محمّل بالفعل');
        return;
      }
      const result = await startDownload({
        videoId: video.videoId,
        title: video.title,
        thumbnailUrl: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
        channelTitle,
        channelId: video.channelId,
      });
      setMessage(result.ok ? 'بدأ التنزيل' : result.message || 'تعذر بدء التنزيل');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر بدء التنزيل');
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    const url = `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: video.title, url });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setMessage('تم نسخ رابط الفيديو');
        return;
      }
      setMessage(url);
    } catch {
      // User cancelled the share sheet.
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-3" dir="rtl" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-3xl border border-yt-border bg-yt-surface shadow-2xl overflow-hidden" style={avoidBottomNav ? { paddingBottom: 'calc(56px + env(safe-area-inset-bottom))' } : undefined} onMouseDown={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-yt-border flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-black text-yt-text truncate">خيارات الفيديو</h3>
            <p className="text-[11px] text-yt-text-muted truncate mt-0.5">{video.title}</p>
          </div>
          <button type="button" onClick={onClose} className="w-10 h-10 rounded-full hover:bg-yt-surface-muted flex items-center justify-center text-yt-text-muted cursor-pointer" aria-label="إغلاق"><X className="w-5 h-5" /></button>
        </div>

        {message && <div className="px-4 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 border-b border-emerald-200">{message}</div>}

        {mode === 'menu' ? (
          <div className="p-3 space-y-1">
            <button type="button" onClick={() => setMode('playlist')} className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-yt-surface-muted text-right cursor-pointer">
              <span className="w-10 h-10 rounded-full bg-yt-brand-soft text-yt-brand flex items-center justify-center"><ListPlus className="w-5 h-5" /></span>
              <span><span className="block text-sm font-bold text-yt-text">حفظ إلى قائمة تشغيل</span><span className="block text-[10px] text-yt-text-muted">أضف الفيديو إلى إحدى قوائمك</span></span>
            </button>
            <button type="button" onClick={() => void handleDownload()} disabled={busy} className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-yt-surface-muted text-right cursor-pointer disabled:opacity-50">
              <span className="w-10 h-10 rounded-full bg-yt-surface-muted text-yt-text flex items-center justify-center"><Download className="w-5 h-5" /></span>
              <span><span className="block text-sm font-bold text-yt-text">تنزيل</span><span className="block text-[10px] text-yt-text-muted">المشاهدة بدون إنترنت — 360p</span></span>
            </button>
            <button type="button" onClick={() => void handleShare()} className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-yt-surface-muted text-right cursor-pointer">
              <span className="w-10 h-10 rounded-full bg-yt-surface-muted text-yt-text flex items-center justify-center"><Share2 className="w-5 h-5" /></span>
              <span><span className="block text-sm font-bold text-yt-text">مشاركة</span><span className="block text-[10px] text-yt-text-muted">مشاركة أو نسخ رابط الفيديو</span></span>
            </button>
          </div>
        ) : (
          <div className="p-3">
            <PlaylistManager mode="add" video={{ videoId: video.videoId, title: video.title }} onClose={() => setMode('menu')} onChanged={() => { setMessage('تمت الإضافة إلى القائمة'); setMode('menu'); }} />
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoOverflowSheet;
