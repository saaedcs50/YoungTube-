import React, { useMemo } from 'react';
import { FeedItem } from '../../db';
import { VideoCard } from '../../components/VideoCard';
import { WeeklyChoiceCard } from '../../components/WeeklyChoiceCard';
import { WindowVirtualizer } from 'virtua';
import { Search, Sparkles, Film } from 'lucide-react';

export interface FeedVideoGridProps {
  loading: boolean;
  filteredVideos: FeedItem[];
  debouncedSearch: string;
  deepSearchResults: Array<{ videoId: string; title: string; publishedAt: string; sourceId: string }>;
  isDeepSearching: boolean;
  showWeeklyChoiceCard: boolean;
  tasteShiftConfig: {
    enabled: boolean;
    targetCategories: string[];
    activeCategoryThisWeek?: string;
    choiceWeekNumber?: number;
    currentWeek: number;
  } | null;
  tasteTargetSet: Set<string> | null;
  channelMap: Map<string, { title: string; categories: string[]; thumbnail?: string; enabled?: boolean }>;
  columnCount: number;
  onSelectVideo?: (videoId: string, title?: string, channelName?: string, channelId?: string) => void;
  onOpenDemoPlayer?: () => void;
  onChannelSelect: (id: string, title: string) => void;
  onClearSearch: () => void;
  onResetCategory: () => void;
  onTasteReacted: () => void;
  onChoiceMade: () => void;
}

