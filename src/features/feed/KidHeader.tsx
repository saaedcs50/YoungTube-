import React, { useState, useRef, useEffect } from 'react';
import { Heart, Lock, Search, X, FolderDown } from 'lucide-react';
import { CategoryChips } from './CategoryChips';
import { YoungTubeWordmark } from '../../components/YoungTubeWordmark';
import type { AutocompleteSuggestion } from '../../services/kidSearch';

export interface KidHeaderProps {
  collapsed?: boolean;
  childName?: string;
  showFavorites: boolean;
  onToggleFavorites: () => void;
  onOpenDownloads?: () => void;
  onOpenParentDashboard: () => void;
  searchInput: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  selectedCategory?: string;
  onSelectCategory?: (categoryId: string) => void;
  suggestions?: AutocompleteSuggestion[];
  onSelectSuggestion?: (text: string) => void;
}

export function KidHeader({
  collapsed = false,
  showFavorites,
  onToggleFavorites,
  onOpenDownloads,
  onOpenParentDashboard,
  searchInput,
  onSearchChange,
  onClearSearch,
  selectedCategory = 'all',
  onSelectCategory,
  suggestions = [],
  onSelectSuggestion,
}: KidHeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, []);

  // Auto-focus input when search expands in collapsed mode
  useEffect(() => {
    if (collapsed && searchOpen) {
      const raf = requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [collapsed, searchOpen]);

  // Reset searchOpen if collapsed state becomes false
  useEffect(() => {
    if (!collapsed) {
      setSearchOpen(false);
    }
  }, [collapsed]);

  const handleSelect = (text: string) => {
    setShowSuggestions(false);
    if (onSelectSuggestion) {
      onSelectSuggestion(text);
    } else {
      onSearchChange(text);
    }
  };

  const hasSuggestions = showSuggestions && suggestions.length > 0 && searchInput.trim().length >= 1;

  const renderSuggestionsList = () => {
    if (!hasSuggestions) return null;

    return (
      <div
        id="kid-search-autocomplete-dropdown"
        dir="rtl"
        className="absolute top-full mt-1.5 inset-x-0 z-50 bg-yt-surface rounded-2xl border border-yt-border shadow-xl p-1.5 max-h-60 overflow-y-auto overscroll-contain animate-fade-in"
      >
        <div className="space-y-0.5">
          {suggestions.map((item) => (
            <button
              key={item.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(item.text);
              }}
              className="w-full text-right px-3 py-2 rounded-xl text-xs flex items-center justify-between gap-2 hover:bg-yt-surface-muted active:scale-[0.99] transition cursor-pointer group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Search className="w-3.5 h-3.5 text-yt-text-muted shrink-0 group-hover:text-yt-brand" />
                <span className="truncate text-yt-text font-medium group-hover:text-yt-brand">
                  {item.text}
                </span>
              </div>
              {item.type === 'channel' ? (
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-md bg-yt-brand-soft text-yt-brand font-bold">
                  قناة
                </span>
              ) : item.channelTitle ? (
                <span className="shrink-0 text-[10px] text-yt-text-muted truncate max-w-[110px]">
                  {item.channelTitle}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    );
  };

  /* =========================================================================
   * 1. COLLAPSED VIEW: Single horizontal bar (~48-56px) [Search | Chips | Love]
   * ========================================================================= */
  if (collapsed) {
    return (
      <header className="px-3 sm:px-6 py-1.5 h-12 sm:h-13 flex items-center gap-2 sm:gap-3 transition-[height,padding] duration-200">
        {/* START (RTL: right side) - Search icon or in-bar expanded search */}
        {searchOpen ? (
          <div
            ref={searchContainerRef}
            className="flex-1 min-w-0 flex items-center relative transition-all duration-200 ease-out"
          >
            <input
              ref={searchInputRef}
              id="kid-feed-search-input"
              type="text"
              value={searchInput}
              onChange={(e) => {
                onSearchChange(e.target.value);
                setShowSuggestions(e.target.value.trim().length >= 1);
              }}
              onFocus={() => {
                if (searchInput.trim().length >= 1) setShowSuggestions(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  if (showSuggestions) {
                    setShowSuggestions(false);
                  } else {
                    setSearchOpen(false);
                  }
                }
              }}
              placeholder="ابحث في الفيديوهات..."
              className="w-full pl-9 pr-9 py-1.5 sm:py-2 rounded-full bg-yt-surface-muted border border-yt-border text-xs sm:text-sm text-yt-text placeholder-yt-text-muted focus:outline-hidden focus:bg-yt-surface focus:ring-2 focus:ring-yt-brand/25 focus:border-yt-brand shadow-xs transition-all font-medium"
            />
            <div className="absolute right-3 text-yt-text-muted pointer-events-none flex items-center justify-center">
              <Search className="w-4 h-4" />
            </div>
            <button
              type="button"
              onClick={() => {
                if (searchInput) onClearSearch();
                setShowSuggestions(false);
                setSearchOpen(false);
              }}
              className="absolute left-2.5 text-yt-text-muted hover:text-yt-text p-1 rounded-full hover:bg-yt-border/50 transition cursor-pointer"
              title="إغلاق البحث"
              aria-label="إغلاق البحث"
            >
              <X className="w-4 h-4" />
            </button>
            {renderSuggestionsList()}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-full bg-yt-surface-muted border border-yt-border/70 hover:bg-yt-border/40 flex items-center justify-center text-yt-text transition-transform active:scale-95 cursor-pointer"
            title="البحث"
            aria-label="البحث"
          >
            <Search className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </button>
        )}

        {/* MIDDLE - Category chips (compact mode, hidden when search is expanded) */}
        {!searchOpen && onSelectCategory && (
          <div className="flex-1 min-w-0 overflow-hidden">
            <CategoryChips
              selectedCategory={selectedCategory}
              showFavorites={showFavorites}
              onSelectCategory={onSelectCategory}
              compact
            />
          </div>
        )}

        {/* END (RTL: left side) - Downloads button & Love (Favorites) button */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onOpenDownloads && (
            <button
              id="kid-downloads-open-btn-collapsed"
              type="button"
              onClick={onOpenDownloads}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-yt-border bg-yt-surface text-yt-text-muted hover:text-yt-brand hover:bg-yt-brand-soft shadow-xs flex items-center justify-center transition active:scale-95 cursor-pointer"
              title="التنزيلات"
              aria-label="التنزيلات"
            >
              <FolderDown className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </button>
          )}

          <button
            id="kid-favorites-toggle-btn"
            type="button"
            onClick={onToggleFavorites}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border shadow-xs flex items-center justify-center transition active:scale-95 cursor-pointer ${
              showFavorites
                ? 'text-rose-500 bg-rose-50 border-rose-200 ring-2 ring-rose-300'
                : 'bg-yt-surface border-yt-border text-yt-text-muted hover:text-rose-500 hover:bg-yt-surface-muted'
            }`}
            title="المفضلة"
            aria-label="المفضلة"
          >
            <Heart
              className={`w-4 h-4 sm:w-4.5 sm:h-4.5 ${
                showFavorites ? 'fill-rose-500 text-rose-500' : 'text-yt-text-muted'
              }`}
            />
          </button>

          <button
            id="parent-dashboard-lock-btn-collapsed"
            type="button"
            onClick={onOpenParentDashboard}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-yt-border bg-yt-surface text-yt-text-muted hover:text-yt-text hover:bg-yt-surface-muted shadow-xs flex items-center justify-center transition active:scale-95 cursor-pointer"
            title="منطقة الوالدين"
            aria-label="منطقة الوالدين"
          >
            <Lock className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </button>
        </div>
      </header>
    );
  }

  /* =========================================================================
   * 2. EXPANDED VIEW: Full Header Stack (Brand, Love, Lock, and Full Search)
   * ========================================================================= */
  return (
    <header className="px-3.5 sm:px-8 py-2 sm:py-3 transition-all duration-200">
      <div className="max-w-7xl mx-auto space-y-2 sm:space-y-2.5">
        {/* Top row: Brand wordmark at start, Favorites & Parent lock at end */}
        <div className="flex items-center justify-between">
          {/* Start (RTL: right side) - brand wordmark */}
          <div className="flex items-center gap-2">
            <YoungTubeWordmark />
          </div>

          {/* End (RTL: left side) - Downloads, Heart (favorites) & Lock (parents) buttons */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {onOpenDownloads && (
              <button
                id="kid-downloads-open-btn"
                type="button"
                onClick={onOpenDownloads}
                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full border border-yt-border bg-yt-surface text-yt-text-muted hover:text-yt-brand hover:bg-yt-brand-soft shadow-xs flex items-center justify-center transition active:scale-95 cursor-pointer"
                title="التنزيلات"
                aria-label="التنزيلات"
              >
                <FolderDown className="w-5 h-5" />
              </button>
            )}

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
        <div ref={searchContainerRef} className="relative w-full">
          <div className="relative flex items-center">
            <input
              id="kid-feed-search-input"
              type="text"
              value={searchInput}
              onChange={(e) => {
                onSearchChange(e.target.value);
                setShowSuggestions(e.target.value.trim().length >= 1);
              }}
              onFocus={() => {
                if (searchInput.trim().length >= 1) setShowSuggestions(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowSuggestions(false);
                }
              }}
              placeholder="ابحث في الفيديوهات المسموحة..."
              className="w-full pl-10 pr-11 py-2 sm:py-2.5 rounded-full bg-yt-surface-muted border border-yt-border text-xs sm:text-sm text-yt-text placeholder-yt-text-muted focus:outline-hidden focus:bg-yt-surface focus:ring-2 focus:ring-yt-brand/25 focus:border-yt-brand shadow-xs transition-all font-medium"
            />
            <div className="absolute right-3.5 text-yt-text-muted pointer-events-none flex items-center justify-center">
              <Search className="w-4 h-4" />
            </div>
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  onClearSearch();
                  setShowSuggestions(false);
                }}
                className="absolute left-3 text-yt-text-muted hover:text-yt-text p-1 rounded-full hover:bg-yt-border/50 transition cursor-pointer"
                title="مسح البحث"
                aria-label="مسح البحث"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {renderSuggestionsList()}
        </div>
      </div>
    </header>
  );
}

export default KidHeader;

