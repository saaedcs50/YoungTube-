import React, { useEffect, useState } from 'react';
import db, { FeedItem } from '../db';
import { Play, Sparkles, RefreshCw, ShieldCheck, Film } from 'lucide-react';

interface EndScreenSuggestionsProps {
  excludeVideoId: string;
  onPickVideo: (videoId: string) => void;
  className?: string;
}

export default function EndScreenSuggestions({
  excludeVideoId,
  onPickVideo,
  className = '',
}: EndScreenSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      // Query up to 5 non-hidden videos from db.feedCache, excluding current video
      const items = await db.feedCache
        .filter((item) => !item.hidden && item.videoId !== excludeVideoId)
        .toArray();

      // Shuffle or pick up to 5 items
      const shuffled = items.sort(() => Math.random() - 0.5).slice(0, 5);
      setSuggestions(shuffled);
    } catch (err) {
      console.error('Failed to load suggestions from db.feedCache:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuggestions();
  }, [excludeVideoId]);

  return (
    <div
      id="custom-end-screen-overlay"
      className={`relative w-full aspect-video rounded-2xl overflow-hidden bg-slate-900/95 text-white flex flex-col justify-between p-4 sm:p-5 shadow-inner border border-slate-700 z-30 select-none ${className}`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-slate-700/80 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-white">فيديوهات مقترحة تالية</h3>
            <span className="text-[10px] text-slate-400">مقترحات آمنة ونظيفة من الذاكرة المحلية (Dexie)</span>
          </div>
        </div>

        <button
          id="refresh-suggestions-btn"
          onClick={fetchSuggestions}
          disabled={loading}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          title="تحديث المقترحات"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Suggestions Cards Grid */}
      <div className="grow my-auto flex items-center justify-center py-2">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
            جاري تحضير المقترحات الآمنة...
          </div>
        ) : suggestions.length === 0 ? (
          <div className="text-center space-y-1">
            <Film className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-400">لا توجد مقترحات إضافية في الذاكرة حالياً</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 w-full max-h-[80%] overflow-y-auto">
            {suggestions.map((video) => {
              const thumbnail = `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;
              return (
                <button
                  key={video.videoId}
                  id={`suggestion-card-${video.videoId}`}
                  type="button"
                  onClick={() => onPickVideo(video.videoId)}
                  className="group relative flex flex-col bg-slate-800/90 hover:bg-slate-700/90 rounded-xl overflow-hidden border border-slate-700 hover:border-sky-500/50 transition duration-200 text-right cursor-pointer shadow-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <div className="relative aspect-video w-full bg-slate-950 overflow-hidden">
                    <img
                      src={thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 flex items-center justify-center transition">
                      <div className="w-8 h-8 rounded-full bg-sky-600/90 text-white flex items-center justify-center shadow-md group-hover:scale-110 transition">
                        <Play className="w-4 h-4 fill-white translate-x-0.5" />
                      </div>
                    </div>
                  </div>

                  <div className="p-2 flex flex-col justify-between grow">
                    <p className="text-[11px] font-medium text-slate-200 line-clamp-2 leading-snug group-hover:text-white transition">
                      {video.title}
                    </p>
                    {video.hasMusic === false && (
                      <span className="mt-1 text-[9px] text-emerald-400 font-semibold">
                        بدون موسيقى ✨
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer info badge */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-700/60 pt-2">
        <span className="flex items-center gap-1 text-emerald-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>تم استبدال شاشة مقترحات يوتيوب بمقترحاتك المفلترة فقط</span>
        </span>
        <button
          onClick={() => onPickVideo(excludeVideoId)}
          className="text-sky-400 hover:text-sky-300 underline font-medium cursor-pointer"
        >
          إعادة تشغيل هذا الفيديو ↺
        </button>
      </div>
    </div>
  );
}
