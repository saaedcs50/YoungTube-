import React, { useState } from 'react';
import db from '../db';
import { KID_CATEGORIES } from '../data/categoryRegistry';
import { useAllCategories, generateUniqueCategoryId } from '../hooks/useAllCategories';
import { Plus, Trash2, FolderPlus, Sparkles, Tag } from 'lucide-react';

const COMMON_EMOJIS = [
  '⭐', '🎨', '🚀', '🐱', '🦕', '🧩', '⚽', '📚', 
  '🎯', '🌈', '🍦', '🤖', '🎬', '🏆', '🎮', '💡', 
  '🧪', '🌍', '🕌', '🎵', '🚗', '🦄'
];

interface CustomCategoryManagerProps {
  onChanged?: () => void;
}

export const CustomCategoryManager: React.FC<CustomCategoryManagerProps> = ({ onChanged }) => {
  const { customCategories } = useAllCategories();
  const [labelInput, setLabelInput] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('⭐');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLabel = labelInput.trim();
    if (!cleanLabel) {
      setErrorMessage('يرجى إدخال اسم التصنيف');
      return;
    }

    try {
      setErrorMessage(null);
      const existingCustom = await db.customCategories.toArray();
      const existingIds = new Set<string>([
        ...KID_CATEGORIES.map((c) => c.id),
        ...existingCustom.map((c) => c.categoryId),
      ]);

      const categoryId = generateUniqueCategoryId(cleanLabel, existingIds);

      await db.customCategories.add({
        categoryId,
        label: cleanLabel,
        emoji: selectedEmoji,
      });

      setLabelInput('');
      setSelectedEmoji('⭐');
      onChanged?.();
    } catch (err) {
      console.error('Failed to create custom category:', err);
      setErrorMessage('حدث خطأ أثناء إنشاء التصنيف الجديد');
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    try {
      // 1. Remove from customCategories table
      await db.customCategories.where('categoryId').equals(catId).delete();

      // 2. Remove categoryId from every channel in db.channels
      const affectedChannels = await db.channels.where('category').equals(catId).toArray();
      for (const ch of affectedChannels) {
        if (ch.id) {
          const nextCats = (ch.category || []).filter((c) => c !== catId);
          await db.channels.update(ch.id, { category: nextCats });
        }
      }

      onChanged?.();
    } catch (err) {
      console.error('Failed to delete custom category:', err);
    }
  };

  return (
    <div id="custom-category-manager" className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <FolderPlus className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-xs sm:text-sm font-bold text-amber-950">
            إنشاء تصنيف جديد (Custom Category)
          </h4>
          <p className="text-[11px] text-amber-800">
            أضف تصنيفات خاصة بعائلتك وتظهر كفلتر مستمر في واجهة الطفل وعند تصنيف القنوات.
          </p>
        </div>
      </div>

      <form onSubmit={handleCreateCategory} className="space-y-3">
        {/* Label Input */}
        <div className="space-y-1">
          <label htmlFor="custom-cat-label-input" className="text-xs font-semibold text-stone-700 block">
            اسم التصنيف الجديد:
          </label>
          <input
            id="custom-cat-label-input"
            type="text"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            placeholder="مثال: تجارب علمية، رحلات استكشاف، لغة إنجليزية..."
            className="w-full p-2.5 text-xs sm:text-sm rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition"
          />
        </div>

        {/* Emoji Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-stone-700 block">
            اختر أيقونة (Emoji):
          </label>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-white/80 rounded-xl border border-stone-200/80">
            {COMMON_EMOJIS.map((emoji) => {
              const isSelected = selectedEmoji === emoji;
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setSelectedEmoji(emoji)}
                  className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition cursor-pointer active:scale-95 ${
                    isSelected
                      ? 'bg-amber-500 text-white shadow-sm scale-105'
                      : 'hover:bg-amber-100/60 text-stone-700'
                  }`}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        </div>

        {errorMessage && (
          <p className="text-xs text-rose-600 font-semibold">{errorMessage}</p>
        )}

        <button
          id="create-custom-cat-btn"
          type="submit"
          disabled={!labelInput.trim()}
          className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>إنشاء التصنيف</span>
        </button>
      </form>

      {/* List of existing Custom Categories */}
      {customCategories.length > 0 && (
        <div className="pt-3 border-t border-amber-200/60 space-y-2">
          <h5 className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-amber-700" />
            <span>التصنيفات المخصصة الحالية ({customCategories.length}):</span>
          </h5>

          <div className="flex flex-wrap gap-2">
            {customCategories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-amber-200 text-xs text-stone-800 shadow-sm"
              >
                <span>{cat.emoji}</span>
                <span className="font-bold">{cat.label}</span>
                <span className="text-[10px] font-mono text-stone-400">({cat.id})</span>
                <button
                  type="button"
                  onClick={() => handleDeleteCategory(cat.id)}
                  className="p-1 rounded-full text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                  title="حذف التصنيف"
                  aria-label={`حذف تصنيف ${cat.label}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
