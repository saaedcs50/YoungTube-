import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Play, RefreshCw } from 'lucide-react';
import { CategoryChips } from './CategoryChips';
import { PullToRefresh } from '../../components/PullToRefresh';
import { WeeklyChoiceCard } from '../../components/WeeklyChoiceCard';
import { YoungTubeVideoCard } from '../../components/YoungTubeVideoCard';
import { VideoOverflowSheet } from '../../components/VideoOverflowSheet';
import type { FeedItem, Interaction } from '../../db';
import db from '../../db';
import type { PlaylistPlaybackContext } from '../../services/playlists/playlistTypes';
import { useAllCategories } from '../../hooks/useAllCategories';
import { matchCategory } from '../../data/categoryRegistry';
import { listRegistryChannels } from '../../data/channelRegistry';
import { loadCachedBlocks } from '../../services/globalBlocks';
import { recordCurrentScroll } from '../../shell/navigationStore';
import type { UseKidFeedResult } from './useKidFeed';

export interface KidHomeScreenProps {
  onOpenParentDashboard?: () => void;
  onOpenDemoPlayer?: () => void;
  onSelectVideo?: (
    videoId: string,
    title?: string,
    channelName?: string,
    channelId?: string,
    options?: { localPath?: string; fromDownloads?: boolean; playlistContext?: PlaylistPlaybackContext }
  ) => void;
  onChannelSelect?: (channelId: string, channelTitle: string) => void;
  isPlayerOpen?: boolean;
  feed: UseKidFeedResult;
}

interface ResumeItem {
  video: FeedItem;
  progress: number;
}

function SkeletonCard() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="aspect-video rounded-2xl bg-yt-surface-muted" />
      <div className="flex gap-3 px-1">
        <div className="w-9 h-9 rounded-full bg-yt-surface-muted shrink-0" />
        <div className="flex-1 space-y-2 py-1"><div className="h-4 rounded bg-yt-surface-muted" /><div className="h-3 rounded bg-yt-surface-muted w-2/3" /></div>
      </div>
    </div>
  );
}

