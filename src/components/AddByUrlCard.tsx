import React, { useState } from 'react';
import db, { Interaction } from '../db';
import { WORKER_URL } from '../config';
import { syncSingleChannelRss } from '../filtering';
import { Plus, Loader2, CheckCircle2, AlertCircle, Link as LinkIcon, Tv } from 'lucide-react';

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

export function extractChannelHandleOrUrl(url: string): { handle?: string; channelId?: string; rawUrl?: string } | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('@')) {
    return { handle: trimmed.replace(/^@+/, '') };
  }

  if (/^UC[\w-]{22}$/.test(trimmed)) {
    return { channelId: trimmed };
  }

  if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
    try {
      const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      const path = parsed.pathname;

      const ucMatch = path.match(/\/channel\/(UC[\w-]{22})/i);
      if (ucMatch) {
        return { channelId: ucMatch[1], rawUrl: trimmed };
      }

      const handleMatch = path.match(/\/@([\w.-]+)/i);
      if (handleMatch) {
        return { handle: handleMatch[1], rawUrl: trimmed };
      }

      const cMatch = path.match(/\/c\/([\w.-]+)/i);
      if (cMatch) {
        return { handle: cMatch[1], rawUrl: trimmed };
      }

      const userMatch = path.match(/\/user\/([\w.-]+)/i);
      if (userMatch) {
        return { handle: userMatch[1], rawUrl: trimmed };
      }

      if (!path.includes('/watch') && !path.includes('/shorts') && !path.includes('/embed') && !parsed.searchParams.get('v') && !parsed.searchParams.get('list')) {
        const segments = path.split('/').filter(Boolean);
        if (segments.length === 1 && !['playlist', 'feed', 'gaming', 'results', 'premium'].includes(segments[0].toLowerCase())) {
          return { handle: segments[0], rawUrl: trimmed };
        }
      }
    } catch {}
  }

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
  target: 'saved' | 'loved' | 'channel';
  onAdded?: () => void;
}

