import React, { useEffect, useState, useCallback } from 'react';
import db from '../db';
import {
  filterAndCacheVideos,
  getVideosWithMusicCount,
  type FilteringResult,
  type ChannelItem,
} from '../filtering';
import {
  Filter,
  CheckCircle2,
  AlertCircle,
  Music,
  VolumeX,
  Sparkles,
  ShieldAlert,
  Film,
  RefreshCw,
} from 'lucide-react';

interface FilteringResultCardProps {
  channels: ChannelItem[] | null;
  refreshTrigger?: number;
}

export default function FilteringResultCard({
  channels,
  refreshTrigger = 0,
}: FilteringResultCardProps) {
  const [filtering, setFiltering] = useState(false);
  const [result, setResult] = useState<FilteringResult | null>(null);
  const [hideMusic, setHideMusic] = useState(false);
  const [musicVideosCount, setMusicVideosCount] = useState<number | null>(null);
  const [loadingMusicCount, setLoadingMusicCount] = useState(false);

  // Load initial hideMusicVideos setting from db.settings
  useEffect(() => {
    let isMounted = true;
    async function loadSetting() {
      try {
        const settings = await db.settings.get('main');
        if (isMounted && settings) {
          const isHide = settings.hideMusicVideos === true;
          setHideMusic(isHide);
          if (isHide) {
            setLoadingMusicCount(true);
            const count = await getVideosWithMusicCount();
            if (isMounted) {
              setMusicVideosCount(count);
              setLoadingMusicCount(false);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load hideMusicVideos setting:', err);
      }
    }
    loadSetting();
    return () => {
      isMounted = false;
    };
  }, []);

  // Run filtering whenever channels data changes or refreshTrigger triggers
  const runFilter = useCallback(async () => {
    if (!channels || channels.length === 0) {
      setResult(null);
      return;
    }

    setFiltering(true);
    try {
      const res = await filterAndCacheVideos(channels);
      setResult(res);

      // If hideMusic is currently active, re-query the direct music count
      if (hideMusic) {
        const count = await getVideosWithMusicCount();
        setMusicVideosCount(count);
      }
    } catch (err) {
      console.error('Filtering error:', err);
    } finally {
      setFiltering(false);
    }
  }, [channels, hideMusic]);

  useEffect(() => {
    runFilter();
  }, [runFilter, refreshTrigger]);

  // When "Hide videos with music" checkbox is toggled
  const handleMusicToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setHideMusic(checked);

    try {
      const currentSettings = await db.settings.get('main');
      if (currentSettings) {
        await db.settings.update('main', { hideMusicVideos: checked });
      } else {
        await db.settings.put({
          id: 'main',
          blacklistWords: [],
          hideMusicVideos: checked,
        });
      }
    } catch (err) {
      console.error('Failed to save hideMusicVideos setting to db.settings:', err);
    }

    if (checked) {
      setLoadingMusicCount(true);
      try {
        // Direct query against db.feedCache
        const count = await getVideosWithMusicCount();
        setMusicVideosCount(count);
      } catch (err) {
        console.error('Failed to query db.feedCache for hasMusic:', err);
      } finally {
        setLoadingMusicCount(false);
      }
    } else {
      setMusicVideosCount(null);
    }
  };

  return (
    <div
      id="filtering-result-card"
      className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs flex flex-col justify-between"
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Filter className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">نتائج الفلترة والحماية</h2>
              <span className="text-xs text-slate-500 font-mono">Client-Side Engine (Dexie)</span>
            </div>
          </div>

          <button
            id="re-filter-btn"
            onClick={runFilter}
            disabled={filtering || !channels || channels.length === 0}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition disabled:opacity-50 cursor-pointer"
            title="إعادة تشغيل الفلترة"
          >
            <RefreshCw className={`w-4 h-4 ${filtering ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* State Display */}
        {filtering ? (
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-500 animate-pulse flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-slate-400 shrink-0" />
            جاري تطبيق معايير الأمان وفلترة الفيديوهات...
          </div>
        ) : !channels ? (
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-500 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
            في انتظار اكتمال تحميل القنوات من الـ Worker...
          </div>
        ) : channels.length === 0 ? (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            لا توجد فيديوهات للفلترة حالياً (القائمة المدمجة فارغة).
          </div>
        ) : result ? (
          <div className="space-y-3">
            {/* Primary Counts Grid */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
                <span className="text-[10px] text-slate-500 font-medium block">قبل الفلترة</span>
                <span className="text-sm sm:text-base font-bold text-slate-900 font-mono">
                  {result.totalBefore}
                </span>
                <span className="text-[9px] text-slate-400 block">فيديو</span>
              </div>

              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                <span className="text-[10px] text-emerald-700 font-medium block">بعد الفلترة</span>
                <span className="text-sm sm:text-base font-bold text-emerald-800 font-mono">
                  {result.totalAfterFilter}
                </span>
                <span className="text-[9px] text-emerald-600 block">مقبول في الذاكرة</span>
              </div>

              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-center">
                <span className="text-[10px] text-rose-700 font-medium block">المستبعد</span>
                <span className="text-sm sm:text-base font-bold text-rose-800 font-mono">
                  {result.excludedCount}
                </span>
                <span className="text-[9px] text-rose-600 block">شورتس / محظور</span>
              </div>
            </div>

            {/* Heuristic Breakdown Stats */}
            <div className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-100 text-[11px] text-slate-600 space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="flex items-center gap-1 text-slate-500">
                  <Film className="w-3 h-3 text-slate-400" />
                  مستبعد (Shorts):
                </span>
                <span className="font-bold text-slate-700 font-mono">
                  {result.breakdown.shortsExcluded}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="flex items-center gap-1 text-slate-500">
                  <ShieldAlert className="w-3 h-3 text-slate-400" />
                  مستبعد (قائمة الكلمات المحظورة):
                </span>
                <span className="font-bold text-slate-700 font-mono">
                  {result.breakdown.blacklistExcluded}
                </span>
              </div>
              {result.breakdown.hiddenExcluded > 0 && (
                <div className="flex items-center justify-between text-[10px]">
                  <span className="flex items-center gap-1 text-rose-500">
                    <ShieldAlert className="w-3 h-3 text-rose-400" />
                    مستبعد يدوياً (فيديوهات مخفية):
                  </span>
                  <span className="font-bold text-rose-700 font-mono">
                    {result.breakdown.hiddenExcluded}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-[10px]">
                <span className="flex items-center gap-1 text-slate-500">
                  <VolumeX className="w-3 h-3 text-emerald-600" />
                  فيديوهات بدون موسيقى:
                </span>
                <span className="font-bold text-emerald-700 font-mono">
                  {result.breakdown.noMusicCount}
                </span>
              </div>
            </div>

            {/* Music Filtering Checkbox (Requirement 6) */}
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
              <label
                htmlFor="hide-music-checkbox"
                className="flex items-center gap-2.5 cursor-pointer select-none group"
              >
                <input
                  id="hide-music-checkbox"
                  type="checkbox"
                  checked={hideMusic}
                  onChange={handleMusicToggle}
                  className="w-4 h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                />
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 group-hover:text-slate-900 transition">
                  <Music className="w-3.5 h-3.5 text-slate-500" />
                  <span>إخفاء الفيديوهات ذات الموسيقى (Hide videos with music)</span>
                </div>
              </label>

              {/* Direct query against db.feedCache result shown below */}
              {hideMusic && (
                <div
                  id="music-filter-stat-box"
                  className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-900 text-xs flex items-center justify-between transition-all"
                >
                  <div className="flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span className="text-[11px] font-medium">
                      فيديوهات بموسيقى في الذاكرة (Direct Dexie Query):
                    </span>
                  </div>
                  <span className="font-bold text-xs font-mono bg-amber-200/60 px-2 py-0.5 rounded text-amber-950">
                    {loadingMusicCount ? (
                      <span className="animate-pulse">...</span>
                    ) : (
                      `${musicVideosCount ?? 0} فيديو (hasMusic: true)`
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1 text-emerald-700 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>خصوصية عائلية تامة (معالجة بالكامل محلياً)</span>
          </span>
          <span className="font-mono text-[10px] text-slate-400">db.feedCache</span>
        </div>
      </div>
    </div>
  );
}
