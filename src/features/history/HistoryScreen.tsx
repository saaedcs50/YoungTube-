import React, { useEffect, useState } from 'react';
import { ArrowRight, History as HistoryIcon } from 'lucide-react';
import type { FeedItem, Interaction } from '../../db';
import db from '../../db';
import { listRegistryChannels } from '../../data/channelRegistry';
import { YoungTubeVideoRow } from '../../components/YoungTubeVideoRow';

interface Props { onBack: () => void; onSelectVideo: (videoId: string, title?: string, channelName?: string, channelId?: string) => void; onOpenChannel: (channelId: string, title: string) => void; }

export const HistoryScreen: React.FC<Props> = ({ onBack, onSelectVideo, onOpenChannel }) => {
  const [rows, setRows] = useState<Array<{ interaction: Interaction; feed?: FeedItem }>>([]);
  const [channels, setChannels] = useState<Map<string, { title: string; thumbnail?: string }>>(new Map());
  useEffect(() => {
    void (async () => {
      const [interactions, registry] = await Promise.all([db.interactions.orderBy('lastWatched').reverse().limit(100).toArray(), listRegistryChannels()]);
      const map = new Map(registry.map((c) => [c.sourceId, { title: c.title, thumbnail: c.thumbnail }]));
      setChannels(map);
      const feedRows = await Promise.all(interactions.map(async (interaction) => ({ interaction, feed: await db.feedCache.get(interaction.videoId) })));
      setRows(feedRows);
    })();
  }, []);
  return <div dir="rtl" className="min-h-screen bg-yt-bg text-yt-text"><div className="max-w-3xl mx-auto px-4 sm:px-6 pb-28"><div className="flex items-center gap-3 py-4"><button type="button" onClick={onBack} className="w-10 h-10 rounded-full hover:bg-yt-surface-muted flex items-center justify-center cursor-pointer" aria-label="رجوع"><ArrowRight className="w-5 h-5" /></button><div><h1 className="text-xl font-black">السجل</h1><p className="text-xs text-yt-text-muted">الفيديوهات التي شاهدتها مؤخرًا</p></div></div>{rows.length ? <div className="divide-y divide-yt-border">{rows.map(({ interaction, feed }) => { const channelId = interaction.channelId || feed?.channelId || 'unknown'; const info = channels.get(channelId); const item: FeedItem = feed || { videoId: interaction.videoId, channelId, title: interaction.title, fetchedAt: interaction.lastWatched }; const total = interaction.videoDuration || item.videoDuration || 0; const progress = total > 0 ? interaction.watchTime / total : 0; return <YoungTubeVideoRow key={interaction.videoId} video={item} channelTitle={info?.title || 'قناة أطفال'} channelThumbnail={info?.thumbnail} progress={progress} onSelect={() => onSelectVideo(item.videoId, item.title, info?.title, channelId)} onChannelSelect={() => onOpenChannel(channelId, info?.title || 'قناة أطفال')} />; })}</div> : <div className="py-16 text-center"><HistoryIcon className="w-9 h-9 mx-auto text-yt-text-muted mb-3" /><p className="font-black">لا يوجد سجل بعد</p></div>}</div></div>;
};

export default HistoryScreen;
