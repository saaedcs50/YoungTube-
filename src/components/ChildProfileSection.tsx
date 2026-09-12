import React, { useState, useEffect, useRef } from 'react';
import db from '../db';
import { CURATION_CATEGORIES } from '../categories';
import { User, Heart, ShieldX, Check, Sparkles } from 'lucide-react';

interface ChildProfileSectionProps {
  onSaved?: () => void;
}

export const ChildProfileSection: React.FC<ChildProfileSectionProps> = ({ onSaved }) => {
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
    <div id="child-profile-section" className="space-y-6">
      {/* Header with save status indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <User className="w-4 h-4 text-amber-600" />
            <span>ملف الطفل والاهتمامات (Child Profile & Interests)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            خصص تجربة التطبيق بحسب عمر الطفل وتفضيلاته لتوجيه المحتوى المناسب وتفضيل أو تجنب مجالات معينة.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {saveStatus === 'saving' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              جاري الحفظ...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 animate-fade-in">
              <Check className="w-3 h-3 text-emerald-600" />
              تم الحفظ تلقائياً
            </span>
          )}
        </div>
      </div>

      {/* Name and Age Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
        <div className="space-y-1.5">
          <label htmlFor="child-name-input" className="text-xs font-semibold text-slate-700 block">
            اسم الطفل
          </label>
          <input
            id="child-name-input"
            type="text"
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            placeholder="مثال: يوسف، سارة..."
            className="w-full p-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 transition"
          />
          <span className="text-[10px] text-slate-400 block">
            يظهر في الترحيب وشاشات التشجيع
          </span>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="child-age-input" className="text-xs font-semibold text-slate-700 block">
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
            className="w-full p-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono transition"
          />
          <span className="text-[10px] text-slate-400 block">
            يساعد في موائمة نوعية الألعاب والأنشطة المناسبة
          </span>
        </div>
      </div>

      {/* Positive Interests Multi-select */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600/20" />
            <span>اهتمامات إيجابية (يُنصح بها وتظهر في الصدارة)</span>
          </label>
          <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
            {positiveInterests.length} محددة
          </span>
        </div>
        <p className="text-[11px] text-slate-500">
          اختر المجالات التي ترغب في تشجيع طفلك عليها لمضاعفة ظهورها واقتراحها.
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          {CURATION_CATEGORIES.map((cat) => {
            const isSelected = positiveInterests.includes(cat.id);
            return (
              <button
                key={`pos-${cat.id}`}
                id={`chip-pos-${cat.id}`}
                type="button"
                onClick={() => togglePositive(cat.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition active:scale-95 cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-600 text-white border border-emerald-600 shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-emerald-50/60 hover:border-emerald-300'
                }`}
              >
                <span>{cat.emoji}</span>
                <span>{cat.label}</span>
                {isSelected && <Check className="w-3 h-3 ml-0.5" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Negative Interests Multi-select */}
      <div className="space-y-2.5 pt-2 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <ShieldX className="w-3.5 h-3.5 text-rose-600" />
            <span>اهتمامات سلبية (مستبعدة أو غير مرغوبة)</span>
          </label>
          <span className="text-[11px] font-medium text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">
            {negativeInterests.length} محددة
          </span>
        </div>
        <p className="text-[11px] text-slate-500">
          اختر المجالات التي ترغب في تقليلها أو عدم عرض قنواتها لطفلك (اختيار قسم هنا يزيله تلقائياً من الإيجابي).
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          {CURATION_CATEGORIES.map((cat) => {
            const isSelected = negativeInterests.includes(cat.id);
            return (
              <button
                key={`neg-${cat.id}`}
                id={`chip-neg-${cat.id}`}
                type="button"
                onClick={() => toggleNegative(cat.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition active:scale-95 cursor-pointer ${
                  isSelected
                    ? 'bg-rose-600 text-white border border-rose-600 shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-rose-50/60 hover:border-rose-300'
                }`}
              >
                <span>{cat.emoji}</span>
                <span>{cat.label}</span>
                {isSelected && <Check className="w-3 h-3 ml-0.5" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
