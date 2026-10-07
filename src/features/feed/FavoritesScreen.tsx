import React, { useEffect, useState } from 'react';
import { ArrowRight, Heart } from 'lucide-react';
import type { FeedItem } from '../../db';
import { useKidFeed } from './useKidFeed';
import { YoungTubeVideoCard } from '../../components/YoungTubeVideoCard';
import { VideoOverflowSheet } from '../../components/VideoOverflowSheet';

interface Props { onBack: () => void; onSelectVideo: (videoId: string, title?: string, channelName?: string, channelId?: string) => void; onOpenChannel: (channelId: string, title: string) => void; }

export const FavoritesScreen: React.FC<Props> = ({ onBack, onSelectVideo, onOpenChannel }) => {
  const [overflowVideo, setOverflowVideo] = useState<FeedItem | null>(null);
  const { filteredFavorites, channelMap, loadFavorites } = useKidFeed({});
  useEffect(() => { void loadFavorites(); }, [loadFavorites]);
  return <div dir="rtl" className="min-h-screen bg-yt-bg text-yt-text"><div className="max-w-3xl mx-auto px-4 sm:px-6 pb-28"><div className="flex items-center gap-3 py-4"><button type="button" onClick={onBack} className="w-10 h-10 rounded-full hover:bg-yt-surface-muted flex items-center justify-center cursor-pointer" aria-label="رجوع"><ArrowRight className="w-5 h-5" /></button><div><h1 className="text-xl font-black">المفضلة</h1><p className="text-xs text-yt-text-muted">الفيديوهات التي أحببتها</p></div></div>{filteredFavorites.length ? <div className="space-y-6">{filteredFavorites.map((video) => { const info = channelMap.get(video.channelId); return <YoungTubeVideoCard key={video.videoId} video={video} channelTitle={info?.title || 'قناة أطفال'} channelThumbnail={info?.thumbnail} onSelectVideo={() => onSelectVideo(video.videoId, video.title, info?.title, video.channelId)} onChannelSelect={() => onOpenChannel(video.channelId, info?.title || 'قناة أطفال')} onOverflow={setOverflowVideo} />; })}</div> : <div className="py-16 text-center"><Heart className="w-9 h-9 mx-auto text-yt-text-muted mb-3" /><p className="font-black">مفيش فيديوهات مفضلة لسه</p></div>}</div><VideoOverflowSheet video={overflowVideo} channelTitle={overflowVideo ? channelMap.get(overflowVideo.channelId)?.title : undefined} onClose={() => setOverflowVideo(null)} /></div>;
};

export default FavoritesScreen;
