import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ListVideo, Loader2, Play, Radio, UserRound } from 'lucide-react';
import type { ChildPlaylist, FeedItem } from '../../db';
import db from '../../db';
import { getChannelBySourceId, type RegistryChannel } from '../../data/channelRegistry';
import { loadCachedBlocks } from '../../services/globalBlocks';
import { listPlaylists, getPlaylistItems } from '../../services/playlists/playlistRepository';
import { YoungTubeVideoCard } from '../../components/YoungTubeVideoCard';
import { VideoOverflowSheet } from '../../components/VideoOverflowSheet';
import { WORKER_URL } from '../../config';

interface Props {
  channelId: string;
  onBack: () => void;
  onSelectVideo: (videoId: string, title?: string, channelName?: string, channelId?: string) => void;
  onOpenPlaylist: (playlistId: string, title: string) => void;
  onOpenChannel: (channelId: string) => void;
}

function filterChannelVideos(
  items: FeedItem[],
  settings: any,
  blockedChannelIds: string[],
  hasFamilyKey: boolean
): FeedItem[] {
  return items.filter((row) => {
    if (row.hidden === true) return false;
    if (row.isPortrait === true) return false;
    if (blockedChannelIds.includes(row.channelId)) return false;
    if (settings?.hideMusicVideos === true && row.hasMusic === true) return false;
    if (
      hasFamilyKey &&
      typeof row.videoDuration === 'number' &&
      Number.isFinite(row.videoDuration) &&
      row.videoDuration < 120
    ) {
      return false;
    }
    return true;
  });
}

function mapArchiveRowToFeedItem(raw: any, channelId: string): FeedItem | null {
  const videoId = typeof raw?.videoId === 'string' ? raw.videoId.trim() : '';
  const title = typeof raw?.title === 'string' ? raw.title : '';
  if (!videoId || !title) return null;
  return {
    videoId,
    channelId,
    title,
    publishedAt: typeof raw?.publishedAt === 'string' && raw.publishedAt.trim() ? raw.publishedAt.trim() : undefined,
    videoDuration: typeof raw?.videoDuration === 'number' && Number.isFinite(raw.videoDuration) ? raw.videoDuration : undefined,
    hasMusic: raw?.hasMusic === true,
    isPortrait: raw?.isPortrait === true ? true : false,
    hidden: false,
    fetchedAt: Date.now(),
  };
}

