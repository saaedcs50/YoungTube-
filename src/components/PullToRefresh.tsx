import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, Check, Loader2, RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  disabled?: boolean;
  threshold?: number;
  children: React.ReactNode;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  disabled = false,
  threshold = 72,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const startXRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [completed, setCompleted] = useState(false);

  // Helper to reliably check scroll position across all mobile webviews & browsers
  const getScrollTop = () => {
    if (typeof window === 'undefined') return 0;
    return Math.max(
      0,
      window.scrollY || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0
    );
  };

  // Reset any active pull state immediately when disabled
  useEffect(() => {
    if (disabled) {
      activeRef.current = false;
      pullDistanceRef.current = 0;
      setPullDistance(0);
      startYRef.current = null;
      startXRef.current = null;
    }
  }, [disabled]);

  useEffect(() => {
    const onTouchStart = (event: TouchEvent) => {
      // 1. Guard against disabled state, active refresh, or multi-touch gestures
      if (disabled || refreshingRef.current || event.touches.length !== 1) return;

      // 2. Strict top check: ONLY trigger when at the very top of the feed (scrollY <= 1)
      if (getScrollTop() > 1) return;

      // 3. Strict Target check: Touch MUST start directly inside this PullToRefresh container
      const target = event.target as Node | null;
      if (!containerRef.current || !target || !containerRef.current.contains(target)) {
        return;
      }

      // 4. Exclude touches on player, modals, dialogs, buttons, or form controls
      const el = event.target as HTMLElement | null;
      if (
        el &&
        el.closest(
          '#player-video-container, #player-view, #mini-player-body-tap, #mini-player-close-btn, .player-view, [data-prevent-pull-to-refresh], button, a, input, textarea, select'
        )
      ) {
        return;
      }

      // 5. Do not activate if a full/portrait video player is currently active in the DOM
      const playerEl = document.getElementById('player-video-container');
      const isMini = document.getElementById('mini-player-close-btn');
      if (playerEl && !isMini) {
        return;
      }

      startYRef.current = event.touches[0].clientY;
      startXRef.current = event.touches[0].clientX;
      activeRef.current = true;
      setCompleted(false);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!activeRef.current || startYRef.current == null || startXRef.current == null || refreshingRef.current) return;

      // If user has scrolled down into the feed or changed fingers, abort pull-to-refresh
      if (getScrollTop() > 1 || event.touches.length !== 1) {
        activeRef.current = false;
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }

      const dy = event.touches[0].clientY - startYRef.current;
      const dx = event.touches[0].clientX - startXRef.current;

      // Must be a downward swipe and strictly more vertical than horizontal
      if (Math.abs(dx) > Math.abs(dy) || dy <= 0) {
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }

      const eased = Math.min(threshold * 1.35, Math.pow(dy, 0.82) * 2.1);
      pullDistanceRef.current = eased;
      setPullDistance(eased);
      if (eased > 6 && event.cancelable) {
        event.preventDefault();
      }
    };

    const onTouchEnd = async () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      const shouldRefresh = pullDistanceRef.current >= threshold;
      pullDistanceRef.current = 0;
      setPullDistance(0);
      startYRef.current = null;
      startXRef.current = null;
      if (!shouldRefresh || refreshingRef.current) return;

      refreshingRef.current = true;
      setRefreshing(true);
      try {
        await onRefresh();
        setCompleted(true);
        window.setTimeout(() => setCompleted(false), 900);
      } finally {
        refreshingRef.current = false;
        setRefreshing(false);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [disabled, onRefresh, threshold]);

  const progress = Math.min(1, pullDistance / threshold);
  const visible = refreshing || completed || pullDistance > 4;
  const icon = refreshing ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : completed ? (
    <Check className="h-4 w-4" />
  ) : progress >= 1 ? (
    <RefreshCw className="h-4 w-4" />
  ) : (
    <ArrowDown className="h-4 w-4" />
  );

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center transition-opacity duration-150 ${visible ? 'opacity-100' : 'opacity-0'}`}
        aria-hidden="true"
      >
        <div
          className="mt-2 inline-flex items-center gap-2 rounded-full border border-yt-border bg-yt-surface/95 px-3 py-2 text-[11px] font-bold text-yt-text shadow-lg backdrop-blur-md"
          style={{ transform: `translateY(${Math.min(pullDistance, threshold + 12)}px)` }}
        >
          {icon}
          <span>
            {refreshing ? 'جاري تحديث الفيديوهات…' : completed ? 'تم تحديث الفيد' : progress >= 1 ? 'اسحب لتحديث الفيد' : 'اسحب لأسفل للتحديث'}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
};

export default PullToRefresh;
