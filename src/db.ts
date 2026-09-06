import Dexie, { type EntityTable } from 'dexie';

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
  fetchedAt: number;
}

interface Interaction {
  videoId: string;
  channelId: string;
  watchTime: number;
  videoDuration: number;
  completed: boolean;
  lastWatched: number;
}

interface DownloadItem {
  id?: number;
  title: string;
  channelId: string;
  status: 'downloading' | 'paused' | 'completed' | 'failed';
  progress: number;
  size?: number;
}

const db = new Dexie('KidsYouTubeDB') as Dexie & {
  settings: EntityTable<Settings, 'id'>;
  channels: EntityTable<Channel, 'id'>;
  usage: EntityTable<Usage, 'date'>;
  feedCache: EntityTable<FeedItem, 'videoId'>;
  interactions: EntityTable<Interaction, 'videoId'>;
  downloads: EntityTable<DownloadItem, 'id'>;
};

db.version(1).stores({
  settings: 'id',
  channels: '++id, sourceId, *category',
  usage: 'date',
  feedCache: 'videoId, channelId, fetchedAt',
  interactions: 'videoId, channelId',
  downloads: '++id',
});

export default db;
export type { Settings, Channel, Usage, FeedItem, Interaction, DownloadItem };
