import React, { useEffect, useRef, useState } from 'react';
import { Play, AlertTriangle, Loader2 } from 'lucide-react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface VideoPlayerProps {
  videoId: string;
  onEnded: () => void;
  className?: string;
}

// Global promise to guarantee script is loaded only once across remounts
let ytApiPromise: Promise<void> | null = null;

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  // If already loaded and ready
  if (window.YT && window.YT.Player) {
    return Promise.resolve();
  }

  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve) => {
      // Check if script element already exists in DOM
      const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        if (firstScriptTag && firstScriptTag.parentNode) {
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        } else {
          document.head.appendChild(tag);
        }
      }

      // Hook onYouTubeIframeAPIReady callback
      const previousCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof previousCallback === 'function') {
          previousCallback();
        }
        resolve();
      };

      // Periodic check in case callback was fired earlier
      const interval = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }

  return ytApiPromise;
}

export default function VideoPlayer({ videoId, onEnded, className = '' }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const [loadingApi, setLoadingApi] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep latest onEnded in a ref so listener doesn't go stale
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    let isCancelled = false;

    async function initPlayer() {
      if (!videoId) return;
      setLoadingApi(true);
      setError(null);

      try {
        await loadYouTubeIframeApi();

        if (isCancelled || !containerRef.current) return;

        // Destroy previous player instance if exists
        if (playerRef.current) {
          try {
            playerRef.current.destroy();
          } catch {
            // Ignore destruction errors
          }
          playerRef.current = null;
        }

        // Clean container element for new player insertion
        containerRef.current.innerHTML = '';
        const playerDiv = document.createElement('div');
        playerDiv.id = `yt-player-${videoId}-${Math.random().toString(36).substring(2, 7)}`;
        containerRef.current.appendChild(playerDiv);

        // Instantiate YouTube Player with youtube-nocookie host
        playerRef.current = new window.YT.Player(playerDiv.id, {
          height: '100%',
          width: '100%',
          videoId: videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            rel: 0,
            modestbranding: 1,
            autoplay: 1,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event: any) => {
              if (isCancelled) return;
              setLoadingApi(false);
              try {
                event.target.playVideo();
              } catch {
                // Autoplay may be restricted by browser policy
              }
            },
            onStateChange: (event: any) => {
              if (isCancelled) return;
              // YT.PlayerState.ENDED is 0
              if (event.data === 0 || event.data === window.YT?.PlayerState?.ENDED) {
                onEndedRef.current?.();
              }
            },
            onError: (event: any) => {
              if (isCancelled) return;
              setLoadingApi(false);
              setError(`تعذر تشغيل الفيديو (رمز الخطأ: ${event.data})`);
            },
          },
        });
      } catch (err) {
        if (!isCancelled) {
          setLoadingApi(false);
          setError(err instanceof Error ? err.message : 'فشل تحميل مشغل يوتيوب');
        }
      }
    }

    initPlayer();

    return () => {
      isCancelled = true;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // Ignore cleanup error
        }
        playerRef.current = null;
      }
    };
  }, [videoId]);

  return (
    <div
      id="video-player-wrapper"
      className={`relative w-full h-full min-h-0 aspect-video overflow-hidden bg-black rounded-none shadow-none ${className}`}
    >
      {/* Player Mounting Container — fills parent completely */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full [&>div]:!w-full [&>div]:!h-full [&>iframe]:!w-full [&>iframe]:!h-full" />

      {/* Loading Overlay */}
      {loadingApi && (
        <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center text-white gap-2 pointer-events-none z-10">
          <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
          <span className="text-xs font-medium text-slate-300">جاري تجهيز مشغل الفيديو الآمن...</span>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center text-white p-4 text-center gap-2 z-10">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
          <p className="text-xs text-amber-200">{error}</p>
        </div>
      )}
    </div>
  );
}
