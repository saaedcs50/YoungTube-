import React, { useState, useCallback } from 'react';
import ChannelVideosModal from '../../components/ChannelVideosModal';
import DownloadsModal from '../../components/DownloadsModal';
import { useKidFeed } from './useKidFeed';
import { useColumnCount } from './useColumnCount';
import { useFeedHeaderCollapse } from './useFeedHeaderCollapse';
import { KidHeader } from './KidHeader';
import { CategoryChips } from './CategoryChips';
import { FavoritesView } from './FavoritesView';
import { FeedVideoGrid } from './FeedVideoGrid';
import { PullToRefresh } from '../../components/PullToRefresh';
import { PlaylistManager } from '../../components/PlaylistManager';
import { FeedItem } from '../../db';

export interface KidHomeScreenProps {
  onOpenParentDashboard: () => void;
  onOpenDemoPlayer?: () => void;
  onSelectVideo?: (
    videoId: string,
    title?: string,
    channelName?: string,
    channelId?: string,
    options?: { localPath?: string; fromDownloads?: boolean }
  ) => void;
  refreshTrigger?: number;
  suppressedVideoIds?: string[];
}

export function KidHomeScreen({
  onOpenParentDashboard,
  onOpenDemoPlayer,
  onSelectVideo,
  refreshTrigger = 0,
  suppressedVideoIds = [],
}: KidHomeScreenProps) {
  const columnCount = useColumnCount();
  const collapsed = useFeedHeaderCollapse();
  const [viewingChannelId, setViewingChannelId] = useState<{ id: string; title: string } | null>(null);
  const [showDownloads, setShowDownloads] = useState(false);
  const [playlistActionVideo, setPlaylistActionVideo] = useState<FeedItem | null>(null);

  const handleChannelSelect = useCallback((id: string, title: string) => {
    setViewingChannelId({ id, title });
  }, []);

  const {
    loading,
    childName,
    selectedCategory,
    setSelectedCategory,
    searchInput,
    setSearchInput,
    debouncedSearch,
    setDebouncedSearch,
    deepSearchResults,
    setDeepSearchResults,
    isDeepSearching,
    showFavorites,
    setShowFavorites,
    filteredFavorites,
    tasteShiftConfig,
    tasteTargetSet,
    showWeeklyChoiceCard,
    channelMap,
    filteredVideos,
    loadVideos,
    loadFavorites,
  } = useKidFeed({ refreshTrigger, suppressedVideoIds });

  const handleRefreshFeed = useCallback(async () => {
    // Full feed refresh intentionally re-shuffles the current approved pool.
    await loadVideos(false);
  }, [loadVideos]);

  const handleClearSearch = useCallback(() => {
    setSearchInput('');
    setDebouncedSearch('');
    setDeepSearchResults([]);
  }, [setSearchInput, setDebouncedSearch, setDeepSearchResults]);

  const handleResetCategory = useCallback(() => {
    setSelectedCategory('all');
    void loadVideos(false);
  }, [setSelectedCategory, loadVideos]);

  const handleSelectCategory = useCallback(
    (catId: string) => {
      setShowFavorites(false);
      setSelectedCategory(catId);
      void loadVideos(false);
    },
    [setShowFavorites, setSelectedCategory, loadVideos]
  );

  return (
    <div
      id="kid-home-screen"
      className="min-h-screen bg-yt-bg text-yt-text flex flex-col select-none font-sans"
    >
      {/* 1. Sticky Header Shell: Switches between full header + chips and collapsed single bar */}
      <div className="sticky top-0 z-40 bg-yt-bg/95 backdrop-blur-md border-b border-yt-border shadow-xs">
        {collapsed ? (
          <KidHeader
            collapsed={true}
            selectedCategory={selectedCategory}
            showFavorites={showFavorites}
            onSelectCategory={handleSelectCategory}
            searchInput={searchInput}
            onSearchChange={setSearchInput}
            onClearSearch={handleClearSearch}
            onToggleFavorites={() => setShowFavorites((prev) => !prev)}
            onOpenDownloads={() => setShowDownloads(true)}
            onOpenParentDashboard={onOpenParentDashboard}
          />
        ) : (
          <>
            <KidHeader
              collapsed={false}
              childName={childName}
              showFavorites={showFavorites}
              onToggleFavorites={() => setShowFavorites((prev) => !prev)}
              onOpenDownloads={() => setShowDownloads(true)}
              onOpenParentDashboard={onOpenParentDashboard}
              searchInput={searchInput}
              onSearchChange={setSearchInput}
              onClearSearch={handleClearSearch}
            />
            <CategoryChips
              selectedCategory={selectedCategory}
              showFavorites={showFavorites}
              onSelectCategory={handleSelectCategory}
            />
          </>
        )}
      </div>

      {/* 2. Main Content: Favorites View OR Main Feed Video Grid */}
      <PullToRefresh onRefresh={handleRefreshFeed} disabled={loading || showFavorites}>
      <main className="grow w-full py-2 sm:py-6">
        {showFavorites ? (
          <FavoritesView
            filteredFavorites={filteredFavorites}
            debouncedSearch={debouncedSearch}
            channelMap={channelMap}
            onSelectVideo={onSelectVideo}
            onOpenDemoPlayer={onOpenDemoPlayer}
            onChannelSelect={handleChannelSelect}
            onCloseFavorites={() => setShowFavorites(false)}
            onClearSearch={handleClearSearch}
            onFavoritesChanged={() => void loadFavorites()}
            onAddToPlaylist={(video) => setPlaylistActionVideo(video)}
          />
        ) : (
          <FeedVideoGrid
            loading={loading}
            filteredVideos={filteredVideos}
            debouncedSearch={debouncedSearch}
            deepSearchResults={deepSearchResults}
            isDeepSearching={isDeepSearching}
            showWeeklyChoiceCard={showWeeklyChoiceCard}
            tasteShiftConfig={tasteShiftConfig}
            tasteTargetSet={tasteTargetSet}
            channelMap={channelMap}
            columnCount={columnCount}
            onSelectVideo={onSelectVideo}
            onOpenDemoPlayer={onOpenDemoPlayer}
            onChannelSelect={handleChannelSelect}
            onClearSearch={handleClearSearch}
            onResetCategory={handleResetCategory}
            onTasteReacted={() => void loadVideos(true)}
            onChoiceMade={() => void loadVideos(true)}
            onAddToPlaylist={(video) => setPlaylistActionVideo(video)}
          />
        )}
      </main>
      </PullToRefresh>

      {playlistActionVideo && (
        <div className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-3" onMouseDown={() => setPlaylistActionVideo(null)}>
          <div className="w-full max-w-md bg-yt-surface rounded-3xl border border-yt-border shadow-2xl p-4 sm:p-5 max-h-[80vh] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
            <PlaylistManager
              mode="add"
              video={playlistActionVideo}
              onClose={() => setPlaylistActionVideo(null)}
              onChanged={() => setPlaylistActionVideo(null)}
            />
          </div>
        </div>
      )}

      {/* 3. Friendly Bottom Footer */}
      <footer className="py-5 border-t border-yt-border text-center text-xs font-medium text-yt-text-muted">
        مساحة ترفيهية وتعليمية آمنة للصغار 🌟
      </footer>

      {/* 4. Channel Videos Modal */}
      {viewingChannelId && (
        <ChannelVideosModal
          sourceId={viewingChannelId.id}
          channelTitle={viewingChannelId.title}
          onClose={() => setViewingChannelId(null)}
          onSelectVideo={onSelectVideo || (() => {})}
        />
      )}

      {/* 5. Downloads List Modal */}
      <DownloadsModal
        isOpen={showDownloads}
        onClose={() => setShowDownloads(false)}
        onSelectVideo={onSelectVideo}
      />
    </div>
  );
}

export default KidHomeScreen;
