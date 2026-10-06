import db from '../../db';
import type { QueuedVideo } from '../../screens/PlayerView';
import { canPlayVideoInChildContext } from './playlistSafety';

export async function resolvePlaylistQueue(
  playlistId: string,
  initialItemId?: string,
  options: { online?: boolean; shuffle?: boolean } = {},
): Promise<{ items: QueuedVideo[]; itemIds: string[]; playableItemIds: string[]; currentIndex: number }> {
  const rawItems = await db.childPlaylistItems.where('playlistId').equals(playlistId).sortBy('position');
  const playable: Array<{ item: typeof rawItems[number]; queued: QueuedVideo }> = [];
  for (const item of rawItems) {
    const decision = await canPlayVideoInChildContext(item.videoId, { online: options.online });
    if (!decision.allowed || !decision.feed) continue;
    const channel = await db.channels.where('sourceId').equals(decision.feed.channelId).first();
    playable.push({
      item,
      queued: {
        videoId: item.videoId,
        title: decision.feed.title || item.titleSnapshot || item.videoId,
        channelTitle: channel?.title || 'قناة أطفال موثوقة',
        channelId: decision.feed.channelId,
      },
    });
  }
  let ordered = [...playable];
  if (options.shuffle) {
    for (let i = ordered.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    }
  }
  const itemIds = ordered.map((entry) => entry.item.id);
  const playableItemIds = itemIds;
  const currentIndex = initialItemId ? Math.max(0, itemIds.indexOf(initialItemId)) : 0;
  return {
    items: ordered.map((entry) => entry.queued),
    itemIds,
    playableItemIds,
    currentIndex: currentIndex < 0 ? 0 : currentIndex,
  };
}