export function FeedVideoGrid({
  loading,
  filteredVideos,
  debouncedSearch,
  deepSearchResults,
  isDeepSearching,
  showWeeklyChoiceCard,
  tasteShiftConfig,
  tasteTargetSet,
  channelMap,
  columnCount,
  onSelectVideo,
  onOpenDemoPlayer,
  onChannelSelect,
  onClearSearch,
  onResetCategory,
  onTasteReacted,
  onChoiceMade,
}: FeedVideoGridProps) {
  // Chunk filtered videos into rows for virtualization
  const videoRows = useMemo(() => {
    const rows: FeedItem[][] = [];
    for (let i = 0; i < filteredVideos.length; i += columnCount) {
      rows.push(filteredVideos.slice(i, i + columnCount));
    }
    return rows;
  }, [filteredVideos, columnCount]);

  if (loading) {
    /* Shimmer Skeleton matching rounded-[28px], border-stone-100 */
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={`skeleton-card-${idx}`}
              className="bg-white rounded-[28px] overflow-hidden border border-stone-100 shadow-sm flex flex-col animate-pulse"
            >
              <div className="aspect-video w-full bg-stone-200/70" />
              <div className="p-4 space-y-2.5 bg-white">
                <div className="h-4 bg-stone-200/80 rounded-full w-4/5" />
                <div className="h-4 bg-stone-200/50 rounded-full w-3/5" />
                <div className="h-3 bg-stone-100 rounded-full w-1/3 pt-1" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (filteredVideos.length === 0) {
    if (debouncedSearch) {
      if (deepSearchResults.length > 0) {
        return (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-4 text-center sm:text-right flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-amber-900">
                <div className="w-9 h-9 rounded-xl bg-amber-200/70 flex items-center justify-center shrink-0">
                  <Search className="w-5 h-5 text-amber-800" />
                </div>
                <p className="text-xs sm:text-sm font-bold">
                  لم نجد نتائج في الصفحة الحالية، ولكن عثرنا على نتائج في أرشيف القنوات!
                </p>
              </div>
              <button
                type="button"
                onClick={onClearSearch}
                className="text-xs font-bold text-amber-800 hover:text-amber-950 underline cursor-pointer"
              >
                مسح البحث
              </button>
            </div>

            <div id="deep-search-archive-section">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-2xl bg-amber-600 text-white flex items-center justify-center shadow-xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-stone-900">
                    Results from channel archive
                  </h3>
                  <p className="text-xs text-stone-600 font-medium">
                    نتائج من أرشيف القنوات الموسع ({deepSearchResults.length} فيديو)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
                {deepSearchResults.map((item) => {
                  const channelInfo = channelMap.get(item.sourceId);
                  const videoFeedItem: FeedItem = {
                    videoId: item.videoId,
                    channelId: item.sourceId,
                    title: item.title,
                    publishedAt: item.publishedAt,
                    fetchedAt: Date.now(),
                    hidden: false,
                  };

                  return (
                    <VideoCard
                      key={`archive-${item.videoId}`}
                      video={videoFeedItem}
                      channelTitle={channelInfo?.title || 'قناة أطفال'}
                      onSelectVideo={onSelectVideo}
                      onOpenDemoPlayer={onOpenDemoPlayer}
                      onChannelSelect={onChannelSelect}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        );
      }

      if (isDeepSearching) {
        return (
          <div className="max-w-lg mx-auto my-12 px-4 text-center space-y-4">
            <div className="w-12 h-12 border-4 border-amber-600/20 border-t-amber-600 rounded-full animate-spin mx-auto" />
            <p className="text-sm font-bold text-stone-700">
              جاري البحث في أرشيف القنوات الموسع...
            </p>
          </div>
        );
      }

      /* Friendly Search Empty State */
      return (
        <div className="max-w-lg mx-auto my-8 sm:my-12 px-4">
          <div className="bg-white rounded-[28px] border border-stone-100 p-8 sm:p-10 text-center space-y-4 shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto shadow-sm border border-amber-100">
              <Search className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base sm:text-lg font-black text-stone-900">
                مفيش فيديوهات بالاسم ده جوه القنوات المسموحة
              </h3>
              <p className="text-xs sm:text-sm text-stone-600 max-w-sm mx-auto leading-relaxed font-medium">
                هذا البحث يعمل فقط داخل مكتبة القنوات الآمنة المصرح بها للطفل ولا يبحث في الإنترنت الخارجي.
              </p>
            </div>
            <button
              id="clear-search-empty-btn"
              type="button"
              onClick={onClearSearch}
              className="px-6 py-2.5 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold transition shadow-sm cursor-pointer active:scale-95"
            >
              مسح البحث وعرض كل الفيديوهات ✨
            </button>
          </div>
        </div>
      );
    }

    /* Friendly Category Empty State */
    return (
      <div className="max-w-lg mx-auto my-8 sm:my-12 px-4">
        <div className="bg-white rounded-[28px] border border-stone-100 p-8 sm:p-10 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto shadow-sm border border-amber-100">
            <Film className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base sm:text-lg font-black text-stone-900">
              لا توجد فيديوهات في هذا القسم حالياً
            </h3>
            <p className="text-xs sm:text-sm text-stone-600 max-w-sm mx-auto leading-relaxed font-medium">
              يمكنك تصفح باقي الأقسام الممتعة أو العودة لقسم &quot;الكل&quot; لمشاهدة جميع الفيديوهات.
            </p>
          </div>
          <button
            id="reset-filter-btn"
            type="button"
            onClick={onResetCategory}
            className="px-6 py-2.5 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold transition shadow-sm cursor-pointer active:scale-95"
          >
            عرض جميع الفيديوهات ✨
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {showWeeklyChoiceCard && tasteShiftConfig && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-5 sm:mb-6">
          <WeeklyChoiceCard
            targetCategories={tasteShiftConfig.targetCategories}
            currentWeek={tasteShiftConfig.currentWeek}
            onChoiceMade={onChoiceMade}
          />
        </div>
      )}

      {filteredVideos.length <= 12 ? (
        /* Non-virtualized small list */
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
            {filteredVideos.map((video) => {
              const channelInfo = channelMap.get(video.channelId);
              const channelTitle = channelInfo?.title || 'قناة أطفال';
              const videoCats =
                channelInfo?.categories ||
                (video as any).categories ||
                (video as any).category ||
                [];
              const isTasteShiftTarget = Boolean(
                tasteTargetSet &&
                  (Array.isArray(videoCats) ? videoCats : [videoCats]).some((cat: string) =>
                    tasteTargetSet.has(cat)
                  )
              );

              return (
                <VideoCard
                  key={video.videoId}
                  video={video}
                  channelTitle={channelTitle}
                  isTasteShiftTarget={isTasteShiftTarget}
                  activeTasteShiftCategory={tasteShiftConfig?.activeCategoryThisWeek}
                  onSelectVideo={onSelectVideo}
                  onOpenDemoPlayer={onOpenDemoPlayer}
                  onTasteReacted={onTasteReacted}
                  onChannelSelect={onChannelSelect}
                />
              );
            })}
          </div>
        </div>
      ) : (
        /* Virtualized unbounded feed using virtua WindowVirtualizer */
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <WindowVirtualizer bufferSize={600} itemSize={320} shift={false}>
            {videoRows.map((row, rowIndex) => (
              <div
                key={`row-${row[0]?.videoId || rowIndex}`}
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6 pb-4 sm:pb-5 lg:pb-6"
              >
                {row.map((video) => {
                  const channelInfo = channelMap.get(video.channelId);
                  const channelTitle = channelInfo?.title || 'قناة أطفال';
                  const videoCats =
                    channelInfo?.categories ||
                    (video as any).categories ||
                    (video as any).category ||
                    [];
                  const isTasteShiftTarget = Boolean(
                    tasteTargetSet &&
                      (Array.isArray(videoCats) ? videoCats : [videoCats]).some((cat: string) =>
                        tasteTargetSet.has(cat)
                      )
                  );

                  return (
                    <VideoCard
                      key={video.videoId}
                      video={video}
                      channelTitle={channelTitle}
                      isTasteShiftTarget={isTasteShiftTarget}
                      activeTasteShiftCategory={tasteShiftConfig?.activeCategoryThisWeek}
                      onSelectVideo={onSelectVideo}
                      onOpenDemoPlayer={onOpenDemoPlayer}
                      onTasteReacted={onTasteReacted}
                      onChannelSelect={onChannelSelect}
                    />
                  );
                })}
              </div>
            ))}
          </WindowVirtualizer>
        </div>
      )}

      {/* Loading indicator for deep archive search if ongoing */}
      {isDeepSearching && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 text-center text-xs text-stone-500 font-medium flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-500 rounded-full animate-spin" />
          <span>جاري البحث في أرشيف القنوات الموسع...</span>
        </div>
      )}

      {/* Deep search results fallback section */}
      {deepSearchResults.length > 0 && (
        <div
          id="deep-search-archive-section"
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 pt-8 border-t border-amber-100/80"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-stone-900">
                Results from channel archive
              </h3>
              <p className="text-xs text-stone-500 font-medium">
                نتائج إضافية من أرشيف القنوات الموسع ({deepSearchResults.length} فيديو)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
            {deepSearchResults.map((item) => {
              const channelInfo = channelMap.get(item.sourceId);
              const videoFeedItem: FeedItem = {
                videoId: item.videoId,
                channelId: item.sourceId,
                title: item.title,
                publishedAt: item.publishedAt,
                fetchedAt: Date.now(),
                hidden: false,
              };

              return (
                <VideoCard
                  key={`archive-${item.videoId}`}
                  video={videoFeedItem}
                  channelTitle={channelInfo?.title || 'قناة أطفال'}
                  onSelectVideo={onSelectVideo}
                  onOpenDemoPlayer={onOpenDemoPlayer}
                  onChannelSelect={onChannelSelect}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default FeedVideoGrid;
