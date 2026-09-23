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
    <section className="px-4 sm:px-8 py-3.5">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-2 sm:gap-2.5 overflow-x-auto pb-1 scrollbar-none">
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
                className={`shrink-0 flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2 rounded-full text-xs sm:text-sm whitespace-nowrap transition duration-150 active:scale-[0.98] cursor-pointer ${
                  isActive
                    ? 'bg-yt-brand hover:bg-yt-brand-hover text-yt-brand-text font-bold shadow-md shadow-yt-brand/25 ring-2 ring-yt-brand/20'
                    : 'bg-yt-surface text-yt-text-muted border border-yt-border hover:bg-yt-surface-muted hover:border-yt-border'
                }`}
              >
                <span className="text-base leading-none select-none">{cat.emoji || '✨'}</span>
                <span className="truncate max-w-[120px] sm:max-w-none">{shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default CategoryChips;
