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
        const videos = parseYouTubeRss(xmlText);

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

        // Store all videos in env.CHANNELS_ARCHIVE under key sourceId
        if (env.CHANNELS_ARCHIVE) {
          await env.CHANNELS_ARCHIVE.put(sourceId, JSON.stringify(allVideos));
          // Invalidate merged channels cache so channels-latest reflects fresh archive
          await env.CHANNELS_ARCHIVE.delete('_channels_latest_merged').catch(() => {});
        }

        return new Response(
          JSON.stringify({
            success: true,
            count: allVideos.length,
            sourceId,
            sourceType,
            playlistId,
            message: `تم حفظ ${allVideos.length} فيديو في الأرشيف بنجاح.`,
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

    // 4. GET /api/channels-latest (Public merged channels endpoint)
    if (url.pathname === '/api/channels-latest' && request.method === 'GET') {
      // Check merged cache first for sub-millisecond response
      if (env.CHANNELS_ARCHIVE) {
        const cachedMerged = await env.CHANNELS_ARCHIVE.get('_channels_latest_merged');
        if (cachedMerged) {
          return new Response(cachedMerged, {
            status: 200,
            headers: corsHeaders,
          });
        }
      }

      // Merge seed channels + archived videos in env.CHANNELS_ARCHIVE
      const mergedChannels = await Promise.all(
        channelsSeed.map(async (channel: any) => {
          let videos: VideoItem[] = [];
          if (env.CHANNELS_ARCHIVE) {
            try {
              const raw = await env.CHANNELS_ARCHIVE.get(channel.sourceId);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                  // Sort newest first
                  parsed.sort(
                    (a, b) =>
                      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
                  );
                  // Cap at 200 videos
                  videos = parsed.slice(0, 200);
                }
              }
            } catch {
              // Ignore individual KV read errors
            }
          }

          return {
            ...channel,
            videos,
            videoCount: videos.length,
          };
        })
      );

      const responseBody = JSON.stringify(mergedChannels);

      // Cache merged result for 10 minutes in KV
      if (env.CHANNELS_ARCHIVE) {
        env.CHANNELS_ARCHIVE.put('_channels_latest_merged', responseBody, {
          expirationTtl: 600,
        }).catch(() => {});
      }

      return new Response(responseBody, {
        status: 200,
        headers: corsHeaders,
      });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};
