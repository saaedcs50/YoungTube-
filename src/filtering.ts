import db, { FeedItem } from './db';
import { WORKER_URL } from './config';

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
      const data = await response.json();
      // Empty array means KV is not populated yet — not a success. Allow retry.
      if (!Array.isArray(data) || data.length === 0) {
        archiveSyncPromise = null;
        return false;
      }
      await filterAndCacheVideos(data);
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
export async function filterAndCacheVideos(channels: ChannelItem[]): Promise<FilteringResult> {
  // Read blacklist words from Dexie settings ('main')
  const settings = await db.settings.get('main');
  const blacklistWords = (settings?.blacklistWords || [])
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 0);

  // 1. Single query for all existing feedCache items to batch reconciliation in memory
  const allExisting = await db.feedCache.toArray();
  const hiddenIds = new Set(
    allExisting.filter((item) => item.hidden === true).map((item) => item.videoId)
  );

  // 2. Group allExisting by channelId in memory
  const existingByChannel = new Map<string, FeedItem[]>();
  for (const item of allExisting) {
    if (!item.channelId) continue;
    const list = existingByChannel.get(item.channelId);
    if (list) {
      list.push(item);
    } else {
      existingByChannel.set(item.channelId, [item]);
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

    const channelId = channel.sourceId || '';
    if (!channelId) continue;

    const preliminaryVideos: Array<{
      videoId: string;
      title: string;
      publishedAt?: string;
      hasMusic: boolean;
    }> = [];

    for (const video of channel.videos) {
      if (!video || !video.videoId || !video.title) continue;

      totalBefore++;
      const titleLower = video.title.toLowerCase();

      // 0. Manual Hidden check: if previously marked hidden by user -> exclude
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

      // 3. hasMusic heuristic:
      // if title contains "no music" or Arabic "بدون موسيقى" (case-insensitive) -> hasMusic: false, otherwise true
      const hasNoMusicPhrase =
        titleLower.includes('no music') || titleLower.includes('بدون موسيقى');
      const hasMusic = !hasNoMusicPhrase;

      preliminaryVideos.push({
        videoId: video.videoId,
        title: video.title,
        publishedAt: video.publishedAt,
        hasMusic,
      });
    }

    // 4. Portrait orientation check for preliminary passing videos:
    // Load thumbnail once per video, read naturalWidth/naturalHeight, exclude if height > width.
    const orientationChecks = await Promise.all(
      preliminaryVideos.map(async (v) => {
        const isPortrait = await checkIsPortraitVideo(v.videoId);
        return { ...v, isPortrait };
      })
    );

    const channelPassedItems: FeedItem[] = [];

    for (const item of orientationChecks) {
      if (item.isPortrait) {
        portraitExcluded++;
        continue;
      }

      if (item.hasMusic) {
        hasMusicCount++;
      } else {
        noMusicCount++;
      }

      const feedItem: FeedItem = {
        videoId: item.videoId,
        channelId,
        title: item.title,
        hasMusic: item.hasMusic,
        isPortrait: false,
        fetchedAt: now,
        publishedAt: item.publishedAt,
        hidden: false,
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

    // Reconcile feedCache for this channel in memory.
    // Skip prune when incoming list is a clearly partial RSS snapshot vs a larger local cache.
    const existingForChannel = existingByChannel.get(channelId) || [];
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

  // 3. Single bulk delete for all stale IDs across all channels
  if (allStaleIdsToDelete.length > 0) {
    for (let i = 0; i < allStaleIdsToDelete.length; i += PUT_CHUNK) {
      await db.feedCache.bulkDelete(allStaleIdsToDelete.slice(i, i + PUT_CHUNK));
    }
  }

  // 4. Store passed videos in Dexie feedCache (chunked to keep the UI thread breathing)
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