export function AddByUrlCard({ target, onAdded }: AddByUrlCardProps) {
  const [urlInput, setUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleAdd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    setFeedback(null);

    const channelInfo = extractChannelHandleOrUrl(trimmed);
    const playlistId = extractPlaylistId(trimmed);
    const videoId = extractVideoId(trimmed);

    if (target === 'channel') {
      if (!channelInfo && !playlistId && !trimmed.includes('youtube.com')) {
        setFeedback({
          type: 'error',
          message: 'الرابط أو المعرف غير صالح. يرجى إدخال رابط قناة يوتيوب أو معرفها (@handle).',
        });
        return;
      }
    } else {
      if (!playlistId && !videoId && !channelInfo) {
        setFeedback({ type: 'error', message: 'الرابط غير صالح' });
        return;
      }
    }

    setIsLoading(true);

    try {
      if (target === 'channel') {
        // Channel resolution flow
        let resolveUrl = '';
        if (channelInfo?.handle) {
          resolveUrl = `${WORKER_URL}/api/resolve-channel?handle=${encodeURIComponent(channelInfo.handle)}`;
        } else if (channelInfo?.channelId) {
          resolveUrl = `${WORKER_URL}/api/resolve-channel?handle=${encodeURIComponent(channelInfo.channelId)}`;
        } else {
          resolveUrl = `${WORKER_URL}/api/resolve-channel?url=${encodeURIComponent(trimmed)}`;
        }

        const res = await fetch(resolveUrl);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (res.status === 404) {
            throw new Error('لم يتم العثور على القناة على يوتيوب. يرجى التحقق من صحة الرابط أو المعرف.');
          } else if (errData.error === 'no_api_key') {
            throw new Error('خدمة التعرف على القنوات غير مهيأة بمفتاح API على الخادم.');
          } else {
            throw new Error(errData.error || 'تعذر جلب بيانات القناة من يوتيوب');
          }
        }

        const data = await res.json();
        const resolvedSourceId = (data.sourceId || '').trim();

        // STRICT INVARIANT: Block add if sourceId starts with "@"
        if (!resolvedSourceId || resolvedSourceId.startsWith('@')) {
          throw new Error('تم حظر الإضافة: لا يمكن حفظ قناة بمعرف يبدأ بـ @. يجب استخدام معرف قناة صالح.');
        }

        const channelTitle = data.title || resolvedSourceId;

        // Persist to db.channels (sourceId = UC... ONLY)
        const existing = await db.channels.where('sourceId').equals(resolvedSourceId).first();
        if (existing && existing.id) {
          await db.channels.update(existing.id, { enabled: true });
        } else {
          await db.channels.add({
            sourceType: 'channel',
            sourceId: resolvedSourceId, // UC... ONLY
            title: channelTitle,        // from API
            thumbnail: data.thumbnail,
            category: [],
            isPreloaded: false,
            enabled: true,
          });
        }

        // Trigger background RSS sync
        syncSingleChannelRss('channel', resolvedSourceId, channelTitle).catch(() => {});

        setFeedback({
          type: 'success',
          message: `تمت إضافة قناة "${channelTitle}" بنجاح! ✨`,
        });
        setUrlInput('');
        onAdded?.();
      } else if (playlistId) {
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
      } else if (channelInfo) {
        // Channel URL pasted into saved/loved: resolve channel and add its recent videos
        let resolveUrl = channelInfo.handle
          ? `${WORKER_URL}/api/resolve-channel?handle=${encodeURIComponent(channelInfo.handle)}`
          : `${WORKER_URL}/api/resolve-channel?url=${encodeURIComponent(trimmed)}`;

        const res = await fetch(resolveUrl);
        if (!res.ok) {
          throw new Error('تعذر التعرف على القناة');
        }
        const chData = await res.json();
        const ucId = (chData.sourceId || '').trim();
        if (!ucId || ucId.startsWith('@')) {
          throw new Error('معرف القناة غير صالح (يبدأ بـ @)');
        }

        const rssRes = await fetch(`${WORKER_URL}/api/rss?type=channel&id=${encodeURIComponent(ucId)}`);
        if (!rssRes.ok) {
          throw new Error('تعذر جلب فيديوهات القناة');
        }
        const feedData = await rssRes.json();
        const items = feedData.items || feedData.videos || [];
        if (items.length === 0) {
          throw new Error('لم يتم العثور على فيديوهات حديثة في هذه القناة');
        }

        const now = Date.now();
        for (const item of items.slice(0, 15)) {
          const vId = item.videoId || item.id;
          if (!vId) continue;
          const existing = await db.interactions.get(vId);
          await db.interactions.put({
            videoId: vId,
            channelId: ucId,
            title: item.title || existing?.title || 'فيديو يوتيوب',
            thumbnail: item.thumbnail || existing?.thumbnail,
            parentRating: existing?.parentRating,
            childReaction: existing?.childReaction,
            watchTime: existing?.watchTime || 0,
            videoDuration: existing?.videoDuration || 0,
            completed: existing?.completed || false,
            lastWatched: existing?.lastWatched || now,
            savedByParent: target === 'saved' ? true : existing?.savedByParent,
            childLoved: target === 'loved' ? true : existing?.childLoved,
          });
        }

        setFeedback({
          type: 'success',
          message: `تمت إضافة فيديوهات قناة "${chData.title || ucId}" بنجاح إلى ${target === 'saved' ? 'المحفوظات' : 'المفضلة'}! ✨`,
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
      className="bg-yt-surface rounded-2xl border border-yt-border p-4 sm:p-5 shadow-xs mb-6 text-right"
    >
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
            target === 'channel'
              ? 'bg-sky-50 text-sky-600 border-sky-100'
              : 'bg-yt-brand-soft text-yt-brand border-yt-brand/30'
          }`}
        >
          {target === 'channel' ? <Tv className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
        </div>
        <div>
          <h3 className="text-sm font-bold text-yt-text">
            {target === 'channel'
              ? 'إضافة قناة مخصصة عبر الرابط أو المعرف (@handle)'
              : target === 'saved'
              ? 'إضافة فيديو أو قائمة تشغيل مخصصة'
              : 'إضافة فيديو أو قائمة إلى المفضلة'}
          </h3>
          <p className="text-xs text-yt-text-muted">
            {target === 'channel'
              ? 'ألصق رابط القناة أو معرفها (@handle) للتحقق منها وإضافتها فوراً إلى قائمة القنوات.'
              : 'يمكنك لصق رابط فيديو مباشر أو رابط قائمة تشغيل كاملة من يوتيوب لإضافتها فوراً.'}
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
            placeholder={
              target === 'channel'
                ? 'الصق رابط القناة أو المعرف (مثال: @spacetoon أو https://youtube.com/@...)'
                : 'الصق رابط فيديو أو قائمة تشغيل من يوتيوب'
            }
            disabled={isLoading}
            className="w-full px-4 py-2.5 rounded-xl bg-yt-surface-muted border border-yt-border text-xs sm:text-sm text-yt-text placeholder-yt-text-muted focus:outline-hidden focus:ring-2 focus:ring-yt-brand/30 focus:border-yt-brand transition-all text-right"
          />
        </div>
        <button
          id={`add-url-btn-${target}`}
          type="submit"
          disabled={isLoading || !urlInput.trim()}
          className="px-5 py-2.5 rounded-xl bg-yt-brand hover:bg-yt-brand-hover disabled:bg-yt-surface-muted disabled:text-yt-text-muted text-yt-brand-text text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition shadow-xs cursor-pointer disabled:cursor-not-allowed shrink-0 active:scale-95"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>جاري التحقق والإضافة...</span>
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
              : 'bg-rose-50 text-yt-danger border border-yt-danger/30'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-yt-danger" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
}

export default AddByUrlCard;
