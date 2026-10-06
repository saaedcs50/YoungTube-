import type { ChildPlaylist, PlaylistItem, PlaylistPlaybackSession } from '../../db';

export type PlaylistKind = 'regular' | 'watch_later' | 'favorites' | 'series' | 'system';
export type PlaylistOwnerType = 'local_child' | 'parent_curated' | 'system';
export type PlaylistVisibility = 'private' | 'family';

export interface PlaylistPlaybackContext {
  source: 'feed' | 'playlist' | 'favorites' | 'search' | 'downloads' | 'channel';
  playlistId?: string;
  playlistItemId?: string;
  initialIndex?: number;
  orderedItemIds?: string[];
  shuffle?: boolean;
}

export interface ResolvedPlaylistQueue {
  source: 'playlist';
  playlistId: string;
  itemIds: string[];
  playableItemIds: string[];
  currentIndex: number;
  transient: boolean;
  shuffle: boolean;
}

export type { ChildPlaylist, PlaylistItem, PlaylistPlaybackSession };

