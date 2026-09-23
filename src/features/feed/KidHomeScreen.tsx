import React, { useState, useCallback } from 'react';
import ChannelVideosModal from '../../components/ChannelVideosModal';
import { useKidFeed } from './useKidFeed';
import { useColumnCount } from './useColumnCount';
import { KidHeader } from './KidHeader';
import { CategoryChips } from './CategoryChips';
import { FavoritesView } from './FavoritesView';
import { FeedVideoGrid } from './FeedVideoGrid';

export interface KidHomeScreenProps {
  onOpenParentDashboard: () => void;
  onOpenDemoPlayer?: () => void;
  onSelectVideo?: (
    videoId: string,
    title?: string,
    channelName?: string,
    channelId?: string
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
  const [viewingChannelId, setViewingChannelId] = useState<{ id: string; title: string } | null>(null);

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
      {/* 1. Header with child badge, favorites toggle, lock button, and search */}
      <KidHeader
        childName={childName}
        showFavorites={showFavorites}
        onToggleFavorites={() => setShowFavorites((prev) => !prev)}
        onOpenParentDashboard={onOpenParentDashboard}
        searchInput={searchInput}
        onSearchChange={setSearchInput}
        onClearSearch={handleClearSearch}
      />

      {/* 2. Category Filter Chips */}
      <CategoryChips
        selectedCategory={selectedCategory}
        showFavorites={showFavorites}
        onSelectCategory={handleSelectCategory}
      />

      {/* 3. Main Content: Favorites View OR Main Feed Video Grid */}
      <main className="grow w-full py-4 sm:py-6">
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
          />
        )}
      </main>

      {/* 4. Friendly Bottom Footer */}
      <footer className="py-5 border-t border-yt-border text-center text-xs font-medium text-yt-text-muted">
        مساحة ترفيهية وتعليمية آمنة للصغار 🌟
      </footer>

      {/* 5. Channel Videos Modal */}
      {viewingChannelId && (
        <ChannelVideosModal
          sourceId={viewingChannelId.id}
          channelTitle={viewingChannelId.title}
          onClose={() => setViewingChannelId(null)}
          onSelectVideo={onSelectVideo || (() => {})}
        />
      )}
    </div>
  );
}

export default KidHomeScreen;
