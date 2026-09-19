import React, { useState } from 'react';
import db, { Interaction } from '../db';
import { WORKER_URL } from '../config';
import { Plus, Loader2, CheckCircle2, AlertCircle, Link as LinkIcon } from 'lucide-react';

export function extractPlaylistId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const listParam = parsed.searchParams.get('list');
    if (listParam) return listParam;
  } catch {
    // URL parsing fallback
  }
  const match = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  return null;
}

export function extractVideoId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (parsed.hostname.includes('youtu.be')) {
      const path = parsed.pathname.slice(1).split('/')[0];
      if (path && /^[a-zA-Z0-9_-]{11}$/.test(path)) return path;
    }
    if (parsed.pathname.includes('/shorts/')) {
      const parts = parsed.pathname.split('/shorts/');
      if (parts[1]) {
        const id = parts[1].split('/')[0].split('?')[0];
        if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }
    }
    if (parsed.pathname.includes('/embed/')) {
      const parts = parsed.pathname.split('/embed/');
      if (parts[1]) {
        const id = parts[1].split('/')[0].split('?')[0];
        if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }
    }
    const vParam = parsed.searchParams.get('v');
    if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) return vParam;
  } catch {
    // Regex fallback
  }

  const vMatch = trimmed.match(/(?:v=|\/shorts\/|\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (vMatch) return vMatch[1];

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

interface AddByUrlCardProps {
  target: 'saved' | 'loved';
  onAdded?: () => void;
}

export default function AddByUrlCard({ target, onAdded }: AddByUrlCardProps) {
  const [urlInput, setUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleAdd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    setFeedback(null);

    const playlistId = extractPlaylistId(trimmed);
    const videoId = extractVideoId(trimmed);

    if (!playlistId && !videoId) {
      setFeedback({ type: 'error', message: 'الرابط غير صالح' });
      return;
    }

    setIsLoading(true);

    try {
      if (playlistId) {
        // Fetch playlist lookup
        const res = await fetch(`${WORKER_URL}/api/playlist-lookup?id=${encodeURIComponent(playlistId)}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'فشل جلب بيانات قائمة التشغيل من يوتيوب');
        }
        const data = await res.json();
        const videos: Array<{ videoId: string; title: string; publishedAt: string }> = data.videos || [];

        if (videos.length === 0) {
          throw new Error('قائمة التشغيل فارغة أو غير متوفرة');
        }

        const now = Date.now();
        for (const vid of videos) {
          const existing = await db.interactions.get(vid.videoId);
          const record: Interaction = {
            videoId: vid.videoId,
            channelId: existing?.channelId || '',
            title: vid.title || existing?.title || 'فيديو يوتيوب',
            thumbnail: existing?.thumbnail,
            parentRating: existing?.parentRating,
            childReaction: existing?.childReaction,
            watchTime: existing?.watchTime || 0,
            videoDuration: existing?.videoDuration || 0,
            completed: existing?.completed || false,
            lastWatched: existing?.lastWatched || now,
            savedByParent: target === 'saved' ? true : existing?.savedByParent,
            childLoved: target === 'loved' ? true : existing?.childLoved,
          };
          await db.interactions.put(record);
        }

        setFeedback({
          type: 'success',
          message: `تمت إضافة ${videos.length} فيديو بنجاح إلى ${target === 'saved' ? 'المحفوظات' : 'المفضلة'}! ✨`,
        });
        setUrlInput('');
        onAdded?.();
      } else if (videoId) {
        // Fetch single video lookup
        const res = await fetch(`${WORKER_URL}/api/video-lookup?id=${encodeURIComponent(videoId)}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'فيديو غير متاح أو تم حذفه');
        }
        const data = await res.json();

        const now = Date.now();
        const existing = await db.interactions.get(videoId);
        const record: Interaction = {
          videoId,
          channelId: data.channelId || existing?.channelId || '',
          title: data.title || existing?.title || 'فيديو يوتيوب',
          thumbnail: existing?.thumbnail,
          parentRating: existing?.parentRating,
          childReaction: existing?.childReaction,
          watchTime: existing?.watchTime || 0,
          videoDuration: existing?.videoDuration || 0,
          completed: existing?.completed || false,
          lastWatched: existing?.lastWatched || now,
          savedByParent: target === 'saved' ? true : existing?.savedByParent,
          childLoved: target === 'loved' ? true : existing?.childLoved,
        };
        await db.interactions.put(record);

        setFeedback({
          type: 'success',
          message: `تمت إضافة فيديو "${data.title || videoId}" بنجاح إلى ${target === 'saved' ? 'المحفوظات' : 'المفضلة'}! ✨`,
        });
        setUrlInput('');
        onAdded?.();
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'حدث خطأ أثناء إضافة الرابط',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      id={`add-by-url-card-${target}`}
      className="bg-white rounded-2xl border border-amber-100/80 p-4 sm:p-5 shadow-xs mb-6 text-right"
    >
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
          <LinkIcon className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-stone-900">
            {target === 'saved' ? 'إضافة فيديو أو قائمة تشغيل مخصصة' : 'إضافة فيديو أو قائمة إلى المفضلة'}
          </h3>
          <p className="text-xs text-stone-500">
            يمكنك لصق رابط فيديو مباشر أو رابط قائمة تشغيل كاملة من يوتيوب لإضافتها فوراً.
          </p>
        </div>
      </div>

      <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <input
            id={`url-input-${target}`}
            type="text"
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              if (feedback) setFeedback(null);
            }}
            placeholder="الصق رابط فيديو أو قائمة تشغيل من يوتيوب"
            disabled={isLoading}
            className="w-full px-4 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs sm:text-sm text-stone-900 placeholder-stone-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all text-right"
          />
        </div>
        <button
          id={`add-url-btn-${target}`}
          type="submit"
          disabled={isLoading || !urlInput.trim()}
          className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:bg-stone-200 disabled:text-stone-400 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition shadow-xs cursor-pointer disabled:cursor-not-allowed shrink-0 active:scale-95"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>جاري الإضافة...</span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              <span>إضافة</span>
            </>
          )}
        </button>
      </form>

      {feedback && (
        <div
          className={`mt-3 p-3 rounded-xl flex items-center gap-2.5 text-xs font-bold ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/60'
              : 'bg-rose-50 text-rose-800 border border-rose-200/60'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
}
