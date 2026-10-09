import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Radio, Search } from 'lucide-react';
import type { FeedItem } from '../../db';
import db from '../../db';
import { listRegistryChannels, type RegistryChannel } from '../../data/channelRegistry';
import { loadBoundedFeed } from '../feed/useKidFeed';
import { loadCachedBlocks } from '../../services/globalBlocks';
import { useAllCategories } from '../../hooks/useAllCategories';
import { matchCategory } from '../../data/categoryRegistry';
import { YoungTubeVideoCard } from '../../components/YoungTubeVideoCard';
import { VideoOverflowSheet } from '../../components/VideoOverflowSheet';

interface Props {
  onOpenChannel: (channelId: string, title: string) => void;
  onSelectVideo: (videoId: string, title?: string, channelName?: string, channelId?: string) => void;
}

function diversify(items: FeedItem[]) {
  const result: FeedItem[] = [];
  const buckets = new Map<string, FeedItem[]>();
  for (const item of items) {
    const bucket = buckets.get(item.channelId) || [];
    bucket.push(item);
    buckets.set(item.channelId, bucket);
  }
  const cursors = new Map<string, number>();
  let added = true;
  while (added) {
    added = false;
    for (const [channelId, bucket] of buckets) {
      const cursor = cursors.get(channelId) || 0;
      if (cursor < bucket.length && result.length < items.length) {
        result.push(bucket[cursor]);
        cursors.set(channelId, cursor + 1);
        added = true;
      }
    }
  }
  return result;
}

