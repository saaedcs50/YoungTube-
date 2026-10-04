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
  const startYRef = useRef<number | null>(null);
  const startXRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    const onTouchStart = (event: TouchEvent) => {
      if (disabled || refreshingRef.current || window.scrollY > 2 || event.touches.length !== 1) return;
      startYRef.current = event.touches[0].clientY;
      startXRef.current = event.touches[0].clientX;
      activeRef.current = true;
      setCompleted(false);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!activeRef.current || startYRef.current == null || startXRef.current == null || refreshingRef.current) return;
      if (window.scrollY > 2 || event.touches.length !== 1) {
        activeRef.current = false;
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }

      const dy = event.touches[0].clientY - startYRef.current;
      const dx = event.touches[0].clientX - startXRef.current;
      if (Math.abs(dx) > Math.abs(dy) || dy <= 0) {
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }

      const eased = Math.min(threshold * 1.35, Math.pow(dy, 0.82) * 2.1);
      pullDistanceRef.current = eased;
      setPullDistance(eased);
      if (eased > 6) event.preventDefault();
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
    <div className="relative">
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
