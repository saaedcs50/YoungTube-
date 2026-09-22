export interface KVNamespace {
  get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }): Promise<any>;
  put(
    key: string,
    value: string | ReadableStream | ArrayBuffer,
    options?: { expiration?: number; expirationTtl?: number }
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<any>;
}

export interface DurableObjectId {
  toString(): string;
  equals(other: DurableObjectId): boolean;
  name?: string;
}

export interface DurableObjectStub {
  fetch(request: Request | string, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

export interface Env {
  CHANNELS_ARCHIVE?: KVNamespace;
  TELEMETRY_DO?: DurableObjectNamespace;
  YOUTUBE_API_KEY?: string;
  ADMIN_KEY?: string;
}

export interface VideoItem {
  videoId: string;
  title: string;
  publishedAt: string;
}

export interface TelemetryDaily {
  date: string; // YYYY-MM-DD UTC

  // —— أهل ——
  parentSessionsByCountry: Record<string, number>;
  parentDurationSecByCountry: Record<string, number>;
  parentSessionsTotal: number;
  parentDurationSecTotal: number;

  // —— طفل ——
  childSessionsByCountry: Record<string, number>;
  childDurationSecByCountry: Record<string, number>;
  childSessionsTotal: number;
  childDurationSecTotal: number;

  // —— تثبيتات ——
  uniqueByCountry: Record<string, number>;
  uniqueInstallsTotal: number;

  updatedAt: number;
}

export const ACCEPTED_FUNNEL_EVENTS = [
  'welcome_seen',
  'onboarding_started',
  'onboarding_completed',
  'first_play',
] as const;

export type FunnelEvent = (typeof ACCEPTED_FUNNEL_EVENTS)[number];

export interface TelemetryFunnelDaily {
  date: string; // YYYY-MM-DD UTC
  events: Record<string, number>;
  eventsByCountry: Record<string, Record<string, number>>;
  uniqueByEvent: Record<string, number>;
  updatedAt: number;
}

export interface MaintenanceLock {
  lockedBy: string; // 'scheduled' | 'manual_admin' | 'manual_admin_cleanup'
  startedAt: string; // ISO string
  until: string; // ISO string
}

export interface MaintenanceStatus {
  lastRunTime: string | null;
  cursor: number;
  lastError: string | null;
  lastProcessed: { sourceId: string; title: string; videoCount: number }[];
  lastFailed: any[];
  isLocked: boolean;
  lockUntil: string | null;
  primaryTask: string;
  batchSize: number;
  totalChannels: number;
}

export interface BackfillBatchResult {
  processedChannels: { sourceId: string; title: string; videoCount: number }[];
  failedChannels: (
    | { sourceId: string; title: string; error: 'youtube_rate_limited'; status: number }
    | { sourceId: string; title: string; error: 'other'; message: string }
  )[];
  cursorBefore: number;
  cursorAfter: number;
  totalChannels: number;
  wrappedAround: boolean;
}
