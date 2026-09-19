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
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key, Authorization',
};

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
 * Processes a batch of 12 channels from channels_seed.json:
 * - Reads cursor from KV (_rss_refresh_cursor)
 * - Fetches live RSS for 12 channels only (safely under the 50 subrequests limit)
 * - Merges with archived videos in KV
 * - Deduplicates by videoId, sorts by publishedAt descending, caps at 200 videos
 * - Updates each channel in place in the full list stored at _channels_latest_merged
 * - Updates cursor for the next 40 (circular wrap-around)
 */
export async function refreshChannelsBatch(env: Env): Promise<{
  updatedCount: number;
  cursorBefore: number;
  cursorAfter: number;
  updatedChannels: string[];
}> {
  const totalChannels = channelsSeed.length;
  const BATCH_SIZE = 12;

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
          headers: corsHeaders,
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

      try {
        const totalChannels = channelsSeed.length;
        const BATCH_SIZE = 3;

        let cursor = 0;
        if (env.CHANNELS_ARCHIVE) {
          try {
            const rawCursor = await env.CHANNELS_ARCHIVE.get('_backfill_all_cursor');
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

        // Select 3 channels from channelsSeed using cursor
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
              const apiError = new Error(`YouTube API error (${ytRes.status}) for ${sourceId}: ${errText}`) as Error & { status?: number };
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

        // Advance and save the cursor
        const cursorAfter = (cursorBefore + BATCH_SIZE) % totalChannels;
        if (env.CHANNELS_ARCHIVE) {
          try {
            await env.CHANNELS_ARCHIVE.put('_backfill_all_cursor', cursorAfter.toString());
          } catch (e) {
            console.error('Failed to save _backfill_all_cursor:', e);
          }
        }

        const wrappedAround = cursorAfter < cursorBefore;

        return new Response(
          JSON.stringify({
            processedChannels,
            failedChannels,
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
            error: err instanceof Error ? err.message : 'Error executing batch backfill',
          }),
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // 4. GET /api/channels-latest (Public merged channels endpoint - direct from KV only, no live RSS)
    if (url.pathname === '/api/channels-latest' && request.method === 'GET') {
      const noStoreHeaders = {
        ...corsHeaders,
        'Cache-Control': 'no-store, max-age=0',
      };
      if (env.CHANNELS_ARCHIVE) {
        try {
          const cachedMerged = await env.CHANNELS_ARCHIVE.get('_channels_latest_merged');
          if (cachedMerged) {
            return new Response(cachedMerged, {
              status: 200,
              headers: {
                ...noStoreHeaders,
                'Cache-Control': 'public, max-age=60',
              },
            });
          }
        } catch {
          // If error reading KV, fall through to empty array
        }
      }

      // If key doesn't exist or KV is empty, return empty array (not an error)
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: noStoreHeaders,
      });
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
          'Cache-Control': 'public, max-age=60',
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
          'Cache-Control': returnAll ? 'no-cache, no-store, must-revalidate' : 'public, max-age=60',
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
          'Cache-Control': 'public, max-age=30',
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
   * Cron Trigger handler: Runs periodically (e.g. every 15 minutes)
   * to refresh the next batch of 40 channels safely under the 50 subrequests limit.
   */
  async scheduled(controller: any, env: Env, ctx?: any): Promise<void> {
    try {
      await refreshChannelsBatch(env);
    } catch (err) {
      console.error('Scheduled cron execution error:', err);
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
