import db, { FeedItem } from './db';
import { WORKER_URL } from './config';
import {
  fetchGlobalBlocks,
  isChannelBlocked,
  isPlaylistBlocked,
  type GlobalBlocks,
} from './services/globalBlocks';

export interface FilteringResult {
  totalBefore: number;
  totalAfterFilter: number;
  excludedCount: number;
  breakdown: {
    shortsExcluded: number;
    blacklistExcluded: number;
    portraitExcluded: number;
    hiddenExcluded: number;
    hasMusicCount: number;
    noMusicCount: number;
  };
}

export interface ChannelItem {
  sourceId: string;
  sourceType?: string;
  title?: string;
  videos?: Array<{
    videoId: string;
    title: string;
    publishedAt?: string;
  }>;
  [key: string]: any;
}

const PUT_CHUNK = 300;
/** Do not prune existing cache against a clearly partial incoming list. */
const PRUNE_SAFE_INCOMING = 50;
/** Keep only the newest N passing videos per channel in Dexie (kid feed never needs 200). */
const KEEP_PER_CHANNEL = 30;

let archiveSyncPromise: Promise<boolean> | null = null;

function videoRecencyMs(publishedAt: string | undefined, fetchedAt: number): number {
  if (publishedAt) {
    const parsed = Date.parse(String(publishedAt));
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fetchedAt || 0;
}

/**
 * Shorts detector: "#shorts" or the standalone token "shorts" / "شورتس".
 * Does NOT match titles that merely contain those letters (e.g. "short story").
 */
export function isLikelyShortsTitle(title: string): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  if (t.includes('#shorts') || t.includes('#short')) return true;
  if (title.includes('شورتس')) return true;
  return /(?:^|[^a-z0-9])shorts(?:$|[^a-z0-9])/i.test(title);
}

/**
 * Detects if a video is portrait/vertical by loading its thumbnail via a JS Image() object
 * and checking if naturalHeight > naturalWidth.
 *
 * Uses frame0.jpg (YouTube's un-letterboxed raw frame) with a fallback to hqdefault.jpg.
 * Wraps in a ~3s timeout and defaults to NOT excluding (fail-open: returns false) on error/timeout.
 */
export function checkIsPortraitVideo(videoId: string): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    let resolved = false;
    const finish = (isPortrait: boolean) => {
      if (!resolved) {
        resolved = true;
        resolve(isPortrait);
      }
    };

    // ~3s timeout: fail-open
    const timer = setTimeout(() => {
      finish(false);
    }, 3000);

    const img = new Image();
    img.onload = () => {
      clearTimeout(timer);
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        finish(img.naturalHeight > img.naturalWidth);
      } else {
        finish(false);
      }
    };

    img.onerror = () => {
      // If frame0.jpg fails or is missing, try fallback thumbnail
      const fallbackImg = new Image();
      fallbackImg.onload = () => {
        clearTimeout(timer);
        if (fallbackImg.naturalWidth > 0 && fallbackImg.naturalHeight > 0) {
          finish(fallbackImg.naturalHeight > fallbackImg.naturalWidth);
        } else {
          finish(false);
        }
      };
      fallbackImg.onerror = () => {
        clearTimeout(timer);
        finish(false);
      };
      fallbackImg.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    };

    img.src = `https://i.ytimg.com/vi/${videoId}/frame0.jpg`;
  });
}

let isProcessingPortraitQueue = false;

/**
 * Background queue to detect portrait/vertical videos without blocking initial feed load or archive sync.
 * Concurrency is capped at 4.
 * Updates FeedItem in Dexie with `isPortrait: boolean` metadata.
 */
export async function processBackgroundPortraitQueue(): Promise<void> {
  if (isProcessingPortraitQueue) return;
  if (typeof window === 'undefined') return;

  isProcessingPortraitQueue = true;
  let hasPendingNextBatch = false;

  try {
    // Find uninspected items in feedCache (isPortrait is undefined and not hidden)
    const uninspected = await db.feedCache
      .filter((item) => item.isPortrait === undefined && item.hidden !== true)
      .limit(60) // process in small non-blocking chunks
      .toArray();

    if (uninspected.length === 0) {
      return;
    }

    const CONCURRENCY = 4;
    let idx = 0;

    const worker = async () => {
      while (idx < uninspected.length) {
        const item = uninspected[idx++];
        if (!item) break;
        try {
          const isPortrait = await checkIsPortraitVideo(item.videoId);
          await db.feedCache.update(item.videoId, { isPortrait });
        } catch {
          await db.feedCache.update(item.videoId, { isPortrait: false });
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, uninspected.length) },
      () => worker()
    );
    await Promise.all(workers);

    // If there are more items to check, schedule next batch after short delay during idle time
    const remainingCount = await db.feedCache
      .filter((item) => item.isPortrait === undefined && item.hidden !== true)
      .count();

    if (remainingCount > 0) {
      hasPendingNextBatch = true;
      setTimeout(() => {
        isProcessingPortraitQueue = false;
        void processBackgroundPortraitQueue();
      }, 1500);
      return;
    }
  } catch (err) {
    console.warn('Background portrait queue error:', err);
  } finally {
    if (!hasPendingNextBatch) {
      isProcessingPortraitQueue = false;
    }
  }
}

