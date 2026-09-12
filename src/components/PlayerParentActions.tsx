import React, { useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import db from '../db';
import channelsSeed from '../../channels_seed.json';
import PinLockModal from './PinLockModal';
import { Flag, Ban, Check, Loader2 } from 'lucide-react';

interface PlayerParentActionsProps {
  videoId: string;
  channelId?: string;
  channelTitle?: string;
  /** After report: parent may advance queue */
  onReported?: (videoId: string) => void;
  /** After block: parent should rebuild queue / leave */
  onBlocked?: (channelId: string) => void;
  className?: string;
}

/**
 * Phase 5 — parent tools inside the player:
 * Report video (local) + Block channel (PIN-gated).
 */
export type PlayerParentActionsHandle = {
  report: () => void;
  block: () => void;
};

const PlayerParentActions = forwardRef<PlayerParentActionsHandle, PlayerParentActionsProps>(function PlayerParentActions({
  videoId,
  channelId,
  channelTitle,
  onReported,
  onBlocked,
  className = '',
}, ref) {
  const [busy, setBusy] = useState<'report' | 'block' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pendingBlock, setPendingBlock] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  const handleReport = useCallback(async () => {
    if (!videoId || busy) return;
    setBusy('report');
    try {
      const item = await db.feedCache.get(videoId);
      await db.feedCache.update(videoId, { hidden: true });

      const existing = await db.interactions.get(videoId);
      await db.interactions.put({
        videoId,
        channelId: item?.channelId || channelId || '',
        title: item?.title || 'فيديو مبلغ عنه',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        parentRating: 'disliked',
        watchTime: existing?.watchTime ?? 0,
        videoDuration: existing?.videoDuration ?? item?.videoDuration ?? 0,
        completed: existing?.completed ?? false,
        lastWatched: Date.now(),
      });

      showToast('تم الإبلاغ وإخفاء الفيديو من قائمة الطفل');
      onReported?.(videoId);
    } catch (err) {
      console.error('Report failed:', err);
      showToast('تعذر الإبلاغ، حاول مرة أخرى');
    } finally {
      setBusy(null);
    }
  }, [videoId, channelId, busy, onReported]);

  const executeBlockChannel = useCallback(async () => {
    if (!channelId) {
      showToast('لا يمكن تحديد القناة');
      return;
    }
    setBusy('block');
    try {
      const rows = await db.channels.where('sourceId').equals(channelId).toArray();
      if (rows.length === 0) {
        // Seed channels often have no Dexie row until curation runs — upsert a disabled row
        // so KidHome keeps treating the channel as blocked after the next archive sync.
        const seed = (channelsSeed as any[]).find((c) => c.sourceId === channelId);
        const cats = seed?.categories || seed?.category || [];
        await db.channels.add({
          sourceType: (seed?.sourceType === 'playlist' ? 'playlist' : 'channel') as
            | 'channel'
            | 'playlist',
          sourceId: channelId,
          title: channelTitle || seed?.title || seed?.originalName || channelId,
          thumbnail: seed?.thumbnail,
          category: Array.isArray(cats) ? cats : [cats],
          isPreloaded: Boolean(seed),
          enabled: false,
          status: 'disabled',
          autoDisabled: false,
        });
      } else {
        for (const row of rows) {
          if (row.id != null) {
            await db.channels.update(row.id, {
              enabled: false,
              status: 'disabled',
              autoDisabled: false,
            });
          }
        }
      }

      // Hide every cached video from this channel
      const videos = await db.feedCache.where('channelId').equals(channelId).toArray();
      for (const v of videos) {
        await db.feedCache.update(v.videoId, { hidden: true });
      }

      const name = channelTitle || channelId;
      showToast(`تم حظر القناة: ${name}`);
      onBlocked?.(channelId);
    } catch (err) {
      console.error('Block channel failed:', err);
      showToast('تعذر حظر القناة');
    } finally {
      setBusy(null);
      setPendingBlock(false);
    }
  }, [channelId, channelTitle, onBlocked]);

  const requestBlock = () => {
    if (!channelId || busy) return;
    setPendingBlock(true);
    setPinOpen(true);
  };

  useImperativeHandle(ref, () => ({
    report: () => { void handleReport(); },
    block: () => { requestBlock(); },
  }), [handleReport, channelId, busy]);

  return (
    <>
      <div className={`flex items-center gap-1.5 ${className}`}>
        <button
          type="button"
          id="player-report-btn"
          onClick={handleReport}
          disabled={!!busy}
          className="inline-flex items-center justify-center gap-1 min-h-11 min-w-11 px-3 rounded-full bg-white/10 hover:bg-amber-500/25 text-white border border-white/15 text-[11px] font-semibold cursor-pointer disabled:opacity-50 transition"
          title="الإبلاغ عن هذا الفيديو"
        >
          {busy === 'report' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Flag className="w-4 h-4 text-amber-300" />
          )}
          <span className="hidden sm:inline">إبلاغ</span>
        </button>

        <button
          type="button"
          id="player-block-btn"
          onClick={requestBlock}
          disabled={!!busy || !channelId}
          className="inline-flex items-center justify-center gap-1 min-h-11 min-w-11 px-3 rounded-full bg-white/10 hover:bg-rose-500/30 text-white border border-white/15 text-[11px] font-semibold cursor-pointer disabled:opacity-50 transition"
          title="حظر القناة (يتطلب PIN)"
        >
          {busy === 'block' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Ban className="w-4 h-4 text-rose-300" />
          )}
          <span className="hidden sm:inline">حظر</span>
        </button>
      </div>

      {toast && (
        <div
          className="fixed top-16 inset-x-3 z-[120] mx-auto max-w-sm px-3 py-2.5 rounded-xl bg-zinc-900/95 border border-white/15 text-xs text-white text-center shadow-xl flex items-center justify-center gap-2"
          role="status"
        >
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      <PinLockModal
        isOpen={pinOpen}
        onClose={() => {
          setPinOpen(false);
          setPendingBlock(false);
        }}
        onUnlockSuccess={() => {
          setPinOpen(false);
          if (pendingBlock) {
            void executeBlockChannel();
          }
        }}
      />
    </>
  );
});

export default PlayerParentActions;
