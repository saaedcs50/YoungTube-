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
      className="rounded-2xl border border-yt-border bg-yt-surface p-4 sm:p-5 shadow-sm flex flex-col justify-between space-y-4"
    >
      <div>
        <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-yt-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-yt-brand text-yt-brand-text flex items-center justify-center shrink-0 shadow-sm">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-yt-text">أرشيف القنوات الحي</h2>
              <span className="text-[11px] text-yt-text-muted font-mono">/api/channels-latest</span>
            </div>
          </div>
          <button
            id="retest-channels-btn"
            onClick={fetchChannelsLatest}
            disabled={loading}
            className="min-h-[44px] sm:min-h-[40px] px-4 py-2 rounded-xl bg-yt-brand hover:bg-yt-brand-hover text-yt-brand-text text-xs font-bold transition duration-150 disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-sm shrink-0"
            title="تحديث عدد القنوات"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث الأرشيف</span>
          </button>
        </div>

        {/* Status / Count Display */}
        {loading ? (
          <div className="p-4 rounded-xl bg-yt-surface-muted border border-yt-border text-xs text-yt-text-muted animate-pulse flex items-center gap-2.5">
            <RefreshCw className="w-4 h-4 animate-spin text-yt-brand shrink-0" />
            <span>جاري جلب القنوات والبيانات المدمجة من السحابة...</span>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-yt-brand-soft border border-yt-brand/30 text-yt-text space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-yt-text text-xs">
              <AlertTriangle className="w-4 h-4 text-yt-brand shrink-0" />
              <span>فشل فحص القنوات</span>
            </div>
            <p className="text-[11px] text-yt-text-muted leading-relaxed">{error}</p>
            <div className="text-[10px] text-yt-text-muted font-mono pt-0.5">
              آخر محاولة: {lastChecked}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* 2x2 Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-yt-surface-muted border border-yt-border space-y-0.5">
                <span className="text-[11px] text-yt-text-muted font-bold block">إجمالي القنوات</span>
                <span className="text-lg font-extrabold text-yt-text font-mono">{totalChannels} قناة</span>
              </div>
              <div className="p-3.5 rounded-xl bg-yt-surface-muted border border-yt-border space-y-0.5">
                <span className="text-[11px] text-yt-text-muted font-bold block">قنوات بأرشيف نشط</span>
                <span className="text-lg font-extrabold text-yt-brand font-mono">{channelsWithVideos} قناة</span>
              </div>
              <div className="p-3.5 rounded-xl bg-yt-surface-muted border border-yt-border space-y-0.5">
                <span className="text-[11px] text-yt-text-muted font-bold block">إجمالي الفيديوهات</span>
                <span className="text-lg font-extrabold text-yt-text font-mono">{totalVideos} فيديو</span>
              </div>
              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/70 space-y-0.5">
                <span className="text-[11px] text-emerald-700 font-bold block">حالة البيانات</span>
                <span className="text-xs font-bold text-emerald-800 flex items-center gap-1 pt-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  بيانات حية Live
                </span>
              </div>
            </div>

            <div className="text-[10px] text-yt-text-muted font-mono pt-0.5 text-left">
              آخر تحديث ناجح: {lastChecked}
            </div>
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-yt-border">
        <div className="flex items-center justify-between text-[11px] text-yt-text-muted">
          <span className="flex items-center gap-1 text-yt-text font-medium">
            <Film className="w-3.5 h-3.5 text-yt-brand" />
            <span>بحد أقصى 200 فيديو لكل قناة</span>
          </span>
          <span className="font-mono text-[10px] text-yt-text-muted">Cloudflare KV + Seed</span>
        </div>
      </div>
    </div>
  );
}