/**
 * Schedule background portrait queue with requestIdleCallback or setTimeout
 */
export function scheduleBackgroundPortraitCheck(): void {
  if (typeof window === 'undefined') return;
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(
      () => {
        void processBackgroundPortraitQueue();
      },
      { timeout: 5000 }
    );
  } else {
    setTimeout(() => {
      void processBackgroundPortraitQueue();
    }, 1500);
  }
}

/**
 * Fetch the Worker KV archive once per successful session and write filtered rows into Dexie.
 * Empty KV (`[]`) and network failures do NOT lock the session — callers can retry.
 */
export async function ensureChannelsArchiveSynced(): Promise<boolean> {
  if (archiveSyncPromise) return archiveSyncPromise;

  archiveSyncPromise = (async () => {
    try {
      let response: Response;
      try {
        response = await fetch(`${WORKER_URL}/api/channels-latest`);
      } catch {
        response = await fetch('/api/channels-latest');
      }
      if (!response.ok) {
        archiveSyncPromise = null;
        return false;
      }
      const [data, blocks] = await Promise.all([
        response.json(),
        fetchGlobalBlocks(),
      ]);
      // Empty array means KV is not populated yet — not a success. Allow retry.
      if (!Array.isArray(data) || data.length === 0) {
        archiveSyncPromise = null;
        return false;
      }
      await filterAndCacheVideos(data, blocks);
      return true;
    } catch (err) {
      console.warn('ensureChannelsArchiveSynced failed:', err);
      archiveSyncPromise = null;
      return false;
    }
  })();

  return archiveSyncPromise;
}

/**
 * All client-side filtering logic:
 * Sensitive family data (blacklist words) never leaves the browser.
 */
