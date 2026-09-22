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
    <header className="sticky top-0 z-40 bg-[#FAF8F5]/90 backdrop-blur-md border-b border-amber-100 px-4 sm:px-8 py-3.5 shadow-sm">
      <div className="max-w-7xl mx-auto space-y-3">
        <div className="flex items-center justify-between">
          {/* Right side in RTL: 44x44 badge with star icon + small line "مرحباً يا بطل" and extra-bold child name */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-600 to-amber-500 text-white flex items-center justify-center shadow-sm shrink-0">
              <Star className="w-6 h-6 fill-white" />
            </div>
            <div className="flex flex-col text-right">
              <span className="text-xs font-semibold text-stone-600">مرحباً يا بطل</span>
              <span className="text-xl font-extrabold text-stone-900 tracking-tight leading-tight">
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
              className={`w-11 h-11 rounded-full bg-white border border-stone-100 shadow-sm flex items-center justify-center transition active:scale-[0.98] cursor-pointer ${
                showFavorites
                  ? 'text-rose-500 ring-2 ring-rose-300'
                  : 'text-stone-700 hover:text-rose-500 hover:bg-stone-50'
              }`}
              title="المفضلة"
              aria-label="المفضلة"
            >
              <Heart
                className={`w-5 h-5 ${
                  showFavorites ? 'fill-rose-500 text-rose-500' : 'text-stone-700'
                }`}
              />
            </button>

            <button
              id="parent-dashboard-lock-btn"
              type="button"
              onClick={onOpenParentDashboard}
              className="w-11 h-11 rounded-full bg-white border border-stone-100 shadow-sm flex items-center justify-center text-stone-700 hover:text-stone-900 hover:bg-stone-50 transition active:scale-[0.98] cursor-pointer"
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
              className="w-full pl-10 pr-11 py-2.5 rounded-2xl bg-white border border-stone-200 text-xs sm:text-sm text-stone-900 placeholder-stone-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 shadow-sm transition-all font-medium"
            />
            <div className="absolute right-3.5 text-amber-600 pointer-events-none flex items-center justify-center">
              <Search className="w-4 h-4" />
            </div>
            {searchInput && (
              <button
                type="button"
                onClick={onClearSearch}
                className="absolute left-3 text-stone-500 hover:text-stone-800 p-1 rounded-full hover:bg-stone-100 transition cursor-pointer"
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
