import React, { useEffect, useState, useCallback } from 'react';
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
        onChannelsLoaded?.(data);
      } else {
        setChannels([]);
        onChannelsLoaded?.([]);
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
  }, [onChannelsLoaded]);

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
      className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs flex flex-col justify-between"
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">أرشيف القنوات</h2>
              <span className="text-xs text-slate-500 font-mono">/api/channels-latest</span>
            </div>
          </div>
          <button
            id="retest-channels-btn"
            onClick={fetchChannelsLatest}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition disabled:opacity-50 cursor-pointer"
            title="تحديث عدد القنوات"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Status / Count Display */}
        {loading ? (
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-500 animate-pulse flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-slate-400 shrink-0" />
            جاري جلب القنوات من الـ Worker...
          </div>
        ) : error ? (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-amber-800 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>فشل فحص القنوات</span>
            </div>
            <p className="text-[11px] text-amber-700 leading-relaxed">{error}</p>
            <div className="text-[10px] text-amber-600 font-mono pt-0.5">
              آخر محاولة: {lastChecked}
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-sky-50/80 border border-sky-200 text-sky-950 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-xs text-sky-900">
                <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0" />
                <span>عدد القنوات المُحمّلة: {totalChannels}</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-200/80 text-sky-900">
                Live Data
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="p-2 rounded-lg bg-white/70 border border-sky-100 space-y-0.5">
                <span className="text-[10px] text-slate-500 block">قنوات بأرشيف</span>
                <span className="text-xs font-bold text-sky-900">{channelsWithVideos} قناة</span>
              </div>
              <div className="p-2 rounded-lg bg-white/70 border border-sky-100 space-y-0.5">
                <span className="text-[10px] text-slate-500 block">إجمالي الفيديوهات</span>
                <span className="text-xs font-bold text-sky-900">{totalVideos} فيديو</span>
              </div>
            </div>

            <div className="text-[10px] text-sky-700 font-mono pt-0.5">
              آخر تحديث: {lastChecked}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1 text-slate-600 font-medium">
            <Film className="w-3.5 h-3.5 text-sky-600" />
            <span>بحد أقصى 200 فيديو لكل قناة</span>
          </span>
          <span className="font-mono text-[10px] text-slate-400">KV + Seed</span>
        </div>
      </div>
    </div>
  );
}
