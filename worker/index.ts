import channelsSeed from '../channels_seed.json';
 
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

export interface Env {
  CHANNELS_ARCHIVE?: KVNamespace;
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

      const finalVideos = deduped.slice(0, 200);

      // Save updated channel archive back to KV under channel.sourceId
      if (finalVideos.length > 0) {
        await env.CHANNELS_ARCHIVE!.put(channel.sourceId, JSON.stringify(finalVideos)).catch(() => {});
      }

      return {
        channel,
        videos: finalVideos,
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

    // 3. POST /api/admin/backfill-channel (Protected with X-Admin-Key)
    if (url.pathname === '/api/admin/backfill-channel' && request.method === 'POST') {
      const adminKeyHeader =
        request.headers.get('X-Admin-Key') || request.headers.get('x-admin-key') || '';

      if (!env.ADMIN_KEY || adminKeyHeader !== env.ADMIN_KEY) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid or missing X-Admin-Key' }),
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
              videos: allVideos.slice(0, 200),
              videoCount: Math.min(allVideos.length, 200),
            };

            // If the channel exists in the seed, merge its metadata (title, thumbnail, categories, etc.)
            const seedChannel = channelsSeed.find((ch: any) => ch.sourceId === sourceId);
            if (seedChannel) {
              Object.assign(updatedChannel, seedChannel, {
                videos: allVideos.slice(0, 200),
                videoCount: Math.min(allVideos.length, 200),
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

    // 5. POST/GET /api/admin/trigger-refresh (Manual trigger for testing the cron batch)
    if (
      url.pathname === '/api/admin/trigger-refresh' &&
      (request.method === 'POST' || request.method === 'GET')
    ) {
      const adminKeyHeader =
        request.headers.get('X-Admin-Key') ||
        request.headers.get('x-admin-key') ||
        url.searchParams.get('key') ||
        '';
      if (env.ADMIN_KEY && adminKeyHeader !== env.ADMIN_KEY) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid or missing X-Admin-Key' }),
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
  },
};
