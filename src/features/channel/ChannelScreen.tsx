import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, ListVideo, Play, Radio, UserRound } from 'lucide-react';
import type { ChildPlaylist, FeedItem } from '../../db';
import db from '../../db';
import { getChannelBySourceId, listRegistryChannels, type RegistryChannel } from '../../data/channelRegistry';
import { loadCachedBlocks } from '../../services/globalBlocks';
import { listPlaylists, getPlaylistItems } from '../../services/playlists/playlistRepository';
import { YoungTubeVideoCard } from '../../components/YoungTubeVideoCard';
import { YoungTubeVideoRow } from '../../components/YoungTubeVideoRow';
import { VideoOverflowSheet } from '../../components/VideoOverflowSheet';

interface Props {
  channelId: string;
  onBack: () => void;
  onSelectVideo: (videoId: string, title?: string, channelName?: string, channelId?: string) => void;
  onOpenPlaylist: (playlistId: string, title: string) => void;
  onOpenChannel: (channelId: string) => void;
}

export const ChannelScreen: React.FC<Props> = ({ channelId, onBack, onSelectVideo, onOpenPlaylist, onOpenChannel }) => {
  const [channel, setChannel] = useState<RegistryChannel | null>(null);
  const [videos, setVideos] = useState<FeedItem[]>([]);
  const [playlists, setPlaylists] = useState<ChildPlaylist[]>([]);
  const [tab, setTab] = useState<'videos' | 'playlists'>('videos');
  const [loading, setLoading] = useState(true);
  const [overflowVideo, setOverflowVideo] = useState<FeedItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [found, settings, allPlaylists] = await Promise.all([getChannelBySourceId(channelId), db.settings.get('main'), listPlaylists()]);
      setChannel(found);
      const blocks = loadCachedBlocks();
      const rows = await db.feedCache.where('channelId').equals(channelId).toArray();
      const safe = rows.filter((row) => {
        if (row.hidden || row.isPortrait) return false;
        if (blocks.channelIds.includes(row.channelId)) return false;
        if (settings?.hideMusicVideos && row.hasMusic === true) return false;
        if (settings?.familyYoutubeApiKey && typeof row.videoDuration === 'number' && row.videoDuration < 120) return false;
        return true;
      }).sort((a, b) => Date.parse(b.publishedAt || '') - Date.parse(a.publishedAt || '') || b.fetchedAt - a.fetchedAt);
      setVideos(safe);

      const matches: ChildPlaylist[] = [];
      for (const playlist of allPlaylists) {
        const items = await getPlaylistItems(playlist.id);
        let matched = false;
        for (const item of items) {
          if (item.channelIdSnapshot === channelId) { matched = true; break; }
          if (!item.channelIdSnapshot && await rowHasChannel(item.videoId, channelId)) { matched = true; break; }
        }
        if (matched) matches.push(playlist);
      }
      setPlaylists(matches);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div dir="rtl" className="min-h-screen bg-yt-bg text-yt-text">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-28">
        <button type="button" onClick={onBack} className="mt-3 w-10 h-10 rounded-full border border-yt-border bg-yt-surface flex items-center justify-center cursor-pointer" aria-label="رجوع"><ArrowRight className="w-5 h-5" /></button>
        {channel ? (
          <section className="mt-3 overflow-hidden rounded-3xl border border-yt-border bg-yt-surface">
            <div className="h-28 sm:h-40 bg-yt-brand-soft">{channel.thumbnail ? <img src={channel.thumbnail} alt="" className="w-full h-full object-cover opacity-80" /> : null}</div>
            <div className="p-4 -mt-10 relative">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-yt-surface border-4 border-yt-surface shadow-md flex items-center justify-center text-xl font-black text-yt-text-muted">{channel.thumbnail ? <img src={channel.thumbnail} alt={channel.title} className="w-full h-full object-cover" /> : <UserRound className="w-8 h-8" />}</div>
              <div className="mt-3"><h1 className="text-xl font-black">{channel.title}</h1><p className="text-xs text-yt-text-muted mt-1">{channel.category?.join(' • ') || 'قناة أطفال موثوقة'}</p></div>
            </div>
            <div className="flex border-t border-yt-border">
              <button type="button" onClick={() => setTab('videos')} className={`flex-1 py-3 text-xs font-bold cursor-pointer ${tab === 'videos' ? 'text-yt-text border-b-2 border-yt-brand' : 'text-yt-text-muted'}`}><Radio className="inline w-4 h-4 ml-1" />فيديوهات</button>
              {playlists.length > 0 && <button type="button" onClick={() => setTab('playlists')} className={`flex-1 py-3 text-xs font-bold cursor-pointer ${tab === 'playlists' ? 'text-yt-text border-b-2 border-yt-brand' : 'text-yt-text-muted'}`}><ListVideo className="inline w-4 h-4 ml-1" />قوائم</button>}
            </div>
          </section>
        ) : (
          <div className="py-16 text-center"><p className="font-bold">القناة غير متاحة</p></div>
        )}

        {loading ? <div className="space-y-6 py-6 animate-pulse">{[0,1,2,3].map((i) => <div key={i}><div className="aspect-video rounded-2xl bg-yt-surface-muted" /><div className="h-5 bg-yt-surface-muted rounded mt-3" /></div>)}</div> : tab === 'videos' ? (
          <div className="space-y-6 py-6">
            {videos.length ? videos.map((video) => <YoungTubeVideoCard key={video.videoId} video={video} channelTitle={channel?.title || 'قناة أطفال'} channelThumbnail={channel?.thumbnail} onSelectVideo={() => onSelectVideo(video.videoId, video.title, channel?.title, channelId)} onChannelSelect={() => onOpenChannel(channelId)} onAddToPlaylist={() => setOverflowVideo(video)} onOverflow={setOverflowVideo} />) : <div className="rounded-3xl border border-dashed border-yt-border p-10 text-center text-sm text-yt-text-muted">لا توجد فيديوهات متاحة حاليًا</div>}
          </div>
        ) : (
          <div className="space-y-2 py-6">
            {playlists.map((playlist) => <button type="button" key={playlist.id} onClick={() => onOpenPlaylist(playlist.id, playlist.name)} className="w-full text-right p-3 rounded-2xl border border-yt-border bg-yt-surface flex items-center gap-3 cursor-pointer hover:bg-yt-surface-muted"><div className="w-24 aspect-video rounded-xl bg-yt-surface-muted overflow-hidden flex items-center justify-center">{playlist.thumbnailVideoId ? <img src={`https://i.ytimg.com/vi/${playlist.thumbnailVideoId}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" /> : <ListVideo className="w-6 h-6 text-yt-text-muted" />}</div><div className="min-w-0"><div className="font-bold text-sm truncate">{playlist.name}</div><div className="text-[10px] text-yt-text-muted">قائمة تشغيل</div></div></button>)}
          </div>
        )}
      </div>
      <VideoOverflowSheet video={overflowVideo} channelTitle={channel?.title} onClose={() => setOverflowVideo(null)} />
    </div>
  );
};

async function rowHasChannel(videoId: string, channelId: string): Promise<boolean> {
  const row = await db.feedCache.get(videoId);
  return row?.channelId === channelId;
}

export default ChannelScreen;
