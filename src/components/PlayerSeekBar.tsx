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

  const remainingSeconds = Math.max(0, (duration || 0) - displayCurrentTime);

  return (
    <div
      id={id}
      className={`flex flex-col gap-1.5 w-full select-none ${className}`}
    >
      {/* LTR Seek Bar */}
      <div
        ref={trackRef}
        dir="ltr"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="w-full h-8 flex items-center cursor-pointer touch-none relative group"
        aria-label="شريط التقدم"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={duration || 100}
        aria-valuenow={Math.round(displayCurrentTime)}
      >
        {/* Track */}
        <div className="w-full h-2 bg-white/15 rounded-full relative overflow-visible">
          {/* Filled Progress (Amber with warm glow) */}
          <div
            className="h-full bg-amber-500 rounded-full shadow-[0_0_12px_rgba(255,159,28,0.7)]"
            style={{ width: `${progressPercent}%` }}
          />
          {/* Interactive Scrubber Pin */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white border-2 border-amber-500 shadow-md pointer-events-none transition-transform duration-75 ${
              isDragging ? 'w-4 h-4 scale-125' : 'w-3.5 h-3.5 group-hover:scale-125'
            }`}
            style={{ left: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Timestamps & Remaining Time Badge */}
      <div className="w-full flex items-center justify-between text-xs font-semibold text-stone-300 px-0.5">
        <div dir="ltr" className="flex items-center gap-1 font-mono tracking-wider">
          <span className="text-amber-400 font-bold">{formatTime(displayCurrentTime)}</span>
          <span className="text-white/30">/</span>
          <span className="text-white/60">{formatTime(duration)}</span>
        </div>

        <span className="text-emerald-300 text-[11px] font-bold bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-full">
          متبقي {formatTime(remainingSeconds)}
        </span>
      </div>
    </div>
  );
};

export default PlayerSeekBar;
