import React, { useEffect, useState, useCallback } from 'react';
import db from '../db';
import { WORKER_URL } from '../config';
import {
  filterAndCacheVideos,
  type FilteringResult,
  type ChannelItem,
} from '../filtering';
import {
  Filter,
  CheckCircle2,
  Music,
  VolumeX,
  ShieldAlert,
  Smartphone,
  RefreshCw,
  Layers,
  Sparkles,
} from 'lucide-react';

interface FilteringResultCardProps {
  channels: ChannelItem[] | null;
  refreshTrigger?: number;
}

interface DexieSummary {
  totalCached: number;
  activeCount: number;
  hiddenCount: number;
  hasMusicCount: number;
  noMusicCount: number;
  portraitCount: number;
  blacklistWordsCount: number;
}

export default function FilteringResultCard({
  channels,
  refreshTrigger = 0,
}: FilteringResultCardProps) {
  const [filtering, setFiltering] = useState(false);
  const [lastResult, setLastResult] = useState<FilteringResult | null>(null);
  const [hideMusic, setHideMusic] = useState(false);
  const [summary, setSummary] = useState<DexieSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  // 1) Read-only lightweight summary from Dexie (NEVER runs filterAndCacheVideos on mount)
  const loadDexieSummary = useCallback(async () => {
    try {
      setLoadingSummary(true);
      const [allRows, settings] = await Promise.all([
        db.feedCache.toArray(),
        db.settings.get('main'),
      ]);

      let hiddenCount = 0;
      let hasMusicCount = 0;
      let noMusicCount = 0;
      let portraitCount = 0;

      for (const item of allRows) {
        if (item.hidden === true) hiddenCount++;
        if (item.hasMusic === true) hasMusicCount++;
        if (item.hasMusic === false) noMusicCount++;
        if (item.isPortrait === true) portraitCount++;
      }

      const totalCached = allRows.length;
      const isHide = settings?.hideMusicVideos === true;
      setHideMusic(isHide);

      const activeCount = Math.max(0, totalCached - hiddenCount);
      const blacklistWordsCount = settings?.blacklistWords?.length || 0;

      setSummary({
        totalCached,
        activeCount,
        hiddenCount,
        hasMusicCount,
        noMusicCount,
        portraitCount,
        blacklistWordsCount,
      });
    } catch (err) {
      console.error('Failed to read Dexie summary in FilteringResultCard:', err);
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  useEffect(() => {
    loadDexieSummary();
  }, [loadDexieSummary, refreshTrigger]);

  // 2) Explicit filter recalculation triggered ONLY by explicit user button click
  const handleExplicitRecalculate = async () => {
    setFiltering(true);
    try {
      let activeChannels = channels;

      if (!activeChannels || activeChannels.length === 0) {
        try {
          let resp: Response;
          try {
            resp = await fetch(`${WORKER_URL}/api/channels-latest`);
          } catch {
            resp = await fetch('/api/channels-latest');
          }
          if (resp.ok) {
            const data = await resp.json();
            if (Array.isArray(data) && data.length > 0) {
              activeChannels = data;
            }
          }
        } catch (e) {
          console.warn('FilteringResultCard fallback fetch error:', e);
        }
      }

      if (activeChannels && activeChannels.length > 0) {
        const res = await filterAndCacheVideos(activeChannels);
        setLastResult(res);
      }

      // Re-read lightweight counts from Dexie after recalculation completes
      await loadDexieSummary();
    } catch (err) {
      console.error('Filtering calculation error:', err);
    } finally {
      setFiltering(false);
    }
  };

  // 3) Music filter toggle (persists setting only, no implicit heavy re-filter)
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
  };

  return (
    <div
      id="filtering-result-card"
      className="rounded-2xl border border-yt-border bg-yt-surface p-4 sm:p-5 shadow-sm flex flex-col justify-between space-y-4"
    >
      <div>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-yt-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-yt-brand text-yt-brand-text flex items-center justify-center shrink-0 shadow-sm">
              <Filter className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-yt-text">ملخص الفلترة والحماية</h2>
              <span className="text-[11px] text-yt-text-muted font-mono">Client-Side Summary (Dexie)</span>
            </div>
          </div>

          <button
            id="re-filter-btn"
            type="button"
            onClick={handleExplicitRecalculate}
            disabled={filtering}
            className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-yt-brand hover:bg-yt-brand-hover text-yt-brand-text text-xs font-bold transition duration-150 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            title="إعادة فحص وتطبيق معايير الفلترة على الفيديوهات"
          >
            <RefreshCw className={`w-4 h-4 ${filtering ? 'animate-spin' : ''}`} />
            <span>{filtering ? 'جاري الفلترة...' : 'تطبيق الفلترة الآن'}</span>
          </button>
        </div>

        {/* State Display */}
        {filtering ? (
          <div className="p-4 rounded-xl bg-yt-brand-soft border border-yt-brand/30 text-xs text-yt-text animate-pulse flex items-center gap-2.5 font-bold">
            <RefreshCw className="w-4 h-4 animate-spin text-yt-brand shrink-0" />
            <span>جاري فحص وتطبيق معايير الأمان (Shorts، الكلمات المحظورة، الموسيقى)...</span>
          </div>
        ) : loadingSummary ? (
          <div className="p-4 rounded-xl bg-yt-surface-muted border border-yt-border text-xs text-yt-text-muted animate-pulse flex items-center gap-2">
            <Layers className="w-4 h-4 text-yt-text-muted shrink-0 animate-spin" />
            <span>جاري قراءة إحصائيات الذاكرة المحلية...</span>
          </div>
        ) : summary ? (
          <div className="space-y-4">
            {/* Primary Counts 2x2 Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl bg-yt-surface-muted border border-yt-border text-center space-y-0.5">
                <span className="text-[10px] text-yt-text-muted font-bold block">إجمالي بالذاكرة</span>
                <span className="text-base sm:text-lg font-extrabold text-yt-text font-mono">
                  {summary.totalCached}
                </span>
                <span className="text-[10px] text-yt-text-muted block">فيديو مفحوص</span>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/70 text-center space-y-0.5">
                <span className="text-[10px] text-emerald-700 font-bold block">مقبول ونشط</span>
                <span className="text-base sm:text-lg font-extrabold text-emerald-800 font-mono">
                  {summary.activeCount}
                </span>
                <span className="text-[10px] text-emerald-600 block">متاح للطفل</span>
              </div>

              <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200/70 text-center space-y-0.5">
                <span className="text-[10px] text-rose-700 font-bold block">مستبعد / محجوب</span>
                <span className="text-base sm:text-lg font-extrabold text-rose-800 font-mono">
                  {summary.hiddenCount}
                </span>
                <span className="text-[10px] text-rose-600 block">شورتس / محظور</span>
              </div>

              <div className="p-3 rounded-xl bg-yt-brand-soft border border-yt-brand/30 text-center space-y-0.5">
                <span className="text-[10px] text-yt-brand font-bold block">كلمات حظر نشطة</span>
                <span className="text-base sm:text-lg font-extrabold text-yt-text font-mono">
                  {summary.blacklistWordsCount}
                </span>
                <span className="text-[10px] text-yt-brand block">كلمة محددة</span>
              </div>
            </div>

            {/* Heuristic Breakdown Stats */}
            <div className="p-3.5 rounded-xl bg-yt-surface-muted border border-yt-border text-xs text-yt-text-muted space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                  <VolumeX className="w-3.5 h-3.5 text-emerald-600" />
                  فيديوهات بدون موسيقى:
                </span>
                <span className="font-bold text-emerald-700 font-mono">
                  {summary.noMusicCount} فيديو
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-yt-brand font-medium">
                  <Music className="w-3.5 h-3.5 text-yt-brand" />
                  فيديوهات تحتوي على موسيقى:
                </span>
                <span className="font-bold text-yt-brand font-mono">
                  {summary.hasMusicCount} فيديو
                </span>
              </div>

              {summary.portraitCount > 0 && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-yt-text-muted">
                    <Smartphone className="w-3.5 h-3.5 text-yt-text-muted" />
                    مستبعد (فيديوهات طولية / Portrait):
                  </span>
                  <span className="font-bold text-yt-text font-mono">
                    {summary.portraitCount}
                  </span>
                </div>
              )}

              {lastResult && (
                <div className="pt-2 border-t border-yt-border flex items-center justify-between text-[10px] text-yt-text-muted">
                  <span className="flex items-center gap-1 text-yt-text-muted font-medium">
                    <Sparkles className="w-3 h-3 text-yt-brand" />
                    آخر حساب كامل:
                  </span>
                  <span className="font-mono">
                    استبعاد {lastResult.breakdown.shortsExcluded} شورتس • {lastResult.breakdown.blacklistExcluded} كلمات
                  </span>
                </div>
              )}
            </div>

            {/* Music Filtering Checkbox */}
            <div className="mt-3 pt-3 border-t border-yt-border space-y-2">
              <label
                htmlFor="hide-music-checkbox"
                className="flex items-center gap-2.5 cursor-pointer select-none group min-h-[44px]"
              >
                <input
                  id="hide-music-checkbox"
                  type="checkbox"
                  checked={hideMusic}
                  onChange={handleMusicToggle}
                  className="w-5 h-5 rounded border-yt-border focus:ring-yt-brand cursor-pointer accent-yt-brand"
                />
                <div className="flex items-center gap-1.5 text-xs font-bold text-yt-text group-hover:text-yt-text transition">
                  <Music className="w-4 h-4 text-yt-text-muted" />
                  <span>إخفاء الفيديوهات ذات الموسيقى (Hide videos with music)</span>
                </div>
              </label>

              {hideMusic && (
                <div
                  id="music-filter-stat-box"
                  className="p-3 rounded-xl bg-yt-brand-soft border border-yt-brand/30 text-yt-text text-xs flex items-center justify-between transition-all"
                >
                  <div className="flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-yt-brand shrink-0" />
                    <span className="text-[11px] font-medium">
                      الفيديوهات ذات الموسيقى المحجوبة من خلاصة الطفل:
                    </span>
                  </div>
                  <span className="font-bold text-xs font-mono bg-yt-brand/20 px-2.5 py-0.5 rounded text-yt-text">
                    {summary.hasMusicCount} فيديو
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div className="pt-3 border-t border-yt-border flex items-center justify-between text-[11px] text-yt-text-muted">
        <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>معالجة محلية بالكامل دون إرسال بيانات الطفل خارجياً</span>
        </span>
        <span className="font-mono text-[10px] text-yt-text-muted">db.feedCache</span>
      </div>
    </div>
  );
}
