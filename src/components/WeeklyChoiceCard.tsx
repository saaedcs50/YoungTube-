import React, { useMemo } from 'react';
import db from '../db';
import { useAllCategories } from '../hooks/useAllCategories';
import { Sparkles } from 'lucide-react';
import { logChosen } from '../tasteShiftStorage';

interface WeeklyChoiceCardProps {
  targetCategories: string[];
  currentWeek: number;
  onChoiceMade: () => void;
}

/** Deterministic shuffle keyed by week so the same 3 options stay stable across reloads. */
function stablePickCategories(ids: string[], week: number, max = 3): string[] {
  if (ids.length <= max) return [...ids];
  const arr = [...ids];
  let seed = (week + 1) * 2654435761;
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, max);
}

export const WeeklyChoiceCard: React.FC<WeeklyChoiceCardProps> = ({
  targetCategories,
  currentWeek,
  onChoiceMade,
}) => {
  const { curationCategories } = useAllCategories();

  // Stable for the same currentWeek + target set (not Math.random)
  const offeredCategoryIds = useMemo(() => {
    return stablePickCategories(targetCategories, currentWeek, 3);
  }, [targetCategories.join(','), currentWeek]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, { label: string; emoji: string }>();
    for (const cat of curationCategories) {
      map.set(cat.id, { label: cat.label, emoji: cat.emoji });
    }
    return map;
  }, [curationCategories]);

  const handleSelectCategory = async (catId: string) => {
    try {
      const settings = await db.settings.get('main');
      if (settings?.tasteShift) {
        await db.settings.update('main', {
          tasteShift: {
            ...settings.tasteShift,
            activeCategoryThisWeek: catId,
            choiceWeekNumber: currentWeek,
          },
        });
        await logChosen(catId);
      }
      onChoiceMade();
    } catch (err) {
      console.error('Failed to save child weekly choice:', err);
    }
  };

  if (offeredCategoryIds.length === 0) {
    return null;
  }

  return (
    <div
      id="weekly-choice-card"
      className="col-span-full rounded-3xl border border-yt-border bg-yt-surface p-5 sm:p-6 shadow-xs transition-all duration-150 text-right"
    >
      <div className="space-y-1">
        <h2 className="text-lg sm:text-xl font-black text-yt-text">
          عايز نجرّب إيه الأسبوع ده؟
        </h2>
        <p className="text-xs sm:text-sm font-medium text-yt-text-muted">
          اختر قسماً تحب تستكشف فيديوهاته هذا الأسبوع!
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2.5 sm:gap-4 mt-4">
        {offeredCategoryIds.map((catId) => {
          const cat = categoryMap.get(catId) || { label: catId, emoji: '✨' };
          return (
            <button
              key={`weekly-choice-${catId}`}
              id={`choice-btn-${catId}`}
              type="button"
              onClick={() => handleSelectCategory(catId)}
              className="p-3.5 sm:p-5 rounded-2xl bg-yt-surface border border-yt-border hover:border-yt-brand hover:bg-yt-brand-soft/50 active:scale-[0.98] shadow-sm transition-all duration-150 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 text-center cursor-pointer group"
            >
              <span className="text-2xl sm:text-3xl">
                {cat.emoji}
              </span>
              <span className="text-xs sm:text-base font-extrabold text-yt-text group-hover:text-yt-brand transition-colors">
                {cat.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
