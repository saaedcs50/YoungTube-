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
      className="col-span-full rounded-3xl border border-amber-200/90 bg-gradient-to-br from-amber-50/95 via-orange-50/70 to-amber-100/50 p-5 sm:p-7 shadow-[0_4px_16px_rgba(245,158,11,0.06)] transition-all duration-300"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-right">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-amber-200/70 text-amber-800 shadow-sm">
              <Sparkles className="w-5 h-5" />
            </span>
            <h2 className="text-lg sm:text-xl font-black text-amber-950">
              عايز نجرّب إيه الأسبوع ده؟ 🎨
            </h2>
          </div>
          <p className="text-xs sm:text-sm font-medium text-amber-900">
            اختر قسماً جديداً تحب تستكشف فيديوهاته وتتعلم منه هذا الأسبوع!
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-5">
        {offeredCategoryIds.map((catId) => {
          const cat = categoryMap.get(catId) || { label: catId, emoji: '✨' };
          return (
            <button
              key={`weekly-choice-${catId}`}
              id={`choice-btn-${catId}`}
              type="button"
              onClick={() => handleSelectCategory(catId)}
              className="p-4 sm:p-5 rounded-2xl bg-white/95 border border-amber-200/90 hover:border-amber-400 hover:bg-amber-50/80 active:scale-[0.98] shadow-sm hover:shadow-md transition-all duration-150 flex items-center justify-center gap-3 text-center cursor-pointer group"
            >
              <span className="text-3xl sm:text-4xl group-hover:scale-110 transition-transform duration-200">
                {cat.emoji}
              </span>
              <span className="text-base sm:text-lg font-black text-stone-800 group-hover:text-amber-900">
                {cat.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
