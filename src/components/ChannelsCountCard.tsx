import React, { useEffect, useState, useCallback, useRef } from 'react';
import { WORKER_URL } from '../config';
import { Tv, RefreshCw, CheckCircle2, AlertTriangle, Film, Layers } from 'lucide-react';

interface ChannelData {
  sourceId: string;
  sourceType: string;
  title: string;
  thumbnail?: string;
  categories?: string[];
  videos?: Array<{ videoId: string; title: string; publishedAt: string }>;
  videoCount?: number;
}

interface ChannelsCountCardProps {
  refreshTrigger?: number;
  onChannelsLoaded?: (channels: ChannelData[]) => void;
}

export default function ChannelsCountCard({
  refreshTrigger = 0,
  onChannelsLoaded,
}: ChannelsCountCardProps) {
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string>('');

  // Keep callback in a ref so fetch identity stays stable even if parent passes a new function
  const onChannelsLoadedRef = useRef(onChannelsLoaded);
  useEffect(() => {
    onChannelsLoadedRef.current = onChannelsLoaded;
  }, [onChannelsLoaded]);

  const fetchChannelsLatest = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let response: Response;
      try {
        response = await fetch(`${WORKER_URL}/api/channels-latest`);
      } catch {
        // Fallback to local dev server if remote worker is unreachable
        response = await fetch('/api/channels-latest');
      }

      if (!response.ok) {
        throw new Error(`كود الاستجابة: ${response.status}`);
      }

      const data = await response.json();
      if (Array.isArray(data)) {
        setChannels(data);
        onChannelsLoadedRef.current?.(data);
      } else {
        setChannels([]);
        onChannelsLoadedRef.current?.([]);
      }
      setLastChecked(new Date().toLocaleTimeString('ar-EG'));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'تعذر تحميل القنوات من /api/channels-latest'
      );
      setLastChecked(new Date().toLocaleTimeString('ar-EG'));
    } finally {
      setLoading(false);
    }
  }, []); // stable — no dependency on onChannelsLoaded

  useEffect(() => {
    fetchChannelsLatest();
  }, [fetchChannelsLatest, refreshTrigger]);

  const totalChannels = channels.length;
  const channelsWithVideos = channels.filter(
    (c) => (c.videos && c.videos.length > 0) || (c.videoCount && c.videoCount > 0)
  ).length;
  const totalVideos = channels.reduce(
    (sum, c) => sum + (c.videos?.length || c.videoCount || 0),
    0
  );

  return (
    <div
      id="channels-count-card"
      className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 shadow-2xs flex flex-col justify-between"
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-100/80 text-sky-700 flex items-center justify-center shrink-0">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-stone-900">أرشيف القنوات الحي</h2>
              <span className="text-[11px] text-stone-500 font-mono">/api/channels-latest</span>
            </div>
          </div>
          <button
            id="retest-channels-btn"
            onClick={fetchChannelsLatest}
            disabled={loading}
            className="min-h-[40px] px-3 py-1.5 rounded-xl text-stone-500 hover:text-stone-900 hover:bg-stone-100 border border-stone-200 transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            title="تحديث عدد القنوات"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-600' : ''}`} />
            <span className="hidden sm:inline">تحديث الأرشيف</span>
          </button>
        </div>

        {/* Status / Count Display */}
        {loading ? (
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/70 text-xs text-stone-600 animate-pulse flex items-center gap-2.5">
            <RefreshCw className="w-4 h-4 animate-spin text-stone-400 shrink-0" />
            <span>جاري جلب القنوات والبيانات المدمجة من السحابة...</span>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-950 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-amber-900 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>فشل فحص القنوات</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">{error}</p>
            <div className="text-[10px] text-amber-700 font-mono pt-0.5">
              آخر محاولة: {lastChecked}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-sky-50/60 border border-sky-200/80 text-sky-950 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-sky-950">
                <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0" />
                <span>إجمالي القنوات المُحمّلة: {totalChannels} قناة</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-200/80 text-sky-900">
                بيانات حية Live
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <div className="p-2.5 rounded-lg bg-white border border-sky-100 shadow-2xs space-y-0.5">
                <span className="text-[11px] text-stone-500 block">قنوات بأرشيف نشط</span>
                <span className="text-xs sm:text-sm font-bold text-sky-900">{channelsWithVideos} قناة</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-sky-100 shadow-2xs space-y-0.5">
                <span className="text-[11px] text-stone-500 block">إجمالي الفيديوهات</span>
                <span className="text-xs sm:text-sm font-bold text-sky-900">{totalVideos} فيديو</span>
              </div>
            </div>

            <div className="text-[10px] text-sky-800 font-mono pt-0.5">
              آخر تحديث ناجح: {lastChecked}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-stone-100">
        <div className="flex items-center justify-between text-[11px] text-stone-500">
          <span className="flex items-center gap-1 text-stone-600 font-medium">
            <Film className="w-3.5 h-3.5 text-sky-600" />
            <span>بحد أقصى 200 فيديو لكل قناة</span>
          </span>
          <span className="font-mono text-[10px] text-stone-400">Cloudflare KV + Seed</span>
        </div>
      </div>
    </div>
  );
}