export const ChannelScreen: React.FC<Props> = ({ channelId, onBack, onSelectVideo, onOpenPlaylist, onOpenChannel }) => {
  const [channel, setChannel] = useState<RegistryChannel | null>(null);
  const [videos, setVideos] = useState<FeedItem[]>([]);
  const [playlists, setPlaylists] = useState<ChildPlaylist[]>([]);
  const [tab, setTab] = useState<'videos' | 'playlists'>('videos');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [overflowVideo, setOverflowVideo] = useState<FeedItem | null>(null);
  const [overflowMode, setOverflowMode] = useState<'menu' | 'playlist'>('menu');

  const memoryBufferRef = useRef<FeedItem[]>([]);
  const nextOffsetRef = useRef<number | null>(null);
  const loadingMoreRef = useRef(false);
  const settingsRef = useRef<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    memoryBufferRef.current = [];
    nextOffsetRef.current = null;
    try {
      const [found, settings, allPlaylists] = await Promise.all([
        getChannelBySourceId(channelId),
        db.settings.get('main'),
        listPlaylists(),
      ]);
      settingsRef.current = settings;
      setChannel(found);
      if (
        !found ||
        found.enabled === false ||
        found.autoDisabled === true ||
        found.status === 'disabled'
      ) {
        setVideos([]);
        setPlaylists([]);
        return;
      }

      const blocks = loadCachedBlocks();
      const hasFamilyKey = Boolean(settings?.familyYoutubeApiKey?.trim());

      // 1. Keep current local feedCache read so something appears immediately
      const localRows = await db.feedCache.where('channelId').equals(channelId).toArray();
      const safeLocal = filterChannelVideos(localRows, settings, blocks.channelIds, hasFamilyKey)
        .sort((a, b) => Date.parse(b.publishedAt || '') - Date.parse(a.publishedAt || '') || b.fetchedAt - a.fetchedAt);
      setVideos(safeLocal);
      setLoading(false);

      // Playlists matching channel
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

      // 2. Fetch channel-archive from worker
      try {
        const res = await fetch(
          `${WORKER_URL}/api/channel-archive?sourceId=${encodeURIComponent(channelId)}&offset=0&limit=24`,
          { cache: 'no-store' }
        );
        if (res.ok) {
          const data: any = await res.json();
          const rawVideos = Array.isArray(data?.videos) ? data.videos : [];
          if (rawVideos.length > 0) {
            const mapped = rawVideos
              .map((raw: any) => mapArchiveRowToFeedItem(raw, channelId))
              .filter((v: any): v is FeedItem => v !== null);

            const filtered = filterChannelVideos(mapped, settings, blocks.channelIds, hasFamilyKey);

            if (filtered.length > 0) {
              if (typeof data.nextOffset === 'number' || data.nextOffset === null) {
                // New worker with nextOffset
                nextOffsetRef.current = data.nextOffset;
                memoryBufferRef.current = [];
                setVideos(filtered);
              } else if (filtered.length > 24) {
                // Old worker with >24 videos: reveal 24 and store remainder in memory buffer
                setVideos(filtered.slice(0, 24));
                memoryBufferRef.current = filtered.slice(24);
                nextOffsetRef.current = null;
              } else {
                setVideos(filtered);
                memoryBufferRef.current = [];
                nextOffsetRef.current = null;
              }
            }
          }
        }
      } catch (fetchErr) {
        console.warn('Failed to fetch channel archive:', fetchErr);
        // Keep local rows
      }
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;

    // Case A: Reveal next memory page from buffer
    if (memoryBufferRef.current.length > 0) {
      loadingMoreRef.current = true;
      setLoadingMore(true);
      const nextBatch = memoryBufferRef.current.slice(0, 24);
      memoryBufferRef.current = memoryBufferRef.current.slice(24);
      setVideos((prev) => {
        const seen = new Set(prev.map((v) => v.videoId));
        const newItems = nextBatch.filter((v) => !seen.has(v.videoId));
        return [...prev, ...newItems];
      });
      loadingMoreRef.current = false;
      setLoadingMore(false);
      return;
    }

    // Case B: Fetch next offset from worker
    const offset = nextOffsetRef.current;
    if (offset === null || offset === undefined) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `${WORKER_URL}/api/channel-archive?sourceId=${encodeURIComponent(channelId)}&offset=${offset}&limit=24`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        nextOffsetRef.current = null;
        return;
      }
      const data: any = await res.json();
      const rawVideos = Array.isArray(data?.videos) ? data.videos : [];
      const blocks = loadCachedBlocks();
      const settings = settingsRef.current;
      const hasFamilyKey = Boolean(settings?.familyYoutubeApiKey?.trim());

      const mapped = rawVideos
        .map((raw: any) => mapArchiveRowToFeedItem(raw, channelId))
        .filter((v: any): v is FeedItem => v !== null);

      const filtered = filterChannelVideos(mapped, settings, blocks.channelIds, hasFamilyKey);

      setVideos((prev) => {
        const seen = new Set(prev.map((v) => v.videoId));
        const newItems = filtered.filter((v) => !seen.has(v.videoId));
        return [...prev, ...newItems];
      });

      nextOffsetRef.current = typeof data.nextOffset === 'number' ? data.nextOffset : null;
    } catch (err) {
      console.warn('Failed to load more channel archive videos:', err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [channelId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (tab !== 'videos') return;
    const handleScroll = () => {
      if (loadingMoreRef.current) return;
      if (nextOffsetRef.current === null && memoryBufferRef.current.length === 0) return;

      const scrollY = window.scrollY || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const docHeight = document.documentElement.scrollHeight;

      if (windowHeight + scrollY >= docHeight - 400) {
        void loadMore();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [tab, loadMore]);

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
            {videos.length ? (
              <>
                {videos.map((video) => (
                  <YoungTubeVideoCard
                    key={video.videoId}
                    video={video}
                    channelTitle={channel?.title || 'قناة أطفال'}
                    channelThumbnail={channel?.thumbnail}
                    onSelectVideo={() => onSelectVideo(video.videoId, video.title, channel?.title, channelId)}
                    onChannelSelect={() => onOpenChannel(channelId)}
                    onAddToPlaylist={() => { setOverflowMode('playlist'); setOverflowVideo(video); }}
                    onOverflow={(video) => { setOverflowMode('menu'); setOverflowVideo(video); }}
                  />
                ))}
                {loadingMore && (
                  <div className="flex items-center justify-center py-6 gap-2 text-xs font-bold text-yt-text-muted">
                    <Loader2 className="w-4 h-4 animate-spin text-yt-brand" />
                    <span>جاري تحميل المزيد...</span>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-3xl border border-dashed border-yt-border p-10 text-center text-sm text-yt-text-muted">لا توجد فيديوهات متاحة حاليًا</div>
            )}
          </div>
        ) : (
          <div className="space-y-2 py-6">
            {playlists.map((playlist) => <button type="button" key={playlist.id} onClick={() => onOpenPlaylist(playlist.id, playlist.name)} className="w-full text-right p-3 rounded-2xl border border-yt-border bg-yt-surface flex items-center gap-3 cursor-pointer hover:bg-yt-surface-muted"><div className="w-24 aspect-video rounded-xl bg-yt-surface-muted overflow-hidden flex items-center justify-center">{playlist.thumbnailVideoId ? <img src={`https://i.ytimg.com/vi/${playlist.thumbnailVideoId}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" /> : <ListVideo className="w-6 h-6 text-yt-text-muted" />}</div><div className="min-w-0"><div className="font-bold text-sm truncate">{playlist.name}</div><div className="text-[10px] text-yt-text-muted">قائمة تشغيل</div></div></button>)}
          </div>
        )}
      </div>
      <VideoOverflowSheet video={overflowVideo} channelTitle={channel?.title} initialMode={overflowMode} onClose={() => setOverflowVideo(null)} />
    </div>
  );
};

async function rowHasChannel(videoId: string, channelId: string): Promise<boolean> {
  const row = await db.feedCache.get(videoId);
  return row?.channelId === channelId;
}

export default ChannelScreen;
