import React from 'react';
import { useAllCategories } from '../../hooks/useAllCategories';

export const CATEGORY_SHORT_NAMES: Record<string, string> = {
  all: 'الكل',
  quran: 'قرآن',
  stories: 'قصص',
  cartoons: 'كرتون',
  education: 'تعليم',
  science: 'علوم',
  crafts: 'فنون',
  sports: 'رياضة',
  gaming: 'ألعاب',
  cooking: 'طبخ',
  calm: 'هدوء',
};

export function getCategoryShortLabel(cat: { id: string; label: string; shortLabel?: string }): string {
  if (cat.shortLabel && cat.shortLabel.trim()) {
    return cat.shortLabel.trim();
  }
  if (CATEGORY_SHORT_NAMES[cat.id]) {
    return CATEGORY_SHORT_NAMES[cat.id];
  }
  const label = (cat.label || '').trim();
  if (label.length <= 15) {
    return label;
  }
  return label.slice(0, 14) + '…';
}

export interface CategoryChipsProps {
  selectedCategory: string;
  showFavorites: boolean;
  onSelectCategory: (categoryId: string) => void;
}

export function CategoryChips({
  selectedCategory,
  showFavorites,
  onSelectCategory,
}: CategoryChipsProps) {
  const { kidCategories } = useAllCategories();

  return (
    <section className="px-4 sm:px-8 py-2 sm:py-2.5">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          {kidCategories.map((cat) => {
            const isActive = !showFavorites && selectedCategory === cat.id;
            const shortLabel = getCategoryShortLabel(cat);
            return (
              <button
                key={cat.id}
                id={`cat-chip-${cat.id}`}
                type="button"
                title={cat.label}
                aria-label={cat.label}
                aria-pressed={isActive}
                onClick={() => onSelectCategory(cat.id)}
                className={`shrink-0 h-8 sm:h-8.5 px-3.5 flex items-center justify-center rounded-full text-xs sm:text-sm whitespace-nowrap transition-colors duration-150 active:scale-95 cursor-pointer select-none ${
                  isActive
                    ? 'bg-yt-text text-yt-text-inverse font-semibold'
                    : 'bg-yt-surface-muted hover:bg-yt-border/50 text-yt-text font-medium border border-yt-border/50'
                }`}
              >
                <span className="truncate">{shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default CategoryChips;
