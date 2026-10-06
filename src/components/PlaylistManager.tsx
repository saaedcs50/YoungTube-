import React, { useEffect, useState } from 'react';
import { Check, FolderPlus, ListPlus, Loader2, Pencil, Trash2, X } from 'lucide-react';
import type { ChildPlaylist } from '../db';
import { addPlaylistItem, createAndSaveVideo, createPlaylist, deletePlaylist, listPlaylists, removePlaylistItem, setLastUsedPlaylistId, updatePlaylistName } from '../services/playlists/playlistService';
import { getPlaylistItems } from '../services/playlists/playlistRepository';

interface PlaylistManagerProps {
  video?: { videoId: string; title?: string } | null;
  mode?: 'add' | 'manage';
  onClose?: () => void;
  onChanged?: () => void;
}

export const PlaylistManager: React.FC<PlaylistManagerProps> = ({ video = null, mode = 'manage', onClose, onChanged }) => {
  const [playlists, setPlaylists] = useState<ChildPlaylist[]>([]);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const rows = await listPlaylists();
    setPlaylists(rows);
    const entries = await Promise.all(rows.map(async (playlist) => [playlist.id, (await getPlaylistItems(playlist.id)).length] as const));
    setCounts(Object.fromEntries(entries));
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      if (video) {
        await createAndSaveVideo(trimmed, video.videoId, video.title);
        setMessage('اتعملت القائمة واتضاف الفيديو فيها');
      } else {
        const playlist = await createPlaylist(trimmed);
        await setLastUsedPlaylistId(playlist.id);
        setMessage('اتعملت قائمة تشغيل جديدة');
      }
      setName('');
      await load();
      onChanged?.();
      if (mode === 'add') onClose?.();
    } catch (error) {
      setMessage(error instanceof Error && error.message === 'PLAYLIST_NAME_REQUIRED' ? 'اكتب اسم القائمة الأول' : 'حصل خطأ أثناء حفظ القائمة');
    } finally {
      setBusy(false);
    }
  };

  const rename = async () => {
    const trimmed = name.trim();
    if (!editingId || !trimmed || busy) return;
    setBusy(true);
    try {
      await updatePlaylistName(editingId, trimmed);
      setEditingId(null);
      setName('');
      setMessage('تم تغيير اسم القائمة');
      await load();
      onChanged?.();
    } catch {
      setMessage('تعذر تغيير اسم القائمة');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (playlist: ChildPlaylist) => {
    if (busy) return;
    if (!window.confirm(`مسح قائمة «${playlist.name}»؟ الفيديوهات والتنزيلات لن تتأثر.`)) return;
    setBusy(true);
    try {
      await deletePlaylist(playlist.id);
      setMessage('تم مسح القائمة');
      await load();
      onChanged?.();
    } catch {
      setMessage('تعذر مسح القائمة');
    } finally {
      setBusy(false);
    }
  };

  const toggleVideo = async (playlist: ChildPlaylist) => {
    if (!video || busy) return;
    setBusy(true);
    try {
      const items = await getPlaylistItems(playlist.id);
      const existing = items.find((item) => item.videoId === video.videoId);
      if (existing) {
        setMessage('الفيديو موجود بالفعل — استخدم إزالة من القائمة لو عايز تشيله');
      } else {
        await addPlaylistItem(playlist.id, video.videoId, { titleSnapshot: video.title });
        await setLastUsedPlaylistId(playlist.id);
        setMessage(`تمت الإضافة إلى «${playlist.name}»`);
      }
      await load();
      onChanged?.();
    } catch {
      setMessage('تعذر تحديث القائمة');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-yt-border bg-yt-surface p-4 space-y-3" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-black text-yt-text">{mode === 'add' ? 'إضافة إلى قائمة تشغيل' : 'قوائم التشغيل'}</div>
          <div className="text-[10px] text-yt-text-muted">{video ? 'اختار قائمة أو اعمل واحدة جديدة.' : 'قوائمك المحلية الخاصة بالطفل.'}</div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-yt-surface-muted text-yt-text-muted cursor-pointer" aria-label="إغلاق">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {message && <div className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{message}</div>}

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void (editingId ? rename() : create());
          }}
          placeholder={editingId ? 'الاسم الجديد للقائمة…' : 'اسم قائمة جديدة…'}
          className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-yt-border bg-yt-surface-muted text-xs text-yt-text focus:outline-hidden focus:ring-2 focus:ring-yt-brand/20"
          aria-label={editingId ? 'الاسم الجديد للقائمة' : 'اسم قائمة جديدة'}
        />
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() => void (editingId ? rename() : create())}
          className="shrink-0 px-3.5 py-2.5 rounded-xl bg-yt-brand text-yt-brand-text text-xs font-bold disabled:opacity-40 cursor-pointer inline-flex items-center gap-1.5"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editingId ? <Check className="w-3.5 h-3.5" /> : <FolderPlus className="w-3.5 h-3.5" />}
          <span>{editingId ? 'حفظ' : 'إنشاء'}</span>
        </button>
        {editingId && (
          <button type="button" onClick={() => { setEditingId(null); setName(''); }} className="shrink-0 p-2.5 rounded-xl border border-yt-border text-yt-text-muted hover:bg-yt-surface-muted cursor-pointer" aria-label="إلغاء تعديل الاسم">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {playlists.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-yt-border bg-yt-surface-muted/60 p-5 text-center">
          <ListPlus className="w-6 h-6 mx-auto text-yt-text-muted mb-2" />
          <div className="text-xs font-bold text-yt-text">لسه مفيش قوائم</div>
          <div className="text-[10px] text-yt-text-muted mt-1">اكتب اسم واعمل أول قائمة.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {playlists.map((playlist) => {
            const count = counts[playlist.id] ?? 0;
            return (
              <div key={playlist.id} className="flex items-center gap-2 rounded-xl border border-yt-border bg-yt-surface-muted px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => void toggleVideo(playlist)}
                  disabled={busy || !video}
                  className="min-w-0 flex-1 text-right cursor-pointer disabled:cursor-default"
                >
                  <div className="text-xs font-black text-yt-text truncate">{playlist.name}</div>
                  <div className="text-[10px] text-yt-text-muted">{count} فيديو</div>
                </button>
                {!video && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setEditingId(playlist.id); setName(playlist.name); }}
                      className="p-2 rounded-lg text-yt-text-muted hover:bg-yt-surface cursor-pointer"
                      aria-label={`تعديل ${playlist.name}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(playlist)}
                      className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                      aria-label={`حذف ${playlist.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
                {video && <ListPlus className="w-4 h-4 shrink-0 text-yt-brand" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
