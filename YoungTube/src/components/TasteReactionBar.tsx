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
      className="flex items-center gap-2 pt-1"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        id={`taste-like-${videoId}`}
        disabled={busy || picked !== null}
        onClick={() => handle('liked')}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition duration-150 active:scale-[0.98] cursor-pointer shadow-sm ${
          picked === 'liked'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-emerald-500/10'
            : picked
              ? 'opacity-40 border-yt-border text-yt-text-muted bg-yt-surface-muted'
              : 'bg-yt-surface text-emerald-700 border-yt-border hover:bg-emerald-50 hover:border-emerald-200'
        }`}
        aria-label="أعجبني"
      >
        <ThumbsUp className="w-3.5 h-3.5 text-emerald-600" />
        <span>حلو</span>
      </button>
      <button
        type="button"
        id={`taste-dislike-${videoId}`}
        disabled={busy || picked !== null}
        onClick={() => handle('disliked')}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition duration-150 active:scale-[0.98] cursor-pointer shadow-sm ${
          picked === 'disliked'
            ? 'bg-yt-surface-muted text-yt-text border-yt-border'
            : picked
              ? 'opacity-40 border-yt-border text-yt-text-muted bg-yt-surface-muted'
              : 'bg-yt-surface text-yt-text-muted border-yt-border hover:bg-yt-surface-muted hover:border-yt-border'
        }`}
        aria-label="لم يعجبني"
      >
        <ThumbsDown className="w-3.5 h-3.5 text-yt-text-muted" />
        <span>مش حابب</span>
      </button>
    </div>
  );
};
