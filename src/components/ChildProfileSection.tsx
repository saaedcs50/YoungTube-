import React, { useState, useEffect, useRef } from 'react';
import db from '../db';
import { useAllCategories } from '../hooks/useAllCategories';
import { User, Heart, ShieldX, Check, Sparkles } from 'lucide-react';

interface ChildProfileSectionProps {
  onSaved?: () => void;
}

export const ChildProfileSection: React.FC<ChildProfileSectionProps> = ({ onSaved }) => {
  const { curationCategories } = useAllCategories();
  const [childName, setChildName] = useState<string>('');
  const [childAge, setChildAge] = useState<number | ''>('');
  const [positiveInterests, setPositiveInterests] = useState<string[]>([]);
  const [negativeInterests, setNegativeInterests] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');

  // Track if this is the first load to prevent saving defaults on mount
  const isFirstLoad = useRef(true);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load initial settings
  useEffect(() => {
    let isMounted = true;
    async function loadSettings() {
      try {
        const settings = await db.settings.get('main');
        if (settings && isMounted) {
          setChildName(settings.childName || '');
          setChildAge(settings.childAge !== undefined && settings.childAge !== null ? settings.childAge : '');
          setPositiveInterests(settings.positiveInterests || []);
          setNegativeInterests(settings.negativeInterests || []);
        }
      } catch (err) {
        console.error('Failed to load child profile settings:', err);
      } finally {
        if (isMounted) {
          setIsLoaded(true);
          // Wait a tick before enabling auto-save to ignore initial state setters
          setTimeout(() => {
            isFirstLoad.current = false;
          }, 100);
        }
      }
    }
    loadSettings();
    return () => {
      isMounted = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Debounced auto-save on change
  useEffect(() => {
    if (isFirstLoad.current || !isLoaded) return;

    setSaveStatus('saving');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const ageNum = typeof childAge === 'number' ? childAge : undefined;
        await db.settings.update('main', {
          childName: childName.trim(),
          childAge: ageNum,
          positiveInterests,
          negativeInterests,
        });
        setSaveStatus('saved');
        onSaved?.();
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (err) {
        console.error('Failed to auto-save child profile:', err);
        setSaveStatus('idle');
      }
    }, 500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [childName, childAge, positiveInterests, negativeInterests, isLoaded, onSaved]);

  const togglePositive = (catId: string) => {
    setPositiveInterests((prev) => {
      if (prev.includes(catId)) {
        return prev.filter((id) => id !== catId);
      } else {
        // A category can be picked in only one group at a time
        setNegativeInterests((neg) => neg.filter((id) => id !== catId));
        return [...prev, catId];
      }
    });
  };

  const toggleNegative = (catId: string) => {
    setNegativeInterests((prev) => {
      if (prev.includes(catId)) {
        return prev.filter((id) => id !== catId);
      } else {
        // A category can be picked in only one group at a time
        setPositiveInterests((pos) => pos.filter((id) => id !== catId));
        return [...prev, catId];
      }
    });
  };

  return (
    <div id="child-profile-section" className="space-y-5 max-w-4xl mx-auto">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200/80">
        <div>
          <h3 className="text-base sm:text-lg font-extrabold text-stone-900 flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <User className="w-4 h-4" />
            </span>
            <span>ملف الطفل والاهتمامات</span>
          </h3>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            خصص اسم الطفل وعمره واهتماماته المفضلة أو المستبعدة لتوجيه المحتوى والأنشطة المناسبة له.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {saveStatus === 'saving' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              جاري الحفظ...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              تم الحفظ تلقائياً
            </span>
          )}
          {saveStatus === 'idle' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold text-stone-400 bg-white border border-stone-200/70">
              حفظ فوري في الجهاز
            </span>
          )}
        </div>
      </div>

      {/* Card 1: Name and Age Inputs */}
      <div className="rounded-2xl border border-stone-200/70 bg-white p-4 sm:p-5 shadow-xs space-y-4">
        <h4 className="text-xs sm:text-sm font-bold text-stone-900">
          البيانات الأساسية للطفل
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="child-name-input" className="text-xs font-bold text-stone-700 block">
              اسم الطفل
            </label>
            <input
              id="child-name-input"
              type="text"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              placeholder="مثال: يوسف، سارة..."
              className="w-full min-h-[44px] px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-white focus:bg-white text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition"
            />
            <span className="text-[11px] text-stone-400 block">
              يظهر في عبارات الترحيب والتشجيع
            </span>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="child-age-input" className="text-xs font-bold text-stone-700 block">
              عمر الطفل (بالسنوات)
            </label>
            <input
              id="child-age-input"
              type="number"
              min="2"
              max="16"
              value={childAge}
              onChange={(e) => {
                const val = e.target.value;
                setChildAge(val === '' ? '' : Math.max(1, Math.min(18, Number(val))));
              }}
              placeholder="مثال: 6"
              className="w-full min-h-[44px] px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-white focus:bg-white text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 font-mono transition"
            />
            <span className="text-[11px] text-stone-400 block">
              يساعد في موائمة طبيعة المحتوى والأنشطة للمرحلة العمرية
            </span>
          </div>
        </div>
      </div>

      {/* Card 2: Positive Interests Multi-select */}
      <div className="rounded-2xl border border-stone-200/70 bg-white p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-1">
            <label className="text-xs sm:text-sm font-bold text-stone-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Heart className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600/30" />
              </span>
              <span>اهتمامات مفضلة وموصى بها</span>
            </label>
            <p className="text-xs text-stone-500">
              المجالات التي ترغب في تشجيع طفلك عليها لمضاعفة ظهورها واقتراحها في الخلاصة.
            </p>
          </div>
          <span className="self-start sm:self-auto text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl">
            {positiveInterests.length} محددة
          </span>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {curationCategories.map((cat) => {
            const isSelected = positiveInterests.includes(cat.id);
            return (
              <button
                key={`pos-${cat.id}`}
                id={`chip-pos-${cat.id}`}
                type="button"
                onClick={() => togglePositive(cat.id)}
                className={`min-h-[44px] flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition active:scale-[0.98] cursor-pointer select-none ${
                  isSelected
                    ? 'bg-emerald-600 text-white border border-emerald-600 shadow-xs'
                    : 'bg-stone-50 text-stone-700 border border-stone-200 hover:bg-emerald-50/60 hover:border-emerald-300'
                }`}
              >
                <span className="text-base">{cat.emoji}</span>
                <span>{cat.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 ml-0.5" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Card 3: Negative Interests Multi-select */}
      <div className="rounded-2xl border border-stone-200/70 bg-white p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-1">
            <label className="text-xs sm:text-sm font-bold text-stone-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <ShieldX className="w-3.5 h-3.5 text-rose-600" />
              </span>
              <span>اهتمامات مستبعدة أو غير مرغوبة</span>
            </label>
            <p className="text-xs text-stone-500">
              المجالات التي ترغب في تجنبها أو عدم ظهور قنواتها لطفلك (اختيار قسم هنا يزيله من المفضلة تلقائياً).
            </p>
          </div>
          <span className="self-start sm:self-auto text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-xl">
            {negativeInterests.length} محددة
          </span>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {curationCategories.map((cat) => {
            const isSelected = negativeInterests.includes(cat.id);
            return (
              <button
                key={`neg-${cat.id}`}
                id={`chip-neg-${cat.id}`}
                type="button"
                onClick={() => toggleNegative(cat.id)}
                className={`min-h-[44px] flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition active:scale-[0.98] cursor-pointer select-none ${
                  isSelected
                    ? 'bg-rose-600 text-white border border-rose-600 shadow-xs'
                    : 'bg-stone-50 text-stone-700 border border-stone-200 hover:bg-rose-50/60 hover:border-rose-300'
                }`}
              >
                <span className="text-base">{cat.emoji}</span>
                <span>{cat.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 ml-0.5" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
