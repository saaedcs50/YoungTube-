import channelsSeed from '../channels_seed.json';
import { TelemetryAggregator } from './telemetry_do';

export { TelemetryAggregator };
 
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

const corsHeaders: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, X-Admin-Key, Authorization, X-Family-Youtube-Key, x-family-youtube-key',
};

/**
 * Resolves the YouTube API key from request headers or environment variable.
 * Priority: X-Family-Youtube-Key header > env.YOUTUBE_API_KEY.
 * Never logs key value.
 */
function resolveYouTubeApiKey(request: Request, env: Env): string {
  const headerKey =
    request.headers.get('X-Family-Youtube-Key') ||
    request.headers.get('x-family-youtube-key') ||
    '';
  const trimmedHeader = headerKey.trim();
  if (trimmedHeader) {
    return trimmedHeader;
  }
  return (env.YOUTUBE_API_KEY || '').trim();
}

/**
 * Merges new videos with existing KV archive for sourceId, dedupes by videoId,
 * sorts by publishedAt desc, caps stored list at 2000 items, and saves back to KV best-effort.
 */
async function mergeAndStoreKVArchive(
  env: Env,
  sourceId: string,
  newVideos: VideoItem[]
): Promise<VideoItem[]> {
  if (!env.CHANNELS_ARCHIVE || !sourceId) return newVideos;

  let existing: VideoItem[] = [];
  try {
    const raw = await env.CHANNELS_ARCHIVE.get(sourceId);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) existing = parsed;
    }
  } catch {}

  const videoMap = new Map<string, VideoItem>();
  for (const v of existing) {
    if (v && v.videoId) videoMap.set(v.videoId, v);
  }
  for (const v of newVideos) {
    if (v && v.videoId) videoMap.set(v.videoId, v);
  }

  const merged = Array.from(videoMap.values());
  merged.sort((a, b) => {
    const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return timeB - timeA;
  });

  const capped = merged.slice(0, 2000);
  try {
    await env.CHANNELS_ARCHIVE.put(sourceId, JSON.stringify(capped));
  } catch (err) {
    console.warn(`Failed to store merged KV archive for ${sourceId}:`, err);
  }

  return merged;
}

/**
 * Validates admin requests using Authorization: Bearer ADMIN_KEY (or legacy X-Admin-Key).
 */
function checkAdminAuth(request: Request, env: Env): boolean {
  if (!env.ADMIN_KEY) return false;
  const authHeader =
    request.headers.get('Authorization') || request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token === env.ADMIN_KEY) return true;
  }
  const xKey = request.headers.get('X-Admin-Key') || request.headers.get('x-admin-key') || '';
  if (xKey === env.ADMIN_KEY) return true;
  return false;
}

/**
 * Parses ISO 8601 duration string (e.g. "PT1M30S", "PT45S", "PT2H3M10S") into total seconds.
 */
function parseIsoDuration(durationStr: string): number {
  if (!durationStr) return 0;
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const seconds = match[3] ? parseInt(match[3], 10) : 0;
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Parses JPEG image dimensions (width and height) from an ArrayBuffer of JPEG header bytes.
 */
function getJpegDimensions(buffer: ArrayBuffer): { width: number; height: number } | null {
  if (!buffer || buffer.byteLength < 4) return null;
  const view = new DataView(buffer);
  if (view.getUint8(0) !== 0xFF || view.getUint8(1) !== 0xD8) {
    return null;
  }

  const SOF_MARKERS = new Set([
    0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF,
  ]);

  let offset = 2;
  let iterations = 0;

  while (offset + 1 < buffer.byteLength) {
    if (++iterations > 500) return null;

    if (view.getUint8(offset) !== 0xFF) {
      return null;
    }

    const marker = view.getUint8(offset + 1);

    if (marker === 0xFF) {
      offset += 1;
      continue;
    }

    if (SOF_MARKERS.has(marker)) {
      if (offset + 8 >= buffer.byteLength) return null;
      const height = view.getUint16(offset + 5, false);
      const width = view.getUint16(offset + 7, false);
      return { width, height };
    }

    if (offset + 3 >= buffer.byteLength) return null;
    const segmentLength = view.getUint16(offset + 2, false);
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }

  return null;
}

/**
 * Rate Limiting Constants for Targeted Public GET Endpoints (Phase P3.2)
 *
 * Rules & Invariants:
 * - Window: 60 seconds
 * - Limit: 60 requests per IP per window (1 req/sec average, generous for multiple kids sharing NAT)
 * - Exceeded response: HTTP 429 with { error: 'rate_limit' }, Retry-After: 60, and CORS headers
 * - Excludes admin Bearer / X-Admin-Key routes
 * - Zero high-volume KV writes: Uses in-memory counting within Durable Object (with in-memory worker isolate fallback)
 */
export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const RATE_LIMIT_MAX_REQUESTS = 60;
export const RATE_LIMITED_ROUTES = new Set([
  '/api/categories',
  '/api/channels-latest',
  '/api/announcements',
  '/api/global-blocks',
  '/api/rss',
]);

// In-memory fallback map for worker isolates when Durable Objects are unavailable or during tests
const fallbackRateLimitMap = new Map<string, { count: number; resetAt: number }>();
let lastFallbackSweep = Date.now();

function checkFallbackRateLimit(ip: string): boolean {
  const now = Date.now();
  if (now - lastFallbackSweep > 60000) {
    lastFallbackSweep = now;
    for (const [key, entry] of fallbackRateLimitMap.entries()) {
      if (now > entry.resetAt) {
        fallbackRateLimitMap.delete(key);
      }
    }
  }

  const windowMs = RATE_LIMIT_WINDOW_SECONDS * 1000;
  let entry = fallbackRateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    fallbackRateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  return true;
}

/**
 * Checks rate limit for public GET requests via Durable Object (Approach A)
 * or gracefully falls back to worker isolate in-memory state.
 */
async function checkPublicRateLimit(request: Request, env: Env): Promise<boolean> {
  const ip =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '127.0.0.1';

  if (env.TELEMETRY_DO) {
    try {
      const id = env.TELEMETRY_DO.idFromName('rate-limiter-v1');
      const stub = env.TELEMETRY_DO.get(id);
      const res = await stub.fetch('http://do/rate_limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip,
          limit: RATE_LIMIT_MAX_REQUESTS,
          windowSec: RATE_LIMIT_WINDOW_SECONDS,
        }),
      });
      if (res.ok) {
        const data: any = await res.json();
        return data.allowed !== false;
      }
    } catch (err) {
      console.warn('DO rate limit check failed, using in-memory fallback:', err);
    }
  }

  return checkFallbackRateLimit(ip);
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

