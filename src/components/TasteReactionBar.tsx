import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { recordChildReaction } from '../tasteShiftStorage';

interface TasteReactionBarProps {
  videoId: string;
  channelId: string;
  title: string;
  categoryId: string;
  onReacted?: (reaction: 'liked' | 'disliked') => void;
}

/**
 * Compact 👍/👎 for Taste Shift target cards only.
 * Explicit child signal — never inferred from "weak moments".
 */
export const TasteReactionBar: React.FC<TasteReactionBarProps> = ({
  videoId,
  channelId,
  title,
  categoryId,
  onReacted,
}) => {
  const [picked, setPicked] = useState<'liked' | 'disliked' | null>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (reaction: 'liked' | 'disliked') => {
    if (busy || picked) return;
    setBusy(true);
    try {
      await recordChildReaction({
        categoryId,
        videoId,
        channelId,
        title,
        reaction,
      });
      setPicked(reaction);
      onReacted?.(reaction);
    } catch (err) {
      console.error('Taste reaction failed:', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      id={`taste-reaction-${videoId}`}
      className="flex items-center gap-1.5 pt-1"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        id={`taste-like-${videoId}`}
        disabled={busy || picked !== null}
        onClick={() => handle('liked')}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition active:scale-95 ${
          picked === 'liked'
            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
            : picked
              ? 'opacity-40 border-stone-200 text-stone-400'
              : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
        }`}
        aria-label="أعجبني"
      >
        <ThumbsUp className="w-3.5 h-3.5" />
        <span>حلو</span>
      </button>
      <button
        type="button"
        id={`taste-dislike-${videoId}`}
        disabled={busy || picked !== null}
        onClick={() => handle('disliked')}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition active:scale-95 ${
          picked === 'disliked'
            ? 'bg-rose-100 text-rose-800 border-rose-300'
            : picked
              ? 'opacity-40 border-stone-200 text-stone-400'
              : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
        }`}
        aria-label="لم يعجبني"
      >
        <ThumbsDown className="w-3.5 h-3.5" />
        <span>مش حابب</span>
      </button>
    </div>
  );
};
