import React, { useState, useEffect } from 'react';
import db, { FeedItem } from '../db';
import VideoPlayer from './VideoPlayer';
import EndScreenSuggestions from './EndScreenSuggestions';
import HideVideoButton from './HideVideoButton';
import { Play, RotateCcw, FastForward, CheckCircle2, Film, Shield, Sparkles, X } from 'lucide-react';

interface PlayerTestCardProps {
  onVideoHidden?: () => void;
}

export default function PlayerTestCard({ onVideoHidden }: PlayerTestCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<FeedItem | null>(null);
  const [isEnded, setIsEnded] = useState(false);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pick a random non-hidden video from Dexie feedCache
  const startRandomVideo = async () => {
    setLoadingVideo(true);
    setError(null);
    setIsEnded(false);

    try {
      const nonHidden = await db.feedCache.filter((item) => !item.hidden).toArray();
      if (nonHidden.length === 0) {
        setError('لا توجد فيديوهات مقبولة في الذاكرة (تأكد من تشغيل الفلترة أو تفريغ القنوات)');
        setIsPlaying(false);
        return;
      }

      const randomItem = nonHidden[Math.floor(Math.random() * nonHidden.length)];
      setCurrentVideo(randomItem);
      setIsPlaying(true);
      setIsEnded(false);
    } catch (err) {
      setError('تعذر قراءة الفيديوهات من Dexie');
    } finally {
      setLoadingVideo(false);
    }
  };

  // Switch to a new video chosen from EndScreenSuggestions
  const handlePickSuggestion = async (newVideoId: string) => {
    setIsEnded(false);
    try {
      const item = await db.feedCache.get(newVideoId);
      if (item) {
        setCurrentVideo(item);
      } else {
        setCurrentVideo({
          videoId: newVideoId,
          channelId: '',
          title: 'فيديو مقترح',
          fetchedAt: Date.now(),
        });
      }
    } catch {
      setCurrentVideo({
        videoId: newVideoId,
        channelId: '',
        title: 'فيديو مقترح',
        fetchedAt: Date.now(),
      });
    }
  };

  const handleVideoEnded = () => {
    setIsEnded(true);
  };

  const handleSimulateEnd = () => {
    setIsEnded(true);
  };

  const handleStopPlayer = () => {
    setIsPlaying(false);
    setCurrentVideo(null);
    setIsEnded(false);
  };

  const handleHiddenSuccess = async () => {
    onVideoHidden?.();
    // Refresh current video status or pick another if current was hidden
    if (currentVideo) {
      const updated = await db.feedCache.get(currentVideo.videoId);
      if (updated) {
        setCurrentVideo(updated);
      }
    }
  };

  return (
    <div
      id="player-test-card"
      className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs flex flex-col justify-between"
    >
      <div>
        {/* Card Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Play className="w-5 h-5 fill-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">اختبار المشغل (Phase 7: Player)</h2>
              <span className="text-xs text-slate-500 font-mono">YouTube IFrame & EndScreen Suggestions</span>
            </div>
          </div>

          {isPlaying && (
            <button
              id="close-player-test-btn"
              onClick={handleStopPlayer}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              title="إغلاق المشغل"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-3 mb-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
            {error}
          </div>
        )}

        {/* Not Playing State */}
        {!isPlaying ? (
          <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-100 text-center space-y-3">
            <div className="flex items-center justify-center gap-2 text-indigo-900 font-bold text-xs">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>فحص آليات المشغل ومقترحات نهاية الفيديو المخصصة</span>
            </div>
            <p className="text-[11px] text-indigo-700 max-w-sm mx-auto leading-relaxed">
              يشغل الفيديو عبر نطاق <code className="font-mono bg-white/80 px-1 py-0.5 rounded text-[10px]">youtube-nocookie.com</code>، ويستبدل شاشة مقترحات يوتيوب بمقترحات داخلية من الـ Dexie فور انتهاء الفيديو.
            </p>

            <button
              id="start-test-video-btn"
              type="button"
              onClick={startRandomVideo}
              disabled={loadingVideo}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs hover:shadow transition cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>{loadingVideo ? 'جاري اختيار فيديو...' : 'شغّل فيديو تجريبي'}</span>
            </button>
          </div>
        ) : (
          /* Active Playing / Ended State */
          <div className="space-y-3">
            {/* Player Container with EndScreen Replacement */}
            <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-md border border-slate-800">
              {!isEnded && currentVideo ? (
                <VideoPlayer
                  videoId={currentVideo.videoId}
                  onEnded={handleVideoEnded}
                />
              ) : currentVideo ? (
                <EndScreenSuggestions
                  excludeVideoId={currentVideo.videoId}
                  onPickVideo={handlePickSuggestion}
                />
              ) : null}
            </div>

            {/* Video Meta & Controls Bar */}
            {currentVideo && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <span className="text-[10px] text-slate-400 font-mono block">
                      ID: {currentVideo.videoId}
                    </span>
                    <h4 className="text-xs font-bold text-slate-800 line-clamp-1">
                      {currentVideo.title}
                    </h4>
                  </div>

                  {/* Hide Video Button (Requirement 3) */}
                  <HideVideoButton
                    videoId={currentVideo.videoId}
                    onHidden={handleHiddenSuccess}
                  />
                </div>

                {/* Developer Simulation Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60 text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-500 text-[10px]">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>الحالة: {isEnded ? 'شاشة المقترحات المخصصة (انتهى)' : 'جاري التشغيل'}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {!isEnded ? (
                      <button
                        id="simulate-ended-btn"
                        type="button"
                        onClick={handleSimulateEnd}
                        className="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-medium transition flex items-center gap-1 cursor-pointer"
                        title="محاكاة حدث انتهاء الفيديو لاختبار شاشة المقترحات فوراً"
                      >
                        <FastForward className="w-3 h-3 text-slate-600" />
                        <span>محاكاة انتهاء الفيديو (onEnded)</span>
                      </button>
                    ) : (
                      <button
                        id="replay-video-btn"
                        type="button"
                        onClick={() => setIsEnded(false)}
                        className="px-2.5 py-1 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-800 text-[10px] font-medium transition flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3 text-sky-600" />
                        <span>إعادة التشغيل ↺</span>
                      </button>
                    )}

                    <button
                      id="next-random-video-btn"
                      type="button"
                      onClick={startRandomVideo}
                      className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-medium transition flex items-center gap-1 cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-indigo-600" />
                      <span>فيديو عشوائي آخر</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Card Footer */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1 text-slate-600 font-medium">
            <Shield className="w-3.5 h-3.5 text-indigo-600" />
            <span>youtube-nocookie + rel=0 + No Native EndScreen</span>
          </span>
          <span className="font-mono text-[10px] text-slate-400">Dexie Suggestions</span>
        </div>
      </div>
    </div>
  );
}
