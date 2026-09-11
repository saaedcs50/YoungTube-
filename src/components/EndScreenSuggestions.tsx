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
      const items = await db.feedCache
        .filter((item) => !item.hidden && item.videoId !== excludeVideoId)
        .toArray();

      const shuffled = items.sort(() => Math.random() - 0.5).slice(0, 6);
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
      className={`w-full min-h-0 flex flex-col bg-zinc-950 text-white select-none ${className}`}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5 border-b border-white/10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0 text-right">
            <h3 className="text-sm sm:text-base font-bold text-white">ماذا بعد؟</h3>
            <span className="text-[11px] sm:text-xs text-white/50 block truncate">
              مقترحات آمنة من قائمتك فقط
            </span>
          </div>
        </div>

        <button
          id="refresh-suggestions-btn"
          onClick={fetchSuggestions}
          disabled={loading}
          className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
          title="تحديث المقترحات"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Scrollable suggestions — large cards, real room to see content */}
      <div className="grow min-h-0 overflow-y-auto px-3 py-4 sm:px-5 sm:py-5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-white/50 py-16">
            <RefreshCw className="w-5 h-5 animate-spin text-sky-400" />
            جاري تحضير المقترحات...
          </div>
        ) : suggestions.length === 0 ? (
          <div className="text-center space-y-2 py-16">
            <Film className="w-10 h-10 text-white/20 mx-auto" />
            <p className="text-sm text-white/50">لا توجد مقترحات إضافية حالياً</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 max-w-3xl mx-auto">
            {suggestions.map((video) => {
              const thumbnail = `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`;
              return (
                <button
                  key={video.videoId}
                  id={`suggestion-card-${video.videoId}`}
                  type="button"
                  onClick={() => onPickVideo(video.videoId)}
                  className="group flex flex-row sm:flex-col bg-zinc-900 hover:bg-zinc-800 active:scale-[0.99] overflow-hidden border border-white/10 hover:border-sky-500/40 transition text-right cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500 rounded-none"
                >
                  {/* Thumbnail — large, sharp */}
                  <div className="relative w-[42%] sm:w-full shrink-0 aspect-video bg-black overflow-hidden">
                    <img
                      src={thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition duration-300"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/25 group-hover:bg-black/10 flex items-center justify-center transition">
                      <div className="w-11 h-11 rounded-full bg-white text-zinc-900 flex items-center justify-center shadow-lg group-hover:scale-110 transition">
                        <Play className="w-5 h-5 fill-current translate-x-0.5" />
                      </div>
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="flex-1 min-w-0 p-3 sm:p-3.5 flex flex-col justify-center gap-1.5">
                    <p className="text-sm sm:text-[15px] font-bold text-white line-clamp-2 leading-snug group-hover:text-sky-100 transition">
                      {video.title}
                    </p>
                    {video.hasMusic === false && (
                      <span className="text-[11px] text-emerald-400 font-semibold">
                        بدون موسيقى
                      </span>
                    )}
                    <span className="text-[11px] text-white/40 font-medium mt-auto pt-1">
                      اضغط للمشاهدة
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 border-t border-white/10 text-[11px] text-white/45">
        <span className="flex items-center gap-1.5 text-emerald-400/90">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          <span className="leading-tight">بدون مقترحات يوتيوب — قائمتك فقط</span>
        </span>
        <button
          onClick={() => onPickVideo(excludeVideoId)}
          className="text-sky-400 hover:text-sky-300 font-semibold cursor-pointer shrink-0"
        >
          إعادة التشغيل ↺
        </button>
      </div>
    </div>
  );
}
