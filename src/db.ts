import Dexie, { type EntityTable } from 'dexie';
import type { PerCategoryState } from './tasteShiftTypes';

interface Settings {
  id: string;
  lastUsedPlaylistId?: string;
  pinHash?: string;
  securityQuestion?: string;
  securityAnswerHash?: string;
  blacklistWords: string[];
  scheduleWindow?: { start: string; end: string };
  sessionLimitMinutes?: number;
  preloadedListVersion?: number;
  pinAttempts?: number;
  childName?: string;
  childAge?: number;
  positiveInterests?: string[];
  negativeInterests?: string[];
  familyYoutubeApiKey?: string;
  hasCompletedFirstSetup?: boolean;
  supportPayOnboardingSeenAt?: number;
  hideMusicVideos?: boolean;
  enabledOptInCategories?: string[];
  tasteShift?: {
    enabled: boolean;
    targetCategories: string[];
    startDate: string;
    weeklyStepPercent: number;
    capPercent: number;
    activeCategoryThisWeek?: string;
    choiceWeekNumber?: number;
    perCategory?: Record<string, PerCategoryState>;
  };
  remoteChannelsCache?: Array<{
    sourceId: string;
    sourceType?: string;
    title?: string;
    categories: string[];
    thumbnail?: string;
  }>;
}

interface Channel {
  id?: number;
  sourceType: 'channel' | 'playlist';
  sourceId: string;
  title: string;
  thumbnail?: string;
  category: string[];
  isPreloaded: boolean;
  enabled: boolean;
  status?: 'active' | 'error' | 'disabled';
  lastHealthCheck?: number;
  consecutiveFailures?: number;
  autoDisabled?: boolean;
  gaming?: { ageRange: string; gameType: string; intensity: string };
}

interface Usage {
  date: string;
  secondsUsedToday: number;
}

interface FeedItem {
  videoId: string;
  channelId: string;
  title: string;
  videoDuration?: number;
  hasMusic?: boolean;
  isPortrait?: boolean;
  fetchedAt: number;
  publishedAt?: string;
  hidden?: boolean;
  viewCount?: number;
  viewCountFetchedAt?: number;
}

interface Interaction {
  videoId: string;
  channelId: string;
  title: string;
  thumbnail?: string;
  parentRating?: 'liked' | 'disliked';
  childReaction?: 'liked' | 'disliked';
  watchTime: number;
  videoDuration: number;
  completed: boolean;
  lastWatched: number;
  savedByParent?: boolean;
  childLoved?: boolean;
}

interface DownloadItem {
  id?: number;
  videoId: string;
  title: string;
  thumbnailUrl?: string;
  channelTitle?: string;
  channelId?: string;
  status: 'queued' | 'downloading' | 'done' | 'failed';
  path?: string;
  errorMessage?: string;
  bytesDownloaded?: number;
  totalBytes?: number | null;
  percent?: number | null;
  createdAt: number;
  updatedAt: number;
}

interface DailySummary {
  date: string;
  totalSecondsWatched: number;
  videosWatchedCount: number;
  categoryBreakdown: Record<string, number>;
  likedVideoIds: string[];
  dislikedVideoIds: string[];
}

interface ChildPlaylist {
  id: string;
  name: string;
  kind?: 'regular' | 'watch_later' | 'favorites' | 'series' | 'system';
  ownerType?: 'local_child' | 'parent_curated' | 'system';
  ownerId?: string;
  visibility?: 'private' | 'family';
  description?: string;
  thumbnailVideoId?: string;
  thumbnailUrl?: string;
  videoIds?: string[];
  createdAt: number;
  updatedAt: number;
}

interface PlaylistItem {
  id: string;
  playlistId: string;
  videoId: string;
  position: number;
  addedAt: number;
  addedByType?: 'child' | 'parent' | 'system';
  addedById?: string;
  titleSnapshot?: string;
  thumbnailSnapshot?: string;
  channelIdSnapshot?: string;
  lastKnownAvailability?: 'available' | 'missing' | 'blocked';
}

interface PlaylistPlaybackSession {
  playlistId: string;
  lastPlayedItemId?: string;
  lastPlayedAt?: number;
  loopMode?: 'off' | 'item' | 'playlist';
  shuffle?: boolean;
  updatedAt: number;
}

