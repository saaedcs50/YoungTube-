import React from 'react';
import { Star, Heart, Lock, Search, X } from 'lucide-react';

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
  childName,
  showFavorites,
  onToggleFavorites,
  onOpenParentDashboard,
  searchInput,
  onSearchChange,
  onClearSearch,
}: KidHeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-yt-bg/90 backdrop-blur-md border-b border-yt-border px-4 sm:px-8 py-3.5 shadow-sm">
      <div className="max-w-7xl mx-auto space-y-3">
        <div className="flex items-center justify-between">
          {/* Right side in RTL: 44x44 badge with star icon + small line "مرحباً يا بطل" and extra-bold child name */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-yt-brand text-yt-brand-text flex items-center justify-center shadow-sm shrink-0">
              <Star className="w-6 h-6 fill-yt-brand-text" />
            </div>
            <div className="flex flex-col text-right">
              <span className="text-xs font-semibold text-yt-text-muted">مرحباً يا بطل</span>
              <span className="text-xl font-extrabold text-yt-text tracking-tight leading-tight">
                {childName || 'عالم ياسين'}
              </span>
            </div>
          </div>

          {/* Left side in RTL: Two 44x44 round white buttons (Heart favorites, Lock parents) */}
          <div className="flex items-center gap-2.5">
            <button
              id="kid-favorites-toggle-btn"
              type="button"
              onClick={onToggleFavorites}
              className={`w-11 h-11 rounded-full bg-yt-surface border border-yt-border shadow-sm flex items-center justify-center transition active:scale-[0.98] cursor-pointer ${
                showFavorites
                  ? 'text-rose-500 ring-2 ring-rose-300'
                  : 'text-yt-text-muted hover:text-rose-500 hover:bg-yt-surface-muted'
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
              className="w-11 h-11 rounded-full bg-yt-surface border border-yt-border shadow-sm flex items-center justify-center text-yt-text-muted hover:text-yt-text hover:bg-yt-surface-muted transition active:scale-[0.98] cursor-pointer"
              title="منطقة الوالدين"
              aria-label="منطقة الوالدين"
            >
              <Lock className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Under that: full-width search pill, white, rounded-2xl, amber search icon, keep current search logic */}
        <div className="relative w-full">
          <div className="relative flex items-center">
            <input
              id="kid-feed-search-input"
              type="text"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="ابحث في الفيديوهات المسموحة..."
              className="w-full pl-10 pr-11 py-2.5 rounded-2xl bg-yt-surface border border-yt-border text-xs sm:text-sm text-yt-text placeholder-yt-text-muted focus:outline-hidden focus:ring-2 focus:ring-yt-brand/30 focus:border-yt-brand shadow-sm transition-all font-medium"
            />
            <div className="absolute right-3.5 text-yt-brand pointer-events-none flex items-center justify-center">
              <Search className="w-4 h-4" />
            </div>
            {searchInput && (
              <button
                type="button"
                onClick={onClearSearch}
                className="absolute left-3 text-yt-text-muted hover:text-yt-text p-1 rounded-full hover:bg-yt-surface-muted transition cursor-pointer"
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