export const ChannelsScreen: React.FC<Props> = ({ onOpenChannel, onSelectVideo }) => {
  const { kidCategories } = useAllCategories();
  const [channels, setChannels] = useState<RegistryChannel[]>([]);
  const [videos, setVideos] = useState<FeedItem[]>([]);
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [unseenChannelIds, setUnseenChannelIds] = useState<Set<string>>(new Set());
  const [overflowVideo, setOverflowVideo] = useState<FeedItem | null>(null);
  const [overflowMode, setOverflowMode] = useState<'menu' | 'playlist'>('menu');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [registry, settings, cachedRows, interactions] = await Promise.all([
        listRegistryChannels(),
        db.settings.get('main'),
        db.feedCache.toArray(),
        db.interactions.toArray(),
      ]);
      const enabled = registry.filter((channel) => channel.sourceType === 'channel' && channel.enabled !== false && channel.autoDisabled !== true);
      setChannels(enabled);
      const lastWatched = new Map(interactions.map((item) => [item.videoId, item.lastWatched || 0]));
      const blockedChannelSet = new Set(loadCachedBlocks().channelIds);
      const enabledChannelSet = new Set(enabled.map((channel) => channel.sourceId));
      const hideMusicVideos = settings?.hideMusicVideos === true;
      const hasFamilyKey = Boolean(settings?.familyYoutubeApiKey?.trim());
      const unseen = new Set<string>();
      for (const video of cachedRows) {
        if (video.hidden || video.isPortrait || !video.channelId) continue;
        if (!enabledChannelSet.has(video.channelId) || blockedChannelSet.has(video.channelId)) continue;
        if (hideMusicVideos && video.hasMusic === true) continue;
        if (hasFamilyKey && (
          typeof video.videoDuration !== 'number' ||
          !Number.isFinite(video.videoDuration) ||
          video.videoDuration < 120
        )) continue;

        const published = Date.parse(video.publishedAt || '') || video.fetchedAt || 0;
        const watchedAt = lastWatched.get(video.videoId) || 0;
        if (!watchedAt || watchedAt < published) unseen.add(video.channelId);
      }
      setUnseenChannelIds(unseen);
      const rows = await loadBoundedFeed(enabled.map((channel) => channel.sourceId), settings?.hideMusicVideos === true, Boolean(settings?.familyYoutubeApiKey?.trim()));
      rows.sort((a, b) => Date.parse(b.publishedAt || '') - Date.parse(a.publishedAt || '') || b.fetchedAt - a.fetchedAt);
      setVideos(diversify(rows));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const channelMap = useMemo(() => new Map(channels.map((channel) => [channel.sourceId, channel])), [channels]);
  const visibleVideos = useMemo(() => category === 'all' ? videos : videos.filter((video) => matchCategory(channelMap.get(video.channelId)?.category || [], category)), [category, videos, channelMap]);

  return (
    <section dir="rtl" className="min-h-[calc(100vh-7rem)] max-w-3xl mx-auto px-4 sm:px-6 py-4 pb-28 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-xs text-yt-text-muted font-bold">مكتبتك الآمنة</p><h1 className="text-xl font-black">القنوات</h1></div>
          <button type="button" onClick={() => setDirectoryOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-yt-border bg-yt-surface text-xs font-bold cursor-pointer"><Search className="w-4 h-4" /> كل القنوات</button>
        </div>
        <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1">
          {channels.slice(0, 20).map((channel) => (
            <button key={channel.sourceId} type="button" onClick={() => onOpenChannel(channel.sourceId, channel.title)} className="w-16 shrink-0 flex flex-col items-center gap-1.5 cursor-pointer">
              <span className="relative w-14 h-14 rounded-full overflow-hidden bg-yt-surface-muted border border-yt-border flex items-center justify-center text-xs font-bold text-yt-text-muted">
                {channel.thumbnail ? <img src={channel.thumbnail} alt={channel.title} className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : <Radio className="w-6 h-6" />}
                {unseenChannelIds.has(channel.sourceId) && <span className="absolute top-0 end-0 w-2.5 h-2.5 rounded-full bg-yt-brand border-2 border-yt-bg" />}
              </span>
              <span className="text-[10px] font-semibold text-center line-clamp-2">{channel.title}</span>
            </button>
          ))}
          {channels.length === 0 && !loading && <div className="text-sm text-yt-text-muted py-4">لا توجد قنوات مفعّلة</div>}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        {kidCategories.map((item) => (
          <button key={item.id} type="button" onClick={() => setCategory(item.id)} className={`shrink-0 px-4 py-2 rounded-full border text-xs font-bold cursor-pointer ${category === item.id ? 'bg-yt-text text-yt-text-inverse border-yt-text' : 'bg-yt-surface border-yt-border text-yt-text'}`}>{item.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-7 animate-pulse">{[0,1,2,3].map((i) => <div key={i}><div className="aspect-video rounded-2xl bg-yt-surface-muted" /><div className="h-5 mt-3 bg-yt-surface-muted rounded" /></div>)}</div>
      ) : visibleVideos.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-yt-border bg-yt-surface p-10 text-center"><Radio className="w-8 h-8 mx-auto text-yt-text-muted mb-2" /><p className="font-black">لا توجد فيديوهات من القنوات المفعّلة</p></div>
      ) : (
        <div className="space-y-6">
          {visibleVideos.map((video) => {
            const channel = channelMap.get(video.channelId);
            return <YoungTubeVideoCard key={video.videoId} video={video} channelTitle={channel?.title || 'قناة أطفال'} channelThumbnail={channel?.thumbnail} onSelectVideo={() => onSelectVideo(video.videoId, video.title, channel?.title, video.channelId)} onChannelSelect={() => onOpenChannel(video.channelId, channel?.title || 'قناة أطفال')} onAddToPlaylist={() => { setOverflowMode('playlist'); setOverflowVideo(video); }} onOverflow={(selectedVideo) => { setOverflowMode('menu'); setOverflowVideo(selectedVideo); }} />;
          })}
        </div>
      )}

      {directoryOpen && (
        <div className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-3" onMouseDown={() => setDirectoryOpen(false)}>
          <div className="w-full max-w-lg max-h-[82vh] overflow-y-auto rounded-3xl border border-yt-border bg-yt-surface p-4" onMouseDown={(e) => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between mb-3"><h2 className="text-base font-black">دليل القنوات</h2><button type="button" onClick={() => setDirectoryOpen(false)} className="text-xs font-bold text-yt-text-muted cursor-pointer">إغلاق</button></div>
            <div className="space-y-2">
              {channels.map((channel) => <button key={channel.sourceId} type="button" onClick={() => { setDirectoryOpen(false); onOpenChannel(channel.sourceId, channel.title); }} className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-yt-surface-muted text-right cursor-pointer"><span className="w-11 h-11 rounded-full overflow-hidden bg-yt-surface-muted border border-yt-border flex items-center justify-center font-bold">{channel.thumbnail ? <img src={channel.thumbnail} alt="" className="w-full h-full object-cover" /> : channel.title.charAt(0)}</span><span className="min-w-0 flex-1"><span className="block text-sm font-bold truncate">{channel.title}</span><span className="block text-[10px] text-yt-text-muted truncate">{channel.category?.join(' • ') || 'قناة أطفال'}</span></span><ChevronLeft className="w-4 h-4 text-yt-text-muted" /></button>)}
            </div>
          </div>
        </div>
      )}

      <VideoOverflowSheet video={overflowVideo} channelTitle={overflowVideo ? channelMap.get(overflowVideo.channelId)?.title : undefined} initialMode={overflowMode} avoidBottomNav onClose={() => { setOverflowVideo(null); setOverflowMode('menu'); }} />
    </section>
  );
};

export default ChannelsScreen;