interface CustomCategory {
  id?: number;
  categoryId: string;
  label: string;
  emoji: string;
}

interface TasteShiftEvent {
  id?: number;
  ts: number;
  categoryId: string;
  videoId?: string;
  type:
    | 'offered'
    | 'chosen'
    | 'impressed'
    | 'opened'
    | 'completed'
    | 'skipped_early'
    | 'liked'
    | 'disliked';
  meta?: { watchMs?: number; position?: number };
}

const db = new Dexie('KidsYouTubeDB') as Dexie & {
  settings: EntityTable<Settings, 'id'>;
  channels: EntityTable<Channel, 'id'>;
  usage: EntityTable<Usage, 'date'>;
  feedCache: EntityTable<FeedItem, 'videoId'>;
  interactions: EntityTable<Interaction, 'videoId'>;
  downloads: EntityTable<DownloadItem, 'id'>;
  dailySummaries: EntityTable<DailySummary, 'date'>;
  customCategories: EntityTable<CustomCategory, 'id'>;
  tasteShiftEvents: EntityTable<TasteShiftEvent, 'id'>;
  childPlaylists: EntityTable<ChildPlaylist, 'id'>;
  childPlaylistItems: EntityTable<PlaylistItem, 'id'>;
  playlistPlaybackSessions: EntityTable<PlaylistPlaybackSession, 'playlistId'>;
};

db.version(1).stores({
  settings: 'id',
  channels: '++id, sourceId, *category',
  usage: 'date',
  feedCache: 'videoId, channelId, fetchedAt',
  interactions: 'videoId, channelId',
  downloads: '++id',
  dailySummaries: 'date',
});

db.version(2).stores({
  settings: 'id',
  channels: '++id, sourceId, *category',
  usage: 'date',
  feedCache: 'videoId, channelId, fetchedAt, publishedAt',
  interactions: 'videoId, channelId',
  downloads: '++id',
  dailySummaries: 'date',
});

db.version(3).stores({
  settings: 'id',
  channels: '++id, sourceId, *category',
  usage: 'date',
  feedCache: 'videoId, channelId, fetchedAt, publishedAt',
  interactions: 'videoId, channelId',
  downloads: '++id',
  dailySummaries: 'date',
  customCategories: '++id, &categoryId',
});

// Phase B: explicit Taste Shift event log
db.version(4).stores({
  settings: 'id',
  channels: '++id, sourceId, *category',
  usage: 'date',
  feedCache: 'videoId, channelId, fetchedAt, publishedAt',
  interactions: 'videoId, channelId',
  downloads: '++id',
  dailySummaries: 'date',
  customCategories: '++id, &categoryId',
  tasteShiftEvents: '++id, ts, categoryId, type, videoId',
});

// Version 5: viewCount and viewCountFetchedAt fields on feedCache
db.version(5).stores({
  settings: 'id',
  channels: '++id, sourceId, *category',
  usage: 'date',
  feedCache: 'videoId, channelId, fetchedAt, publishedAt',
  interactions: 'videoId, channelId',
  downloads: '++id',
  dailySummaries: 'date',
  customCategories: '++id, &categoryId',
  tasteShiftEvents: '++id, ts, categoryId, type, videoId',
});

// Version 6: updated downloads schema with &videoId, status, and createdAt
db.version(6).stores({
  settings: 'id',
  channels: '++id, sourceId, *category',
  usage: 'date',
  feedCache: 'videoId, channelId, fetchedAt, publishedAt',
  interactions: 'videoId, channelId',
  downloads: '++id, &videoId, status, createdAt',
  dailySummaries: 'date',
  customCategories: '++id, &categoryId',
  tasteShiftEvents: '++id, ts, categoryId, type, videoId',
});

// Version 7: child-created playlists for the Favorites screen
db.version(7).stores({
  settings: 'id',
  channels: '++id, sourceId, *category',
  usage: 'date',
  feedCache: 'videoId, channelId, fetchedAt, publishedAt',
  interactions: 'videoId, channelId',
  downloads: '++id, &videoId, status, createdAt',
  dailySummaries: 'date',
  customCategories: '++id, &categoryId',
  tasteShiftEvents: '++id, ts, categoryId, type, videoId',
  childPlaylists: 'id, createdAt, updatedAt',
});


