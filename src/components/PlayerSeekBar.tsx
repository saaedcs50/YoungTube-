import React, { useState, useRef } from 'react';

export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
  const totalSeconds = Math.floor(seconds);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const mm = mins.toString().padStart(2, '0');
  const ss = secs.toString().padStart(2, '0');

  if (hrs > 0) {
    return `${hrs}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export interface PlayerSeekBarProps {
  id?: string;
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  className?: string;
}

export const PlayerSeekBar: React.FC<PlayerSeekBarProps> = ({
  id = 'player-seek-bar',
  currentTime,
  duration,
  onSeek,
  onSeekStart,
  onSeekEnd,
  className = '',
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);

  const calculateRatio = (clientX: number): number => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const offset = clientX - rect.left;
    return Math.max(0, Math.min(1, offset / rect.width));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    const ratio = calculateRatio(e.clientX);
    setIsDragging(true);
    setDragProgress(ratio);
    onSeekStart?.();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const ratio = calculateRatio(e.clientX);
    setDragProgress(ratio);
    onSeekStart?.();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    const ratio = calculateRatio(e.clientX);
    const targetSeconds = ratio * (duration || 0);
    setIsDragging(false);
    onSeek(targetSeconds);
    onSeekEnd?.();
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setIsDragging(false);
    onSeekEnd?.();
  };

  const currentProgress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const progressRatio = isDragging ? dragProgress : currentProgress;
  const progressPercent = progressRatio * 100;
  const displayCurrentTime = isDragging ? dragProgress * (duration || 0) : currentTime;

  return (
    <div
      id={id}
      dir="ltr"
      className={`flex items-center gap-3 w-full select-none ${className}`}
    >
      {/* Expanded touch-hit-area: ~48px tall (h-12) */}
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="flex-1 h-12 flex items-center cursor-pointer touch-none relative group"
        aria-label="شريط التقدم"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={duration || 100}
        aria-valuenow={Math.round(displayCurrentTime)}
      >
        {/* Thin visible track: ~3px */}
        <div className="w-full h-[3px] bg-white/20 rounded-full relative overflow-visible">
          {/* Progress fill */}
          <div
            className="h-full bg-red-600 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
          {/* Scrubber knob */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-red-600 ring-2 ring-white shadow-md pointer-events-none transition-transform duration-75 ${
              isDragging ? 'w-4 h-4 scale-110' : 'w-3 h-3 group-hover:scale-125'
            }`}
            style={{ left: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Tabular-nums time display: current / total */}
      <span className="text-xs font-mono tabular-nums text-stone-300 whitespace-nowrap shrink-0 select-none">
        {formatTime(displayCurrentTime)} / {formatTime(duration)}
      </span>
    </div>
  );
};

export default PlayerSeekBar;
