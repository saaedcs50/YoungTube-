import Dexie, { type EntityTable } from 'dexie';
import type { PerCategoryState } from './tasteShiftTypes';

interface Settings {
  id: string;
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
  hideMusicVideos?: boolean;
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
}

interface DownloadItem {
  id?: number;
  title: string;
  channelId: string;
  status: 'downloading' | 'paused' | 'completed' | 'failed';
  progress: number;
  size?: number;
}

interface DailySummary {
  date: string;
  totalSecondsWatched: number;
  videosWatchedCount: number;
  categoryBreakdown: Record<string, number>;
  likedVideoIds: string[];
  dislikedVideoIds: string[];
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
};
