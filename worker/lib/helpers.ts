import channelsSeed from '../../channels_seed.json';
import {
  CHANNELS_LATEST_MERGED,
  RSS_REFRESH_CURSOR,
  MAINTENANCE_CURSOR,
  MAINTENANCE_LOCK,
  MAINTENANCE_STATUS,
  BACKFILL_ALL_CURSOR,
  GLOBAL_BLOCKS,
  TELEMETRY_INDEX,
  channelArchiveKey,
  telemetryDailyKey,
  telemetryUniquesKey,
  telemetryFunnelDailyKey,
  telemetryFunnelUniquesKey,
} from './kv-keys';
import {
  Env,
  VideoItem,
  MaintenanceLock,
  MaintenanceStatus,
  BackfillBatchResult,
  TelemetryDaily,
  TelemetryFunnelDaily,
  FunnelEvent,
} from './types';

/**
 * Helper to update a single channel's entry in _channels_latest_merged
 */
export async function updateMergedListForChannel(
  env: Env,
  sourceId: string,
  updatedVideos: VideoItem[]
): Promise<void> {
  if (!env.CHANNELS_ARCHIVE) return;

  try {
    const rawMerged = await env.CHANNELS_ARCHIVE.get(CHANNELS_LATEST_MERGED);
    let mergedList: any[] = [];
    if (rawMerged) {
      try {
        mergedList = JSON.parse(rawMerged);
      } catch {}
    }

    if (!Array.isArray(mergedList) || mergedList.length === 0) {
      mergedList = (channelsSeed as any[]).map((ch) => ({ ...ch, videos: [], videoCount: 0 }));
    }

    const cap300 = updatedVideos.slice(0, 300);
    const idx = mergedList.findIndex((ch: any) => ch.sourceId === sourceId);

    if (idx >= 0) {
      mergedList[idx] = {
        ...mergedList[idx],
        videos: cap300,
        videoCount: updatedVideos.length,
        lastUpdated: new Date().toISOString(),
      };
    } else {
      const seedMatch = (channelsSeed as any[]).find((ch) => ch.sourceId === sourceId);
      mergedList.push({
        sourceId,
        name: seedMatch?.name || sourceId,
        category: seedMatch?.category || 'uncategorized',
        avatar: seedMatch?.avatar || '',
        videos: cap300,
        videoCount: updatedVideos.length,
        lastUpdated: new Date().toISOString(),
      });
    }

    await env.CHANNELS_ARCHIVE.put(CHANNELS_LATEST_MERGED, JSON.stringify(mergedList));
  } catch (err) {
    console.error(`Failed to update _channels_latest_merged for channel ${sourceId}:`, err);
  }
}

/**
 * Helper function to merge new videos into a channel's archive without deleting existing videos
 */
export async function mergeAndStoreKVArchive(
  env: Env,
  sourceId: string,
  newVideos: VideoItem[]
): Promise<{ success: boolean; newCount: number; error?: string }> {
  if (!env.CHANNELS_ARCHIVE) {
    return { success: false, newCount: 0, error: 'CHANNELS_ARCHIVE KV is not configured' };
  }

  try {
    const kvKey = channelArchiveKey(sourceId);
    const existingRaw = await env.CHANNELS_ARCHIVE.get(kvKey);
    let existingVideos: VideoItem[] = [];

    if (existingRaw) {
      try {
        const parsed = JSON.parse(existingRaw);
        if (Array.isArray(parsed)) {
          existingVideos = parsed;
        }
      } catch {}
    }

    const videoMap = new Map<string, VideoItem>();
    for (const v of existingVideos) {
      if (v && v.videoId) videoMap.set(v.videoId, v);
    }
    for (const v of newVideos) {
      if (v && v.videoId) {
        const existing = videoMap.get(v.videoId);
        videoMap.set(v.videoId, { ...existing, ...v });
      }
    }

    const mergedVideos = Array.from(videoMap.values()).sort((a, b) => {
      const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return timeB - timeA;
    });

    await env.CHANNELS_ARCHIVE.put(kvKey, JSON.stringify(mergedVideos));
    await updateMergedListForChannel(env, sourceId, mergedVideos);

    return { success: true, newCount: mergedVideos.length };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return { success: false, newCount: 0, error: errMsg };
  }
}

