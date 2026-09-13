import React, { useMemo } from 'react';
import db from '../db';
import { useAllCategories } from '../hooks/useAllCategories';
import { Sparkles } from 'lucide-react';

interface WeeklyChoiceCardProps {
  targetCategories: string[];
  currentWeek: number;
  onChoiceMade: () => void;
}

export const WeeklyChoiceCard: React.FC<WeeklyChoiceCardProps> = ({
  targetCategories,
  currentWeek,
  onChoiceMade,
}) => {
  const { curationCategories } = useAllCategories();

  // Pick up to 3 at random, stable for the session/currentWeek
  const offeredCategoryIds = useMemo(() => {
    if (targetCategories.length <= 3) {
      return targetCategories;
    }
    const shuffled = [...targetCategories].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      className="col-span-full rounded-3xl border-2 border-amber-300/80 bg-gradient-to-br from-amber-50/90 via-orange-50/60 to-amber-100/40 p-6 sm:p-7 shadow-sm transition-all duration-300"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-right">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-amber-200/60 text-amber-800">
              <Sparkles className="w-5 h-5" />
            </span>
            <h2 className="text-lg sm:text-xl font-black text-amber-950">
              عايز نجرّب إيه الأسبوع ده؟ 🎨
            </h2>
          </div>
          <p className="text-xs sm:text-sm font-medium text-amber-800/80">
            اختر قسماً جديداً تحب تستكشف فيديوهاته وتتعلم منه هذا الأسبوع!
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4 mt-5">
        {offeredCategoryIds.map((catId) => {
          const cat = categoryMap.get(catId) || { label: catId, emoji: '✨' };
          return (
            <button
              key={`weekly-choice-${catId}`}
              id={`choice-btn-${catId}`}
              type="button"
              onClick={() => handleSelectCategory(catId)}
              className="p-5 sm:p-6 rounded-2xl bg-white border-2 border-amber-200 hover:border-amber-400 hover:bg-amber-50/70 active:scale-95 shadow-xs hover:shadow-md transition-all duration-150 flex items-center justify-center gap-3 text-center cursor-pointer group"
            >
              <span className="text-3xl sm:text-4xl group-hover:scale-115 transition-transform duration-200">
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
