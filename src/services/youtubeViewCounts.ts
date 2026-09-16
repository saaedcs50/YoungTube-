import db, { FeedItem } from '../db';
import { WORKER_URL } from '../config';

const MAX_BATCH_SIZE = 50;
const CACHE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

export interface ViewCountResult {
  [videoId: string]: number;
}

/**
 * Formats a raw view count number into an elegant Arabic / compact view count string.
 * Returns null if view count is undefined, null, or invalid (no "0" placeholder for missing data).
 * Examples:
 *   1234 -> "1.2 ألف مشاهدة"
 *   3450000 -> "3.5 مليون مشاهدة"
 *   1200000000 -> "1.2 مليار مشاهدة"
 *   850 -> "850 مشاهدة"
 */
export function formatViewCount(count?: number): string | null {
  if (count === undefined || count === null || isNaN(count) || count < 0) {
    return null;
  }

  if (count >= 1_000_000_000) {
    const formatted = (count / 1_000_000_000).toFixed(1).replace(/\.0$/, '');
    return `${formatted} مليار مشاهدة`;
  }
  if (count >= 1_000_000) {
    const formatted = (count / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${formatted} مليون مشاهدة`;
  }
  if (count >= 1_000) {
    const formatted = (count / 1_000).toFixed(1).replace(/\.0$/, '');
    return `${formatted} ألف مشاهدة`;
  }
  return `${count} مشاهدة`;
}

/**
 * Fetches view counts for a batch of video IDs (up to 50) using worker proxy ONLY.
 * If worker fails or returns empty, returns {} without inventing numbers.
 */
async function fetchBatchViewCounts(videoIds: string[]): Promise<ViewCountResult> {
  if (videoIds.length === 0) return {};

  const idParam = videoIds.slice(0, MAX_BATCH_SIZE).join(',');

  try {
    const proxyBase = WORKER_URL || '';
    const proxyUrl = `${proxyBase}/api/videos-views?ids=${encodeURIComponent(idParam)}`;
    const proxyRes = await fetch(proxyUrl);
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (
        data &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        !('error' in data) &&
        Object.keys(data).length > 0
      ) {
        return data as ViewCountResult;
      }
    }
  } catch (err) {
    // Fail soft without breaking any UI
    console.debug('Failed to fetch YouTube view counts batch via worker proxy:', err);
  }

  return {};
}

// In-flight fetch lock to prevent redundant duplicate network calls
let isEnrichingViews = false;

/**
 * Enriches a list of FeedItem items with fresh view counts in the background.
 * - Non-blocking: intended to run after feed first paint
 * - Filters for videoIds missing viewCount or older than 48h TTL
 * - Batches requests up to 50 IDs per request
 * - Updates Dexie feedCache
 * - Calls onUpdated callback with updated view counts
 */
export async function enrichFeedItemViewCounts(
  videos: FeedItem[],
  onUpdated?: (updatedCounts: ViewCountResult) => void
): Promise<void> {
  if (isEnrichingViews || !videos || videos.length === 0) {
    return;
  }

  const now = Date.now();
  // Filter for videos that need view count fetching (missing or expired)
  const neededVideoIds = videos
    .filter(
      (v) =>
        v.videoId &&
        (v.viewCount === undefined ||
          v.viewCount === null ||
          !v.viewCountFetchedAt ||
          now - v.viewCountFetchedAt > CACHE_TTL_MS)
    )
    .map((v) => v.videoId);

  if (neededVideoIds.length === 0) {
    return;
  }

  isEnrichingViews = true;

  try {
    // Process in chunks of max 50 IDs
    const chunks: string[][] = [];
    for (let i = 0; i < neededVideoIds.length; i += MAX_BATCH_SIZE) {
      chunks.push(neededVideoIds.slice(i, i + MAX_BATCH_SIZE));
    }

    const allUpdated: ViewCountResult = {};

    for (const chunk of chunks) {
      const batchResult = await fetchBatchViewCounts(chunk);
      const batchEntries = Object.entries(batchResult);

      if (batchEntries.length > 0) {
        // Update Dexie in a transaction
        await db.transaction('rw', db.feedCache, async () => {
          for (const [vId, views] of batchEntries) {
            const existing = await db.feedCache.get(vId);
            if (existing) {
              await db.feedCache.update(vId, {
                viewCount: views,
                viewCountFetchedAt: Date.now(),
              });
            }
            allUpdated[vId] = views;
          }
        });

        // Notify callback incrementally
        if (onUpdated && Object.keys(allUpdated).length > 0) {
          onUpdated(allUpdated);
        }
      }

      // 200ms throttle between batches to respect YouTube API quota
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } catch (err) {
    console.debug('Error in enrichFeedItemViewCounts:', err);
  } finally {
    isEnrichingViews = false;
  }
}
