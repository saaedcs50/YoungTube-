import React, { useEffect, useState } from 'react';
import { ArrowRight, History as HistoryIcon } from 'lucide-react';
import type { FeedItem, Interaction } from '../../db';
import db from '../../db';
import { listRegistryChannels } from '../../data/channelRegistry';
import { loadCachedBlocks } from '../../services/globalBlocks';
import { YoungTubeVideoRow } from '../../components/YoungTubeVideoRow';

interface Props { onBack: () => void; onSelectVideo: (videoId: string, title?: string, channelName?: string, channelId?: string) => void; onOpenChannel: (channelId: string, title: string) => void; }

export const HistoryScreen: React.FC<Props> = ({ onBack, onSelectVideo, onOpenChannel }) => {
  const [rows, setRows] = useState<Array<{ interaction: Interaction; feed: FeedItem }>>([]);
  const [channels, setChannels] = useState<Map<string, { title: string; thumbnail?: string }>>(new Map());
  useEffect(() => {
    void (async () => {
      let interactions: Interaction[] = [];
      try {
        interactions = await db.interactions.orderBy('lastWatched').reverse().limit(100).toArray();
      } catch (queryErr) {
        console.warn('Fallback history query:', queryErr);
        const all = await db.interactions.toArray();
        all.sort((a, b) => (b.lastWatched || 0) - (a.lastWatched || 0));
        interactions = all.slice(0, 100);
      }

      const [registry, settings] = await Promise.all([
        listRegistryChannels(),
        db.settings.get('main'),
      ]);
      const map = new Map(registry.map((c) => [c.sourceId, { title: c.title, thumbnail: c.thumbnail }]));
      setChannels(map);

      const blockedChannelSet = new Set(loadCachedBlocks().channelIds);
      const registryMap = new Map(registry.map((c) => [c.sourceId, c]));
      const hasFamilyKey = Boolean(settings?.familyYoutubeApiKey?.trim());
      const hideMusicVideos = settings?.hideMusicVideos === true;
      const safeRows: Array<{ interaction: Interaction; feed: FeedItem }> = [];

      for (const interaction of interactions) {
        const feed = await db.feedCache.get(interaction.videoId);
        if (!feed) continue;
        if (feed.hidden === true || feed.isPortrait === true) continue;

        const channelId = feed.channelId || interaction.channelId;
        if (!channelId) continue;
        const channel = registryMap.get(channelId);
        if (!channel || channel.enabled === false || channel.autoDisabled === true) continue;
        if (blockedChannelSet.has(channelId)) continue;
        if (hideMusicVideos && feed.hasMusic === true) continue;

        const duration = feed.videoDuration ?? interaction.videoDuration;
        if (
          hasFamilyKey &&
          (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 120)
        ) continue;

        safeRows.push({ interaction, feed });
      }

      setRows(safeRows);
    })();
  }, []);
  return <div dir="rtl" className="min-h-screen bg-yt-bg text-yt-text"><div className="max-w-3xl mx-auto px-4 sm:px-6 pb-28"><div className="flex items-center gap-3 py-4"><button type="button" onClick={onBack} className="w-10 h-10 rounded-full hover:bg-yt-surface-muted flex items-center justify-center cursor-pointer" aria-label="رجوع"><ArrowRight className="w-5 h-5" /></button><div><h1 className="text-xl font-black">السجل</h1><p className="text-xs text-yt-text-muted">الفيديوهات التي شاهدتها مؤخرًا</p></div></div>{rows.length ? <div className="divide-y divide-yt-border">{rows.map(({ interaction, feed }) => { const channelId = interaction.channelId || feed.channelId; const info = channels.get(channelId); const total = feed.videoDuration ?? interaction.videoDuration ?? 0; const progress = total > 0 ? interaction.watchTime / total : 0; return <YoungTubeVideoRow key={interaction.videoId} video={feed} channelTitle={info?.title || 'قناة أطفال'} channelThumbnail={info?.thumbnail} progress={progress} onSelect={() => onSelectVideo(feed.videoId, feed.title, info?.title, channelId)} onChannelSelect={() => onOpenChannel(channelId, info?.title || 'قناة أطفال')} />; })}</div> : <div className="py-16 text-center"><HistoryIcon className="w-9 h-9 mx-auto text-yt-text-muted mb-3" /><p className="font-black">لا يوجد سجل بعد</p></div>}</div></div>;
};

export default HistoryScreen;
