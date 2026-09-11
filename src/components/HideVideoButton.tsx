import React, { useState } from 'react';
import db from '../db';
import { EyeOff, Check } from 'lucide-react';

interface HideVideoButtonProps {
  videoId: string;
  onHidden?: (videoId: string) => void;
  className?: string;
  /** Icon-only compact control for player chrome */
  compact?: boolean;
}

/**
 * Phase 4 — hide video from the child's feed permanently (local Dexie).
 */
export default function HideVideoButton({
  videoId,
  onHidden,
  className = '',
  compact = false,
}: HideVideoButtonProps) {
  const [hiding, setHiding] = useState(false);
  const [hiddenSuccess, setHiddenSuccess] = useState(false);

  const handleHide = async () => {
    if (!videoId || hiding) return;
    setHiding(true);

    try {
      await db.feedCache.update(videoId, { hidden: true });
      setHiddenSuccess(true);
      onHidden?.(videoId);
      setTimeout(() => setHiddenSuccess(false), 1600);
    } catch (err) {
      console.error('Failed to hide video in db.feedCache:', err);
    } finally {
      setHiding(false);
    }
  };

  if (hiddenSuccess) {
    if (compact) {
      return (
        <span
          className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
          title="تم الإخفاء"
        >
          <Check className="w-5 h-5" />
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-400/30">
        <Check className="w-3.5 h-3.5" />
        <span>تم الإخفاء</span>
      </span>
    );
  }

  if (compact) {
    return (
      <button
        id={`hide-video-btn-${videoId}`}
        type="button"
        onClick={handleHide}
        disabled={hiding}
        className={`inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/10 hover:bg-rose-500/30 text-white border border-white/15 cursor-pointer disabled:opacity-50 transition ${className}`}
        title="إخفاء هذا الفيديو من قائمة الطفل"
        aria-label="إخفاء الفيديو"
      >
        <EyeOff className="w-5 h-5" />
      </button>
    );
  }

  return (
    <button
      id={`hide-video-btn-${videoId}`}
      type="button"
      onClick={handleHide}
      disabled={hiding}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${className}`}
      title="إخفاء هذا الفيديو من مقترحات وقوائم الطفل"
    >
      <EyeOff className="w-3.5 h-3.5 text-rose-600" />
      <span>{hiding ? 'جاري الإخفاء...' : 'إخفاء'}</span>
    </button>
  );
}