/**
 * Helper to parse ISO 8601 duration (e.g., PT15M33S -> seconds)
 */
export function parseIsoDuration(durationStr: string): number {
  if (!durationStr) return 0;
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Helper to fetch image headers/bytes and parse JPEG width and height
 */
export async function getJpegDimensions(url: string): Promise<{ width: number; height: number } | null> {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-2048' } });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);

    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

    let offset = 2;
    while (offset < bytes.length - 8) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];

      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        return { width, height };
      }

      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      offset += 2 + length;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Helper function for UTC today date ISO string YYYY-MM-DD
 */
export function getTodayDateUtc(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Helper to parse YouTube RSS feed XML text
 */
export function parseYouTubeRss(xmlText: string): VideoItem[] {
  const entries: VideoItem[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(xmlText)) !== null) {
    const entryContent = match[1];

    const videoIdMatch =
      /<yt:videoId>(.*?)<\/yt:videoId>/.exec(entryContent) ||
      /<id>yt:video:(.*?)<\/id>/.exec(entryContent);
    const videoId = videoIdMatch ? videoIdMatch[1].trim() : '';

    const titleMatch = /<title>(.*?)<\/title>/.exec(entryContent);
    let title = titleMatch ? titleMatch[1].trim() : '';
    title = title
      .replace(/<!\[CDATA\[/g, '')
      .replace(/\]\]>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    const publishedMatch = /<published>(.*?)<\/published>/.exec(entryContent);
    const publishedAt = publishedMatch ? publishedMatch[1].trim() : '';

    if (
      videoId &&
      title &&
      title !== 'Private video' &&
      title !== 'Deleted video' &&
      !title.toLowerCase().includes('private video')
    ) {
      entries.push({ videoId, title, publishedAt });
    }
  }

  return entries;
}

/**
 * Helper to fetch YouTube RSS feed for a single channel
 */
export async function fetchYouTubeRss(sourceId: string): Promise<VideoItem[]> {
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${sourceId}`;
  const response = await fetch(rssUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/xml, text/xml, */*',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching RSS for ${sourceId}`);
  }

  const xmlText = await response.text();
  return parseYouTubeRss(xmlText);
}

/**
 * Executes a batch refresh of YouTube channels via RSS (Cron / Triggered)
 * BATCH_SIZE = 40 channels per execution (respects Cloudflare Worker 50 subrequests limit)
 */
