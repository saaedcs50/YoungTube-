import React from 'react';
import { Heart, Lock, Search, X } from 'lucide-react';

export interface KidHeaderProps {
  childName?: string;
  showFavorites: boolean;
  onToggleFavorites: () => void;
  onOpenParentDashboard: () => void;
  searchInput: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
}

export function KidHeader({
  showFavorites,
  onToggleFavorites,
  onOpenParentDashboard,
  searchInput,
  onSearchChange,
  onClearSearch,
}: KidHeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-yt-bg/95 backdrop-blur-md border-b border-yt-border px-4 sm:px-8 py-2.5 sm:py-3 shadow-xs">
      <div className="max-w-7xl mx-auto space-y-2.5">
        {/* Top row: Brand wordmark at start, Favorites & Parent lock at end */}
        <div className="flex items-center justify-between">
          {/* Start (RTL: right side) - brand wordmark */}
          <div className="flex items-center gap-2">
            <span className="text-xl sm:text-2xl font-extrabold text-yt-brand tracking-tight select-none">
              يونج تيوب
            </span>
          </div>

          {/* End (RTL: left side) - Heart (favorites) & Lock (parents) buttons */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            <button
              id="kid-favorites-toggle-btn"
              type="button"
              onClick={onToggleFavorites}
              className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-full border shadow-xs flex items-center justify-center transition active:scale-95 cursor-pointer ${
                showFavorites
                  ? 'text-rose-500 bg-rose-50 border-rose-200 ring-2 ring-rose-300'
                  : 'bg-yt-surface border-yt-border text-yt-text-muted hover:text-rose-500 hover:bg-yt-surface-muted'
              }`}
              title="المفضلة"
              aria-label="المفضلة"
            >
              <Heart
                className={`w-5 h-5 ${
                  showFavorites ? 'fill-rose-500 text-rose-500' : 'text-yt-text-muted'
                }`}
              />
            </button>

            <button
              id="parent-dashboard-lock-btn"
              type="button"
              onClick={onOpenParentDashboard}
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-yt-surface border border-yt-border shadow-xs flex items-center justify-center text-yt-text-muted hover:text-yt-text hover:bg-yt-surface-muted transition active:scale-95 cursor-pointer"
              title="منطقة الوالدين"
              aria-label="منطقة الوالدين"
            >
              <Lock className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Second row: full-width search pill like YouTube mobile search */}
        <div className="relative w-full">
          <div className="relative flex items-center">
            <input
              id="kid-feed-search-input"
              type="text"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="ابحث في الفيديوهات المسموحة..."
              className="w-full pl-10 pr-11 py-2 sm:py-2.5 rounded-full bg-yt-surface-muted border border-yt-border text-xs sm:text-sm text-yt-text placeholder-yt-text-muted focus:outline-hidden focus:bg-yt-surface focus:ring-2 focus:ring-yt-brand/25 focus:border-yt-brand shadow-xs transition-all font-medium"
            />
            <div className="absolute right-3.5 text-yt-text-muted pointer-events-none flex items-center justify-center">
              <Search className="w-4 h-4" />
            </div>
            {searchInput && (
              <button
                type="button"
                onClick={onClearSearch}
                className="absolute left-3 text-yt-text-muted hover:text-yt-text p-1 rounded-full hover:bg-yt-border/50 transition cursor-pointer"
                title="مسح البحث"
                aria-label="مسح البحث"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default KidHeader;