export function KidHomeScreen({
  onSelectVideo,
  onChannelSelect,
  onOpenDemoPlayer,
  isPlayerOpen = false,
  feed,
}: KidHomeScreenProps) {
  const { kidCategories } = useAllCategories();
  const [resumeItem, setResumeItem] = useState<ResumeItem | null>(null);
  const [overflowVideo, setOverflowVideo] = useState<FeedItem | null>(null);

  const {
    videos,
    loading,
    selectedCategory,
    setSelectedCategory,
    tasteShiftConfig,
    tasteTargetSet,
    showWeeklyChoiceCard,
    channelMap,
    filteredVideos,
    registryChannelsList,
    loadVideos,
  } = feed;

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const [rows, settings, registryChannels] = await Promise.all([
          db.interactions
            .orderBy('lastWatched')
            .reverse()
            .filter((item: Interaction) => item.completed !== true && item.watchTime > 10)
            .limit(8)
            .toArray(),
          db.settings.get('main'),
          listRegistryChannels(),
        ]);
        const blockedChannelSet = new Set(loadCachedBlocks().channelIds);
        const registryChannelMap = new Map(registryChannels.map((channel) => [channel.sourceId, channel]));
        const hasFamilyKey = Boolean(settings?.familyYoutubeApiKey?.trim());

        for (const interaction of rows) {
          const video = await db.feedCache.get(interaction.videoId);
          if (!mounted || !video || video.hidden || video.isPortrait) continue;

          const channelId = video.channelId || interaction.channelId;
          const registryChannel = channelId ? registryChannelMap.get(channelId) : undefined;
          if (registryChannel?.enabled === false || registryChannel?.autoDisabled === true) continue;
          if (channelId && blockedChannelSet.has(channelId)) continue;
          if (settings?.hideMusicVideos === true && video.hasMusic === true) continue;

          const total = interaction.videoDuration || video.videoDuration;
          if (hasFamilyKey && (typeof total !== 'number' || !Number.isFinite(total) || total < 120)) continue;

          const progress = typeof total === 'number' && Number.isFinite(total) && total > 0
            ? interaction.watchTime / total
            : 0;
          if (progress > 0.03 && progress < 0.95) {
            setResumeItem({ video, progress });
            return;
          }
        }
        if (mounted) setResumeItem(null);
      } catch {
        if (mounted) setResumeItem(null);
      }
    })();
    return () => { mounted = false; };
  }, [videos.length, isPlayerOpen]);

  const categoryShelfData = useMemo(() => {
    const result: Array<{ id: string; label: string; videos: FeedItem[] }> = [];
    for (const category of kidCategories) {
      const rows = videos.filter((video) => {
        const info = channelMap.get(video.channelId);
        const categories = info?.categories || (video as any).categories || (video as any).category || [];
        return matchCategory(categories, category.id);
      }).slice(0, 8);
      if (rows.length >= 3) result.push({ id: category.id, label: category.label, videos: rows });
    }
    return result;
  }, [kidCategories, videos, channelMap]);

  const channelShelf = useMemo(
    () => registryChannelsList.filter((ch) => ch.enabled !== false && ch.autoDisabled !== true && ch.sourceType === 'channel').slice(0, 16),
    [registryChannelsList]
  );

  const handleRefresh = useCallback(async () => {
    await loadVideos(false);
  }, [loadVideos]);

  const handleCategory = useCallback((categoryId: string) => {
    recordCurrentScroll();
    setSelectedCategory(categoryId);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }, [setSelectedCategory]);

  const openVideo = useCallback((video: FeedItem) => {
    onSelectVideo?.(video.videoId, video.title, channelMap.get(video.channelId)?.title, video.channelId);
  }, [onSelectVideo, channelMap]);

  const heroChannelTitle = resumeItem ? (channelMap.get(resumeItem.video.channelId)?.title || 'قناة أطفال') : '';

  return (
    <div id="kid-home-screen" dir="rtl" className="min-h-screen bg-yt-bg text-yt-text select-none font-sans">
      <div className="sticky top-[calc(56px+env(safe-area-inset-top))] z-30 border-b border-yt-border bg-yt-bg/96 backdrop-blur-md">
        <CategoryChips selectedCategory={selectedCategory} showFavorites={false} onSelectCategory={handleCategory} />
      </div>

      <PullToRefresh onRefresh={handleRefresh} disabled={loading || isPlayerOpen}>
        <main className="w-full max-w-3xl mx-auto px-4 sm:px-6 pb-28 pt-3 sm:pt-5 space-y-7">
          {showWeeklyChoiceCard && tasteShiftConfig && (
            <WeeklyChoiceCard targetCategories={tasteShiftConfig.targetCategories} currentWeek={tasteShiftConfig.currentWeek} onChoiceMade={() => void loadVideos(true)} />
          )}

          {resumeItem && (
            <section className="rounded-3xl border border-yt-border bg-yt-surface p-3 shadow-sm">
              <div className="flex items-center justify-between gap-3 px-1 pb-2">
                <div>
                  <p className="text-[11px] text-yt-text-muted font-bold">متابعة المشاهدة</p>
                  <h2 className="text-sm font-black text-yt-text">كمّل من حيث وقفت</h2>
                </div>
                <span className="text-[10px] font-bold text-yt-brand">{Math.round(resumeItem.progress * 100)}%</span>
              </div>
              <YoungTubeVideoCard
                video={resumeItem.video}
                channelTitle={heroChannelTitle}
                channelThumbnail={channelMap.get(resumeItem.video.channelId)?.thumbnail}
                onSelectVideo={() => openVideo(resumeItem.video)}
                onChannelSelect={() => onChannelSelect?.(resumeItem.video.channelId, heroChannelTitle)}
                onAddToPlaylist={() => setOverflowVideo(resumeItem.video)}
                onOverflow={setOverflowVideo}
              />
            </section>
          )}

          {loading && videos.length === 0 ? (
            <div className="space-y-7">
              {[0, 1, 2, 3].map((id) => <SkeletonCard key={id} />)}
            </div>
          ) : filteredVideos.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-yt-border bg-yt-surface p-10 text-center space-y-3">
              <RefreshCw className="w-8 h-8 mx-auto text-yt-text-muted" />
              <h2 className="text-base font-black">لا توجد فيديوهات هنا حالياً</h2>
              <p className="text-xs text-yt-text-muted">جرّب قسمًا آخر أو حدّث الفيد.</p>
              <button type="button" onClick={() => void handleRefresh()} className="px-4 py-2.5 rounded-full bg-yt-brand text-yt-brand-text text-xs font-bold cursor-pointer">تحديث الفيديوهات</button>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredVideos.map((video, index) => {
                const info = channelMap.get(video.channelId);
                const cats = info?.categories || (video as any).categories || (video as any).category || [];
                const tasteTarget = Boolean(tasteTargetSet && (Array.isArray(cats) ? cats : [cats]).some((cat: string) => tasteTargetSet.has(cat)));
                return (
                  <React.Fragment key={video.videoId}>
                    <YoungTubeVideoCard
                      video={video}
                      channelTitle={info?.title || 'قناة أطفال'}
                      channelThumbnail={info?.thumbnail}
                      isTasteShiftTarget={tasteTarget}
                      activeTasteShiftCategory={tasteShiftConfig?.activeCategoryThisWeek}
                      onSelectVideo={() => openVideo(video)}
                      onChannelSelect={() => onChannelSelect?.(video.channelId, info?.title || 'قناة أطفال')}
                      onAddToPlaylist={() => setOverflowVideo(video)}
                      onOverflow={setOverflowVideo}
                    />

                    {index === 5 && channelShelf.length > 0 && (
                      <section className="pt-1">
                        <div className="flex items-center justify-between mb-2">
                          <h2 className="text-sm font-black">من القنوات</h2>
                          <span className="text-[10px] text-yt-text-muted">قنوات مفعّلة</span>
                        </div>
                        <div className="flex gap-4 overflow-x-auto scrollbar-none pb-1">
                          {channelShelf.map((channel) => (
                            <button key={channel.sourceId} type="button" onClick={() => onChannelSelect?.(channel.sourceId, channel.title)} className="w-16 shrink-0 flex flex-col items-center gap-1.5 cursor-pointer">
                              <span className="relative w-14 h-14 rounded-full border border-yt-border bg-yt-surface-muted overflow-hidden flex items-center justify-center text-xs font-bold text-yt-text-muted">
                                {channel.thumbnail ? <img src={channel.thumbnail} alt={channel.title} className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : channel.title.charAt(0)}
                                <span className="absolute top-0 end-0 w-2.5 h-2.5 rounded-full bg-yt-brand border-2 border-yt-bg" />
                              </span>
                              <span className="w-full text-center text-[10px] font-semibold text-yt-text line-clamp-2">{channel.title}</span>
                            </button>
                          ))}
                        </div>
                      </section>
                    )}

                    {index === 11 && categoryShelfData[0] && (
                      <section className="rounded-2xl border border-yt-border bg-yt-surface p-3">
                        <div className="flex items-center justify-between mb-2">
                          <h2 className="text-sm font-black">من {categoryShelfData[0].label}</h2>
                          <button type="button" onClick={() => handleCategory(categoryShelfData[0].id)} className="text-xs font-bold text-yt-brand inline-flex items-center gap-1 cursor-pointer">عرض الكل<ChevronLeft className="w-4 h-4" /></button>
                        </div>
                        <div className="flex gap-3 overflow-x-auto scrollbar-none">
                          {categoryShelfData[0].videos.map((shelfVideo) => {
                            const info = channelMap.get(shelfVideo.channelId);
                            return (
                              <button key={shelfVideo.videoId} type="button" onClick={() => openVideo(shelfVideo)} className="w-44 shrink-0 text-right cursor-pointer">
                                <div className="relative aspect-video rounded-xl overflow-hidden bg-yt-surface-muted">
                                  <img src={`https://i.ytimg.com/vi/${shelfVideo.videoId}/mqdefault.jpg`} alt={shelfVideo.title} className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                                  <span className="absolute bottom-1 end-1 rounded bg-black/80 text-white px-1.5 py-0.5 text-[10px] font-mono"><Play className="inline w-3 h-3" /></span>
                                </div>
                                <span className="block mt-1 text-[11px] font-semibold line-clamp-2 leading-snug">{shelfVideo.title}</span>
                                <span className="block mt-0.5 text-[10px] text-yt-text-muted truncate">{info?.title || 'قناة أطفال'}</span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    )}
                  </React.Fragment>
                );
              })}

              {categoryShelfData.slice(1).map((shelf) => (
                <section key={shelf.id} className="rounded-2xl border border-yt-border bg-yt-surface p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-black">من {shelf.label}</h2>
                    <button type="button" onClick={() => handleCategory(shelf.id)} className="text-xs font-bold text-yt-brand inline-flex items-center gap-1 cursor-pointer">عرض الكل<ChevronLeft className="w-4 h-4" /></button>
                  </div>
                  <div className="flex gap-3 overflow-x-auto scrollbar-none">
                    {shelf.videos.map((shelfVideo) => (
                      <button key={shelfVideo.videoId} type="button" onClick={() => openVideo(shelfVideo)} className="w-44 shrink-0 text-right cursor-pointer">
                        <img src={`https://i.ytimg.com/vi/${shelfVideo.videoId}/mqdefault.jpg`} alt={shelfVideo.title} className="w-full aspect-video rounded-xl object-cover bg-yt-surface-muted" loading="lazy" referrerPolicy="no-referrer" />
                        <span className="block mt-1 text-[11px] font-semibold line-clamp-2">{shelfVideo.title}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </main>
      </PullToRefresh>

      {overflowVideo && (
        <VideoOverflowSheet video={overflowVideo} channelTitle={channelMap.get(overflowVideo.channelId)?.title} onClose={() => setOverflowVideo(null)} />
      )}
    </div>
  );
}

export default KidHomeScreen;
