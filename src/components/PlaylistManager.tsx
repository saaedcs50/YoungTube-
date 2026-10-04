import React, { useEffect, useState } from 'react';
import db, { ChildPlaylist } from '../db';
import { Check, FolderPlus, ListPlus, Loader2, Pencil, Trash2, X } from 'lucide-react';

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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const rows = await db.childPlaylists.orderBy('updatedAt').reverse().toArray();
    setPlaylists(rows);
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const now = Date.now();
      await db.childPlaylists.add({
        id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: trimmed,
        videoIds: [],
        createdAt: now,
        updatedAt: now,
      });
      setName('');
      setMessage('اتعملت قائمة تشغيل جديدة');
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const rename = async () => {
    const trimmed = name.trim();
    if (!editingId || !trimmed || busy) return;
    setBusy(true);
    try {
      await db.childPlaylists.update(editingId, { name: trimmed, updatedAt: Date.now() });
      setEditingId(null);
      setName('');
      setMessage('تم تغيير اسم القائمة');
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (playlist: ChildPlaylist) => {
    if (busy) return;
    if (!window.confirm(`مسح قائمة «${playlist.name}»؟`)) return;
    setBusy(true);
    try {
      await db.childPlaylists.delete(playlist.id);
      setMessage('تم مسح القائمة');
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const addVideo = async (playlist: ChildPlaylist) => {
    if (!video || busy || playlist.videoIds.includes(video.videoId)) return;
    setBusy(true);
    try {
      await db.childPlaylists.update(playlist.id, {
        videoIds: [...playlist.videoIds, video.videoId],
        updatedAt: Date.now(),
      });
      setMessage(`تمت إضافة الفيديو إلى «${playlist.name}»`);
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const removeVideo = async (playlist: ChildPlaylist) => {
    if (!video || busy || !playlist.videoIds.includes(video.videoId)) return;
    setBusy(true);
    try {
      await db.childPlaylists.update(playlist.id, {
        videoIds: playlist.videoIds.filter((id) => id !== video.videoId),
        updatedAt: Date.now(),
      });
      setMessage(`اتشال الفيديو من «${playlist.name}»`);
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-yt-brand-soft text-yt-brand flex items-center justify-center">
            <ListPlus className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black text-yt-text">
              {mode === 'add' ? 'إضافة الفيديو لقائمة تشغيل' : 'قوائم التشغيل'}
            </h3>
            {video?.title && mode === 'add' && (
              <p className="text-[11px] text-yt-text-muted max-w-sm line-clamp-1">{video.title}</p>
            )}
          </div>
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
        />
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() => void (editingId ? rename() : create())}
          className="shrink-0 px-3.5 py-2.5 rounded-xl bg-yt-brand text-yt-brand-text text-xs font-bold disabled:opacity-40 cursor-pointer inline-flex items-center gap-1.5"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editingId ? <Check className="w-3.5 h-3.5" /> : <FolderPlus className="w-3.5 h-3.5" />}
          <span>{editingId ? 'حفظ' : 'إضافة'}</span>
        </button>
        {editingId && (
          <button
            type="button"
            onClick={() => { setEditingId(null); setName(''); }}
            className="shrink-0 p-2.5 rounded-xl border border-yt-border text-yt-text-muted hover:bg-yt-surface-muted cursor-pointer"
            aria-label="إلغاء تعديل الاسم"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {playlists.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-yt-border bg-yt-surface-muted/50 px-4 py-7 text-center text-xs text-yt-text-muted">
          لسه مفيش قوائم تشغيل. اعمل أول قائمة باسم من اختيارك.
        </div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
          {playlists.map((playlist) => {
            const hasVideo = Boolean(video && playlist.videoIds.includes(video.videoId));
            return (
              <div key={playlist.id} className="flex items-center gap-2 p-3 rounded-2xl border border-yt-border bg-yt-surface">
                <div className="w-9 h-9 rounded-xl bg-yt-surface-muted flex items-center justify-center text-yt-brand shrink-0">
                  <ListPlus className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-black text-yt-text truncate">{playlist.name}</div>
                  <div className="text-[10px] text-yt-text-muted">{playlist.videoIds.length} فيديو</div>
                </div>
                {mode === 'add' && (
                  <button
                    type="button"
                    onClick={() => void (hasVideo ? removeVideo(playlist) : addVideo(playlist))}
                    className={`shrink-0 px-2.5 py-1.5 rounded-xl text-[10px] font-bold cursor-pointer ${hasVideo ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-yt-brand text-yt-brand-text'}`}
                  >
                    {hasVideo ? 'مضاف' : 'إضافة'}
                  </button>
                )}
                {mode === 'manage' && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => { setEditingId(playlist.id); setName(playlist.name); setMessage(null); }}
                      className="p-2 rounded-lg hover:bg-yt-surface-muted text-yt-text-muted cursor-pointer"
                      aria-label={`إعادة تسمية ${playlist.name}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(playlist)}
                      className="p-2 rounded-lg hover:bg-rose-50 text-rose-500 cursor-pointer"
                      aria-label={`مسح ${playlist.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PlaylistManager;
