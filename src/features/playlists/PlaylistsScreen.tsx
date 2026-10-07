import React, { useCallback, useEffect, useState } from 'react';
import { ListVideo, Plus } from 'lucide-react';
import type { ChildPlaylist } from '../../db';
import { listPlaylists } from '../../services/playlists/playlistRepository';
import { getPlaylistSummary, type PlaylistSummary } from '../../services/playlists/playlistSelectors';
import { PlaylistManager } from '../../components/PlaylistManager';

interface Props {
  onOpenPlaylist: (playlistId: string, title: string) => void;
}

export const PlaylistsScreen: React.FC<Props> = ({ onOpenPlaylist }) => {
  const [summaries, setSummaries] = useState<PlaylistSummary[]>([]);
  const [showManager, setShowManager] = useState(false);
  const load = useCallback(async () => {
    const playlists = await listPlaylists();
    const next = await Promise.all(playlists.map((playlist) => getPlaylistSummary(playlist)));
    setSummaries(next);
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <section dir="rtl" className="min-h-[calc(100vh-7rem)] max-w-3xl mx-auto px-4 sm:px-6 py-4 pb-28">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div><p className="text-xs text-yt-text-muted font-bold">مكتبتك الشخصية</p><h1 className="text-xl font-black">القوائم</h1></div>
        <button type="button" onClick={() => setShowManager((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full bg-yt-brand text-yt-brand-text px-4 py-2.5 text-xs font-bold cursor-pointer"><Plus className="w-4 h-4" />قائمة جديدة</button>
      </div>

      {showManager && <div className="mb-5"><PlaylistManager mode="manage" onClose={() => setShowManager(false)} onChanged={() => void load()} /></div>}

      {summaries.length === 0 ? <div className="rounded-3xl border border-dashed border-yt-border bg-yt-surface p-10 text-center"><ListVideo className="w-9 h-9 mx-auto text-yt-text-muted mb-3" /><p className="font-black">لسه مفيش قوائم تشغيل</p><p className="text-xs text-yt-text-muted mt-1">أنشئ قائمة جديدة أو استخدم «إضافة إلى قائمة تشغيل» من أي فيديو.</p></div> : <div className="grid grid-cols-2 gap-3 sm:gap-4">{summaries.map(({ playlist, totalCount, thumbnailUrl }) => <button key={playlist.id} type="button" onClick={() => onOpenPlaylist(playlist.id, playlist.name)} className="text-right rounded-2xl border border-yt-border bg-yt-surface overflow-hidden cursor-pointer hover:bg-yt-surface-muted active:scale-[0.99] transition"><div className="aspect-video bg-yt-surface-muted flex items-center justify-center">{thumbnailUrl ? <img src={thumbnailUrl} alt={playlist.name} className="w-full h-full object-cover" loading="lazy" /> : <ListVideo className="w-8 h-8 text-yt-text-muted" />}</div><div className="p-3"><div className="text-sm font-black truncate">{playlist.name}</div><div className="text-[11px] text-yt-text-muted mt-1">{totalCount} فيديو</div></div></button>)}</div>}
    </section>
  );
};

export default PlaylistsScreen;