export async function filterAndCacheVideos(
  channels: ChannelItem[],
  blocks?: GlobalBlocks
): Promise<FilteringResult> {
  const globalBlocks = blocks || (await fetchGlobalBlocks());
  const blockedChannels = new Set(globalBlocks.channelIds);
  const blockedPlaylists = new Set(globalBlocks.playlistIds);

  const isBlocked = (sourceId: string, sourceType?: string) => {
    const id = (sourceId || '').trim();
    if (!id) return false;
    const isPlaylist = sourceType === 'playlist' || id.startsWith('PL');
    if (isPlaylist) {
      return blockedPlaylists.has(id);
    }
    return blockedChannels.has(id);
  };

  // Read blacklist words from Dexie settings ('main')
  const settings = await db.settings.get('main');
  const blacklistWords = (settings?.blacklistWords || [])
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 0);

  // 1. Collect all incoming videoIds and unique channelIds from channels (excluding blocked)
  const incomingVideoIds: string[] = [];
  const uniqueChannelIdsSet = new Set<string>();
  for (const channel of channels) {
    if (!channel) continue;
    const cid = (channel.sourceId || '').trim();
    if (!cid) continue;
    if (isBlocked(cid, channel.sourceType)) continue;

    uniqueChannelIdsSet.add(cid);
    if (Array.isArray(channel.videos)) {
      for (const video of channel.videos) {
        if (video?.videoId) {
          incomingVideoIds.push(video.videoId);
        }
      }
    }
  }

  // 2. Fetch existing rows for incoming videoIds via anyOf in chunks of 100
  const existingMap = new Map<string, FeedItem>();
  const CHUNK_SIZE = 100;
  for (let i = 0; i < incomingVideoIds.length; i += CHUNK_SIZE) {
    const chunk = incomingVideoIds.slice(i, i + CHUNK_SIZE);
    if (chunk.length === 0) continue;
    try {
      const rows = await db.feedCache.where('videoId').anyOf(chunk).toArray();
      for (const r of rows) {
        existingMap.set(r.videoId, r);
      }
    } catch (e) {
      console.warn('Failed to load existing feedCache chunk:', e);
    }
  }

  // 3. Bulk load existing rows for all channelIds in this sync via anyOf in chunks of 100
  const channelIdsArray = Array.from(uniqueChannelIdsSet);
  const existingForChannelMap = new Map<string, FeedItem[]>();
  for (let i = 0; i < channelIdsArray.length; i += CHUNK_SIZE) {
    const chunk = channelIdsArray.slice(i, i + CHUNK_SIZE);
    if (chunk.length === 0) continue;
    try {
      const rows = await db.feedCache.where('channelId').anyOf(chunk).toArray();
      for (const r of rows) {
        let list = existingForChannelMap.get(r.channelId);
        if (!list) {
          list = [];
          existingForChannelMap.set(r.channelId, list);
        }
        list.push(r);
      }
    } catch (e) {
      console.warn('Failed to load existing channelId chunk:', e);
    }
  }

  // 4. Build hiddenIds from existingMap and existingForChannelMap
  const hiddenIds = new Set<string>();
  for (const [vid, item] of existingMap) {
    if (item.hidden === true) hiddenIds.add(vid);
  }
  for (const [, list] of existingForChannelMap) {
    for (const item of list) {
      if (item.hidden === true) hiddenIds.add(item.videoId);
      if (!existingMap.has(item.videoId)) {
        existingMap.set(item.videoId, item);
      }
    }
  }

  let totalBefore = 0;
  let shortsExcluded = 0;
  let blacklistExcluded = 0;
  let portraitExcluded = 0;
  let hiddenExcluded = 0;
  let hasMusicCount = 0;
  let noMusicCount = 0;

  const passedFeedItems: FeedItem[] = [];
  const allStaleIdsToDelete: string[] = [];
  const now = Date.now();

  for (const channel of channels) {
    if (!channel || !Array.isArray(channel.videos) || channel.videos.length === 0) continue;

    const channelId = (channel.sourceId || '').trim();
    if (!channelId) continue;
    if (isBlocked(channelId, channel.sourceType)) continue;

    // Use in-memory per-channel existing items loaded during bulk step
    const existingForChannel = existingForChannelMap.get(channelId) || [];

    const channelPassedItems: FeedItem[] = [];

    for (const video of channel.videos) {
      if (!video || !video.videoId || !video.title) continue;

      totalBefore++;
      const titleLower = video.title.toLowerCase();

      // 0. Manual Hidden check
      if (hiddenIds.has(video.videoId)) {
        hiddenExcluded++;
        continue;
      }

      // 1. Shorts heuristic: token / hashtag only (not "short story")
      if (isLikelyShortsTitle(video.title)) {
        shortsExcluded++;
        continue;
      }

      // 2. Blacklist: if title contains any word from settings.blacklistWords -> exclude
      const isBlacklisted = blacklistWords.some((word) => titleLower.includes(word));
      if (isBlacklisted) {
        blacklistExcluded++;
        continue;
      }

      // 3. hasMusic heuristic
      const hasNoMusicPhrase =
        titleLower.includes('no music') || titleLower.includes('بدون موسيقى');
      const hasMusic = !hasNoMusicPhrase;

      if (hasMusic) {
        hasMusicCount++;
      } else {
        noMusicCount++;
      }

      const existingItem = existingMap.get(video.videoId);
      const feedItem: FeedItem = {
        videoId: video.videoId,
        channelId,
        title: video.title,
        hasMusic,
        fetchedAt: now,
        publishedAt: video.publishedAt,
        hidden: false,
        isPortrait: existingItem?.isPortrait,
        viewCount: existingItem?.viewCount,
        viewCountFetchedAt: existingItem?.viewCountFetchedAt,
      };

      channelPassedItems.push(feedItem);
    }

    // Keep only the newest N for this channel so Dexie never holds 200 rows/channel
    channelPassedItems.sort(
      (a, b) =>
        videoRecencyMs(b.publishedAt, b.fetchedAt) - videoRecencyMs(a.publishedAt, a.fetchedAt)
    );
    const kept = channelPassedItems.slice(0, KEEP_PER_CHANNEL);
    passedFeedItems.push(...kept);

    // Reconcile feedCache for this channel using existingForChannel
    const incomingCount = channel.videos.length;
    const existingCount = existingForChannel.length;
    const keptIds = new Set(kept.map((item) => item.videoId));
    const shouldPrune =
      incomingCount >= existingCount ||
      incomingCount >= PRUNE_SAFE_INCOMING ||
      existingCount > KEEP_PER_CHANNEL;

    if (shouldPrune) {
      for (const item of existingForChannel) {
        if (item.hidden === true) continue;
        if (!keptIds.has(item.videoId)) {
          allStaleIdsToDelete.push(item.videoId);
        }
      }
    }
  }

  // 5. Single bulk delete for all stale IDs across all channels
  if (allStaleIdsToDelete.length > 0) {
    for (let i = 0; i < allStaleIdsToDelete.length; i += PUT_CHUNK) {
      await db.feedCache.bulkDelete(allStaleIdsToDelete.slice(i, i + PUT_CHUNK));
    }
  }

  // 6. Store passed videos in Dexie feedCache (chunked to keep the UI thread breathing)
  if (passedFeedItems.length > 0) {
    for (let i = 0; i < passedFeedItems.length; i += PUT_CHUNK) {
      await db.feedCache.bulkPut(passedFeedItems.slice(i, i + PUT_CHUNK));
    }
  }

  const totalAfterFilter = passedFeedItems.length;
  const excludedCount = totalBefore - totalAfterFilter;

  return {
    totalBefore,
    totalAfterFilter,
    excludedCount,
    breakdown: {
      shortsExcluded,
      blacklistExcluded,
      portraitExcluded,
      hiddenExcluded,
      hasMusicCount,
      noMusicCount,
    },
  };
}

