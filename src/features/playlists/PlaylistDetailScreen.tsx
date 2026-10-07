import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, GripVertical, Play, Trash2 } from 'lucide-react';
import type { ChildPlaylist } from '../../db';
import { getPlaylist, removePlaylistItem, reorderPlaylistItem } from '../../services/playlists/playlistRepository';
import { resolvePlaylistItemViews, type PlaylistItemView } from '../../services/playlists/playlistSelectors';
import type { PlaylistPlaybackContext } from '../../services/playlists/playlistTypes';

interface Props {
  playlistId: string;
  onBack: () => void;
  onSelectVideo: (videoId: string, title?: string, channelName?: string, channelId?: string, options?: { localPath?: string; playlistContext?: PlaylistPlaybackContext }) => void;
}

export const PlaylistDetailScreen: React.FC<Props> = ({ playlistId, onBack, onSelectVideo }) => {
  const [playlist, setPlaylist] = useState<ChildPlaylist | null>(null);
  const [views, setViews] = useState<PlaylistItemView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPlaylist(await getPlaylist(playlistId) || null);
      setViews(await resolvePlaylistItemViews(playlistId));
    } finally {
      setLoading(false);
    }
  }, [playlistId]);
  useEffect(() => { void load(); }, [load]);

  const playAll = () => {
    const target = views.find((view) => view.playable && view.feed);
    if (!target?.feed || !playlist) return;
    onSelectVideo(target.feed.videoId, target.feed.title, undefined, target.feed.channelId, { localPath: target.localPath, playlistContext: { source: 'playlist', playlistId, playlistItemId: target.item.id, shuffle: false } });
  };

  const move = async (itemId: string, direction: -1 | 1) => {
    const index = views.findIndex((view) => view.item.id === itemId);
    const target = index + direction;
    if (!playlist || index < 0 || target < 0 || target >= views.length) return;
    await reorderPlaylistItem(playlistId, itemId, target);
    await load();
  };

  const remove = async (itemId: string) => {
    await removePlaylistItem(playlistId, itemId);
    await load();
  };

  return (
    <div dir="rtl" className="min-h-screen bg-yt-bg text-yt-text">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-28">
        <button type="button" onClick={onBack} className="mt-3 w-10 h-10 rounded-full border border-yt-border bg-yt-surface flex items-center justify-center cursor-pointer" aria-label="رجوع"><ArrowRight className="w-5 h-5" /></button>
        {loading ? <div className="py-12 space-y-4 animate-pulse"><div className="aspect-video rounded-2xl bg-yt-surface-muted" /><div className="h-6 rounded bg-yt-surface-muted w-1/2" /></div> : !playlist ? <div className="py-16 text-center">القائمة غير موجودة</div> : <>
          <section className="mt-4 rounded-3xl border border-yt-border bg-yt-surface overflow-hidden">
            <div className="aspect-[16/6] bg-yt-surface-muted">{playlist.thumbnailVideoId && <img src={`https://i.ytimg.com/vi/${playlist.thumbnailVideoId}/hqdefault.jpg`} alt="" className="w-full h-full object-cover" />}</div>
            <div className="p-4"><h1 className="text-xl font-black">{playlist.name}</h1><p className="text-xs text-yt-text-muted mt-1">{views.length} فيديو</p><button type="button" disabled={!views.some((v) => v.playable)} onClick={playAll} className="mt-4 inline-flex items-center gap-2 rounded-full bg-yt-brand text-yt-brand-text px-5 py-2.5 text-xs font-bold disabled:opacity-40 cursor-pointer"><Play className="w-4 h-4 fill-current" />تشغيل الكل</button></div>
          </section>
          <div className="mt-5 divide-y divide-yt-border">{views.map((view) => {
            if (!view.feed) return <div key={view.item.id} className="py-4 flex items-center gap-3 text-xs text-yt-text-muted"><GripVertical className="w-4 h-4" /><span className="flex-1">{view.item.titleSnapshot || view.item.videoId} — غير متاح حاليًا</span></div>;
            return <div key={view.item.id} className="flex items-center gap-2"><span className="text-yt-text-muted cursor-grab"><GripVertical className="w-4 h-4" /></span><button type="button" onClick={() => view.playable && onSelectVideo(view.feed!.videoId, view.feed!.title, undefined, view.feed!.channelId, { localPath: view.localPath, playlistContext: { source: 'playlist', playlistId, playlistItemId: view.item.id, shuffle: false } })} className={`flex-1 text-right ${view.playable ? 'cursor-pointer' : 'opacity-50 cursor-default'}`}><div className="flex items-center gap-3 py-2.5"><img src={`https://i.ytimg.com/vi/${view.feed.videoId}/mqdefault.jpg`} alt="" className="w-32 aspect-video rounded-xl object-cover bg-yt-surface-muted" loading="lazy" /><div className="min-w-0"><div className="text-sm font-bold line-clamp-2">{view.feed.title}</div><div className="text-[10px] text-yt-text-muted mt-1">{view.playable ? 'متاح للمشاهدة' : 'غير متاح حاليًا'}</div></div></div></button><div className="flex items-center"><button type="button" onClick={() => void move(view.item.id, -1)} className="w-9 h-9 rounded-full hover:bg-yt-surface-muted text-xs cursor-pointer">↑</button><button type="button" onClick={() => void move(view.item.id, 1)} className="w-9 h-9 rounded-full hover:bg-yt-surface-muted text-xs cursor-pointer">↓</button><button type="button" onClick={() => void remove(view.item.id)} className="w-9 h-9 rounded-full hover:bg-rose-50 text-rose-600 cursor-pointer" aria-label="حذف من القائمة"><Trash2 className="w-4 h-4" /></button></div></div>;
          })}</div>
        </>}
      </div>
    </div>
  );
};

export default PlaylistDetailScreen;
