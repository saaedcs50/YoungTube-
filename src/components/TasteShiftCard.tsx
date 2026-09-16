import React, { useState, useEffect, useRef, useMemo } from 'react';
import db from '../db';
import { useAllCategories } from '../hooks/useAllCategories';
import channelsSeed from '../../channels_seed.json';
import { TrendingUp, Check, ThumbsUp, ThumbsDown, Sparkles, Sliders } from 'lucide-react';

interface TasteShiftCardProps {
  onSaved?: () => void;
}

const SPEED_OPTIONS = [
  { label: 'بطيء', percent: 5, desc: '5% أسبوعياً' },
  { label: 'متوسط', percent: 10, desc: '10% أسبوعياً' },
  { label: 'سريع', percent: 20, desc: '20% أسبوعياً' },
];

const CAP_OPTIONS = [
  { label: 'خفيف', percent: 20, desc: '20% كحد أقصى' },
  { label: 'متوسط', percent: 40, desc: '40% كحد أقصى' },
  { label: 'كبير', percent: 60, desc: '60% كحد أقصى' },
];

export const TasteShiftCard: React.FC<TasteShiftCardProps> = ({ onSaved }) => {
  const { curationCategories } = useAllCategories();

  const [enabled, setEnabled] = useState<boolean>(false);
  const [targetCategories, setTargetCategories] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<string>('');
  const [weeklyStepPercent, setWeeklyStepPercent] = useState<number>(10);
  const [capPercent, setCapPercent] = useState<number>(40);

  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');

  const [reactionStats, setReactionStats] = useState<{
    likedCount: number;
    dislikedCount: number;
    distinctCount: number;
  } | null>(null);

  const [categoryStats, setCategoryStats] = useState<
    Array<{
      id: string;
      effectiveShare: number;
      totalAccepted: number;
      totalRejected: number;
      totalShown: number;
      cooldownUntil?: number;
    }>
  >([]);

  const isFirstLoad = useRef(true);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load initial settings
  useEffect(() => {
    let isMounted = true;
    async function loadSettings() {
      try {
        const settings = await db.settings.get('main');
        if (settings && isMounted) {
          if (settings.tasteShift) {
            setEnabled(!!settings.tasteShift.enabled);
            setTargetCategories(settings.tasteShift.targetCategories || []);
            setStartDate(settings.tasteShift.startDate || '');
            setWeeklyStepPercent(settings.tasteShift.weeklyStepPercent ?? 10);
            setCapPercent(settings.tasteShift.capPercent ?? 40);
            const pc = settings.tasteShift.perCategory || {};
            const stats = (settings.tasteShift.targetCategories || []).map((id) => {
              const s = pc[id];
              return {
                id,
                effectiveShare: s?.effectiveShare ?? 0,
                totalAccepted: s?.totalAccepted ?? 0,
                totalRejected: s?.totalRejected ?? 0,
                totalShown: s?.totalShown ?? 0,
                cooldownUntil: s?.cooldownUntil,
              };
            });
            setCategoryStats(stats);
          }
        }
      } catch (err) {
        console.error('Failed to load taste shift settings:', err);
      } finally {
        if (isMounted) {
          setIsLoaded(true);
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

  // Compute live currentWeek and currentTargetShare
  const { currentWeek, currentTargetShare } = useMemo(() => {
    const parseTime = startDate ? Date.parse(startDate) : Date.now();
    const validTime = Number.isNaN(parseTime) ? Date.now() : parseTime;
    const diffMs = Math.max(0, Date.now() - validTime);
    const week = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
    const targetShare = Math.min(capPercent, weeklyStepPercent * (week + 1));
    return {
      currentWeek: week,
      currentTargetShare: targetShare,
    };
  }, [startDate, capPercent, weeklyStepPercent]);

  // Query reaction summary for interactions in the last 7 days intersecting targetCategories
  useEffect(() => {
    if (!isLoaded || targetCategories.length === 0) {
      setReactionStats(null);
      return;
    }

    let isMounted = true;
    async function computeReactions() {
      try {
        const targetSet = new Set(targetCategories);
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

        // Pre-build channel categories lookup map
        const channelCatMap = new Map<string, string[]>();
        for (const seed of channelsSeed as Array<{ sourceId: string; categories?: string[] }>) {
          if (seed.sourceId && seed.categories) {
            channelCatMap.set(seed.sourceId, seed.categories);
          }
        }

        const dbChannels = await db.channels.toArray();
        for (const c of dbChannels) {
          if (c.sourceId && c.category) {
            channelCatMap.set(c.sourceId, c.category);
          }
        }

        const allInteractions = await db.interactions.toArray();
        const recentInteractions = allInteractions.filter(
          (item) => (item.lastWatched || 0) >= sevenDaysAgo && item.childReaction
        );

        let liked = 0;
        let disliked = 0;
        const distinctVideos = new Set<string>();

        for (const item of recentInteractions) {
          let channelId = item.channelId;
          if (!channelId && item.videoId) {
            const feed = await db.feedCache.get(item.videoId);
            if (feed) channelId = feed.channelId;
          }

          const categories = (channelId ? channelCatMap.get(channelId) : []) || [];
          const hasIntersection = categories.some((cat) => targetSet.has(cat));

          if (hasIntersection) {
            if (item.childReaction === 'liked') liked++;
            if (item.childReaction === 'disliked') disliked++;
            if (item.videoId) distinctVideos.add(item.videoId);
          }
        }

        if (isMounted) {
          if (liked > 0 || disliked > 0 || distinctVideos.size > 0) {
            setReactionStats({
              likedCount: liked,
              dislikedCount: disliked,
              distinctCount: distinctVideos.size,
            });
          } else {
            setReactionStats(null);
          }
        }
      } catch (err) {
        console.error('Failed to compute reaction summary:', err);
      }
    }

    computeReactions();

    return () => {
      isMounted = false;
    };
  }, [isLoaded, targetCategories]);

  // Debounced auto-save on changes — MUST preserve child's weekly choice fields
  useEffect(() => {
    if (isFirstLoad.current || !isLoaded) return;

    setSaveStatus('saving');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const existing = await db.settings.get('main');
        const prev = existing?.tasteShift;
        await db.settings.update('main', {
          tasteShift: {
            enabled,
            targetCategories,
            startDate,
            weeklyStepPercent,
            capPercent,
            // Preserve child's weekly selection + adaptive stats
            activeCategoryThisWeek: prev?.activeCategoryThisWeek,
            choiceWeekNumber: prev?.choiceWeekNumber,
            perCategory: prev?.perCategory,
          },
        });
        setSaveStatus('saved');
        onSaved?.();
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (err) {
        console.error('Failed to save taste shift settings:', err);
        setSaveStatus('idle');
      }
    }, 500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [enabled, targetCategories, startDate, weeklyStepPercent, capPercent, isLoaded, onSaved]);

  const handleToggle = () => {
    const nextEnabled = !enabled;
    let nextStart = startDate;
    if (nextEnabled && !nextStart) {
      nextStart = new Date().toISOString();
      setStartDate(nextStart);
    }
    setEnabled(nextEnabled);
  };

  const toggleCategory = (catId: string) => {
    setTargetCategories((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  return (
    <div id="taste-shift-card" className="space-y-5 max-w-4xl mx-auto">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200/80">
        <div>
          <h3 className="text-base sm:text-lg font-extrabold text-stone-900 flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
              <TrendingUp className="w-4 h-4" />
            </span>
            <span>التحول التدريجي في الاهتمامات (Taste Shift)</span>
          </h3>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            إدخال أقسام واهتمامات جديدة تدريجياً لفتح آفاق الطفل بنسب تتصاعد أسبوعياً.
          </p>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {saveStatus === 'saving' && (
            <span className="text-[11px] text-amber-900 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 animate-pulse font-bold">
              جاري الحفظ...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-[11px] text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1 font-bold">
              <Check className="w-3.5 h-3.5 text-emerald-600" /> تم الحفظ
            </span>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200/70 bg-white p-4 sm:p-5 shadow-sm space-y-4">
        {/* Main Toggle Banner */}
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-stone-50 border border-stone-200/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <span className="text-xs font-extrabold text-stone-900 block">تفعيل خاصية التحول الذكي</span>
              <span className="text-[11px] text-stone-500 block">تعديل توصيات التنوع تلقائياً في خلاصة الطفل</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs font-bold ${enabled ? 'text-amber-700' : 'text-stone-400'}`}>
              {enabled ? 'مفعل' : 'معطل'}
            </span>
            <button
              id="toggle-taste-shift"
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={handleToggle}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                enabled ? 'bg-amber-500' : 'bg-stone-300'
              }`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  enabled ? '-translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Rest of the card: visually disabled (opacity-50, non-interactive) when off */}
        <div
          className={`space-y-4 transition-opacity duration-200 ${
            !enabled ? 'opacity-50 pointer-events-none select-none' : ''
          }`}
        >
          {/* 2. Multi-select category chips for targetCategories */}
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span>الأقسام المستهدفة للتحول (Target Categories)</span>
              </label>
              <span className="text-[11px] font-bold text-amber-900 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                {targetCategories.length} قسم محدد
              </span>
            </div>
            <p className="text-xs text-stone-500">
              اختر المجالات الجديدة التي ترغب في إدخالها للطفل تدريجياً ليتعود عليها ويستكشفها.
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              {curationCategories.map((cat) => {
                const isSelected = targetCategories.includes(cat.id);
                return (
                  <button
                    key={`target-${cat.id}`}
                    id={`chip-taste-${cat.id}`}
                    type="button"
                    onClick={() => toggleCategory(cat.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer min-h-[44px] ${
                      isSelected
                        ? 'bg-amber-500 text-white border border-amber-500 shadow-sm'
                        : 'bg-stone-50 text-stone-700 border border-stone-200/80 hover:bg-amber-50/60 hover:border-amber-300'
                    }`}
                  >
                    <span>{cat.emoji}</span>
                    <span>{cat.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 ml-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Controls Grid: Speed & Cap Segmented Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-stone-100">
            {/* 3. 3-option segmented control "سرعة التغيير": بطيء (5) / متوسط (10) / سريع (20) */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-amber-600" />
                <span>سرعة التغيير (الزيادة الأسبوعية)</span>
              </label>
              <div
                id="segmented-speed"
                className="grid grid-cols-3 p-1 bg-stone-100/80 rounded-xl border border-stone-200/80 gap-1"
              >
                {SPEED_OPTIONS.map((opt) => {
                  const isActive = weeklyStepPercent === opt.percent;
                  return (
                    <button
                      key={`speed-${opt.percent}`}
                      id={`speed-opt-${opt.percent}`}
                      type="button"
                      onClick={() => setWeeklyStepPercent(opt.percent)}
                      className={`py-2 px-2 text-xs font-bold rounded-lg transition-all text-center cursor-pointer min-h-[44px] flex flex-col justify-center ${
                        isActive
                          ? 'bg-white text-amber-900 shadow-sm border border-stone-200/80'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      <div>{opt.label}</div>
                      <div className="text-[10px] opacity-75">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Second 3-option segmented control "أقصى نسبة": خفيف (20) / متوسط (40) / كبير (60) */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-amber-600" />
                <span>أقصى نسبة للمحتوى المقترح (Cap)</span>
              </label>
              <div
                id="segmented-cap"
                className="grid grid-cols-3 p-1 bg-stone-100/80 rounded-xl border border-stone-200/80 gap-1"
              >
                {CAP_OPTIONS.map((opt) => {
                  const isActive = capPercent === opt.percent;
                  return (
                    <button
                      key={`cap-${opt.percent}`}
                      id={`cap-opt-${opt.percent}`}
                      type="button"
                      onClick={() => setCapPercent(opt.percent)}
                      className={`py-2 px-2 text-xs font-bold rounded-lg transition-all text-center cursor-pointer min-h-[44px] flex flex-col justify-center ${
                        isActive
                          ? 'bg-white text-amber-900 shadow-sm border border-stone-200/80'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      <div>{opt.label}</div>
                      <div className="text-[10px] opacity-75">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 5. Read-only status line, computed live (not stored) */}
          <div
            id="taste-shift-status-line"
            className="rounded-xl bg-amber-50/70 border border-amber-200/80 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-amber-950"
          >
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-amber-900">حالة خطة التحول:</div>
              <div className="text-sm font-extrabold text-amber-900">
                الأسبوع {currentWeek + 1} — النسبة الحالية: {currentTargetShare}%
              </div>
            </div>
            <div className="text-xs text-amber-800/90 font-bold sm:text-left font-mono">
              الحد الأقصى المبرمج: {capPercent}% • معدل النمو: +{weeklyStepPercent}% أسبوعياً
            </div>
          </div>

          {/* 6. Reaction summary, shown only if there's at least one relevant interaction */}
          {reactionStats && (
            <div
              id="taste-shift-reaction-summary"
              className="rounded-xl bg-stone-50 border border-stone-200/70 p-3.5 space-y-2 text-xs text-stone-700"
            >
              <div className="font-bold text-stone-900 flex items-center gap-1.5">
                <span>تفاعل الطفل مع المحتوى الجديد المقترح</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-stone-800">
                  <span>تقييم الطفل هذا الأسبوع:</span>
                  <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    <ThumbsUp className="w-3.5 h-3.5 text-emerald-600" /> {reactionStats.likedCount}
                  </span>
                  <span>/</span>
                  <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                    <ThumbsDown className="w-3.5 h-3.5 text-rose-600" /> {reactionStats.dislikedCount}
                  </span>
                </div>
                <div className="text-stone-600 bg-white px-2.5 py-1 rounded-lg border border-stone-200/80 font-medium">
                  عدد الفيديوهات المعروضة: <span className="font-bold text-stone-900 font-mono">{reactionStats.distinctCount}</span>
                </div>
              </div>
            </div>
          )}

          {/* 7. Per-category adaptive stats (Phase B) */}
          {categoryStats.length > 0 && (
            <div
              id="taste-shift-per-category-stats"
              className="rounded-xl bg-stone-50/50 border border-stone-200/70 p-3.5 space-y-2"
            >
              <div className="text-xs font-bold text-stone-900">إحصائيات الأقسام المستهدفة</div>
              <div className="space-y-2">
                {categoryStats.map((s) => {
                  const cat = curationCategories.find((c) => c.id === s.id);
                  const onCooldown = s.cooldownUntil && s.cooldownUntil > Date.now();
                  return (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-xs border border-stone-200/80 rounded-xl px-3.5 py-2.5 bg-white"
                    >
                      <span className="font-bold text-stone-800">
                        {cat ? `${cat.emoji} ${cat.label}` : s.id}
                      </span>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-600">
                        <span className="bg-amber-50 text-amber-900 border border-amber-200/70 px-2 py-0.5 rounded-md font-bold font-mono">
                          نسبة فعّالة {s.effectiveShare}%
                        </span>
                        <span className="text-emerald-700 font-bold">✓ {s.totalAccepted}</span>
                        <span className="text-rose-700 font-bold">✗ {s.totalRejected}</span>
                        <span className="text-stone-500 font-mono">عُرض {s.totalShown}</span>
                        {onCooldown && (
                          <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md font-bold">
                            متوقف مؤقتًا
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
