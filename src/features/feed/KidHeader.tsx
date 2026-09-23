import React, { useState, useRef, useEffect } from 'react';
import { Heart, Lock, Search, X } from 'lucide-react';
import { CategoryChips } from './CategoryChips';

export interface KidHeaderProps {
  collapsed?: boolean;
  childName?: string;
  showFavorites: boolean;
  onToggleFavorites: () => void;
  onOpenParentDashboard: () => void;
  searchInput: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onExpandSearch?: () => void;
  selectedCategory?: string;
  onSelectCategory?: (categoryId: string) => void;
}

export function KidHeader({
  collapsed = false,
  showFavorites,
  onToggleFavorites,
  onOpenParentDashboard,
  searchInput,
  onSearchChange,
  onClearSearch,
  selectedCategory,
  onSelectCategory,
}: KidHeaderProps) {
  const [searchExpanded, setSearchExpanded] = useState(false);
  const collapsedInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when search expands in collapsed mode
  useEffect(() => {
    if (collapsed && searchExpanded) {
      collapsedInputRef.current?.focus();
    }
  }, [collapsed, searchExpanded]);

  // Reset local search expansion if uncollapsed
  useEffect(() => {
    if (!collapsed) {
      setSearchExpanded(false);
    }
  }, [collapsed]);

  /* COLLAPSED UI: ONE horizontal bar (~48-56px), RTL layout */
  if (collapsed) {
    const isSearchActive = searchExpanded || searchInput.trim().length > 0;

    return (
      <header className="px-3 sm:px-6 py-2 transition-all duration-200">
        <div className="max-w-7xl mx-auto flex items-center gap-2 sm:gap-3 h-11 sm:h-12">
          {/* 1) START (right in RTL): Search icon button or morphing search field */}
          {isSearchActive ? (
            <div className="flex-1 relative flex items-center min-w-0 transition-all duration-200 ease-out">
              <input
                ref={collapsedInputRef}
                id="kid-feed-search-input"
                type="text"
                value={searchInput}
                onChange={(e) => onSearchChange(e.target.value)}
                onBlur={() => {
                  if (!searchInput.trim()) {
                    setSearchExpanded(false);
                  }
                }}
                placeholder="ابحث في الفيديوهات المسموحة..."
                className="w-full pl-9 pr-10 py-1.5 sm:py-2 rounded-full bg-yt-surface-muted border border-yt-border text-xs sm:text-sm text-yt-text placeholder-yt-text-muted focus:outline-hidden focus:bg-yt-surface focus:ring-2 focus:ring-yt-brand/25 focus:border-yt-brand shadow-xs transition-all font-medium"
              />
              <div className="absolute right-3 text-yt-text-muted pointer-events-none flex items-center justify-center">
                <Search className="w-4 h-4" />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (searchInput) {
                    onClearSearch();
                  }
                  setSearchExpanded(false);
                }}
                className="absolute left-2.5 text-yt-text-muted hover:text-yt-text p-1 rounded-full hover:bg-yt-border/50 transition cursor-pointer"
                title="إغلاق البحث"
                aria-label="إغلاق البحث"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSearchExpanded(true)}
              className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full bg-yt-surface border border-yt-border text-yt-text-muted hover:text-yt-text hover:bg-yt-surface-muted shadow-xs flex items-center justify-center transition active:scale-95 cursor-pointer shrink-0"
              title="بحث"
              aria-label="بحث"
            >
              <Search className="w-4.5 h-4.5" />
            </button>
          )}

          {/* 2) MIDDLE: Category chips (horizontal scroll, compact height, hidden while search is open) */}
          {!isSearchActive && selectedCategory && onSelectCategory && (
            <div className="flex-1 min-w-0 transition-opacity duration-200">
              <CategoryChips
                compact
                selectedCategory={selectedCategory}
                showFavorites={showFavorites}
                onSelectCategory={onSelectCategory}
              />
            </div>
          )}

          {/* 3) END (left in RTL): Love / favorites icon ONLY (no Lock, no brand wordmark) */}
          <button
            id="kid-favorites-toggle-btn"
            type="button"
            onClick={onToggleFavorites}
            className={`w-10 h-10 min-w-[40px] min-h-[40px] rounded-full border shadow-xs flex items-center justify-center transition active:scale-95 cursor-pointer shrink-0 ${
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
        </div>
      </header>
    );
  }

  /* EXPANDED UI: Full two-row header with brand, lock, love, and full search */
  return (
    <header className="px-4 sm:px-8 py-2.5 sm:py-3 transition-all duration-200">
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
