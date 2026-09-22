import React, { Suspense } from 'react';
import { FeedItem } from '../../db';
import { VideoCard } from '../../components/VideoCard';
import { Heart, ArrowRight, Search } from 'lucide-react';

const AddByUrlCard = React.lazy(() => import('../../components/AddByUrlCard'));

export interface FavoritesViewProps {
  filteredFavorites: FeedItem[];
  debouncedSearch: string;
  channelMap: Map<string, { title: string; categories: string[]; thumbnail?: string; enabled?: boolean }>;
  onSelectVideo?: (videoId: string, title?: string, channelName?: string, channelId?: string) => void;
  onOpenDemoPlayer?: () => void;
  onChannelSelect: (id: string, title: string) => void;
  onCloseFavorites: () => void;
  onClearSearch: () => void;
  onFavoritesChanged: () => void;
}

export function FavoritesView({
  filteredFavorites,
  debouncedSearch,
  channelMap,
  onSelectVideo,
  onOpenDemoPlayer,
  onChannelSelect,
  onCloseFavorites,
  onClearSearch,
  onFavoritesChanged,
}: FavoritesViewProps) {
  return (
    <div id="kid-favorites-view" className="space-y-6">
      {/* Header banner with back button and AddByUrl card */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
        <Suspense fallback={null}>
          <AddByUrlCard target="loved" onAdded={onFavoritesChanged} />
        </Suspense>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/95 p-4 sm:p-5 rounded-3xl border border-rose-100 shadow-[0_2px_12px_rgba(244,63,94,0.05)]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0 border border-rose-100 shadow-sm">
              <Heart className="w-6 h-6 fill-rose-500" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-stone-900 flex items-center gap-2">
                <span>فيديوهاتي المفضلة ❤️</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold border border-rose-200">
                  {filteredFavorites.length} فيديو
                </span>
              </h2>
              <p className="text-xs text-stone-600">
                الفيديوهات التي نالت إعجابك وتستمتع بمشاهدتها دائماً
              </p>
            </div>
          </div>

          <button
            id="back-to-home-feed-btn"
            type="button"
            onClick={onCloseFavorites}
            className="self-start sm:self-auto flex items-center gap-2 px-4 py-2 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs sm:text-sm font-bold transition active:scale-95 cursor-pointer shadow-sm"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة للفيديوهات</span>
          </button>
        </div>
      </div>

      {/* Favorites Video Grid or Empty State */}
      {filteredFavorites.length === 0 ? (
        debouncedSearch ? (
          <div className="max-w-lg mx-auto my-6 px-4">
            <div className="bg-white/90 rounded-3xl border border-rose-100 p-8 text-center space-y-4 shadow-sm">
              <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-sm">
                <Search className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base sm:text-lg font-black text-stone-900">
                  مفيش فيديو مفضل بهذا الاسم
                </h3>
                <p className="text-xs text-stone-600 max-w-md mx-auto font-medium">
                  تأكد من كتابة الاسم بشكل صحيح أو امسح البحث لمشاهدة كل مفضلاتك.
                </p>
              </div>
              <button
                type="button"
                onClick={onClearSearch}
                className="px-5 py-2.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm cursor-pointer active:scale-95"
              >
                عرض كل الفيديوهات المفضلة ❤️
              </button>
            </div>
          </div>
        ) : (
          /* Empty state, kid-friendly tone specified by user */
          <div
            id="kid-favorites-empty-state"
            className="max-w-lg mx-auto my-8 px-4"
          >
            <div className="bg-white/90 rounded-3xl border border-rose-100 p-8 sm:p-10 text-center space-y-4 shadow-sm flex flex-col items-center">
              <div className="w-16 h-16 rounded-3xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100 shadow-sm">
                <Heart className="w-8 h-8 fill-rose-600" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className="text-base sm:text-lg font-black text-stone-900">
                  لسه مفيش فيديوهات حبيتها ❤️
                </h3>
                <p className="text-xs sm:text-sm text-stone-600 leading-relaxed font-medium">
                  اضغط على القلب وانت بتتفرج عشان تحفظها هنا!
                </p>
              </div>
              <button
                id="back-to-feed-from-empty-favorites-btn"
                type="button"
                onClick={onCloseFavorites}
                className="px-6 py-2.5 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold transition shadow-sm cursor-pointer active:scale-95 flex items-center gap-1.5"
              >
                <ArrowRight className="w-4 h-4" />
                <span>العودة للفيديوهات</span>
              </button>
            </div>
          </div>
        )
      ) : (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
            {filteredFavorites.map((video) => {
              const channelInfo = channelMap.get(video.channelId);
              return (
                <VideoCard
                  key={video.videoId}
                  video={video}
                  channelTitle={channelInfo?.title || 'قناة أطفال'}
                  isFavorite={true}
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

export default FavoritesView;
