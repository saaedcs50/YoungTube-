import React, { useState } from 'react';
import db from '../db';
import { EyeOff, Check } from 'lucide-react';

interface HideVideoButtonProps {
  videoId: string;
  onHidden?: () => void;
  className?: string;
}

export default function HideVideoButton({
  videoId,
  onHidden,
  className = '',
}: HideVideoButtonProps) {
  const [hiding, setHiding] = useState(false);
  const [hiddenSuccess, setHiddenSuccess] = useState(false);

  const handleHide = async () => {
    if (!videoId || hiding) return;
    setHiding(true);

    try {
      // Update Dexie feedCache to mark this video as hidden
      await db.feedCache.update(videoId, { hidden: true });
      setHiddenSuccess(true);
      onHidden?.();

      // Clear inline confirmation after 2 seconds
      setTimeout(() => {
        setHiddenSuccess(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to hide video in db.feedCache:', err);
    } finally {
      setHiding(false);
    }
  };

  if (hiddenSuccess) {
    return (
      <span
        id={`hidden-badge-${videoId}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-semibold border border-emerald-300 transition"
      >
        <Check className="w-3.5 h-3.5 text-emerald-600" />
        <span>تم الإخفاء بنجاح ✅</span>
      </span>
    );
  }

  return (
    <button
      id={`hide-video-btn-${videoId}`}
      type="button"
      onClick={handleHide}
      disabled={hiding}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 border border-rose-200 text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${className}`}
      title="إخفاء هذا الفيديو من مقترحات وقوائم الطفل"
    >
      <EyeOff className="w-3.5 h-3.5 text-rose-600" />
      <span>{hiding ? 'جاري الإخفاء...' : 'إخفاء هذا الفيديو (Hide)'}</span>
    </button>
  );
}
