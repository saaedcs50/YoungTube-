import type { FeedItem, PlaylistItem, ChildPlaylist } from '../../db';
import db from '../../db';
import { canPlayVideoInChildContext, type PlaylistSafetyReason } from './playlistSafety';

export interface PlaylistItemView {
  item: PlaylistItem;
  feed?: FeedItem;
  playable: boolean;
  reason?: PlaylistSafetyReason;
  localPath?: string;
}

export interface PlaylistSummary {
  playlist: ChildPlaylist;
  totalCount: number;
  playableCount: number;
  thumbnailUrl?: string;
}

export async function resolvePlaylistItemViews(playlistId: string, options: { online?: boolean } = {}): Promise<PlaylistItemView[]> {
  const items = await db.childPlaylistItems.where('playlistId').equals(playlistId).sortBy('position');
  return Promise.all(items.map(async (item) => {
    const decision = await canPlayVideoInChildContext(item.videoId, options);
    if (decision.allowed) {
      return { item, feed: decision.feed, playable: true, localPath: decision.localPath };
    }
    return { item, feed: decision.feed, playable: false, reason: decision.reason };
  }));
}

export async function getPlaylistSummary(playlist: ChildPlaylist): Promise<PlaylistSummary> {
  const views = await resolvePlaylistItemViews(playlist.id);
  const first = views.find((view) => view.playable && view.feed?.videoId) ?? views.find((view) => view.feed?.videoId);
  return {
    playlist,
    totalCount: views.length,
    playableCount: views.filter((view) => view.playable).length,
    thumbnailUrl: first?.feed?.videoId ? `https://i.ytimg.com/vi/${first.feed.videoId}/mqdefault.jpg` : undefined,
  };
}