let hasRunPortraitMigration = false;

/**
 * One-shot migration to unhide videos previously marked hidden by old portrait queue logic.
 * Only unhides items where isPortrait === true AND hidden === true.
 */
export async function migrateUnhidePortraitVideos(): Promise<void> {
  if (hasRunPortraitMigration) return;
  if (typeof window !== 'undefined' && localStorage.getItem('yt_unhide_portrait_v1') === 'true') {
    hasRunPortraitMigration = true;
    return;
  }
  hasRunPortraitMigration = true;

  try {
    const rows = await db.feedCache
      .filter((v) => v.isPortrait === true && v.hidden === true)
      .toArray();

    if (rows.length > 0) {
      const updates = rows.map((r) => db.feedCache.update(r.videoId, { hidden: false }));
      await Promise.all(updates);
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('yt_unhide_portrait_v1', 'true');
    }
  } catch (err) {
    console.warn('Failed portrait unhide migration:', err);
  }
}

/**
 * Direct query against db.feedCache to count videos where hasMusic is true.
 */
export async function getVideosWithMusicCount(): Promise<number> {
  return await db.feedCache.filter((item) => item.hasMusic === true).count();
}

/**
 * Query total cached feed items in db.feedCache.
 */
export async function getTotalCachedVideosCount(): Promise<number> {
  return await db.feedCache.count();
}

export interface SingleChannelRssResult {
  success: boolean;
  count: number;
  error?: string;
  result?: FilteringResult;
}

/**
 * Fetch videos from worker RSS proxy for a single channel or playlist,
 * filter them against user settings/blacklist/Shorts/music, and write directly into feedCache.
 */
export async function syncSingleChannelRss(
  sourceType: 'channel' | 'playlist',
  sourceId: string,
  title?: string
): Promise<SingleChannelRssResult> {
  try {
    const globalBlocks = await fetchGlobalBlocks();
    const id = (sourceId || '').trim();
    const isPlaylist = sourceType === 'playlist' || id.startsWith('PL');
    if (isPlaylist ? isPlaylistBlocked(id, globalBlocks) : isChannelBlocked(id, globalBlocks)) {
      return {
        success: false,
        count: 0,
        error: 'هذه القناة أو القائمة محظورة إدارياً',
      };
    }

    const url = `${WORKER_URL}/api/rss?type=${sourceType || 'channel'}&id=${encodeURIComponent(sourceId)}`;
    const res = await fetch(url);
    if (!res.ok) {
      return {
        success: false,
        count: 0,
        error: `HTTP ${res.status}: تعذر جلب خلاصة RSS للقناة`,
      };
    }

    const data = await res.json();
    if (data && typeof data === 'object' && !Array.isArray(data) && data.error) {
      return {
        success: false,
        count: 0,
        error: String(data.error),
      };
    }

    if (!Array.isArray(data)) {
      return {
        success: false,
        count: 0,
        error: 'تنسيق استجابة غير صالح من RSS',
      };
    }

    const channelItem: ChannelItem = {
      sourceId,
      sourceType,
      title: title || 'قناة أطفال مخصصة',
      videos: data
        .map((v: any) => ({
          videoId: String(v.videoId || ''),
          title: String(v.title || ''),
          publishedAt: v.publishedAt ? String(v.publishedAt) : undefined,
        }))
        .filter((v: any) => v.videoId && v.title),
    };

    const filterResult = await filterAndCacheVideos([channelItem]);

    return {
      success: true,
      count: filterResult.totalAfterFilter,
      result: filterResult,
    };
  } catch (err: any) {
    console.error('syncSingleChannelRss failed:', err);
    return {
      success: false,
      count: 0,
      error: err?.message || 'خطأ في الاتصال أثناء جلب RSS',
    };
  }
}
