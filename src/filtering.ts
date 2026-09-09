import db, { FeedItem } from './db';

export interface FilteringResult {
  totalBefore: number;
  totalAfterFilter: number;
  excludedCount: number;
  breakdown: {
    shortsExcluded: number;
    blacklistExcluded: number;
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

  let totalBefore = 0;
  let shortsExcluded = 0;
  let blacklistExcluded = 0;
  let hasMusicCount = 0;
  let noMusicCount = 0;

  const passedFeedItems: FeedItem[] = [];

  for (const channel of channels) {
    if (!channel || !Array.isArray(channel.videos)) continue;

    const channelId = channel.sourceId || '';

    for (const video of channel.videos) {
      if (!video || !video.videoId || !video.title) continue;

      totalBefore++;
      const titleLower = video.title.toLowerCase();

      // 1. Shorts heuristic: if title contains "#shorts" or "shorts" (case-insensitive) -> exclude
      if (titleLower.includes('#shorts') || titleLower.includes('shorts')) {
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

      if (hasMusic) {
        hasMusicCount++;
      } else {
        noMusicCount++;
      }

      passedFeedItems.push({
        videoId: video.videoId,
        channelId,
        title: video.title,
        hasMusic,
        fetchedAt: Date.now(),
        hidden: false,
      });
    }
  }

  // Store passed videos in Dexie feedCache
  if (passedFeedItems.length > 0) {
    await db.feedCache.bulkPut(passedFeedItems);
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