function getTodayDateUtc(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Records telemetry events to KV in daily buckets.
 * - Country derived from CF-IPCountry (defaults to XX).
 * - Aggregates parent & child sessions and playing duration separately as integers.
 * - Tracks unique installIds per country.
 */
async function recordTelemetryEvent(
  env: Env,
  type: 'parent_start' | 'parent_end' | 'child_end',
  country: string,
  installId?: string,
  durationSec: number = 0
): Promise<void> {
  if (!env.CHANNELS_ARCHIVE) return;

  const date = getTodayDateUtc();
  const dailyKey = `telemetry_daily:${date}`;
  const uniquesKey = `telemetry_uniques:${date}`;

  let daily: TelemetryDaily = {
    date,
    parentSessionsByCountry: {},
    parentDurationSecByCountry: {},
    parentSessionsTotal: 0,
    parentDurationSecTotal: 0,
    childSessionsByCountry: {},
    childDurationSecByCountry: {},
    childSessionsTotal: 0,
    childDurationSecTotal: 0,
    uniqueByCountry: {},
    uniqueInstallsTotal: 0,
    updatedAt: Date.now(),
  };

  try {
    const rawDaily = await env.CHANNELS_ARCHIVE.get(dailyKey);
    if (rawDaily) {
      daily = { ...daily, ...JSON.parse(rawDaily) };
    }
  } catch {}

  let uniques: Record<string, string[]> = {};
  try {
    const rawUniques = await env.CHANNELS_ARCHIVE.get(uniquesKey);
    if (rawUniques) {
      uniques = JSON.parse(rawUniques);
    }
  } catch {}

  const cc = (country && country.trim().toUpperCase()) || 'XX';

  if (installId && typeof installId === 'string' && installId.trim()) {
    const cleanId = installId.trim();
    if (!uniques[cc]) uniques[cc] = [];
    if (!uniques[cc].includes(cleanId)) {
      uniques[cc].push(cleanId);
    }

    const allUniqueIds = new Set<string>();
    daily.uniqueByCountry = {};
    for (const [c, ids] of Object.entries(uniques)) {
      daily.uniqueByCountry[c] = ids.length;
      for (const id of ids) allUniqueIds.add(id);
    }
    daily.uniqueInstallsTotal = allUniqueIds.size;
  }

  daily.parentSessionsByCountry = daily.parentSessionsByCountry || {};
  daily.parentDurationSecByCountry = daily.parentDurationSecByCountry || {};
  daily.childSessionsByCountry = daily.childSessionsByCountry || {};
  daily.childDurationSecByCountry = daily.childDurationSecByCountry || {};

  const cleanDuration = Math.max(0, Math.floor(Number(durationSec) || 0));

  if (type === 'parent_end') {
    const cappedDuration = Math.min(cleanDuration, 7200); // 2 hours cap
    daily.parentSessionsByCountry[cc] = (daily.parentSessionsByCountry[cc] || 0) + 1;
    daily.parentDurationSecByCountry[cc] =
      (daily.parentDurationSecByCountry[cc] || 0) + cappedDuration;
    daily.parentSessionsTotal = (daily.parentSessionsTotal || 0) + 1;
    daily.parentDurationSecTotal = (daily.parentDurationSecTotal || 0) + cappedDuration;
  } else if (type === 'child_end') {
    const cappedDuration = Math.min(cleanDuration, 14400); // 4 hours cap
    daily.childSessionsByCountry[cc] = (daily.childSessionsByCountry[cc] || 0) + 1;
    daily.childDurationSecByCountry[cc] =
      (daily.childDurationSecByCountry[cc] || 0) + cappedDuration;
    daily.childSessionsTotal = (daily.childSessionsTotal || 0) + 1;
    daily.childDurationSecTotal = (daily.childDurationSecTotal || 0) + cappedDuration;
  }

  daily.updatedAt = Date.now();

  await Promise.all([
    env.CHANNELS_ARCHIVE.put(dailyKey, JSON.stringify(daily)),
    env.CHANNELS_ARCHIVE.put(uniquesKey, JSON.stringify(uniques)),
  ]);

  try {
    const rawIndex = await env.CHANNELS_ARCHIVE.get('telemetry_index');
    let indexDates: string[] = [];
    if (rawIndex) {
      indexDates = JSON.parse(rawIndex);
    }
    if (!indexDates.includes(date)) {
      indexDates.unshift(date);
      const uniqueSorted = Array.from(new Set(indexDates))
        .sort()
        .reverse()
        .slice(0, 30);
      await env.CHANNELS_ARCHIVE.put('telemetry_index', JSON.stringify(uniqueSorted));
    }
  } catch {}
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

/**
 * Records funnel events to KV in daily aggregate buckets.
 * - Country derived from CF-IPCountry (defaults to XX).
 * - Tracks total counts per event and event counts broken down by country.
 * - Optionally tracks unique installIds count per event.
 * - Does not store videoId, titles, or PIN data.
 */
async function recordFunnelEvent(
  env: Env,
  event: string,
  country: string,
  installId?: string
): Promise<void> {
  if (!env.CHANNELS_ARCHIVE) return;

  const date = getTodayDateUtc();
  const funnelDailyKey = `telemetry_funnel:${date}`;
  const funnelUniquesKey = `telemetry_funnel_uniques:${date}`;

  let daily: TelemetryFunnelDaily = {
    date,
    events: {},
    eventsByCountry: {},
    uniqueByEvent: {},
    updatedAt: Date.now(),
  };

  try {
    const rawDaily = await env.CHANNELS_ARCHIVE.get(funnelDailyKey);
    if (rawDaily) {
      daily = { ...daily, ...JSON.parse(rawDaily) };
    }
  } catch {}

  daily.events = daily.events || {};
  daily.eventsByCountry = daily.eventsByCountry || {};
  daily.uniqueByEvent = daily.uniqueByEvent || {};

  const cc = (country && country.trim().toUpperCase()) || 'XX';

  // Increment total event count
  daily.events[event] = (daily.events[event] || 0) + 1;

  // Increment event count by country
  if (!daily.eventsByCountry[event]) {
    daily.eventsByCountry[event] = {};
  }
  daily.eventsByCountry[event][cc] = (daily.eventsByCountry[event][cc] || 0) + 1;

  let uniques: Record<string, string[]> = {};
  if (installId && typeof installId === 'string' && installId.trim()) {
    const cleanId = installId.trim();
    try {
      const rawUniques = await env.CHANNELS_ARCHIVE.get(funnelUniquesKey);
      if (rawUniques) {
        uniques = JSON.parse(rawUniques);
      }
    } catch {}

    if (!uniques[event]) uniques[event] = [];
    if (!uniques[event].includes(cleanId)) {
      uniques[event].push(cleanId);
    }

    for (const [ev, ids] of Object.entries(uniques)) {
      daily.uniqueByEvent[ev] = ids.length;
    }
  }

  daily.updatedAt = Date.now();

  const puts: Promise<void>[] = [
    env.CHANNELS_ARCHIVE.put(funnelDailyKey, JSON.stringify(daily)),
  ];
  if (installId && typeof installId === 'string' && installId.trim()) {
    puts.push(env.CHANNELS_ARCHIVE.put(funnelUniquesKey, JSON.stringify(uniques)));
  }
  await Promise.all(puts);

  try {
    const rawIndex = await env.CHANNELS_ARCHIVE.get('telemetry_index');
    let indexDates: string[] = [];
    if (rawIndex) {
      indexDates = JSON.parse(rawIndex);
    }
    if (!indexDates.includes(date)) {
      indexDates.unshift(date);
      const uniqueSorted = Array.from(new Set(indexDates))
        .sort()
        .reverse()
        .slice(0, 30);
      await env.CHANNELS_ARCHIVE.put('telemetry_index', JSON.stringify(uniqueSorted));
    }
  } catch {}
}

/**
 * Parses YouTube XML RSS feed into an array of VideoItem objects.
 */
function parseYouTubeRss(xml: string): VideoItem[] {
  const entries: VideoItem[] = [];
  const entryRegex = /<entry[\s\S]*?<\/entry>/gi;
  const matches = xml.match(entryRegex) || [];

  for (const entry of matches) {
    const videoIdMatch =
      entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i) ||
      entry.match(/<id>yt:video:([^<]+)<\/id>/i);
    const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const publishedMatch = entry.match(/<published>([^<]+)<\/published>/i);

    if (videoIdMatch && videoIdMatch[1]) {
      const rawTitle = titleMatch ? titleMatch[1] : '';
      const cleanTitle = rawTitle
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();

      entries.push({
        videoId: videoIdMatch[1].trim(),
        title: cleanTitle,
        publishedAt: publishedMatch ? publishedMatch[1].trim() : new Date().toISOString(),
      });
    }
  }

  return entries;
}

/**
 * Internal helper to fetch and parse YouTube RSS feed live.
 */
async function fetchYouTubeRss(sourceType: 'channel' | 'playlist' | string, sourceId: string): Promise<VideoItem[]> {
  const rssUrl =
    sourceType === 'playlist'
      ? `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(sourceId)}`
      : `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(sourceId)}`;

  const rssResponse = await fetch(rssUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!rssResponse.ok) {
    throw new Error(`YouTube RSS returned status ${rssResponse.status}`);
  }

  const xmlText = await rssResponse.text();
  return parseYouTubeRss(xmlText);
}

/**
 * Processes a batch of 45 channels from channels_seed.json:
 * - Reads cursor from KV (_rss_refresh_cursor)
 * - Fetches live RSS for 45 channels only (safely under the 50 subrequests limit)
 * - Merges with archived videos in KV
 * - Deduplicates by videoId, sorts by publishedAt descending, caps at 200 videos
 * - Updates each channel in place in the full list stored at _channels_latest_merged
 * - Updates cursor for the next batch of 45 (circular wrap-around)
 */
export async function refreshChannelsBatch(env: Env): Promise<{
  updatedCount: number;
  cursorBefore: number;
  cursorAfter: number;
  updatedChannels: string[];
}> {
  const totalChannels = channelsSeed.length;
  const BATCH_SIZE = 45;

  if (!env.CHANNELS_ARCHIVE) {
    return {
      updatedCount: 0,
      cursorBefore: 0,
      cursorAfter: 0,
      updatedChannels: [],
    };
  }

  // 1. Get cursor from KV
  let cursor = 0;
  try {
    const rawCursor = await env.CHANNELS_ARCHIVE.get('_rss_refresh_cursor');
    if (rawCursor) {
      const parsed = parseInt(rawCursor, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        cursor = parsed % totalChannels;
      }
    }
  } catch {
    cursor = 0;
  }

  // 2. Select 12 channels with circular wrap-around
  const batch: { channel: any; originalIndex: number }[] = [];
  for (let i = 0; i < BATCH_SIZE; i++) {
    const idx = (cursor + i) % totalChannels;
    batch.push({
      channel: channelsSeed[idx],
      originalIndex: idx,
    });
  }

  // 3. Concurrently fetch live RSS and archived videos (bounded under the 50 subrequest cap)
  const batchResults = await Promise.allSettled(
    batch.map(async ({ channel }) => {
      const [rssResult, existingArchive] = await Promise.allSettled([
        fetchYouTubeRss(channel.sourceType || 'channel', channel.sourceId),
        env.CHANNELS_ARCHIVE!.get(channel.sourceId),
      ]);

      const liveVideos: VideoItem[] =
        rssResult.status === 'fulfilled' && Array.isArray(rssResult.value)
          ? rssResult.value
          : [];

      let archivedVideos: VideoItem[] = [];
      if (existingArchive.status === 'fulfilled' && existingArchive.value) {
        try {
          const parsed = JSON.parse(existingArchive.value);
          if (Array.isArray(parsed)) {
            archivedVideos = parsed;
          }
        } catch {
          // Ignore JSON parse error
        }
      }

      // Merge and deduplicate by videoId
      const combined = [...liveVideos, ...archivedVideos];
      const seen = new Set<string>();
      const deduped: VideoItem[] = [];
      for (const item of combined) {
        if (item && item.videoId && !seen.has(item.videoId)) {
          seen.add(item.videoId);
          deduped.push(item);
        }
      }

      // Sort newest first
      deduped.sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );

      const finalVideos = deduped.slice(0, 10000);
      const finalVideosForMergedList = finalVideos.slice(0, 300);

      // Save updated channel archive back to KV under channel.sourceId
      if (finalVideos.length > 0) {
        await env.CHANNELS_ARCHIVE!.put(channel.sourceId, JSON.stringify(finalVideos)).catch(() => {});
      }

      return {
        channel,
        videos: finalVideosForMergedList,
      };
    })
  );

  // 4. Retrieve current full list from KV (_channels_latest_merged)
  let fullMergedList: any[] = [];
  try {
    const rawMerged = await env.CHANNELS_ARCHIVE.get('_channels_latest_merged');
    if (rawMerged) {
      const parsed = JSON.parse(rawMerged);
      if (Array.isArray(parsed) && parsed.length > 0) {
        fullMergedList = parsed;
      }
    }
  } catch {}

  // If not yet initialized, seed full structure from channelsSeed
  if (fullMergedList.length === 0) {
    fullMergedList = channelsSeed.map((ch: any) => ({
      ...ch,
      videos: [],
      videoCount: 0,
    }));
  }

  // Update channels in fullMergedList in place
  const updatedChannelNames: string[] = [];
  for (const res of batchResults) {
    if (res.status === 'fulfilled' && res.value) {
      const { channel, videos } = res.value;
      const targetIdx = fullMergedList.findIndex(
        (ch: any) => ch.sourceId === channel.sourceId
      );
      const updatedChannelObj = {
        ...channel,
        videos,
        videoCount: videos.length,
      };

      if (targetIdx >= 0) {
        fullMergedList[targetIdx] = updatedChannelObj;
      } else {
        fullMergedList.push(updatedChannelObj);
      }
      updatedChannelNames.push(channel.title || channel.sourceId);
    }
  }

  // Save updated full list back to KV
  await env.CHANNELS_ARCHIVE.put('_channels_latest_merged', JSON.stringify(fullMergedList));

  // 5. Update cursor for next cron run
  const nextCursor = (cursor + BATCH_SIZE) % totalChannels;
  await env.CHANNELS_ARCHIVE.put('_rss_refresh_cursor', nextCursor.toString());

  return {
    updatedCount: updatedChannelNames.length,
    cursorBefore: cursor,
    cursorAfter: nextCursor,
    updatedChannels: updatedChannelNames,
  };
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

/**
 * Checks KV for an active maintenance_lock.
 * Returns true if locked and unexpired.
 */
export async function checkMaintenanceLock(env: Env): Promise<{
  isLocked: boolean;
  lock?: MaintenanceLock;
  until?: string;
}> {
  if (!env.CHANNELS_ARCHIVE) {
    return { isLocked: false };
  }
  try {
    const raw = await env.CHANNELS_ARCHIVE.get('maintenance_lock');
    if (!raw) return { isLocked: false };
    const lock: MaintenanceLock = JSON.parse(raw);
    const untilMs = new Date(lock.until).getTime();
    if (!isNaN(untilMs) && untilMs > Date.now()) {
      return { isLocked: true, lock, until: lock.until };
    }
  } catch {
    // Treat corrupt lock as unlocked
  }
  return { isLocked: false };
}

/**
 * Acquires a maintenance lock in KV with an ISO expiration timestamp to prevent overlaps.
 */
export async function acquireMaintenanceLock(
  env: Env,
  lockedBy: string,
  ttlMs: number = 5 * 60 * 1000 // 5 minutes default
): Promise<MaintenanceLock | null> {
  if (!env.CHANNELS_ARCHIVE) return null;
  const now = new Date();
  const until = new Date(now.getTime() + ttlMs).toISOString();
  const lock: MaintenanceLock = {
    lockedBy,
    startedAt: now.toISOString(),
    until,
  };
  await env.CHANNELS_ARCHIVE.put('maintenance_lock', JSON.stringify(lock));
  return lock;
}

/**
 * Releases the maintenance lock in KV.
 */
export async function releaseMaintenanceLock(env: Env): Promise<void> {
  if (!env.CHANNELS_ARCHIVE) return;
  try {
    await env.CHANNELS_ARCHIVE.delete('maintenance_lock');
  } catch {}
}

/**
 * Saves maintenance status and metrics to KV for monitoring.
 */
export async function saveMaintenanceStatus(
  env: Env,
  update: Partial<MaintenanceStatus>
): Promise<void> {
  if (!env.CHANNELS_ARCHIVE) return;
  try {
    let current: Partial<MaintenanceStatus> = {};
    const raw = await env.CHANNELS_ARCHIVE.get('maintenance_status');
    if (raw) {
      current = JSON.parse(raw);
    }
    const merged = { ...current, ...update };
    await env.CHANNELS_ARCHIVE.put('maintenance_status', JSON.stringify(merged));
  } catch {}
}

/**
 * Primary maintenance task: Option A - backfill-all-batch (archives channel videos from YouTube API).
 * BATCH_SIZE = 2 ensures worst-case 2 channels * 20 maxPages = 40 external subrequests,
 * safely under Cloudflare Workers free plan 50 subrequests per invocation limit.
 */
export async function runBackfillAllBatch(
  env: Env,
  options?: { reset?: boolean; initiatedBy?: 'scheduled' | 'manual_admin' }
): Promise<BackfillBatchResult> {
  const reset = options?.reset === true;
  const totalChannels = channelsSeed.length;
  const BATCH_SIZE = 2;

  if (!env.YOUTUBE_API_KEY) {
    throw new Error('Server configuration error: YOUTUBE_API_KEY is not set');
  }

  let cursor = 0;
  if (!reset && env.CHANNELS_ARCHIVE) {
    try {
      const rawCursor =
        (await env.CHANNELS_ARCHIVE.get('maintenance_cursor')) ||
        (await env.CHANNELS_ARCHIVE.get('_backfill_all_cursor'));
      if (rawCursor) {
        const parsed = parseInt(rawCursor, 10);
        if (!isNaN(parsed) && parsed >= 0) {
          cursor = parsed % totalChannels;
        }
      }
    } catch {
      cursor = 0;
    }
  }
  const cursorBefore = cursor;

  // Select 2 channels from channelsSeed using cursor
  const batch: { channel: any; originalIndex: number }[] = [];
  for (let i = 0; i < BATCH_SIZE; i++) {
    const idx = (cursorBefore + i) % totalChannels;
    batch.push({
      channel: channelsSeed[idx],
      originalIndex: idx,
    });
  }

  // Load existing fullMergedList once for the batch
  let fullMergedList: any[] = [];
  if (env.CHANNELS_ARCHIVE) {
    try {
      const rawMerged = await env.CHANNELS_ARCHIVE.get('_channels_latest_merged');
      if (rawMerged) {
        const parsed = JSON.parse(rawMerged);
        if (Array.isArray(parsed)) {
          fullMergedList = parsed;
        }
      }
    } catch {
      // Ignore parse error
    }

    if (fullMergedList.length === 0) {
      fullMergedList = channelsSeed.map((ch: any) => ({
        ...ch,
        videos: [],
        videoCount: 0,
      }));
    }
  }

  // Async function to process a single channel's pagination and individual archive
  const processOneChannel = async (channel: any) => {
    const sourceId = channel.sourceId;
    const sourceType = channel.sourceType || 'channel';

    let playlistId = sourceId;
    if (sourceType === 'playlist' || sourceId.startsWith('PL')) {
      playlistId = sourceId;
    } else if (sourceId.startsWith('UC')) {
      playlistId = 'UU' + sourceId.slice(2);
    }

    const allVideos: VideoItem[] = [];
    let pageToken: string | undefined = undefined;
    let pageCount = 0;
    const maxPages = 20; // Fetch up to 1000 videos (50 per page)

    while (pageCount < maxPages) {
      const apiUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
      apiUrl.searchParams.set('part', 'snippet');
      apiUrl.searchParams.set('playlistId', playlistId);
      apiUrl.searchParams.set('maxResults', '50');
      if (pageToken) apiUrl.searchParams.set('pageToken', pageToken);
      apiUrl.searchParams.set('key', env.YOUTUBE_API_KEY!);

      const ytRes = await fetch(apiUrl.toString());
      if (!ytRes.ok) {
        const errText = await ytRes.text();
        const apiError = new Error(
          `YouTube API error (${ytRes.status}) for ${sourceId}: ${errText}`
        ) as Error & { status?: number };
        apiError.status = ytRes.status;
        throw apiError;
      }

      const data: any = await ytRes.json();
      const items = data.items || [];
      for (const item of items) {
        const vId = item.snippet?.resourceId?.videoId;
        const title = item.snippet?.title;
        const publishedAt = item.snippet?.publishedAt;
        if (vId && title && title !== 'Private video' && title !== 'Deleted video') {
          allVideos.push({
            videoId: vId,
            title,
            publishedAt: publishedAt || new Date().toISOString(),
          });
        }
      }

      pageToken = data.nextPageToken;
      pageCount++;
      if (!pageToken || items.length === 0) break;
    }

    // Save the individual channel archive (up to 1000 videos)
    if (env.CHANNELS_ARCHIVE) {
      await env.CHANNELS_ARCHIVE.put(sourceId, JSON.stringify(allVideos));
    }

    return {
      channel,
      sourceId,
      sourceType,
      allVideos,
    };
  };

  // Run batch channels concurrently
  const batchResults = await Promise.allSettled(
    batch.map(({ channel }) => processOneChannel(channel))
  );

  const processedChannels: { sourceId: string; title: string; videoCount: number }[] = [];
  const failedChannels: (
    | { sourceId: string; title: string; error: 'youtube_rate_limited'; status: number }
    | { sourceId: string; title: string; error: 'other'; message: string }
  )[] = [];

  for (let i = 0; i < batchResults.length; i++) {
    const res = batchResults[i];
    const channel = batch[i].channel;
    const sourceId = channel.sourceId;

    if (res.status === 'fulfilled') {
      const { sourceType, allVideos } = res.value;

      // Update channel in fullMergedList (capped at 300 videos for the shared merged key)
      if (fullMergedList.length > 0) {
        const targetIdx = fullMergedList.findIndex((ch: any) => ch.sourceId === sourceId);
        const updatedChannel: any = {
          ...(targetIdx >= 0 ? fullMergedList[targetIdx] : { sourceId, sourceType }),
          sourceId,
          sourceType,
          videos: allVideos.slice(0, 300),
          videoCount: Math.min(allVideos.length, 300),
        };

        const seedChannel = channelsSeed.find((ch: any) => ch.sourceId === sourceId);
        if (seedChannel) {
          Object.assign(updatedChannel, seedChannel, {
            videos: allVideos.slice(0, 300),
            videoCount: Math.min(allVideos.length, 300),
          });
        }

        if (targetIdx >= 0) {
          fullMergedList[targetIdx] = updatedChannel;
        } else {
          fullMergedList.push(updatedChannel);
        }
      }

      processedChannels.push({
        sourceId,
        title: channel.title || sourceId,
        videoCount: allVideos.length,
      });
    } else {
      const reason = res.reason;
      console.error(`Error backfilling channel ${sourceId} in batch:`, reason);

      const status = reason?.status;
      if (status === 403 || status === 429) {
        failedChannels.push({
          sourceId,
          title: channel.title || sourceId,
          error: 'youtube_rate_limited',
          status,
        });
      } else {
        failedChannels.push({
          sourceId,
          title: channel.title || sourceId,
          error: 'other',
          message: reason instanceof Error ? reason.message : String(reason || 'Unknown error'),
        });
      }
    }
  }

  // Write fullMergedList back to _channels_latest_merged once after the batch
  if (env.CHANNELS_ARCHIVE && processedChannels.length > 0 && fullMergedList.length > 0) {
    try {
      await env.CHANNELS_ARCHIVE.put(
        '_channels_latest_merged',
        JSON.stringify(fullMergedList)
      );
    } catch (e) {
      console.error('Failed to update _channels_latest_merged after batch backfill:', e);
    }
  }

  // Advance and save the cursor (syncing both maintenance_cursor and _backfill_all_cursor)
  const cursorAfter = (cursorBefore + BATCH_SIZE) % totalChannels;
  if (env.CHANNELS_ARCHIVE) {
    try {
      await env.CHANNELS_ARCHIVE.put('_backfill_all_cursor', cursorAfter.toString());
      await env.CHANNELS_ARCHIVE.put('maintenance_cursor', cursorAfter.toString());
    } catch (e) {
      console.error('Failed to save cursor:', e);
    }
  }

  const wrappedAround = cursorAfter < cursorBefore;

  // Save execution status to KV
  await saveMaintenanceStatus(env, {
    lastRunTime: new Date().toISOString(),
    cursor: cursorAfter,
    lastError:
      failedChannels.length > 0
        ? (failedChannels[0] as any).message || failedChannels[0].error
        : null,
    lastProcessed: processedChannels,
    lastFailed: failedChannels,
    primaryTask: 'backfill-all-batch',
    batchSize: BATCH_SIZE,
    totalChannels,
  });

  return {
    processedChannels,
    failedChannels,
    cursorBefore,
    cursorAfter,
    totalChannels,
    wrappedAround,
  };
}

/**
 * Executes a single scheduled maintenance batch under lock.
 * Bounded by BATCH_SIZE = 2, keeping subrequests under 40 (within 50 cap).
 */
export async function runScheduledMaintenance(env: Env): Promise<void> {
  if (!env.YOUTUBE_API_KEY) {
    console.warn('Scheduled maintenance skipped: YOUTUBE_API_KEY is not configured.');
    await saveMaintenanceStatus(env, {
      lastRunTime: new Date().toISOString(),
      lastError: 'YOUTUBE_API_KEY is not configured',
    });
    return;
  }

  // 1. Check lock to prevent overlapping runs
  const activeLock = await checkMaintenanceLock(env);
  if (activeLock.isLocked) {
    console.log(`Scheduled maintenance skipped: lock active until ${activeLock.until}`);
    return;
  }

  // 2. Acquire lock (5-minute TTL)
  await acquireMaintenanceLock(env, 'scheduled', 5 * 60 * 1000);

  try {
    const result = await runBackfillAllBatch(env, {
      reset: false,
      initiatedBy: 'scheduled',
    });
    console.log(
      `Scheduled maintenance completed batch. Processed: ${result.processedChannels.length} channels, Cursor: ${result.cursorBefore} -> ${result.cursorAfter}`
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('Scheduled maintenance batch error:', errMsg);
    await saveMaintenanceStatus(env, {
      lastRunTime: new Date().toISOString(),
      lastError: errMsg,
    });
  } finally {
    // 3. Always release lock
    await releaseMaintenanceLock(env);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle OPTIONS Preflight for CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // 1. Health & Test worker endpoint
    if (
      url.pathname === '/api/test-worker' ||
      url.pathname === '/api/health' ||
      url.pathname === '/'
    ) {
      return new Response(
        JSON.stringify({
          status: 'ok',
          worker: 'ready',
          version: '1.5.0',
          message: 'Cloudflare Worker is running and operational.',
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: corsHeaders,
        }
      );
    }

    // 1.5 Lightweight rate limit for targeted public GET endpoints (Phase P3.2)
    // Limits abusive scrapers & bursts (60 req/min per IP) without penalizing kid apps on shared NATs
    // Preserves CORS headers and excludes requests with valid ADMIN_KEY or admin endpoints
    if (request.method === 'GET' && RATE_LIMITED_ROUTES.has(url.pathname)) {
      if (!checkAdminAuth(request, env)) {
        const allowed = await checkPublicRateLimit(request, env);
        if (!allowed) {
          return new Response(JSON.stringify({ error: 'rate_limit' }), {
            status: 429,
            headers: {
              ...corsHeaders,
              'Retry-After': String(RATE_LIMIT_WINDOW_SECONDS),
            },
          });
        }
      }
    }

    // 2. GET /api/rss?type=channel|playlist&id=SOURCE_ID
    if (url.pathname === '/api/rss' && request.method === 'GET') {
      const type = (url.searchParams.get('type') || 'channel').toLowerCase();
      const id = url.searchParams.get('id') || url.searchParams.get('sourceId') || '';

      if (!id) {
        return new Response(
          JSON.stringify({ error: 'Missing required parameter "id"' }),
          { status: 400, headers: corsHeaders }
        );
      }

      const cacheKey = `${type}:${id}`;
      const rssUrl =
        type === 'playlist'
          ? `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(id)}`
          : `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(id)}`;

      try {
        const videos = await fetchYouTubeRss(type, id);

        // Cache response in env.CHANNELS_ARCHIVE for 1 hour (3600 seconds)
        if (env.CHANNELS_ARCHIVE) {
          await env.CHANNELS_ARCHIVE.put(cacheKey, JSON.stringify(videos), {
            expirationTtl: 3600,
          });
        }

        return new Response(JSON.stringify(videos), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=600',
          },
        });
      } catch (err) {
        // Fallback: return last cached version from env.CHANNELS_ARCHIVE instead of an empty error
        if (env.CHANNELS_ARCHIVE) {
          const cached = await env.CHANNELS_ARCHIVE.get(cacheKey);
          if (cached) {
            return new Response(cached, {
              status: 200,
              headers: {
                ...corsHeaders,
                'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=600',
                'X-Cache-Fallback': 'true',
              },
            });
          }
        }

        return new Response(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Failed to fetch RSS and no cache found',
            fallback: [],
          }),
          { status: 502, headers: corsHeaders }
        );
      }
    }

    // 3. POST /api/admin/backfill-channel (Protected with Bearer ADMIN_KEY or X-Admin-Key)
    if (url.pathname === '/api/admin/backfill-channel' && request.method === 'POST') {
      if (!checkAdminAuth(request, env)) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid or missing Bearer ADMIN_KEY' }),
          { status: 401, headers: corsHeaders }
        );
      }

      let body: { sourceId?: string; sourceType?: string } = {};
      try {
        body = await request.json();
      } catch {
        return new Response(
          JSON.stringify({ error: 'Invalid JSON body' }),
          { status: 400, headers: corsHeaders }
        );
      }

      const { sourceId, sourceType = 'channel' } = body;
      if (!sourceId) {
        return new Response(
          JSON.stringify({ error: 'Missing required field "sourceId"' }),
          { status: 400, headers: corsHeaders }
        );
      }

      // Convert channel ID (UC...) to uploads playlist ID (UU...)
      let playlistId = sourceId;
      if (sourceType === 'playlist' || sourceId.startsWith('PL')) {
        playlistId = sourceId;
      } else if (sourceId.startsWith('UC')) {
        playlistId = 'UU' + sourceId.slice(2);
      }

      if (!env.YOUTUBE_API_KEY) {
        return new Response(
          JSON.stringify({ error: 'Server configuration error: YOUTUBE_API_KEY is not set' }),
          { status: 500, headers: corsHeaders }
        );
      }

      try {
        const allVideos: VideoItem[] = [];
        let pageToken: string | undefined = undefined;
        let pageCount = 0;
        const maxPages = 200; // Fetch up to 10000 videos (50 per page) — may take a long time for very large channels

        while (pageCount < maxPages) {
          const apiUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
          apiUrl.searchParams.set('part', 'snippet');
          apiUrl.searchParams.set('playlistId', playlistId);
          apiUrl.searchParams.set('maxResults', '50');
          if (pageToken) apiUrl.searchParams.set('pageToken', pageToken);
          apiUrl.searchParams.set('key', env.YOUTUBE_API_KEY);

          const ytRes = await fetch(apiUrl.toString());
          if (!ytRes.ok) {
            const errText = await ytRes.text();
            return new Response(
              JSON.stringify({ error: `YouTube API error (${ytRes.status}): ${errText}` }),
              { status: ytRes.status, headers: corsHeaders }
            );
          }

          const data: any = await ytRes.json();
          const items = data.items || [];
          for (const item of items) {
            const vId = item.snippet?.resourceId?.videoId;
            const title = item.snippet?.title;
            const publishedAt = item.snippet?.publishedAt;
            if (vId && title && title !== 'Private video' && title !== 'Deleted video') {
              allVideos.push({
                videoId: vId,
                title,
                publishedAt: publishedAt || new Date().toISOString(),
              });
            }
          }

          pageToken = data.nextPageToken;
          pageCount++;
          if (!pageToken || items.length === 0) break;
        }

        // 1. Save the channel videos
        if (env.CHANNELS_ARCHIVE) {
          await env.CHANNELS_ARCHIVE.put(sourceId, JSON.stringify(allVideos));

          // 2. Immediately update the merged list instead of deleting it
          try {
            let fullMergedList: any[] = [];
            const rawMerged = await env.CHANNELS_ARCHIVE.get('_channels_latest_merged');

            if (rawMerged) {
              const parsed = JSON.parse(rawMerged);
              if (Array.isArray(parsed)) {
                fullMergedList = parsed;
              }
            }

            // If the merged list does not exist yet, build it from channelsSeed
            if (fullMergedList.length === 0) {
              fullMergedList = channelsSeed.map((ch: any) => ({
                ...ch,
                videos: [],
                videoCount: 0,
              }));
            }

            // Find the channel inside the merged list
            const targetIdx = fullMergedList.findIndex(
              (ch: any) => ch.sourceId === sourceId
            );

            const updatedChannel: any = {
              ...(targetIdx >= 0 ? fullMergedList[targetIdx] : { sourceId, sourceType }),
              sourceId,
              sourceType,
              videos: allVideos.slice(0, 300),
              videoCount: Math.min(allVideos.length, 300),
            };

            // If the channel exists in the seed, merge its metadata (title, thumbnail, categories, etc.)
            const seedChannel = channelsSeed.find((ch: any) => ch.sourceId === sourceId);
            if (seedChannel) {
              Object.assign(updatedChannel, seedChannel, {
                videos: allVideos.slice(0, 300),
                videoCount: Math.min(allVideos.length, 300),
              });
            }

            if (targetIdx >= 0) {
              fullMergedList[targetIdx] = updatedChannel;
            } else {
              fullMergedList.push(updatedChannel);
            }

            await env.CHANNELS_ARCHIVE.put(
              '_channels_latest_merged',
              JSON.stringify(fullMergedList)
            );
          } catch (e) {
            console.error('Failed to update _channels_latest_merged after backfill:', e);
            // Do not fail the whole request — the individual archive was already saved
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            count: allVideos.length,
            sourceId,
            sourceType,
            playlistId,
            message: `تم حفظ ${allVideos.length} فيديو في الأرشيف وتحديث القائمة المدمجة بنجاح.`,
          }),
          { status: 200, headers: corsHeaders }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Error executing backfill',
          }),
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // 3.5 POST /api/admin/backfill-all-batch (Protected with Bearer ADMIN_KEY or X-Admin-Key)
    if (url.pathname === '/api/admin/backfill-all-batch' && request.method === 'POST') {
      if (!checkAdminAuth(request, env)) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid or missing Bearer ADMIN_KEY' }),
          { status: 401, headers: corsHeaders }
        );
      }

      if (!env.YOUTUBE_API_KEY) {
        return new Response(
          JSON.stringify({ error: 'Server configuration error: YOUTUBE_API_KEY is not set' }),
          { status: 500, headers: corsHeaders }
        );
      }

      const activeLock = await checkMaintenanceLock(env);
      if (activeLock.isLocked) {
        return new Response(
          JSON.stringify({
            error: `Maintenance is currently in progress (locked until ${activeLock.until}). Please wait for the current batch to complete.`,
            lock: activeLock.lock,
          }),
          { status: 409, headers: corsHeaders }
        );
      }

      let reset = false;
      try {
        const body: any = await request.json();
        if (body && typeof body === 'object' && body.reset === true) {
          reset = true;
        }
      } catch {
        // Empty or non-JSON body is valid, defaults reset to false
      }

      await acquireMaintenanceLock(env, 'manual_admin');
      try {
        const result = await runBackfillAllBatch(env, {
          reset,
          initiatedBy: 'manual_admin',
        });
        return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Error executing batch backfill',
          }),
          { status: 500, headers: corsHeaders }
        );
      } finally {
        await releaseMaintenanceLock(env);
      }
    }

    // 3.6 POST /api/admin/cleanup-dead-videos-batch (Protected with Bearer ADMIN_KEY or X-Admin-Key)
    if (url.pathname === '/api/admin/cleanup-dead-videos-batch' && request.method === 'POST') {
      if (!checkAdminAuth(request, env)) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid or missing Bearer ADMIN_KEY' }),
          { status: 401, headers: corsHeaders }
        );
      }

      if (!env.YOUTUBE_API_KEY) {
        return new Response(
          JSON.stringify({ error: 'Server configuration error: YOUTUBE_API_KEY is not set' }),
          { status: 500, headers: corsHeaders }
        );
      }

      const activeLock = await checkMaintenanceLock(env);
      if (activeLock.isLocked) {
        return new Response(
          JSON.stringify({
            error: `Maintenance is currently in progress (locked until ${activeLock.until}). Please wait for the current batch to complete.`,
            lock: activeLock.lock,
          }),
          { status: 409, headers: corsHeaders }
        );
      }

      let reset = false;
      try {
        const body: any = await request.json();
        if (body && typeof body === 'object' && body.reset === true) {
          reset = true;
        }
      } catch {
        // Empty or non-JSON body is valid, defaults reset to false
      }

      await acquireMaintenanceLock(env, 'manual_admin_cleanup');
      try {
        const totalChannels = channelsSeed.length;
        let cursor = 0;
        if (!reset && env.CHANNELS_ARCHIVE) {
          try {
            const rawCursor = await env.CHANNELS_ARCHIVE.get('_cleanup_dead_videos_cursor');
            if (rawCursor) {
              const parsed = parseInt(rawCursor, 10);
              if (!isNaN(parsed) && parsed >= 0) {
                cursor = parsed % totalChannels;
              }
            }
          } catch {
            cursor = 0;
          }
        }
        const cursorBefore = cursor;

        const MAX_CHANNELS = 15;
        const MAX_VIDEOS = 2000;
        let channelsIncluded = 0;
        const batchChannels: { channel: any; videos: VideoItem[] }[] = [];
        const failedChannels: {
          sourceId: string;
          title: string;
          error: string;
          message?: string;
        }[] = [];
        let accumulatedVideoCount = 0;

        // Step 4: Iterate channels from cursor, respecting subrequest and channel caps
        for (let step = 0; step < MAX_CHANNELS; step++) {
          const idx = (cursorBefore + step) % totalChannels;
          const seed = channelsSeed[idx];
          const sourceId = seed.sourceId;

          let channelVideos: VideoItem[] = [];
          if (env.CHANNELS_ARCHIVE) {
            try {
              const raw = await env.CHANNELS_ARCHIVE.get(sourceId);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                  channelVideos = parsed;
                }
              }
            } catch (err) {
              console.error(`Error reading archive for channel ${sourceId}:`, err);
              failedChannels.push({
                sourceId,
                title: seed.title || sourceId,
                error: 'read_archive_failed',
                message: err instanceof Error ? err.message : String(err),
              });
              channelsIncluded++;
              continue;
            }
          }

          // If channel's archive is empty or missing, skip it (still counts toward the 15-channel cap)
          if (channelVideos.length === 0) {
            channelsIncluded++;
            batchChannels.push({ channel: seed, videos: [] });
            continue;
          }

          // If adding this channel would exceed MAX_VIDEOS and we already have accumulated videos, stop
          if (accumulatedVideoCount > 0 && accumulatedVideoCount + channelVideos.length > MAX_VIDEOS) {
            break;
          }

          channelsIncluded++;
          batchChannels.push({ channel: seed, videos: channelVideos });
          accumulatedVideoCount += channelVideos.length;
        }

        // Step 5: Chunk accumulated videoId list into groups of 50 and validate with YouTube API
        const allVideoIdSet = new Set<string>();
        for (const { videos } of batchChannels) {
          for (const v of videos) {
            if (v && v.videoId) {
              allVideoIdSet.add(v.videoId);
            }
          }
        }
        const allVideoIds = Array.from(allVideoIdSet);
        const aliveSet = new Set<string>();
        const CHUNK_SIZE = 50;

        for (let i = 0; i < allVideoIds.length; i += CHUNK_SIZE) {
          const chunk = allVideoIds.slice(i, i + CHUNK_SIZE);
          const apiUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
          apiUrl.searchParams.set('part', 'id');
          apiUrl.searchParams.set('id', chunk.join(','));
          apiUrl.searchParams.set('key', env.YOUTUBE_API_KEY!);

          const res = await fetch(apiUrl.toString());
          if (!res.ok) {
            const errText = await res.text();
            const apiError = new Error(`YouTube API error (${res.status}): ${errText}`) as Error & { status?: number };
            apiError.status = res.status;
            throw apiError;
          }

          const data: any = await res.json();
          const items = data.items || [];
          for (const item of items) {
            if (item && item.id) {
              aliveSet.add(item.id);
            }
          }
        }

        // Step 6: Filter channel archives and update in-memory fullMergedList
        let fullMergedList: any[] = [];
        if (env.CHANNELS_ARCHIVE) {
          try {
            const rawMerged = await env.CHANNELS_ARCHIVE.get('_channels_latest_merged');
            if (rawMerged) {
              const parsed = JSON.parse(rawMerged);
              if (Array.isArray(parsed)) {
                fullMergedList = parsed;
              }
            }
          } catch {
            // Ignore parse error
          }

          if (fullMergedList.length === 0) {
            fullMergedList = channelsSeed.map((ch: any) => ({
              ...ch,
              videos: [],
              videoCount: 0,
            }));
          }
        }

        const channelsProcessed: {
          sourceId: string;
          title: string;
          videosChecked: number;
          deadVideosRemoved: number;
        }[] = [];
        let totalDeadVideosRemoved = 0;

        for (const { channel, videos } of batchChannels) {
          const sourceId = channel.sourceId;
          const sourceType = channel.sourceType || 'channel';
          const title = channel.title || sourceId;

          if (videos.length === 0) {
            channelsProcessed.push({
              sourceId,
              title,
              videosChecked: 0,
              deadVideosRemoved: 0,
            });
            continue;
          }

          try {
            const filtered = videos.filter((v) => aliveSet.has(v.videoId));
            const deadRemoved = videos.length - filtered.length;
            totalDeadVideosRemoved += deadRemoved;

            // Write back to individual channel archive only if dead videos were removed
            if (deadRemoved > 0 && env.CHANNELS_ARCHIVE) {
              await env.CHANNELS_ARCHIVE.put(sourceId, JSON.stringify(filtered));
            }

            // Update channel in fullMergedList (capped at 300 videos)
            if (fullMergedList.length > 0) {
              const targetIdx = fullMergedList.findIndex((ch: any) => ch.sourceId === sourceId);
              const updatedChannel: any = {
                ...(targetIdx >= 0 ? fullMergedList[targetIdx] : { sourceId, sourceType }),
                sourceId,
                sourceType,
                videos: filtered.slice(0, 300),
                videoCount: Math.min(filtered.length, 300),
              };

              const seedChannel = channelsSeed.find((ch: any) => ch.sourceId === sourceId);
              if (seedChannel) {
                Object.assign(updatedChannel, seedChannel, {
                  videos: filtered.slice(0, 300),
                  videoCount: Math.min(filtered.length, 300),
                });
              }

              if (targetIdx >= 0) {
                fullMergedList[targetIdx] = updatedChannel;
              } else {
                fullMergedList.push(updatedChannel);
              }
            }

            channelsProcessed.push({
              sourceId,
              title,
              videosChecked: videos.length,
              deadVideosRemoved: deadRemoved,
            });
          } catch (chErr) {
            console.error(`Error processing cleanup for channel ${sourceId}:`, chErr);
            failedChannels.push({
              sourceId,
              title,
              error: 'process_channel_failed',
              message: chErr instanceof Error ? chErr.message : String(chErr),
            });
          }
        }

        // Write fullMergedList back once if any dead videos were removed
        if (env.CHANNELS_ARCHIVE && totalDeadVideosRemoved > 0 && fullMergedList.length > 0) {
          try {
            await env.CHANNELS_ARCHIVE.put(
              '_channels_latest_merged',
              JSON.stringify(fullMergedList)
            );
          } catch (e) {
            console.error('Failed to update _channels_latest_merged after cleanup batch:', e);
          }
        }

        // Step 7: Advance and save cursor
        const cursorAfter = (cursorBefore + channelsIncluded) % totalChannels;
        if (env.CHANNELS_ARCHIVE) {
          try {
            await env.CHANNELS_ARCHIVE.put(
              '_cleanup_dead_videos_cursor',
              cursorAfter.toString()
            );
          } catch (e) {
            console.error('Failed to save _cleanup_dead_videos_cursor:', e);
          }
        }

        const wrappedAround = cursorAfter < cursorBefore;
        const totalVideosChecked = channelsProcessed.reduce((sum, ch) => sum + ch.videosChecked, 0);

        // Step 8: Return JSON response
        return new Response(
          JSON.stringify({
            channelsProcessed,
            failedChannels,
            totalVideosChecked,
            totalDeadVideosRemoved,
            cursorBefore,
            cursorAfter,
            totalChannels,
            wrappedAround,
          }),
          { status: 200, headers: corsHeaders }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Error executing cleanup dead videos batch',
          }),
          { status: 500, headers: corsHeaders }
        );
      } finally {
        await releaseMaintenanceLock(env);
      }
    }

    // 3.6b POST /api/admin/scan-cleanup-batch (Protected with Bearer ADMIN_KEY or X-Admin-Key)
    if (url.pathname === '/api/admin/scan-cleanup-batch' && request.method === 'POST') {
      if (!checkAdminAuth(request, env)) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid or missing Bearer ADMIN_KEY' }),
          { status: 401, headers: corsHeaders }
        );
      }

      if (!env.YOUTUBE_API_KEY) {
        return new Response(
          JSON.stringify({ error: 'Server configuration error: YOUTUBE_API_KEY is not set' }),
          { status: 500, headers: corsHeaders }
        );
      }

      const activeLock = await checkMaintenanceLock(env);
      if (activeLock.isLocked) {
        return new Response(
          JSON.stringify({
            error: `Maintenance is currently in progress (locked until ${activeLock.until}). Please wait for the current batch to complete.`,
            lock: activeLock.lock,
          }),
          { status: 409, headers: corsHeaders }
        );
      }

      let reset = false;
      try {
        const body: any = await request.json();
        if (body && typeof body === 'object' && body.reset === true) {
          reset = true;
        }
      } catch {
        // Empty or non-JSON body is valid, defaults reset to false
      }

      await acquireMaintenanceLock(env, 'manual_admin_scan_cleanup');
      try {
        const totalChannels = channelsSeed.length;
        let cursor = 0;
        if (!reset && env.CHANNELS_ARCHIVE) {
          try {
            const rawCursor = await env.CHANNELS_ARCHIVE.get('_scan_cleanup_cursor');
            if (rawCursor) {
              const parsed = parseInt(rawCursor, 10);
              if (!isNaN(parsed) && parsed >= 0) {
                cursor = parsed % totalChannels;
              }
            }
          } catch {
            cursor = 0;
          }
        }
        const cursorBefore = cursor;

        const MAX_CHANNELS = 15;
        const MAX_VIDEOS = 40;
        let channelsIncluded = 0;
        const batchChannels: { channel: any; videos: VideoItem[] }[] = [];
        const failedChannels: {
          sourceId: string;
          title: string;
          error: string;
          message?: string;
        }[] = [];
        let accumulatedVideoCount = 0;

        for (let step = 0; step < MAX_CHANNELS; step++) {
          const idx = (cursorBefore + step) % totalChannels;
          const seed = channelsSeed[idx];
          const sourceId = seed.sourceId;

          let channelVideos: VideoItem[] = [];
          if (env.CHANNELS_ARCHIVE) {
            try {
              const raw = await env.CHANNELS_ARCHIVE.get(sourceId);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                  channelVideos = parsed;
                }
              }
            } catch (err) {
              console.error(`Error reading archive for channel ${sourceId}:`, err);
              failedChannels.push({
                sourceId,
                title: seed.title || sourceId,
                error: 'read_archive_failed',
                message: err instanceof Error ? err.message : String(err),
              });
              channelsIncluded++;
              continue;
            }
          }

          if (channelVideos.length === 0) {
            channelsIncluded++;
            batchChannels.push({ channel: seed, videos: [] });
            continue;
          }

          if (accumulatedVideoCount > 0 && accumulatedVideoCount + channelVideos.length > MAX_VIDEOS) {
            break;
          }

          channelsIncluded++;
          batchChannels.push({ channel: seed, videos: channelVideos });
          accumulatedVideoCount += channelVideos.length;
        }

        const allVideoIdSet = new Set<string>();
        for (const { videos } of batchChannels) {
          for (const v of videos) {
            if (v && v.videoId) {
              allVideoIdSet.add(v.videoId);
            }
          }
        }
        const allVideoIds = Array.from(allVideoIdSet);
        const toDeleteReasons = new Map<string, 'short_duration' | 'portrait'>();

        // Step 4a & 4b: Chunk videoIds into groups of 50 and check duration via YouTube API
        const CHUNK_SIZE = 50;
        for (let i = 0; i < allVideoIds.length; i += CHUNK_SIZE) {
          const chunk = allVideoIds.slice(i, i + CHUNK_SIZE);
          const apiUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
          apiUrl.searchParams.set('part', 'contentDetails');
          apiUrl.searchParams.set('id', chunk.join(','));
          apiUrl.searchParams.set('key', env.YOUTUBE_API_KEY!);

          const res = await fetch(apiUrl.toString());
          if (!res.ok) {
            const errText = await res.text();
            const apiError = new Error(`YouTube API error (${res.status}): ${errText}`) as Error & { status?: number };
            apiError.status = res.status;
            throw apiError;
          }

          const data: any = await res.json();
          const items = data.items || [];
          for (const item of items) {
            const vId = item?.id;
            const durationStr = item?.contentDetails?.duration;
            if (vId && durationStr) {
              const seconds = parseIsoDuration(durationStr);
              if (seconds < 120) {
                toDeleteReasons.set(vId, 'short_duration');
              }
            }
          }
        }

        // Step 4c: Check orientation for videos not in toDelete (duration >= 120s)
        for (const vId of allVideoIds) {
          if (toDeleteReasons.has(vId)) continue;
          try {
            const thumbUrl = `https://i.ytimg.com/vi/${encodeURIComponent(vId)}/hqdefault.jpg`;
            const thumbRes = await fetch(thumbUrl);
            if (thumbRes.ok) {
              const buffer = await thumbRes.arrayBuffer();
              const dims = getJpegDimensions(buffer);
              if (dims && dims.height > dims.width) {
                toDeleteReasons.set(vId, 'portrait');
              }
            }
          } catch {
            // Fail open: do NOT add video to toDelete on fetch or parse error
          }
        }

        // Step 5: Filter channel archives and update in-memory fullMergedList
        let fullMergedList: any[] = [];
        if (env.CHANNELS_ARCHIVE) {
          try {
            const rawMerged = await env.CHANNELS_ARCHIVE.get('_channels_latest_merged');
            if (rawMerged) {
              const parsed = JSON.parse(rawMerged);
              if (Array.isArray(parsed)) {
                fullMergedList = parsed;
              }
            }
          } catch {
            // Ignore parse error
          }

          if (fullMergedList.length === 0) {
            fullMergedList = channelsSeed.map((ch: any) => ({
              ...ch,
              videos: [],
              videoCount: 0,
            }));
          }
        }

        const channelsProcessed: {
          sourceId: string;
          title: string;
          videosChecked: number;
          removedShortDuration: number;
          removedPortrait: number;
        }[] = [];
        let totalRemovedShortDuration = 0;
        let totalRemovedPortrait = 0;

        for (const { channel, videos } of batchChannels) {
          const sourceId = channel.sourceId;
          const sourceType = channel.sourceType || 'channel';
          const title = channel.title || sourceId;

          if (videos.length === 0) {
            channelsProcessed.push({
              sourceId,
              title,
              videosChecked: 0,
              removedShortDuration: 0,
              removedPortrait: 0,
            });
            continue;
          }

          try {
            let removedShortDuration = 0;
            let removedPortrait = 0;

            const filtered = videos.filter((v) => {
              const reason = toDeleteReasons.get(v.videoId);
              if (reason === 'short_duration') {
                removedShortDuration++;
                return false;
              }
              if (reason === 'portrait') {
                removedPortrait++;
                return false;
              }
              return true;
            });

            totalRemovedShortDuration += removedShortDuration;
            totalRemovedPortrait += removedPortrait;
            const totalRemoved = removedShortDuration + removedPortrait;

            // Write back to individual channel archive if any videos were removed
            if (totalRemoved > 0 && env.CHANNELS_ARCHIVE) {
              await env.CHANNELS_ARCHIVE.put(sourceId, JSON.stringify(filtered));
            }

            // Update channel in fullMergedList (capped at 300 videos)
            if (fullMergedList.length > 0) {
              const targetIdx = fullMergedList.findIndex((ch: any) => ch.sourceId === sourceId);
              const updatedChannel: any = {
                ...(targetIdx >= 0 ? fullMergedList[targetIdx] : { sourceId, sourceType }),
                sourceId,
                sourceType,
                videos: filtered.slice(0, 300),
                videoCount: Math.min(filtered.length, 300),
              };

              const seedChannel = channelsSeed.find((ch: any) => ch.sourceId === sourceId);
              if (seedChannel) {
                Object.assign(updatedChannel, seedChannel, {
                  videos: filtered.slice(0, 300),
                  videoCount: Math.min(filtered.length, 300),
                });
              }

              if (targetIdx >= 0) {
                fullMergedList[targetIdx] = updatedChannel;
              } else {
                fullMergedList.push(updatedChannel);
              }
            }

            channelsProcessed.push({
              sourceId,
              title,
              videosChecked: videos.length,
              removedShortDuration,
              removedPortrait,
            });
          } catch (chErr) {
            console.error(`Error processing scan cleanup for channel ${sourceId}:`, chErr);
            failedChannels.push({
              sourceId,
              title,
              error: 'process_channel_failed',
              message: chErr instanceof Error ? chErr.message : String(chErr),
            });
          }
        }

        // Write fullMergedList back ONCE at the end of the batch if any videos were removed
        const totalRemovedAll = totalRemovedShortDuration + totalRemovedPortrait;
        if (env.CHANNELS_ARCHIVE && totalRemovedAll > 0 && fullMergedList.length > 0) {
          try {
            await env.CHANNELS_ARCHIVE.put(
              '_channels_latest_merged',
              JSON.stringify(fullMergedList)
            );
          } catch (e) {
            console.error('Failed to update _channels_latest_merged after scan cleanup batch:', e);
          }
        }

        // Step 6: Advance and save cursor
        const cursorAfter = (cursorBefore + channelsIncluded) % totalChannels;
        if (env.CHANNELS_ARCHIVE) {
          try {
            await env.CHANNELS_ARCHIVE.put(
              '_scan_cleanup_cursor',
              cursorAfter.toString()
            );
          } catch (e) {
            console.error('Failed to save _scan_cleanup_cursor:', e);
          }
        }

        const wrappedAround = cursorAfter < cursorBefore;
        const totalVideosChecked = channelsProcessed.reduce((sum, ch) => sum + ch.videosChecked, 0);

        // Step 7: Return JSON response
        return new Response(
          JSON.stringify({
            channelsProcessed,
            failedChannels,
            totalVideosChecked,
            totalRemovedShortDuration,
            totalRemovedPortrait,
            cursorBefore,
            cursorAfter,
            totalChannels,
            wrappedAround,
          }),
          { status: 200, headers: corsHeaders }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Error executing scan cleanup batch',
          }),
          { status: 500, headers: corsHeaders }
        );
      } finally {
        await releaseMaintenanceLock(env);
      }
    }

    // 3.7 GET /api/admin/maintenance-status (Protected with Bearer ADMIN_KEY or X-Admin-Key)
    if (url.pathname === '/api/admin/maintenance-status' && request.method === 'GET') {
      if (!checkAdminAuth(request, env)) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid or missing Bearer ADMIN_KEY' }),
          { status: 401, headers: corsHeaders }
        );
      }

      let currentCursor = 0;
      if (env.CHANNELS_ARCHIVE) {
        try {
          const raw =
            (await env.CHANNELS_ARCHIVE.get('maintenance_cursor')) ||
            (await env.CHANNELS_ARCHIVE.get('_backfill_all_cursor'));
          if (raw) currentCursor = parseInt(raw, 10) || 0;
        } catch {}
      }

      let statusData: any = {};
      if (env.CHANNELS_ARCHIVE) {
        try {
          const raw = await env.CHANNELS_ARCHIVE.get('maintenance_status');
          if (raw) statusData = JSON.parse(raw);
        } catch {}
      }

      const activeLock = await checkMaintenanceLock(env);

      return new Response(
        JSON.stringify({
          lastRunTime: statusData.lastRunTime || null,
          cursor: currentCursor,
          lastError: statusData.lastError || null,
          isLocked: activeLock.isLocked,
          lock: activeLock.lock || null,
          primaryTask: 'backfill-all-batch',
          batchSize: 2,
          totalChannels: channelsSeed.length,
          lastProcessed: statusData.lastProcessed || [],
          lastFailed: statusData.lastFailed || [],
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // 3.8 POST /api/admin/maintenance-run (Protected: Trigger one scheduled maintenance batch on demand)
    if (url.pathname === '/api/admin/maintenance-run' && request.method === 'POST') {
      if (!checkAdminAuth(request, env)) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid or missing Bearer ADMIN_KEY' }),
          { status: 401, headers: corsHeaders }
        );
      }

      if (!env.YOUTUBE_API_KEY) {
        return new Response(
          JSON.stringify({ error: 'Server configuration error: YOUTUBE_API_KEY is not set' }),
          { status: 500, headers: corsHeaders }
        );
      }

      const activeLock = await checkMaintenanceLock(env);
      if (activeLock.isLocked) {
        return new Response(
          JSON.stringify({
            error: `Maintenance is currently in progress (locked until ${activeLock.until}).`,
            lock: activeLock.lock,
          }),
          { status: 409, headers: corsHeaders }
        );
      }

      try {
        await runScheduledMaintenance(env);
        return new Response(
          JSON.stringify({ ok: true, message: 'Maintenance batch executed successfully' }),
          { status: 200, headers: corsHeaders }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Error executing scheduled maintenance',
          }),
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // 4. GET /api/channels-latest (Public merged channels endpoint - direct from KV only, no live RSS)
    if (url.pathname === '/api/channels-latest' && request.method === 'GET') {
      const publicCacheHeaders = {
        ...corsHeaders,
        'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=600',
      };
      if (env.CHANNELS_ARCHIVE) {
        try {
          const cachedMerged = await env.CHANNELS_ARCHIVE.get('_channels_latest_merged');
          if (cachedMerged) {
            return new Response(cachedMerged, {
              status: 200,
              headers: publicCacheHeaders,
            });
          }
        } catch {
          // If error reading KV, fall through to empty array
        }
      }

      // If key doesn't exist or KV is empty, return empty array (not an error)
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: publicCacheHeaders,
      });
    }

    // 4.1 GET /api/channel-archive?id={sourceId}&sourceType={channel|playlist}&max={50..2000}&deepen={0|1}
    if (url.pathname === '/api/channel-archive' && request.method === 'GET') {
      const sourceId = (url.searchParams.get('id') || url.searchParams.get('sourceId') || '').trim();
      const sourceType = (url.searchParams.get('sourceType') || 'channel').toLowerCase();

      const rawMax = url.searchParams.get('max');
      let max = 500;
      if (rawMax) {
        const parsedMax = parseInt(rawMax, 10);
        if (!isNaN(parsedMax)) {
          max = Math.max(50, Math.min(2000, parsedMax));
        }
      }

      const deepen = url.searchParams.get('deepen') === '1';

      if (!sourceId) {
        return new Response(
          JSON.stringify({ sourceId: '', videos: [], count: 0, nextPageToken: null, deepened: false }),
          { status: 200, headers: corsHeaders }
        );
      }

      try {
        let existingVideos: VideoItem[] = [];
        if (env.CHANNELS_ARCHIVE) {
          const raw = await env.CHANNELS_ARCHIVE.get(sourceId);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) existingVideos = parsed;
          }
        }

        const apiKey = resolveYouTubeApiKey(request, env);

        // Return immediately if deepen is not requested, or we already have >= max items in KV, or no API key is available
        if (!deepen || existingVideos.length >= max || !apiKey) {
          const sliced = existingVideos.slice(0, max);
          return new Response(
            JSON.stringify({
              sourceId,
              videos: sliced,
              count: sliced.length,
              nextPageToken: null,
              deepened: false,
            }),
            { status: 200, headers: corsHeaders }
          );
        }

        // Deepen from YouTube API
        let playlistId = sourceId;
        if (sourceType === 'playlist' || sourceId.startsWith('PL')) {
          playlistId = sourceId;
        } else if (sourceId.startsWith('UC')) {
          playlistId = 'UU' + sourceId.slice(2);
        }

        const videoMap = new Map<string, VideoItem>();
        for (const v of existingVideos) {
          if (v && v.videoId) videoMap.set(v.videoId, v);
        }

        let pageToken: string | undefined = undefined;
        if (env.CHANNELS_ARCHIVE) {
          try {
            const storedToken = await env.CHANNELS_ARCHIVE.get(`_channel_pagetoken:${sourceId}`);
            if (storedToken === 'DONE') {
              const sliced = existingVideos.slice(0, max);
              return new Response(
                JSON.stringify({
                  sourceId,
                  videos: sliced,
                  count: sliced.length,
                  nextPageToken: null,
                  deepened: false,
                  exhausted: true,
                }),
                { status: 200, headers: corsHeaders }
              );
            }
            if (storedToken && storedToken.trim().length > 0) {
              pageToken = storedToken.trim();
            }
          } catch (tokenReadErr) {
            console.error(`Failed to read pageToken for ${sourceId}:`, tokenReadErr);
          }
        }

        let pageCount = 0;
        const maxPages = 10; // Cap to stay under worker subrequest limits
        let lastNextPageToken: string | null = null;

        while (pageCount < maxPages && videoMap.size < max) {
          const apiUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
          apiUrl.searchParams.set('part', 'snippet');
          apiUrl.searchParams.set('playlistId', playlistId);
          apiUrl.searchParams.set('maxResults', '50');
          if (pageToken) apiUrl.searchParams.set('pageToken', pageToken);
          apiUrl.searchParams.set('key', apiKey);

          const ytRes = await fetch(apiUrl.toString());
          if (!ytRes.ok) {
            break;
          }

          const data: any = await ytRes.json();
          const items = data.items || [];
          for (const item of items) {
            const vId = item.snippet?.resourceId?.videoId;
            const title = item.snippet?.title;
            const publishedAt = item.snippet?.publishedAt;
            if (vId && title && title !== 'Private video' && title !== 'Deleted video') {
              videoMap.set(vId, {
                videoId: vId,
                title,
                publishedAt: publishedAt || new Date().toISOString(),
              });
            }
          }

          pageToken = data.nextPageToken;
          lastNextPageToken = pageToken || null;
          pageCount++;
          if (!pageToken || items.length === 0) break;
        }

        if (env.CHANNELS_ARCHIVE && pageCount > 0) {
          const tokenToStore = lastNextPageToken || 'DONE';
          try {
            await env.CHANNELS_ARCHIVE.put(`_channel_pagetoken:${sourceId}`, tokenToStore);
          } catch (tokenErr) {
            console.error(`Failed to store pageToken for ${sourceId}:`, tokenErr);
          }
        }

        const mergedVideos = Array.from(videoMap.values());
        mergedVideos.sort((a, b) => {
          const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
          const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
          return timeB - timeA;
        });

        if (env.CHANNELS_ARCHIVE) {
          const storedCap = mergedVideos.slice(0, 2000);
          try {
            await env.CHANNELS_ARCHIVE.put(sourceId, JSON.stringify(storedCap));
          } catch (putErr) {
            console.warn(`Failed to put deepened archive for ${sourceId}:`, putErr);
          }

          // Also update this channel's entry inside _channels_latest_merged
          try {
            let fullMergedList: any[] = [];
            const rawMerged = await env.CHANNELS_ARCHIVE.get('_channels_latest_merged');
            if (rawMerged) {
              const parsed = JSON.parse(rawMerged);
              if (Array.isArray(parsed)) {
                fullMergedList = parsed;
              }
            }

            if (fullMergedList.length === 0) {
              fullMergedList = channelsSeed.map((ch: any) => ({
                ...ch,
                videos: [],
                videoCount: 0,
              }));
            }

            const targetIdx = fullMergedList.findIndex((ch: any) => ch.sourceId === sourceId);
            const updatedChannel: any = {
              ...(targetIdx >= 0 ? fullMergedList[targetIdx] : { sourceId, sourceType }),
              sourceId,
              sourceType,
              videos: mergedVideos.slice(0, 300),
              videoCount: Math.min(mergedVideos.length, 300),
            };

            const seedChannel = channelsSeed.find((ch: any) => ch.sourceId === sourceId);
            if (seedChannel) {
              Object.assign(updatedChannel, seedChannel, {
                videos: mergedVideos.slice(0, 300),
                videoCount: Math.min(mergedVideos.length, 300),
              });
            }

            if (targetIdx >= 0) {
              fullMergedList[targetIdx] = updatedChannel;
            } else {
              fullMergedList.push(updatedChannel);
            }

            await env.CHANNELS_ARCHIVE.put(
              '_channels_latest_merged',
              JSON.stringify(fullMergedList)
            );
          } catch (mergedErr) {
            console.error(`Failed to update _channels_latest_merged during deepen for ${sourceId}:`, mergedErr);
          }
        }

        const sliced = mergedVideos.slice(0, max);
        return new Response(
          JSON.stringify({
            sourceId,
            videos: sliced,
            count: sliced.length,
            nextPageToken: lastNextPageToken,
            deepened: true,
            exhausted: false,
          }),
          { status: 200, headers: corsHeaders }
        );
      } catch {
        return new Response(
          JSON.stringify({ sourceId, videos: [], count: 0, nextPageToken: null, deepened: false }),
          { status: 200, headers: corsHeaders }
        );
      }
    }

    // 4.2 GET /api/channel-videos-page?sourceId={sourceId}&sourceType={channel|playlist}&pageToken={token}&pageSize={50}
    if (url.pathname === '/api/channel-videos-page' && request.method === 'GET') {
      const sourceId = (url.searchParams.get('id') || url.searchParams.get('sourceId') || '').trim();
      const sourceType = (url.searchParams.get('sourceType') || 'channel').toLowerCase();
      const pageToken = url.searchParams.get('pageToken') || undefined;

      const rawPageSize = url.searchParams.get('pageSize');
      let pageSize = 50;
      if (rawPageSize) {
        const parsed = parseInt(rawPageSize, 10);
        if (!isNaN(parsed)) {
          pageSize = Math.max(1, Math.min(50, parsed));
        }
      }

      if (!sourceId) {
        return new Response(
          JSON.stringify({ error: 'Missing required parameter "sourceId"' }),
          { status: 400, headers: corsHeaders }
        );
      }

      const apiKey = resolveYouTubeApiKey(request, env);
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: 'no_api_key' }),
          { status: 400, headers: corsHeaders }
        );
      }

      let playlistId = sourceId;
      if (sourceType === 'playlist' || sourceId.startsWith('PL')) {
        playlistId = sourceId;
      } else if (sourceId.startsWith('UC')) {
        playlistId = 'UU' + sourceId.slice(2);
      }

      try {
        const apiUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
        apiUrl.searchParams.set('part', 'snippet');
        apiUrl.searchParams.set('playlistId', playlistId);
        apiUrl.searchParams.set('maxResults', String(pageSize));
        if (pageToken) apiUrl.searchParams.set('pageToken', pageToken);
        apiUrl.searchParams.set('key', apiKey);

        const ytRes = await fetch(apiUrl.toString());
        if (!ytRes.ok) {
          const errText = await ytRes.text();
          return new Response(
            JSON.stringify({ error: `YouTube API error (${ytRes.status}): ${errText}` }),
            { status: ytRes.status, headers: corsHeaders }
          );
        }

        const data: any = await ytRes.json();
        const items = data.items || [];
        const newVideos: VideoItem[] = [];

        for (const item of items) {
          const vId = item.snippet?.resourceId?.videoId;
          const title = item.snippet?.title;
          const publishedAt = item.snippet?.publishedAt;
          if (vId && title && title !== 'Private video' && title !== 'Deleted video') {
            newVideos.push({
              videoId: vId,
              title,
              publishedAt: publishedAt || new Date().toISOString(),
            });
          }
        }

        // Merge new items into KV archive best-effort
        if (env.CHANNELS_ARCHIVE && newVideos.length > 0) {
          void mergeAndStoreKVArchive(env, sourceId, newVideos);
        }

        return new Response(
          JSON.stringify({
            sourceId,
            videos: newVideos,
            nextPageToken: data.nextPageToken || null,
          }),
          { status: 200, headers: corsHeaders }
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return new Response(
          JSON.stringify({ error: errMsg }),
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // 4.3 GET /api/channel-search?sourceId={sourceId}&q={query}&pageToken={token}&maxResults={25}
    if (url.pathname === '/api/channel-search' && request.method === 'GET') {
      const sourceId = (url.searchParams.get('sourceId') || url.searchParams.get('id') || '').trim();
      let q = (url.searchParams.get('q') || '').trim();
      if (q.length > 100) {
        q = q.slice(0, 100);
      }

      const pageToken = url.searchParams.get('pageToken') || undefined;

      const rawMax = url.searchParams.get('maxResults');
      let maxResults = 25;
      if (rawMax) {
        const parsed = parseInt(rawMax, 10);
        if (!isNaN(parsed)) {
          maxResults = Math.max(1, Math.min(50, parsed));
        }
      }

      if (!sourceId || !q || q.length < 1) {
        return new Response(
          JSON.stringify({ error: 'Missing required parameter "sourceId" or "q"' }),
          { status: 400, headers: corsHeaders }
        );
      }

      const apiKey = resolveYouTubeApiKey(request, env);
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: 'no_api_key' }),
          { status: 400, headers: corsHeaders }
        );
      }

      try {
        const apiUrl = new URL('https://www.googleapis.com/youtube/v3/search');
        apiUrl.searchParams.set('part', 'snippet');
        apiUrl.searchParams.set('type', 'video');
        apiUrl.searchParams.set('channelId', sourceId);
        apiUrl.searchParams.set('q', q);
        apiUrl.searchParams.set('maxResults', String(maxResults));
        apiUrl.searchParams.set('safeSearch', 'strict');
        if (pageToken) apiUrl.searchParams.set('pageToken', pageToken);
        apiUrl.searchParams.set('key', apiKey);

        const ytRes = await fetch(apiUrl.toString());
        if (!ytRes.ok) {
          if (ytRes.status === 403 || ytRes.status === 429) {
            return new Response(
              JSON.stringify({ error: 'YouTube API quota or access error' }),
              { status: ytRes.status === 429 ? 429 : 502, headers: corsHeaders }
            );
          }
          return new Response(
            JSON.stringify({ error: `YouTube API error (${ytRes.status})` }),
            { status: ytRes.status >= 500 ? 502 : ytRes.status, headers: corsHeaders }
          );
        }

        const data: any = await ytRes.json();
        const items = data.items || [];
        const videos = items
          .map((item: any) => {
            const vId = item.id?.videoId || '';
            const title = item.snippet?.title || '';
            const publishedAt = item.snippet?.publishedAt || '';
            const thumbnail =
              item.snippet?.thumbnails?.medium?.url ||
              item.snippet?.thumbnails?.high?.url ||
              item.snippet?.thumbnails?.default?.url ||
              undefined;

            return {
              videoId: vId,
              title,
              publishedAt,
              thumbnail,
              channelId: sourceId,
            };
          })
          .filter(
            (v: any) =>
              v.videoId && v.title && v.title !== 'Private video' && v.title !== 'Deleted video'
          );

        return new Response(
          JSON.stringify({
            sourceId,
            q,
            videos,
            nextPageToken: data.nextPageToken || null,
          }),
          { status: 200, headers: corsHeaders }
        );
      } catch {
        return new Response(
          JSON.stringify({ error: 'Failed to search channel videos' }),
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // 4.5 GET /api/search-archive?q={query} (Deep search across all individual channel archives)
    if (url.pathname === '/api/search-archive' && request.method === 'GET') {
      try {
        const q = (url.searchParams.get('q') || '').trim();
        if (!q || q.length < 2) {
          return new Response(JSON.stringify({ results: [], count: 0 }), {
            status: 200,
            headers: corsHeaders,
          });
        }

        if (!env.CHANNELS_ARCHIVE) {
          return new Response(JSON.stringify({ results: [], count: 0 }), {
            status: 200,
            headers: corsHeaders,
          });
        }

        const normalize = (text: string) =>
          text
            .toLowerCase()
            .replace(/[\u064B-\u065F\u0670]/g, '')
            .replace(/[أإآ]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/ى/g, 'ي');

        const qLower = q.toLowerCase();
        const qNorm = normalize(q);

        const sourceIds: string[] = (channelsSeed as any[])
          .map((ch: any) => ch.sourceId)
          .filter(Boolean);

        const kvReads = await Promise.allSettled(
          sourceIds.map((sourceId) => env.CHANNELS_ARCHIVE!.get(sourceId))
        );

        const matchedVideos: Array<{ videoId: string; title: string; publishedAt: string; sourceId: string }> = [];

        kvReads.forEach((res, idx) => {
          if (res.status === 'fulfilled' && res.value) {
            const sourceId = sourceIds[idx];
            try {
              const videos = JSON.parse(res.value);
              if (Array.isArray(videos)) {
                for (const v of videos) {
                  if (v && v.videoId && v.title) {
                    const titleStr = String(v.title);
                    const titleLower = titleStr.toLowerCase();
                    const titleNorm = normalize(titleStr);
                    if (titleLower.includes(qLower) || titleNorm.includes(qNorm)) {
                      matchedVideos.push({
                        videoId: v.videoId,
                        title: titleStr,
                        publishedAt: v.publishedAt || '',
                        sourceId,
                      });
                    }
                  }
                }
              }
            } catch {
              // Ignore JSON parse errors for corrupt individual records
            }
          }
        });

        // Sort matching results by publishedAt descending
        matchedVideos.sort((a, b) => {
          const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
          const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
          return timeB - timeA;
        });

        const results = matchedVideos.slice(0, 50);

        return new Response(
          JSON.stringify({
            results,
            count: results.length,
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              'Cache-Control': 'public, max-age=60',
            },
          }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            results: [],
            count: 0,
            error: err instanceof Error ? err.message : String(err),
          }),
          {
            status: 200,
            headers: corsHeaders,
          }
        );
      }
    }

    // 4.6 GET /api/video-lookup?id={videoId} (Public lookup for a single video)
    if (url.pathname === '/api/video-lookup' && request.method === 'GET') {
      const videoId = (url.searchParams.get('id') || url.searchParams.get('videoId') || '').trim();
      if (!videoId) {
        return new Response(
          JSON.stringify({ error: 'Missing required parameter "id"' }),
          { status: 400, headers: corsHeaders }
        );
      }

      if (!env.YOUTUBE_API_KEY) {
        return new Response(
          JSON.stringify({ error: 'Server configuration error: YOUTUBE_API_KEY is not set' }),
          { status: 500, headers: corsHeaders }
        );
      }

      try {
        const apiUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
        apiUrl.searchParams.set('part', 'snippet');
        apiUrl.searchParams.set('id', videoId);
        apiUrl.searchParams.set('key', env.YOUTUBE_API_KEY);

        const ytRes = await fetch(apiUrl.toString());
        if (!ytRes.ok) {
          const errText = await ytRes.text();
          return new Response(
            JSON.stringify({ error: `YouTube API error (${ytRes.status}): ${errText}` }),
            { status: ytRes.status, headers: corsHeaders }
          );
        }

        const data: any = await ytRes.json();
        const item = data.items?.[0];

        if (
          !item ||
          !item.snippet ||
          item.snippet.title === 'Private video' ||
          item.snippet.title === 'Deleted video'
        ) {
          return new Response(
            JSON.stringify({ error: 'Video is unavailable or has been deleted' }),
            { status: 404, headers: corsHeaders }
          );
        }

        return new Response(
          JSON.stringify({
            videoId,
            title: item.snippet.title,
            channelId: item.snippet.channelId || '',
            channelTitle: item.snippet.channelTitle || '',
            publishedAt: item.snippet.publishedAt || new Date().toISOString(),
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              'Cache-Control': 'public, max-age=300',
            },
          }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: err?.message || 'Error looking up video' }),
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // 4.7 GET /api/playlist-lookup?id={playlistId} (Public lookup for a playlist)
    if (url.pathname === '/api/playlist-lookup' && request.method === 'GET') {
      const playlistId = (url.searchParams.get('id') || url.searchParams.get('playlistId') || '').trim();
      if (!playlistId) {
        return new Response(
          JSON.stringify({ error: 'Missing required parameter "id"' }),
          { status: 400, headers: corsHeaders }
        );
      }

      if (!env.YOUTUBE_API_KEY) {
        return new Response(
          JSON.stringify({ error: 'Server configuration error: YOUTUBE_API_KEY is not set' }),
          { status: 500, headers: corsHeaders }
        );
      }

      try {
        const allVideos: Array<{ videoId: string; title: string; publishedAt: string }> = [];
        let pageToken: string | undefined = undefined;
        let pageCount = 0;
        const maxPages = 4; // Fetch up to 200 videos (50 per page)

        while (pageCount < maxPages) {
          const apiUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
          apiUrl.searchParams.set('part', 'snippet');
          apiUrl.searchParams.set('playlistId', playlistId);
          apiUrl.searchParams.set('maxResults', '50');
          if (pageToken) apiUrl.searchParams.set('pageToken', pageToken);
          apiUrl.searchParams.set('key', env.YOUTUBE_API_KEY);

          const ytRes = await fetch(apiUrl.toString());
          if (!ytRes.ok) {
            const errText = await ytRes.text();
            if (ytRes.status === 404) {
              return new Response(
                JSON.stringify({ error: 'Playlist is unavailable or has been deleted' }),
                { status: 404, headers: corsHeaders }
              );
            }
            return new Response(
              JSON.stringify({ error: `YouTube API error (${ytRes.status}): ${errText}` }),
              { status: ytRes.status, headers: corsHeaders }
            );
          }

          const data: any = await ytRes.json();
          const items = data.items || [];
          for (const item of items) {
            const vId = item.snippet?.resourceId?.videoId;
            const title = item.snippet?.title;
            const publishedAt = item.snippet?.publishedAt;
            if (vId && title && title !== 'Private video' && title !== 'Deleted video') {
              allVideos.push({
                videoId: vId,
                title,
                publishedAt: publishedAt || new Date().toISOString(),
              });
            }
          }

          pageToken = data.nextPageToken;
          pageCount++;
          if (!pageToken || items.length === 0) break;
        }

        return new Response(
          JSON.stringify({
            playlistId,
            videos: allVideos,
            count: allVideos.length,
          }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              'Cache-Control': 'public, max-age=300',
            },
          }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: err?.message || 'Error looking up playlist' }),
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // 5. POST/GET /api/admin/trigger-refresh (Manual trigger for testing the cron batch)
    if (
      url.pathname === '/api/admin/trigger-refresh' &&
      (request.method === 'POST' || request.method === 'GET')
    ) {
      const queryKey = url.searchParams.get('key');
      const isAuthorized = checkAdminAuth(request, env) || (Boolean(env.ADMIN_KEY) && queryKey === env.ADMIN_KEY);

      if (!isAuthorized) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid or missing Bearer ADMIN_KEY' }),
          { status: 401, headers: corsHeaders }
        );
      }

      try {
        const result = await refreshChannelsBatch(env);
        return new Response(
          JSON.stringify({
            success: true,
            message: `تم تحديث دفعة من ${result.updatedCount} قناة بنجاح.`,
            ...result,
          }),
          { status: 200, headers: corsHeaders }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Error during batch refresh',
          }),
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // 6. GET /api/videos-views (Public proxy for YouTube video view count statistics)
    // Deploy note: Cloudflare secret YOUTUBE_API_KEY must be set on the worker for production.
    if (url.pathname === '/api/videos-views' && request.method === 'GET') {
      const rawIds = url.searchParams.get('ids') || '';
      const parsedIds = Array.from(
        new Set(
          rawIds
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
        )
      ).slice(0, 50);

      if (parsedIds.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Missing or empty required query parameter "ids"' }),
          { status: 400, headers: corsHeaders }
        );
      }

      if (!env.YOUTUBE_API_KEY) {
        return new Response(
          JSON.stringify({ error: 'YOUTUBE_API_KEY not configured' }),
          { status: 503, headers: corsHeaders }
        );
      }

      try {
        const ytUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
        ytUrl.searchParams.set('part', 'statistics,id');
        ytUrl.searchParams.set('id', parsedIds.join(','));
        ytUrl.searchParams.set('key', env.YOUTUBE_API_KEY);

        const ytRes = await fetch(ytUrl.toString());
        if (!ytRes.ok) {
          return new Response(
            JSON.stringify({ error: `Upstream YouTube API error (${ytRes.status})` }),
            { status: 502, headers: corsHeaders }
          );
        }

        const data: any = await ytRes.json();
        const results: Record<string, number> = {};
        for (const item of data.items || []) {
          const vId = item.id;
          const rawViews = item.statistics?.viewCount;
          if (vId && rawViews !== undefined) {
            results[vId] = Number(rawViews) || 0;
          }
        }

        return new Response(JSON.stringify(results), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Cache-Control': 'public, max-age=3600',
          },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Failed to fetch video statistics',
          }),
          { status: 502, headers: corsHeaders }
        );
      }
    }

    // 7. GET /api/global-blocks (Public - global blocked channels & playlists)
    if (url.pathname === '/api/global-blocks' && request.method === 'GET') {
      let blocks: { channelIds: string[]; playlistIds: string[]; updatedAt: number } = {
        channelIds: [],
        playlistIds: [],
        updatedAt: 0,
      };
      if (env.CHANNELS_ARCHIVE) {
        try {
          const raw = await env.CHANNELS_ARCHIVE.get('global_blocks');
          if (raw) {
            blocks = { ...blocks, ...JSON.parse(raw) };
          }
        } catch {}
      }
      return new Response(JSON.stringify(blocks), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=600',
        },
      });
    }

    // 8. GET /api/announcements (Public - active announcements, or full list if all=true or admin)
    if ((url.pathname === '/api/announcements' || url.pathname === '/api/admin/announcements') && request.method === 'GET') {
      const returnAll = url.searchParams.get('all') === 'true' || url.pathname === '/api/admin/announcements' || checkAdminAuth(request, env);
      let list: any[] = [];
      if (env.CHANNELS_ARCHIVE) {
        try {
          const raw = await env.CHANNELS_ARCHIVE.get('announcements');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              list = parsed;
            } else if (parsed && Array.isArray(parsed.announcements)) {
              list = parsed.announcements;
            }
          }
        } catch {}
      }
      const responseList = returnAll ? list : list.filter((a) => a && a.active !== false);
      return new Response(JSON.stringify(responseList), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Cache-Control': returnAll
            ? 'no-cache, no-store, must-revalidate'
            : 'public, max-age=120, s-maxage=300, stale-while-revalidate=600',
        },
      });
    }

    // 8.5 GET /api/categories (Public - dynamic categories with fallback defaults)
    if ((url.pathname === '/api/categories' || url.pathname === '/api/admin/categories') && request.method === 'GET') {
      if (url.pathname === '/api/admin/categories' && !checkAdminAuth(request, env)) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid or missing Bearer ADMIN_KEY' }),
          { status: 401, headers: corsHeaders }
        );
      }

      const defaultCategories = [
        { id: 'quran', name: 'قرآن كريم وأذكار', label: 'قرآن كريم وأذكار', emoji: '🕌', icon: '🕌', order: 1, description: 'تلاوات خاشعة وأذكار يومية وقصص الأنبياء' },
        { id: 'stories', name: 'قصص وحكايات', label: 'قصص وحكايات', emoji: '📖', icon: '📖', order: 2, description: 'قصص ممتعة ومغامرات هادفة ومسلية' },
        { id: 'cartoons', name: 'كرتون وأناشيد', label: 'كرتون وأناشيد', emoji: '📺', icon: '📺', order: 3, description: 'أناشيد كرتونية وبرامج رسوم متحركة مبهجة' },
        { id: 'education', name: 'تعليم ولغات', label: 'تعليم ولغات', emoji: '💡', icon: '💡', order: 4, description: 'حروف وأرقام وتعلم اللغات والمفاهيم الأساسية' },
        { id: 'science', name: 'علوم واستكشاف', label: 'علوم واستكشاف', emoji: '🔬', icon: '🔬', order: 5, description: 'تجارب علمية واستكشاف العالم الطبيعي' },
        { id: 'crafts', name: 'رسم وفنون', label: 'رسم وفنون', emoji: '🎨', icon: '🎨', order: 6, description: 'تعلم الرسم والتلوين والأشغال اليدوية المبتكرة' },
        { id: 'sports', name: 'حركة ورياضة', label: 'حركة ورياضة', emoji: '⚽', icon: '⚽', order: 7, description: 'تمارين وألعاب حركية وتحديات رياضية ممتعة' },
        { id: 'gaming', name: 'ألعاب مناسبة', label: 'ألعاب مناسبة', emoji: '🎮', icon: '🎮', order: 8, description: 'ألعاب ذكاء ومرح عائلي مناسبة للأطفال' },
        { id: 'cooking', name: 'طبخ الصغار', label: 'طبخ الصغار', emoji: '🍳', icon: '🍳', order: 9, description: 'وصفات لذيذة وسهلة للأطفال' },
        { id: 'calm', name: 'هدوء واسترخاء', label: 'هدوء واسترخاء', emoji: '🌙', icon: '🌙', order: 10, description: 'موسيقى هادئة وقصص ما قبل النوم' },
      ];

      let rawList: any[] = [];
      if (env.CHANNELS_ARCHIVE) {
        try {
          const raw = await env.CHANNELS_ARCHIVE.get('custom_categories');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              rawList = parsed;
            } else if (parsed && Array.isArray(parsed.categories) && parsed.categories.length > 0) {
              rawList = parsed.categories;
            } else if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
              rawList = parsed.items;
            }
          }
        } catch {}
      }

      if (rawList.length === 0) {
        rawList = defaultCategories;
      }

      const normalizedList = rawList
        .map((c: any, index: number) => {
          if (!c || typeof c !== 'object') return null;
          const id = String(c.id || c.categoryId || '').trim();
          if (!id) return null;
          const label = String(c.label || c.name || id).trim();
          const name = String(c.name || c.label || id).trim();
          const emoji = String(c.emoji || c.icon || '🌟').trim();
          const icon = String(c.icon || c.emoji || '🌟').trim();
          const order = typeof c.order === 'number' ? c.order : index + 1;
          const description = String(c.description || '').trim();
          return { id, name, label, icon, emoji, order, description };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));

      return new Response(JSON.stringify(normalizedList), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=600',
        },
      });
    }

    // 8.6 POST/PUT /api/admin/categories (Admin - save, delete, reorder or full replace)
    if ((url.pathname === '/api/admin/categories' || url.pathname === '/api/categories') && (request.method === 'POST' || request.method === 'PUT')) {
      if (!checkAdminAuth(request, env)) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or missing Bearer ADMIN_KEY' }), {
          status: 401,
          headers: corsHeaders,
        });
      }

      try {
        const body: any = await request.json();

        // 1. Load existing categories from KV custom_categories
        const defaultCategories = [
          { id: 'quran', name: 'قرآن كريم وأذكار', label: 'قرآن كريم وأذكار', emoji: '🕌', icon: '🕌', order: 1, description: 'تلاوات خاشعة وأذكار يومية وقصص الأنبياء' },
          { id: 'stories', name: 'قصص وحكايات', label: 'قصص وحكايات', emoji: '📖', icon: '📖', order: 2, description: 'قصص ممتعة ومغامرات هادفة ومسلية' },
          { id: 'cartoons', name: 'كرتون وأناشيد', label: 'كرتون وأناشيد', emoji: '📺', icon: '📺', order: 3, description: 'أناشيد كرتونية وبرامج رسوم متحركة مبهجة' },
          { id: 'education', name: 'تعليم ولغات', label: 'تعليم ولغات', emoji: '💡', icon: '💡', order: 4, description: 'حروف وأرقام وتعلم اللغات والمفاهيم الأساسية' },
          { id: 'science', name: 'علوم واستكشاف', label: 'علوم واستكشاف', emoji: '🔬', icon: '🔬', order: 5, description: 'تجارب علمية واستكشاف العالم الطبيعي' },
          { id: 'crafts', name: 'رسم وفنون', label: 'رسم وفنون', emoji: '🎨', icon: '🎨', order: 6, description: 'تعلم الرسم والتلوين والأشغال اليدوية المبتكرة' },
          { id: 'sports', name: 'حركة ورياضة', label: 'حركة ورياضة', emoji: '⚽', icon: '⚽', order: 7, description: 'تمارين وألعاب حركية وتحديات رياضية ممتعة' },
          { id: 'gaming', name: 'ألعاب مناسبة', label: 'ألعاب مناسبة', emoji: '🎮', icon: '🎮', order: 8, description: 'ألعاب ذكاء ومرح عائلي مناسبة للأطفال' },
          { id: 'cooking', name: 'طبخ الصغار', label: 'طبخ الصغار', emoji: '🍳', icon: '🍳', order: 9, description: 'وصفات لذيذة وسهلة للأطفال' },
          { id: 'calm', name: 'هدوء واسترخاء', label: 'هدوء واسترخاء', emoji: '🌙', icon: '🌙', order: 10, description: 'موسيقى هادئة وقصص ما قبل النوم' },
        ];

        let currentList: any[] = [];
        if (env.CHANNELS_ARCHIVE) {
          try {
            const raw = await env.CHANNELS_ARCHIVE.get('custom_categories');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed) && parsed.length > 0) currentList = parsed;
              else if (parsed && Array.isArray(parsed.categories) && parsed.categories.length > 0) currentList = parsed.categories;
              else if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) currentList = parsed.items;
            }
          } catch {}
        }
        if (currentList.length === 0) {
          currentList = defaultCategories;
        }

        const normalizeCategory = (c: any, defaultOrder: number) => {
          const id = String(c.id || c.categoryId || '').trim();
          const label = String(c.label || c.name || id).trim();
          const name = String(c.name || c.label || id).trim();
          const emoji = String(c.emoji || c.icon || '🌟').trim();
          const icon = String(c.icon || c.emoji || '🌟').trim();
          const order = typeof c.order === 'number' ? c.order : defaultOrder;
          const description = String(c.description || '').trim();
          return { id, name, label, icon, emoji, order, description };
        };

        const action = body?.action ? String(body.action).toLowerCase() : undefined;

        // Action 1: save | add | update | upsert
        if (action === 'save' || action === 'add' || action === 'update' || action === 'upsert') {
          const catInput = body.category || body.item || body;
          const targetId = String(catInput.id || catInput.categoryId || '').trim();
          if (!targetId) {
            return new Response(JSON.stringify({ error: 'Missing category id' }), {
              status: 400,
              headers: corsHeaders,
            });
          }

          const normalizedCat = normalizeCategory(catInput, currentList.length + 1);
          const existingIdx = currentList.findIndex((c: any) => String(c.id || c.categoryId) === targetId);

          if (existingIdx >= 0) {
            currentList[existingIdx] = { ...currentList[existingIdx], ...normalizedCat };
          } else {
            currentList.push(normalizedCat);
          }

          if (env.CHANNELS_ARCHIVE) {
            await env.CHANNELS_ARCHIVE.put('custom_categories', JSON.stringify(currentList));
          }

          return new Response(JSON.stringify({ ok: true, category: normalizedCat }), {
            status: 200,
            headers: corsHeaders,
          });
        }

        // Action 2: delete | remove
        if (action === 'delete' || action === 'remove') {
          const targetId = String(body.id || body.categoryId || (body.category && (body.category.id || body.category.categoryId)) || '').trim();
          if (!targetId) {
            return new Response(JSON.stringify({ error: 'Missing category id to delete' }), {
              status: 400,
              headers: corsHeaders,
            });
          }

          currentList = currentList.filter((c: any) => String(c.id || c.categoryId) !== targetId);

          if (env.CHANNELS_ARCHIVE) {
            await env.CHANNELS_ARCHIVE.put('custom_categories', JSON.stringify(currentList));
          }

          return new Response(JSON.stringify({ ok: true, deletedId: targetId }), {
            status: 200,
            headers: corsHeaders,
          });
        }

        // Action 3: reorder
        if (action === 'reorder') {
          if (Array.isArray(body.categories) && body.categories.length > 0) {
            currentList = body.categories.map((c: any, idx: number) => normalizeCategory(c, idx + 1));
          } else if (Array.isArray(body.categoryIds) && body.categoryIds.length > 0) {
            const idOrderMap = new Map<string, number>();
            body.categoryIds.forEach((id: string, idx: number) => idOrderMap.set(String(id).trim(), idx + 1));
            currentList = currentList
              .map((c: any, idx: number) => {
                const id = String(c.id || c.categoryId).trim();
                const newOrder = idOrderMap.has(id) ? idOrderMap.get(id)! : 999 + idx;
                return normalizeCategory({ ...c, order: newOrder }, newOrder);
              })
              .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
          }

          if (env.CHANNELS_ARCHIVE) {
            await env.CHANNELS_ARCHIVE.put('custom_categories', JSON.stringify(currentList));
          }

          return new Response(JSON.stringify({ ok: true, categories: currentList }), {
            status: 200,
            headers: corsHeaders,
          });
        }

        // Action 4: Raw array or body.categories / body.items without explicit action (full replace)
        let listToSave: any[] = [];
        if (Array.isArray(body)) {
          listToSave = body;
        } else if (body && Array.isArray(body.categories)) {
          listToSave = body.categories;
        } else if (body && Array.isArray(body.items)) {
          listToSave = body.items;
        } else {
          return new Response(JSON.stringify({ error: 'Invalid request payload for categories' }), {
            status: 400,
            headers: corsHeaders,
          });
        }

        const normalizedFull = listToSave.map((c: any, idx: number) => normalizeCategory(c, idx + 1));

        if (env.CHANNELS_ARCHIVE) {
          await env.CHANNELS_ARCHIVE.put('custom_categories', JSON.stringify(normalizedFull));
        }

        return new Response(JSON.stringify({ ok: true, count: normalizedFull.length, categories: normalizedFull }), {
          status: 200,
          headers: corsHeaders,
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err?.message || 'Failed to process categories' }), {
          status: 400,
          headers: corsHeaders,
        });
      }
    }

    // 9. POST /api/admin/blocks (Protected with Bearer ADMIN_KEY)
    if (url.pathname === '/api/admin/blocks' && request.method === 'POST') {
      if (!checkAdminAuth(request, env)) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid or missing Bearer ADMIN_KEY' }),
          { status: 401, headers: corsHeaders }
        );
      }

      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return new Response(
          JSON.stringify({ error: 'Invalid JSON body' }),
          { status: 400, headers: corsHeaders }
        );
      }

      if (!env.CHANNELS_ARCHIVE) {
        return new Response(
          JSON.stringify({ error: 'KV binding CHANNELS_ARCHIVE is not available' }),
          { status: 500, headers: corsHeaders }
        );
      }

      let blocks: { channelIds: string[]; playlistIds: string[]; updatedAt: number } = {
        channelIds: [],
        playlistIds: [],
        updatedAt: Date.now(),
      };
      try {
        const raw = await env.CHANNELS_ARCHIVE.get('global_blocks');
        if (raw) {
          blocks = { ...blocks, ...JSON.parse(raw) };
        }
      } catch {}

      const { action, type, id, channelIds, playlistIds } = body;

      if (Array.isArray(channelIds)) {
        blocks.channelIds = Array.from(
          new Set(channelIds.map((s: any) => String(s).trim()).filter(Boolean))
        );
      }
      if (Array.isArray(playlistIds)) {
        blocks.playlistIds = Array.from(
          new Set(playlistIds.map((s: any) => String(s).trim()).filter(Boolean))
        );
      }

      if (action && id) {
        const cleanId = String(id).trim();
        const targetList = type === 'playlist' ? 'playlistIds' : 'channelIds';
        if (action === 'add') {
          if (!blocks[targetList].includes(cleanId)) {
            blocks[targetList].push(cleanId);
          }
        } else if (action === 'remove' || action === 'delete') {
          blocks[targetList] = blocks[targetList].filter((x) => x !== cleanId);
        }
      }

      blocks.updatedAt = Date.now();
      await env.CHANNELS_ARCHIVE.put('global_blocks', JSON.stringify(blocks));

      return new Response(
        JSON.stringify({
          success: true,
          blocks,
          message: 'Global blocks updated successfully',
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // 10. POST /api/admin/channels (Protected with Bearer ADMIN_KEY)
    if (url.pathname === '/api/admin/channels' && request.method === 'POST') {
      if (!checkAdminAuth(request, env)) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid or missing Bearer ADMIN_KEY' }),
          { status: 401, headers: corsHeaders }
        );
      }

      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return new Response(
          JSON.stringify({ error: 'Invalid JSON body' }),
          { status: 400, headers: corsHeaders }
        );
      }

      if (!env.CHANNELS_ARCHIVE) {
        return new Response(
          JSON.stringify({ error: 'KV binding CHANNELS_ARCHIVE is not available' }),
          { status: 500, headers: corsHeaders }
        );
      }

      let fullMergedList: any[] = [];
      try {
        const rawMerged = await env.CHANNELS_ARCHIVE.get('_channels_latest_merged');
        if (rawMerged) {
          fullMergedList = JSON.parse(rawMerged);
        }
      } catch {}

      if (!Array.isArray(fullMergedList) || fullMergedList.length === 0) {
        fullMergedList = channelsSeed.map((ch: any) => ({ ...ch, videos: [], videoCount: 0 }));
      }

      const { action, channel, item, sourceId, channels } = body;
      const targetChannel = channel || item;

      if (Array.isArray(channels)) {
        for (const ch of channels) {
          if (!ch || !ch.sourceId) continue;
          const idx = fullMergedList.findIndex((it) => it.sourceId === ch.sourceId);
          if (idx >= 0) {
            fullMergedList[idx] = { ...fullMergedList[idx], ...ch };
          } else {
            fullMergedList.push({ videos: [], videoCount: 0, ...ch });
          }
        }
      } else if (action === 'delete' || action === 'remove') {
        const targetId = sourceId || (targetChannel && targetChannel.sourceId);
        if (targetId) {
          fullMergedList = fullMergedList.filter((it) => it.sourceId !== targetId);
        }
      } else if (targetChannel && targetChannel.sourceId) {
        const idx = fullMergedList.findIndex((it) => it.sourceId === targetChannel.sourceId);
        if (idx >= 0) {
          fullMergedList[idx] = { ...fullMergedList[idx], ...targetChannel };
        } else {
          fullMergedList.push({ videos: [], videoCount: 0, ...targetChannel });
        }
      }

      await env.CHANNELS_ARCHIVE.put('_channels_latest_merged', JSON.stringify(fullMergedList));

      return new Response(
        JSON.stringify({
          success: true,
          count: fullMergedList.length,
          message: 'Channels list updated successfully',
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // 10.5 POST /api/admin/channel-video-delete (Protected with Bearer ADMIN_KEY)
    if (url.pathname === '/api/admin/channel-video-delete' && request.method === 'POST') {
      if (!checkAdminAuth(request, env)) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid or missing Bearer ADMIN_KEY' }),
          { status: 401, headers: corsHeaders }
        );
      }

      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return new Response(
          JSON.stringify({ error: 'Invalid JSON body' }),
          { status: 400, headers: corsHeaders }
        );
      }

      const sourceId = body && typeof body.sourceId === 'string' ? body.sourceId.trim() : '';
      const videoId = body && typeof body.videoId === 'string' ? body.videoId.trim() : '';

      if (!sourceId || !videoId) {
        return new Response(
          JSON.stringify({ error: 'Missing required field: sourceId and videoId must be provided' }),
          { status: 400, headers: corsHeaders }
        );
      }

      if (!env.CHANNELS_ARCHIVE) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'CHANNELS_ARCHIVE KV is not configured',
            remainingCount: 0,
          }),
          { status: 200, headers: corsHeaders }
        );
      }

      try {
        const rawChannel = await env.CHANNELS_ARCHIVE.get(sourceId);
        if (!rawChannel) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'القناة غير موجودة في الأرشيف',
              remainingCount: 0,
            }),
            { status: 200, headers: corsHeaders }
          );
        }

        let videos: any[] = [];
        try {
          const parsed = JSON.parse(rawChannel);
          if (Array.isArray(parsed)) {
            videos = parsed;
          }
        } catch {
          videos = [];
        }

        const originalCount = videos.length;
        const filteredVideos = videos.filter((v: any) => v && (v.videoId || v.id) !== videoId);

        if (filteredVideos.length === originalCount) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'الفيديو غير موجود في الأرشيف',
              remainingCount: originalCount,
            }),
            { status: 200, headers: corsHeaders }
          );
        }

        // Write the filtered array back to the individual channel archive
        await env.CHANNELS_ARCHIVE.put(sourceId, JSON.stringify(filteredVideos));

        // Also remove the same videoId from this channel's entry inside _channels_latest_merged if present there
        try {
          const rawMerged = await env.CHANNELS_ARCHIVE.get('_channels_latest_merged');
          if (rawMerged) {
            const mergedList = JSON.parse(rawMerged);
            if (Array.isArray(mergedList)) {
              let mergedModified = false;
              for (const ch of mergedList) {
                if (ch && ch.sourceId === sourceId && Array.isArray(ch.videos)) {
                  const beforeLen = ch.videos.length;
                  ch.videos = ch.videos.filter((v: any) => v && (v.videoId || v.id) !== videoId);
                  if (ch.videos.length !== beforeLen) {
                    ch.videoCount = ch.videos.length;
                    mergedModified = true;
                  }
                }
              }
              if (mergedModified) {
                await env.CHANNELS_ARCHIVE.put(
                  '_channels_latest_merged',
                  JSON.stringify(mergedList)
                );
              }
            }
          }
        } catch (mergedErr) {
          console.warn('Error removing video from _channels_latest_merged:', mergedErr);
        }

        return new Response(
          JSON.stringify({ success: true, remainingCount: filteredVideos.length }),
          { status: 200, headers: corsHeaders }
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return new Response(
          JSON.stringify({ success: false, error: errMsg, remainingCount: 0 }),
          { status: 200, headers: corsHeaders }
        );
      }
    }

    // 11. POST /api/admin/announcements (Protected with Bearer ADMIN_KEY)
    if (url.pathname === '/api/admin/announcements' && request.method === 'POST') {
      if (!checkAdminAuth(request, env)) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid or missing Bearer ADMIN_KEY' }),
          { status: 401, headers: corsHeaders }
        );
      }

      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return new Response(
          JSON.stringify({ error: 'Invalid JSON body' }),
          { status: 400, headers: corsHeaders }
        );
      }

      if (!env.CHANNELS_ARCHIVE) {
        return new Response(
          JSON.stringify({ error: 'KV binding CHANNELS_ARCHIVE is not available' }),
          { status: 500, headers: corsHeaders }
        );
      }

      let existingList: any[] = [];
      try {
        const raw = await env.CHANNELS_ARCHIVE.get('announcements');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) existingList = parsed;
          else if (parsed && Array.isArray(parsed.announcements)) existingList = parsed.announcements;
        }
      } catch {}

      if (Array.isArray(body)) {
        existingList = body;
      } else if (body.action === 'delete' && body.id) {
        existingList = existingList.filter((a) => a.id !== body.id);
      } else if (body.id) {
        const idx = existingList.findIndex((a) => a.id === body.id);
        const newAnn = {
          id: body.id,
          title: body.title || '',
          body: body.body || '',
          severity: body.severity || 'info',
          active: body.active !== false,
          createdAt: body.createdAt || Date.now(),
          updatedAt: Date.now(),
        };
        if (idx >= 0) {
          existingList[idx] = newAnn;
        } else {
          existingList.unshift(newAnn);
        }
      } else if (Array.isArray(body.announcements)) {
        existingList = body.announcements;
      }

      // Cap at 10 items max
      existingList = existingList.slice(0, 10);
      await env.CHANNELS_ARCHIVE.put('announcements', JSON.stringify(existingList));

      return new Response(
        JSON.stringify({
          success: true,
          announcements: existingList,
          message: 'Announcements updated successfully',
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // 12. GET /api/admin/status (Protected with Bearer ADMIN_KEY)
    if (url.pathname === '/api/admin/status' && request.method === 'GET') {
      if (!checkAdminAuth(request, env)) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid or missing Bearer ADMIN_KEY' }),
          { status: 401, headers: corsHeaders }
        );
      }

      let channelsCount = 0;
      let cursor = 0;
      const globalBlocksCount = { channels: 0, playlists: 0 };
      let activeAnnouncementsCount = 0;

      if (env.CHANNELS_ARCHIVE) {
        try {
          const rawMerged = await env.CHANNELS_ARCHIVE.get('_channels_latest_merged');
          if (rawMerged) {
            const list = JSON.parse(rawMerged);
            if (Array.isArray(list)) channelsCount = list.length;
          }
        } catch {}

        try {
          const rawCursor = await env.CHANNELS_ARCHIVE.get('_rss_refresh_cursor');
          if (rawCursor) cursor = parseInt(rawCursor, 10) || 0;
        } catch {}

        try {
          const rawBlocks = await env.CHANNELS_ARCHIVE.get('global_blocks');
          if (rawBlocks) {
            const b = JSON.parse(rawBlocks);
            globalBlocksCount.channels = Array.isArray(b.channelIds) ? b.channelIds.length : 0;
            globalBlocksCount.playlists = Array.isArray(b.playlistIds) ? b.playlistIds.length : 0;
          }
        } catch {}

        try {
          const rawAnn = await env.CHANNELS_ARCHIVE.get('announcements');
          if (rawAnn) {
            const a = JSON.parse(rawAnn);
            if (Array.isArray(a)) {
              activeAnnouncementsCount = a.filter((x: any) => x.active !== false).length;
            }
          }
        } catch {}
      }

      return new Response(
        JSON.stringify({
          status: 'ok',
          worker: 'youngtube-worker',
          version: '2.0.0',
          channelsCount,
          cursor,
          globalBlocksCount,
          activeAnnouncementsCount,
          hasYoutubeApiKey: Boolean(env.YOUTUBE_API_KEY),
          hasAdminKey: Boolean(env.ADMIN_KEY),
          todayUtc: getTodayDateUtc(),
          timestamp: new Date().toISOString(),
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // 13. Telemetry Event Ingestion:
    // - POST /api/telemetry/parent-session-start
    // - POST /api/telemetry/parent-session-end
    // - POST /api/telemetry/child-session-end
    if (
      request.method === 'POST' &&
      (url.pathname === '/api/telemetry/parent-session-start' ||
        url.pathname === '/api/telemetry/parent-session-end' ||
        url.pathname === '/api/telemetry/child-session-end')
    ) {
      let body: any = {};
      try {
        body = await request.json();
      } catch {}

      const country =
        request.headers.get('CF-IPCountry') ||
        request.headers.get('cf-ipcountry') ||
        'XX';

      const installId = body.installId ? String(body.installId).trim() : undefined;
      const durationSec = Number(body.durationSec) || 0;
      const sessionId = body.sessionId ? String(body.sessionId).trim() : undefined;

      try {
        if (env.TELEMETRY_DO) {
          const id = env.TELEMETRY_DO.idFromName('telemetry-v1');
          const stub = env.TELEMETRY_DO.get(id);

          let doPath = '/parent_start';
          if (url.pathname === '/api/telemetry/parent-session-end') {
            doPath = '/parent_end';
          } else if (url.pathname === '/api/telemetry/child-session-end') {
            doPath = '/child_end';
          }

          await stub.fetch(`https://do${doPath}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ country, installId, durationSec, sessionId }),
          });
        } else {
          // Fallback if DO binding is missing
          if (url.pathname === '/api/telemetry/parent-session-start') {
            await recordTelemetryEvent(env, 'parent_start', country, installId, 0);
          } else if (url.pathname === '/api/telemetry/parent-session-end') {
            await recordTelemetryEvent(env, 'parent_end', country, installId, durationSec);
          } else if (url.pathname === '/api/telemetry/child-session-end') {
            await recordTelemetryEvent(env, 'child_end', country, installId, durationSec);
          }
        }
      } catch (err) {
        console.error('Telemetry record error:', err);
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // 13b. Funnel Event Ingestion:
    // - POST /api/telemetry/funnel-event
    if (request.method === 'POST' && url.pathname === '/api/telemetry/funnel-event') {
      let body: any = {};
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const event = typeof body?.event === 'string' ? body.event.trim() : '';
      if (!ACCEPTED_FUNNEL_EVENTS.includes(event as any)) {
        return new Response(
          JSON.stringify({
            error: 'Unknown or invalid funnel event',
            acceptedEvents: ACCEPTED_FUNNEL_EVENTS,
          }),
          {
            status: 400,
            headers: corsHeaders,
          }
        );
      }

      const country =
        request.headers.get('CF-IPCountry') ||
        request.headers.get('cf-ipcountry') ||
        'XX';

      const installId =
        body.installId && typeof body.installId === 'string' && body.installId.trim()
          ? body.installId.trim()
          : undefined;

      try {
        await recordFunnelEvent(env, event, country, installId);
      } catch (err) {
        console.error('Funnel event record error:', err);
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // 14. GET /api/admin/telemetry (Protected with Bearer ADMIN_KEY)
    if (url.pathname === '/api/admin/telemetry' && request.method === 'GET') {
      if (!checkAdminAuth(request, env)) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid or missing Bearer ADMIN_KEY' }),
          { status: 401, headers: corsHeaders }
        );
      }

      const daysParam = parseInt(url.searchParams.get('days') || '30', 10);
      const maxDays = Math.min(Math.max(isNaN(daysParam) ? 30 : daysParam, 1), 90);

      // Prefer Durable Object TelemetryAggregator single-threaded store
      if (env.TELEMETRY_DO) {
        try {
          const id = env.TELEMETRY_DO.idFromName('telemetry-v1');
          const stub = env.TELEMETRY_DO.get(id);
          const doRes = await stub.fetch(`https://do/summary?days=${maxDays}`);
          if (doRes.ok) {
            const summaryData = await doRes.json();
            return new Response(JSON.stringify(summaryData), {
              status: 200,
              headers: corsHeaders,
            });
          }
        } catch (err) {
          console.error('Telemetry DO summary error, attempting KV fallback:', err);
        }
      }

      if (!env.CHANNELS_ARCHIVE) {
        return new Response(
          JSON.stringify({
            days: [],
            parentSessionsByCountry: {},
            parentDurationSecByCountry: {},
            childSessionsByCountry: {},
            childDurationSecByCountry: {},
            uniqueByCountry: {},
            parentSessionsTotal: 0,
            parentDurationSecTotal: 0,
            childSessionsTotal: 0,
            childDurationSecTotal: 0,
            totalUniqueInstalls: 0,
            generatedAt: Date.now(),
          }),
          { status: 200, headers: corsHeaders }
        );
      }

      let indexDates: string[] = [];
      try {
        const rawIndex = await env.CHANNELS_ARCHIVE.get('telemetry_index');
        if (rawIndex) {
          indexDates = JSON.parse(rawIndex);
        }
      } catch {}

      const todayStr = getTodayDateUtc();
      if (!indexDates.includes(todayStr)) {
        indexDates.unshift(todayStr);
      }

      const targetDates = Array.from(new Set(indexDates))
        .sort()
        .reverse()
        .slice(0, maxDays);

      const daysData: TelemetryDaily[] = [];
      const allUniqueByCountryMap: Record<string, Set<string>> = {};
      const totalUniqueSet = new Set<string>();

      await Promise.all(
        targetDates.map(async (d) => {
          try {
            const [dailyRaw, uniquesRaw] = await Promise.all([
              env.CHANNELS_ARCHIVE!.get(`telemetry_daily:${d}`),
              env.CHANNELS_ARCHIVE!.get(`telemetry_uniques:${d}`),
            ]);

            if (dailyRaw) {
              const parsedDaily: TelemetryDaily = JSON.parse(dailyRaw);
              daysData.push(parsedDaily);
            }

            if (uniquesRaw) {
              const parsedUniques: Record<string, string[]> = JSON.parse(uniquesRaw);
              for (const [c, ids] of Object.entries(parsedUniques)) {
                if (!allUniqueByCountryMap[c]) allUniqueByCountryMap[c] = new Set();
                for (const id of ids) {
                  allUniqueByCountryMap[c].add(id);
                  totalUniqueSet.add(id);
                }
              }
            }
          } catch {}
        })
      );

      daysData.sort((a, b) => b.date.localeCompare(a.date));

      const parentSessionsByCountry: Record<string, number> = {};
      const parentDurationSecByCountry: Record<string, number> = {};
      const childSessionsByCountry: Record<string, number> = {};
      const childDurationSecByCountry: Record<string, number> = {};
      let parentSessionsTotal = 0;
      let parentDurationSecTotal = 0;
      let childSessionsTotal = 0;
      let childDurationSecTotal = 0;

      for (const day of daysData) {
        for (const [c, val] of Object.entries(day.parentSessionsByCountry || {})) {
          parentSessionsByCountry[c] = (parentSessionsByCountry[c] || 0) + val;
          parentSessionsTotal += val;
        }
        for (const [c, val] of Object.entries(day.parentDurationSecByCountry || {})) {
          parentDurationSecByCountry[c] = (parentDurationSecByCountry[c] || 0) + val;
          parentDurationSecTotal += val;
        }
        for (const [c, val] of Object.entries(day.childSessionsByCountry || {})) {
          childSessionsByCountry[c] = (childSessionsByCountry[c] || 0) + val;
          childSessionsTotal += val;
        }
        for (const [c, val] of Object.entries(day.childDurationSecByCountry || {})) {
          childDurationSecByCountry[c] = (childDurationSecByCountry[c] || 0) + val;
          childDurationSecTotal += val;
        }
      }

      const uniqueByCountry: Record<string, number> = {};
      for (const [c, setIds] of Object.entries(allUniqueByCountryMap)) {
        uniqueByCountry[c] = setIds.size;
      }

      return new Response(
        JSON.stringify({
          days: daysData,
          parentSessionsByCountry,
          parentDurationSecByCountry,
          childSessionsByCountry,
          childDurationSecByCountry,
          uniqueByCountry,
          parentSessionsTotal,
          parentDurationSecTotal,
          childSessionsTotal,
          childDurationSecTotal,
          totalUniqueInstalls: totalUniqueSet.size,
          generatedAt: Date.now(),
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },

  /**
   * Cron Trigger handler:
   * - Respects Cloudflare Workers free plan limit (at most 50 subrequests per invocation).
   * - Executes at most ONE batch per run: either live RSS refresh (45 channels) OR
   *   server-scheduled archive maintenance batch (2 channels, max 40 subrequests) under maintenance_lock.
   * - Branches based on cron pattern (e.g. minute :30 for maintenance vs minute :00 for refresh)
   *   or alternates via KV (_last_cron_task) when triggered on a single schedule.
   * - Sweeps pending DO telemetry aggregates.
   */
  async scheduled(controller: any, env: Env, ctx?: any): Promise<void> {
    const cronTrigger = (controller && typeof controller.cron === 'string') ? controller.cron : '';
    let taskToRun: 'refresh' | 'maintenance' = 'refresh';

    if (cronTrigger.includes('30')) {
      taskToRun = 'maintenance';
    } else if (cronTrigger.includes('0')) {
      taskToRun = 'refresh';
    } else if (env.CHANNELS_ARCHIVE) {
      // Fallback branching for single cron trigger or manual testing: alternate tasks
      try {
        const lastTask = await env.CHANNELS_ARCHIVE.get('_last_cron_task');
        taskToRun = lastTask === 'refresh' ? 'maintenance' : 'refresh';
        await env.CHANNELS_ARCHIVE.put('_last_cron_task', taskToRun);
      } catch {
        taskToRun = 'maintenance';
      }
    }

    if (taskToRun === 'maintenance') {
      try {
        await runScheduledMaintenance(env);
      } catch (err) {
        console.error('Scheduled cron maintenance error:', err);
      }
    } else {
      try {
        await refreshChannelsBatch(env);
      } catch (err) {
        console.error('Scheduled cron refresh error:', err);
      }
    }

    if (env.TELEMETRY_DO) {
      try {
        const id = env.TELEMETRY_DO.idFromName('telemetry-v1');
        const stub = env.TELEMETRY_DO.get(id);
        await stub.fetch('https://do/sweep_pending', { method: 'POST' });
      } catch (err) {
        console.error('Telemetry sweep failed:', err);
      }
    }
  },
};
