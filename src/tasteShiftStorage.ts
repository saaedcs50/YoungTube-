import db from './db';
import type { TasteShiftConfig, TasteShiftEvent, TasteShiftEventType } from './tasteShiftTypes';
import { applyReactionEvent } from './tasteShiftEngine';

/** Append an event row. */
export async function logTasteEvent(
  categoryId: string,
  type: TasteShiftEventType,
  videoId?: string,
  meta?: TasteShiftEvent['meta']
): Promise<void> {
  await db.tasteShiftEvents.add({
    ts: Date.now(),
    categoryId,
    type,
    videoId,
    meta,
  });
}

/**
 * Apply a logged taste event (completed / skipped_early) to update settings.tasteShift.perCategory.
 */
export async function applyLoggedTasteEvent(
  categoryId: string,
  type: TasteShiftEventType
): Promise<void> {
  if (type !== 'completed' && type !== 'skipped_early') return;
  if (!categoryId || categoryId === 'general') return;

  const settings = await db.settings.get('main');
  const prev = settings?.tasteShift;
  if (!prev || prev.enabled !== true) return;

  const perCategory = applyReactionEvent(prev as TasteShiftConfig, categoryId, type);

  await db.settings.update('main', {
    tasteShift: {
      ...prev,
      perCategory,
    },
  });
}

/**
 * Record liked/disliked/completed/skipped and update perCategory + interactions.
 * Returns the new effectiveShare for the category (for UI feedback).
 */
export async function recordChildReaction(opts: {
  categoryId: string;
  videoId: string;
  channelId?: string;
  title?: string;
  reaction: 'liked' | 'disliked';
}): Promise<number> {
  const { categoryId, videoId, channelId, title, reaction } = opts;
  const settings = await db.settings.get('main');
  const prev = settings?.tasteShift;
  if (!prev?.enabled) return 0;

  const perCategory = applyReactionEvent(prev as TasteShiftConfig, categoryId, reaction);

  await db.settings.update('main', {
    tasteShift: {
      ...prev,
      perCategory,
    },
  });

  await logTasteEvent(categoryId, reaction, videoId);

  // Mirror into interactions for legacy dashboard summary
  const existing = await db.interactions.get(videoId);
  if (existing) {
    await db.interactions.update(videoId, {
      childReaction: reaction,
      lastWatched: Date.now(),
    });
  } else {
    await db.interactions.put({
      videoId,
      channelId: channelId || '',
      title: title || '',
      childReaction: reaction,
      watchTime: 0,
      videoDuration: 0,
      completed: false,
      lastWatched: Date.now(),
    });
  }

  return perCategory[categoryId]?.effectiveShare ?? 0;
}

export async function logChosen(categoryId: string): Promise<void> {
  await logTasteEvent(categoryId, 'chosen');
}

export async function logImpressedBatch(
  categoryId: string,
  videoIds: string[]
): Promise<void> {
  if (videoIds.length === 0) return;
  const settings = await db.settings.get('main');
  const prev = settings?.tasteShift;
  if (!prev) return;

  let perCategory = { ...(prev.perCategory || {}) };
  let cfg = { ...prev, perCategory } as TasteShiftConfig;
  for (const videoId of videoIds) {
    perCategory = applyReactionEvent(cfg, categoryId, 'impressed');
    cfg = { ...cfg, perCategory };
    await logTasteEvent(categoryId, 'impressed', videoId);
  }
  await db.settings.update('main', {
    tasteShift: { ...prev, perCategory },
  });
}