export async function refreshChannelsBatch(env: Env): Promise<{
  updatedCount: number;
  totalChannels: number;
  cursorBefore: number;
  cursorAfter: number;
  results: { sourceId: string; videoCount: number; status: 'ok' | 'error'; error?: string }[];
}> {
  if (!env.CHANNELS_ARCHIVE) {
    throw new Error('CHANNELS_ARCHIVE KV is not bound');
  }

  const allChannels = channelsSeed as any[];
  const totalChannels = allChannels.length;
  if (totalChannels === 0) {
    return { updatedCount: 0, totalChannels: 0, cursorBefore: 0, cursorAfter: 0, results: [] };
  }

  let cursor = 0;
  try {
    const rawCursor = await env.CHANNELS_ARCHIVE.get(RSS_REFRESH_CURSOR);
    if (rawCursor) {
      const parsed = parseInt(rawCursor, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        cursor = parsed % totalChannels;
      }
    }
  } catch {}

  const cursorBefore = cursor;
  const BATCH_SIZE = 40;
  const batchChannels = [];
  for (let i = 0; i < BATCH_SIZE; i++) {
    const idx = (cursorBefore + i) % totalChannels;
    batchChannels.push(allChannels[idx]);
  }

  const results: { sourceId: string; videoCount: number; status: 'ok' | 'error'; error?: string }[] = [];
  let updatedCount = 0;

  for (const channel of batchChannels) {
    try {
      const fetchedVideos = await fetchYouTubeRss(channel.sourceId);
      if (fetchedVideos.length > 0) {
        const storeRes = await mergeAndStoreKVArchive(env, channel.sourceId, fetchedVideos);
        if (storeRes.success) {
          updatedCount++;
          results.push({ sourceId: channel.sourceId, videoCount: storeRes.newCount, status: 'ok' });
        } else {
          results.push({ sourceId: channel.sourceId, videoCount: 0, status: 'error', error: storeRes.error });
        }
      } else {
        results.push({ sourceId: channel.sourceId, videoCount: 0, status: 'ok' });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      results.push({ sourceId: channel.sourceId, videoCount: 0, status: 'error', error: errMsg });
    }
  }

  const cursorAfter = (cursorBefore + BATCH_SIZE) % totalChannels;
  await env.CHANNELS_ARCHIVE.put(RSS_REFRESH_CURSOR, String(cursorAfter));

  return {
    updatedCount,
    totalChannels,
    cursorBefore,
    cursorAfter,
    results,
  };
}

/**
 * Checks if maintenance process is locked
 */
export async function checkMaintenanceLock(env: Env): Promise<MaintenanceLock | null> {
  if (!env.CHANNELS_ARCHIVE) return null;
  try {
    const raw = await env.CHANNELS_ARCHIVE.get(MAINTENANCE_LOCK);
    if (!raw) return null;
    const lock: MaintenanceLock = JSON.parse(raw);
    const now = new Date();
    const until = new Date(lock.until);
    if (now > until) {
      await env.CHANNELS_ARCHIVE.delete(MAINTENANCE_LOCK);
      return null;
    }
    return lock;
  } catch {
    return null;
  }
}

/**
 * Acquires a lock for maintenance
 */
export async function acquireMaintenanceLock(
  env: Env,
  lockedBy: 'scheduled' | 'manual_admin' | 'manual_admin_cleanup' | 'manual_admin_scan_cleanup' | string,
  durationMinutes = 10
): Promise<boolean> {
  if (!env.CHANNELS_ARCHIVE) return false;
  const existingLock = await checkMaintenanceLock(env);
  if (existingLock) return false;

  const now = new Date();
  const until = new Date(now.getTime() + durationMinutes * 60000);
  const lock: MaintenanceLock = {
    lockedBy,
    startedAt: now.toISOString(),
    until: until.toISOString(),
  };

  await env.CHANNELS_ARCHIVE.put(MAINTENANCE_LOCK, JSON.stringify(lock));
  return true;
}

/**
 * Releases the maintenance lock
 */
export async function releaseMaintenanceLock(env: Env): Promise<void> {
  if (!env.CHANNELS_ARCHIVE) return;
  try {
    await env.CHANNELS_ARCHIVE.delete(MAINTENANCE_LOCK);
  } catch {}
}

/**
 * Saves current maintenance status
 */
export async function saveMaintenanceStatus(env: Env, status: Partial<MaintenanceStatus>): Promise<void> {
  if (!env.CHANNELS_ARCHIVE) return;
  try {
    const raw = await env.CHANNELS_ARCHIVE.get(MAINTENANCE_STATUS);
    let current: MaintenanceStatus = {
      lastRunTime: null,
      cursor: 0,
      lastError: null,
      lastProcessed: [],
      lastFailed: [],
      isLocked: false,
      lockUntil: null,
      primaryTask: 'maintenance',
      batchSize: 2,
      totalChannels: (channelsSeed as any[]).length,
    };
    if (raw) {
      try {
        current = { ...current, ...JSON.parse(raw) };
      } catch {}
    }
    const updated = { ...current, ...status };
    await env.CHANNELS_ARCHIVE.put(MAINTENANCE_STATUS, JSON.stringify(updated));
  } catch {}
}

/**
 * Runs a single backfill batch over YouTube Data API v3
 */
export async function runBackfillAllBatch(
  env: Env,
  apiKey: string,
  resetCursor = false,
  customBatchSize = 2
): Promise<BackfillBatchResult> {
  if (!env.CHANNELS_ARCHIVE) {
    throw new Error('CHANNELS_ARCHIVE KV is not bound');
  }

  const allChannels = channelsSeed as any[];
  const totalChannels = allChannels.length;
  if (totalChannels === 0) {
    return {
      processedChannels: [],
      failedChannels: [],
      cursorBefore: 0,
      cursorAfter: 0,
      totalChannels: 0,
      wrappedAround: false,
    };
  }

  let cursor = 0;
  if (!resetCursor) {
    try {
      const rawCursor = await env.CHANNELS_ARCHIVE.get(BACKFILL_ALL_CURSOR);
      if (rawCursor) {
        const parsed = parseInt(rawCursor, 10);
        if (!isNaN(parsed) && parsed >= 0) {
          cursor = parsed % totalChannels;
        }
      }
    } catch {}
  }

  const cursorBefore = cursor;
  const batchSize = Math.max(1, Math.min(customBatchSize, 5));
  let wrappedAround = false;

  const targetChannels = [];
  for (let i = 0; i < batchSize; i++) {
    const targetIdx = (cursorBefore + i) % totalChannels;
    if (cursorBefore + i >= totalChannels) {
      wrappedAround = true;
    }
    targetChannels.push(allChannels[targetIdx]);
  }

  const processedChannels: { sourceId: string; title: string; videoCount: number }[] = [];
  const failedChannels: (
    | { sourceId: string; title: string; error: 'youtube_rate_limited'; status: number }
    | { sourceId: string; title: string; error: 'other'; message: string }
  )[] = [];

  for (const channel of targetChannels) {
    const sourceId = channel.sourceId;
    const title = channel.name || sourceId;

    try {
      const uploadsPlaylistId = sourceId.startsWith('UC') ? 'UU' + sourceId.slice(2) : sourceId;
      const allFetchedVideos: VideoItem[] = [];
      let pageToken: string | undefined = undefined;
      let pageCount = 0;
      const maxPages = 40; // up to 2000 videos
      let hitRateLimit = false;

      while (pageCount < maxPages) {
        const apiUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
        apiUrl.searchParams.set('part', 'snippet');
        apiUrl.searchParams.set('playlistId', uploadsPlaylistId);
        apiUrl.searchParams.set('maxResults', '50');
        if (pageToken) apiUrl.searchParams.set('pageToken', pageToken);
        apiUrl.searchParams.set('key', apiKey);

        const res = await fetch(apiUrl.toString());
        if (!res.ok) {
          if (res.status === 403 || res.status === 429) {
            hitRateLimit = true;
            failedChannels.push({
              sourceId,
              title,
              error: 'youtube_rate_limited',
              status: res.status,
            });
            break;
          }
          const errText = await res.text();
          failedChannels.push({
            sourceId,
            title,
            error: 'other',
            message: `YouTube API ${res.status}: ${errText}`,
          });
          break;
        }

        const data: any = await res.json();
        const items = data.items || [];
        for (const item of items) {
          const vId = item.snippet?.resourceId?.videoId;
          const vTitle = item.snippet?.title;
          const pubAt = item.snippet?.publishedAt;
          if (vId && vTitle && vTitle !== 'Private video' && vTitle !== 'Deleted video') {
            allFetchedVideos.push({
              videoId: vId,
              title: vTitle,
              publishedAt: pubAt || new Date().toISOString(),
            });
          }
        }

        pageToken = data.nextPageToken;
        pageCount++;
        if (!pageToken || items.length === 0) break;
      }

      if (hitRateLimit) {
        break;
      }

      if (allFetchedVideos.length > 0) {
        const storeRes = await mergeAndStoreKVArchive(env, sourceId, allFetchedVideos);
        if (storeRes.success) {
          processedChannels.push({
            sourceId,
            title,
            videoCount: storeRes.newCount,
          });
        } else {
          failedChannels.push({
            sourceId,
            title,
            error: 'other',
            message: storeRes.error || 'Failed to store in KV',
          });
        }
      } else {
        processedChannels.push({
          sourceId,
          title,
          videoCount: 0,
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      failedChannels.push({
        sourceId,
        title,
        error: 'other',
        message: errMsg,
      });
    }
  }

  const cursorAfter = (cursorBefore + batchSize) % totalChannels;
  await env.CHANNELS_ARCHIVE.put(BACKFILL_ALL_CURSOR, String(cursorAfter));

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
 * Server-Scheduled Maintenance Job: runs either background backfill or maintenance
 */
export async function runScheduledMaintenance(env: Env): Promise<void> {
  if (!env.CHANNELS_ARCHIVE) return;

  const locked = await acquireMaintenanceLock(env, 'scheduled', 10);
  if (!locked) {
    console.log('Scheduled maintenance skipped: process already locked');
    return;
  }

  try {
    const apiKey = env.YOUTUBE_API_KEY;
    if (!apiKey) {
      await saveMaintenanceStatus(env, {
        lastRunTime: new Date().toISOString(),
        lastError: 'YOUTUBE_API_KEY is not configured',
        isLocked: false,
      });
      return;
    }

    const res = await runBackfillAllBatch(env, apiKey, false, 2);

    await saveMaintenanceStatus(env, {
      lastRunTime: new Date().toISOString(),
      cursor: res.cursorAfter,
      lastError: res.failedChannels.length > 0 ? JSON.stringify(res.failedChannels) : null,
      lastProcessed: res.processedChannels,
      lastFailed: res.failedChannels,
      isLocked: false,
      lockUntil: null,
      totalChannels: res.totalChannels,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await saveMaintenanceStatus(env, {
      lastRunTime: new Date().toISOString(),
      lastError: errMsg,
      isLocked: false,
    });
  } finally {
    await releaseMaintenanceLock(env);
  }
}

/**
 * Telemetry recording helper
 */
export async function recordTelemetryEvent(
  env: Env,
  type: 'parent_start' | 'parent_end' | 'child_end',
  country: string,
  installId?: string,
  durationSec = 0
): Promise<void> {
  if (!env.CHANNELS_ARCHIVE) return;

  const today = getTodayDateUtc();
  const dailyKey = telemetryDailyKey(today);
  const uniquesKey = telemetryUniquesKey(today);

  let indexDates: string[] = [];
  try {
    const rawIndex = await env.CHANNELS_ARCHIVE.get(TELEMETRY_INDEX);
    if (rawIndex) {
      indexDates = JSON.parse(rawIndex);
    }
  } catch {}

  if (!indexDates.includes(today)) {
    indexDates.unshift(today);
    indexDates = indexDates.slice(0, 90);
    await env.CHANNELS_ARCHIVE.put(TELEMETRY_INDEX, JSON.stringify(indexDates));
  }

  let daily: TelemetryDaily = {
    date: today,
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

  if (type === 'parent_start') {
    daily.parentSessionsByCountry[country] = (daily.parentSessionsByCountry[country] || 0) + 1;
    daily.parentSessionsTotal = (daily.parentSessionsTotal || 0) + 1;
  } else if (type === 'parent_end') {
    daily.parentDurationSecByCountry[country] =
      (daily.parentDurationSecByCountry[country] || 0) + durationSec;
    daily.parentDurationSecTotal = (daily.parentDurationSecTotal || 0) + durationSec;
  } else if (type === 'child_end') {
    daily.childSessionsByCountry[country] = (daily.childSessionsByCountry[country] || 0) + 1;
    daily.childSessionsTotal = (daily.childSessionsTotal || 0) + 1;
    daily.childDurationSecByCountry[country] =
      (daily.childDurationSecByCountry[country] || 0) + durationSec;
    daily.childDurationSecTotal = (daily.childDurationSecTotal || 0) + durationSec;
  }

  if (installId) {
    let uniquesMap: Record<string, string[]> = {};
    try {
      const rawUniques = await env.CHANNELS_ARCHIVE.get(uniquesKey);
      if (rawUniques) {
        uniquesMap = JSON.parse(rawUniques);
      }
    } catch {}

    const countrySet = new Set(uniquesMap[country] || []);
    if (!countrySet.has(installId)) {
      countrySet.add(installId);
      uniquesMap[country] = Array.from(countrySet);
      await env.CHANNELS_ARCHIVE.put(uniquesKey, JSON.stringify(uniquesMap));

      const totalUniqueSet = new Set<string>();
      for (const list of Object.values(uniquesMap)) {
        for (const id of list) totalUniqueSet.add(id);
      }

      daily.uniqueByCountry[country] = countrySet.size;
      daily.uniqueInstallsTotal = totalUniqueSet.size;
    }
  }

  daily.updatedAt = Date.now();
  await env.CHANNELS_ARCHIVE.put(dailyKey, JSON.stringify(daily));
}

/**
 * Funnel telemetry recording helper
 */
export async function recordFunnelEvent(
  env: Env,
  event: FunnelEvent,
  country: string,
  installId?: string
): Promise<void> {
  if (!env.CHANNELS_ARCHIVE) return;

  const today = getTodayDateUtc();
  const dailyKey = telemetryFunnelDailyKey(today);
  const uniquesKey = telemetryFunnelUniquesKey(today);

  let indexDates: string[] = [];
  try {
    const rawIndex = await env.CHANNELS_ARCHIVE.get(TELEMETRY_INDEX);
    if (rawIndex) {
      indexDates = JSON.parse(rawIndex);
    }
  } catch {}

  if (!indexDates.includes(today)) {
    indexDates.unshift(today);
    indexDates = indexDates.slice(0, 90);
    await env.CHANNELS_ARCHIVE.put(TELEMETRY_INDEX, JSON.stringify(indexDates));
  }

  let daily: TelemetryFunnelDaily = {
    date: today,
    events: {},
    eventsByCountry: {},
    uniqueByEvent: {},
    updatedAt: Date.now(),
  };

  try {
    const rawDaily = await env.CHANNELS_ARCHIVE.get(dailyKey);
    if (rawDaily) {
      daily = { ...daily, ...JSON.parse(rawDaily) };
    }
  } catch {}

  daily.events[event] = (daily.events[event] || 0) + 1;
  if (!daily.eventsByCountry[country]) {
    daily.eventsByCountry[country] = {};
  }
  daily.eventsByCountry[country][event] = (daily.eventsByCountry[country][event] || 0) + 1;

  if (installId) {
    let uniquesMap: Record<string, string[]> = {};
    try {
      const rawUniques = await env.CHANNELS_ARCHIVE.get(uniquesKey);
      if (rawUniques) {
        uniquesMap = JSON.parse(rawUniques);
      }
    } catch {}

    const eventSet = new Set(uniquesMap[event] || []);
    if (!eventSet.has(installId)) {
      eventSet.add(installId);
      uniquesMap[event] = Array.from(eventSet);
      await env.CHANNELS_ARCHIVE.put(uniquesKey, JSON.stringify(uniquesMap));

      daily.uniqueByEvent[event] = eventSet.size;
    }
  }

  daily.updatedAt = Date.now();
  await env.CHANNELS_ARCHIVE.put(dailyKey, JSON.stringify(daily));
}