// Version 8: canonical playlist membership and playback sessions. Legacy videoIds[] is kept for one compatibility release.
db.version(8).stores({
  settings: 'id',
  channels: '++id, sourceId, *category',
  usage: 'date',
  feedCache: 'videoId, channelId, fetchedAt, publishedAt',
  interactions: 'videoId, channelId',
  downloads: '++id, &videoId, status, createdAt',
  dailySummaries: 'date',
  customCategories: '++id, &categoryId',
  tasteShiftEvents: '++id, ts, categoryId, type, videoId',
  childPlaylists: 'id, createdAt, updatedAt',
  childPlaylistItems: 'id, playlistId, videoId, position, addedAt, &[playlistId+videoId], [playlistId+position]',
  playlistPlaybackSessions: 'playlistId, updatedAt',
}).upgrade(async (tx) => {
  const playlists = await tx.table('childPlaylists').toArray();
  const itemsTable = tx.table('childPlaylistItems');
  const existing = await itemsTable.toArray();
  const membership = new Set(existing.map((item) => String(item.playlistId) + '\u0000' + String(item.videoId)));
  let ordinal = 0;
  for (const playlist of playlists) {
    const legacyIds = Array.isArray(playlist.videoIds) ? playlist.videoIds : [];
    const seen = new Set();
    let position = 0;
    for (const rawId of legacyIds) {
      const videoId = String(rawId ?? '').trim();
      if (!videoId || seen.has(videoId)) continue;
      seen.add(videoId);
      const key = String(playlist.id) + '\u0000' + videoId;
      if (membership.has(key)) continue;
      const itemId = 'playlist-item-migration-' + String(playlist.id) + '-' + String(ordinal++);
      await itemsTable.add({ id: itemId, playlistId: playlist.id, videoId, position, addedAt: playlist.createdAt || Date.now(), addedByType: 'system', addedById: 'migration-v8' });
      membership.add(key);
      position += 1;
    }
  }
});

// Version 9: Index lastWatched, savedByParent, and childLoved on interactions table
db.version(9).stores({
  settings: 'id',
  channels: '++id, sourceId, *category',
  usage: 'date',
  feedCache: 'videoId, channelId, fetchedAt, publishedAt',
  interactions: 'videoId, channelId, lastWatched, savedByParent, childLoved',
  downloads: '++id, &videoId, status, createdAt',
  dailySummaries: 'date',
  customCategories: '++id, &categoryId',
  tasteShiftEvents: '++id, ts, categoryId, type, videoId',
  childPlaylists: 'id, createdAt, updatedAt',
  childPlaylistItems: 'id, playlistId, videoId, position, addedAt, &[playlistId+videoId], [playlistId+position]',
  playlistPlaybackSessions: 'playlistId, updatedAt',
}).upgrade(async (tx) => {
  const interactionsTable = tx.table('interactions');
  await interactionsTable.toCollection().modify((item: any) => {
    if (typeof item.lastWatched !== 'number' || isNaN(item.lastWatched)) {
      item.lastWatched = 0;
    }
  });
});

// INVARIANT: Block adding any channel whose sourceId starts with '@'
db.channels.hook('creating', (_primKey, obj) => {
  if (obj.sourceId && typeof obj.sourceId === 'string' && obj.sourceId.trim().startsWith('@')) {
    throw new Error('Database Invariant: Channel sourceId cannot start with @. Must be resolved to canonical UC... channel ID.');
  }
});

export default db;
export const DEFAULT_SCHEDULE_WINDOW = { start: '00:00', end: '23:59' };
export const DEFAULT_SESSION_LIMIT_MINUTES = 60;
export type {
  Settings,
  Channel,
  Usage,
  FeedItem,
  Interaction,
  DownloadItem,
  DailySummary,
  CustomCategory,
  TasteShiftEvent,
  ChildPlaylist,
  PlaylistItem,
  PlaylistPlaybackSession,
};
