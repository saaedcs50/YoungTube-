import channelsSeed from '../../channels_seed.json';
import { corsHeaders, resolveYouTubeApiKey, checkAdminAuth } from '../lib/cors';
import {
  CHANNELS_LATEST_MERGED,
  GLOBAL_BLOCKS,
  ANNOUNCEMENTS,
  CUSTOM_CATEGORIES,
  channelArchiveKey,
} from '../lib/kv-keys';
import { Env } from '../lib/types';

export async function handlePublicReadRoutes(
  request: Request,
  env: Env,
  url: URL
): Promise<Response | null> {
  // 1. Health check &Root endpoint: GET / or /api/health or /api/test-worker
  if (
    request.method === 'GET' &&
    (url.pathname === '/' || url.pathname === '/api/health' || url.pathname === '/api/test-worker')
  ) {
    return new Response(
      JSON.stringify({
        status: 'ok',
        service: 'youngtube-worker',
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  // 2. GET /api/rss?sourceId={channelId}
  if (url.pathname === '/api/rss' && request.method === 'GET') {
    const sourceId = url.searchParams.get('sourceId') || url.searchParams.get('id');
    if (!sourceId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter "sourceId"' }),
        { status: 400, headers: corsHeaders }
      );
    }

    try {
      const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${sourceId}`;
      const response = await fetch(rssUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/xml, text/xml, */*',
        },
      });

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: `Failed to fetch RSS from YouTube (${response.status})` }),
          { status: response.status >= 500 ? 502 : response.status, headers: corsHeaders }
        );
      }

      const xmlText = await response.text();
      return new Response(xmlText, {
        status: 200,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300, s-maxage=600',
        },
      });
    } catch {
      return new Response(
        JSON.stringify({ error: 'Failed to proxy RSS request' }),
        { status: 500, headers: corsHeaders }
      );
    }
  }

  // 3. GET /api/channels-latest
  if (url.pathname === '/api/channels-latest' && request.method === 'GET') {
    try {
      if (env.CHANNELS_ARCHIVE) {
        const rawMerged = await env.CHANNELS_ARCHIVE.get(CHANNELS_LATEST_MERGED);
        if (rawMerged) {
          return new Response(rawMerged, {
            status: 200,
            headers: {
              ...corsHeaders,
              'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=600',
            },
          });
        }
      }

      return new Response(JSON.stringify(channelsSeed), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Cache-Control': 'public, max-age=60',
        },
      });
    } catch {
      return new Response(JSON.stringify(channelsSeed), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Cache-Control': 'public, max-age=60',
        },
      });
    }
  }

  // 4. GET /api/channel-archive?sourceId={sourceId}
  if (url.pathname === '/api/channel-archive' && request.method === 'GET') {
    const sourceId = (url.searchParams.get('sourceId') || url.searchParams.get('id') || '').trim();
    if (!sourceId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter "sourceId"' }),
        { status: 400, headers: corsHeaders }
      );
    }

    try {
      if (env.CHANNELS_ARCHIVE) {
        const rawArchive = await env.CHANNELS_ARCHIVE.get(channelArchiveKey(sourceId));
        if (rawArchive) {
          const videos = JSON.parse(rawArchive);
          return new Response(
            JSON.stringify({
              sourceId,
              videos,
              count: videos.length,
            }),
            {
              status: 200,
              headers: {
                ...corsHeaders,
                'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=600',
              },
            }
          );
        }
      }

      return new Response(
        JSON.stringify({
          sourceId,
          videos: [],
          count: 0,
        }),
        { status: 200, headers: corsHeaders }
      );
    } catch {
      return new Response(
        JSON.stringify({ error: 'Failed to load channel archive' }),
        { status: 500, headers: corsHeaders }
      );
    }
  }

  // 4.2 GET /api/channel-videos-page?sourceId={sourceId}&page={page}&pageSize={pageSize}
  if (url.pathname === '/api/channel-videos-page' && request.method === 'GET') {
    const sourceId = (url.searchParams.get('sourceId') || url.searchParams.get('id') || '').trim();
    if (!sourceId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter "sourceId"' }),
        { status: 400, headers: corsHeaders }
      );
    }

    const pageParam = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSizeParam = parseInt(url.searchParams.get('pageSize') || '24', 10);

    const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
    const pageSize = isNaN(pageSizeParam) || pageSizeParam < 1 ? 24 : Math.min(pageSizeParam, 100);

    try {
      let videos: any[] = [];

      if (env.CHANNELS_ARCHIVE) {
        const rawArchive = await env.CHANNELS_ARCHIVE.get(channelArchiveKey(sourceId));
        if (rawArchive) {
          try {
            const parsed = JSON.parse(rawArchive);
            if (Array.isArray(parsed)) {
              videos = parsed;
            }
          } catch {}
        }
      }

      const totalVideos = videos.length;
      const totalPages = Math.ceil(totalVideos / pageSize) || 1;
      const startIndex = (page - 1) * pageSize;
      const pagedVideos = videos.slice(startIndex, startIndex + pageSize);

      return new Response(
        JSON.stringify({
          sourceId,
          page,
          pageSize,
          totalVideos,
          totalPages,
          videos: pagedVideos,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=600',
          },
        }
      );
    } catch {
      return new Response(
        JSON.stringify({ error: 'Failed to load channel videos page' }),
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

  // 4.5 GET /api/search-archive?q={query}
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
        sourceIds.map((sourceId) => env.CHANNELS_ARCHIVE!.get(channelArchiveKey(sourceId)))
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
          } catch {}
        }
      });

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

  // 4.6 GET /api/video-lookup?id={videoId}
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

  // 4.7 GET /api/playlist-lookup?id={playlistId}
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
      const maxPages = 4;

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

  // 6. GET /api/videos-views
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

  // 7. GET /api/global-blocks
  if (url.pathname === '/api/global-blocks' && request.method === 'GET') {
    let blocks: { channelIds: string[]; playlistIds: string[]; updatedAt: number } = {
      channelIds: [],
      playlistIds: [],
      updatedAt: 0,
    };
    if (env.CHANNELS_ARCHIVE) {
      try {
        const raw = await env.CHANNELS_ARCHIVE.get(GLOBAL_BLOCKS);
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

  // 8. GET /api/announcements or /api/admin/announcements
  if (
    (url.pathname === '/api/announcements' || url.pathname === '/api/admin/announcements') &&
    request.method === 'GET'
  ) {
    const returnAll =
      url.searchParams.get('all') === 'true' ||
      url.pathname === '/api/admin/announcements' ||
      checkAdminAuth(request, env);
    let list: any[] = [];
    if (env.CHANNELS_ARCHIVE) {
      try {
        const raw = await env.CHANNELS_ARCHIVE.get(ANNOUNCEMENTS);
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

  // 8.5 GET /api/categories or /api/admin/categories
  if (
    (url.pathname === '/api/categories' || url.pathname === '/api/admin/categories') &&
    request.method === 'GET'
  ) {
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
        const raw = await env.CHANNELS_ARCHIVE.get(CUSTOM_CATEGORIES);
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

  // 9. GET /api/resolve-channel?handle={handle}&url={url}
  if (url.pathname === '/api/resolve-channel' && request.method === 'GET') {
    let rawHandle = (url.searchParams.get('handle') || url.searchParams.get('q') || '').trim();
    const rawUrl = (url.searchParams.get('url') || '').trim();

    if (!rawHandle && rawUrl) {
      try {
        const parsedUrl = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
        const path = parsedUrl.pathname;
        const channelMatch = path.match(/\/channel\/(UC[\w-]{22})/i);
        if (channelMatch) {
          rawHandle = channelMatch[1];
        } else {
          const handleMatch = path.match(/\/@([\w.-]+)/i);
          if (handleMatch) {
            rawHandle = handleMatch[1];
          } else {
            const segments = path.split('/').filter(Boolean);
            if (segments.length > 0) {
              rawHandle = segments[segments.length - 1];
            }
          }
        }
      } catch {
        rawHandle = rawUrl;
      }
    }

    if (!rawHandle) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter "handle" or "url"' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Strip leading @ and trim whitespace
    let handle = rawHandle;
    while (handle.startsWith('@')) {
      handle = handle.slice(1).trim();
    }

    if (!handle) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter "handle"' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Check if value already matches UC... channel ID format
    const isChannelId = /^UC[\w-]{22}$/.test(handle);
    if (isChannelId) {
      const apiKey = resolveYouTubeApiKey(request, env);
      if (apiKey) {
        try {
          const ytUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
          ytUrl.searchParams.set('part', 'snippet');
          ytUrl.searchParams.set('id', handle);
          ytUrl.searchParams.set('key', apiKey);

          const ytRes = await fetch(ytUrl.toString());
          if (ytRes.ok) {
            const data: any = await ytRes.json();
            const item = data.items?.[0];
            if (item && item.id) {
              const title = item.snippet?.title || handle;
              const thumbnail =
                item.snippet?.thumbnails?.medium?.url ||
                item.snippet?.thumbnails?.high?.url ||
                item.snippet?.thumbnails?.default?.url ||
                undefined;

              return new Response(
                JSON.stringify({
                  sourceId: item.id,
                  title,
                  sourceType: 'channel',
                  thumbnail,
                }),
                {
                  status: 200,
                  headers: {
                    ...corsHeaders,
                    'Cache-Control': 'public, max-age=3600',
                  },
                }
              );
            }
          }
        } catch {}
      }

      // If YouTube API not queried or failed to find snippet, return valid UC sourceId
      return new Response(
        JSON.stringify({
          sourceId: handle,
          title: handle,
          sourceType: 'channel',
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Cache-Control': 'public, max-age=3600',
          },
        }
      );
    }

    // Must resolve @handle via YouTube API
    const apiKey = resolveYouTubeApiKey(request, env);
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'no_api_key' }),
        { status: 503, headers: corsHeaders }
      );
    }

    try {
      const ytUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
      ytUrl.searchParams.set('part', 'snippet');
      ytUrl.searchParams.set('forHandle', handle);
      ytUrl.searchParams.set('key', apiKey);

      const ytRes = await fetch(ytUrl.toString());
      if (!ytRes.ok) {
        if (ytRes.status === 404) {
          return new Response(
            JSON.stringify({ error: 'not_found' }),
            { status: 404, headers: corsHeaders }
          );
        }
        const errText = await ytRes.text();
        return new Response(
          JSON.stringify({ error: `YouTube API error (${ytRes.status}): ${errText}` }),
          { status: ytRes.status >= 500 ? 502 : ytRes.status, headers: corsHeaders }
        );
      }

      const data: any = await ytRes.json();
      const item = data.items?.[0];

      if (!item || !item.id) {
        return new Response(
          JSON.stringify({ error: 'not_found' }),
          { status: 404, headers: corsHeaders }
        );
      }

      const sourceId = String(item.id).trim();

      // Ensure NEVER returning sourceId starting with @
      if (!sourceId || sourceId.startsWith('@')) {
        return new Response(
          JSON.stringify({ error: 'not_found' }),
          { status: 404, headers: corsHeaders }
        );
      }

      const title = item.snippet?.title || '';
      const thumbnail =
        item.snippet?.thumbnails?.medium?.url ||
        item.snippet?.thumbnails?.high?.url ||
        item.snippet?.thumbnails?.default?.url ||
        undefined;

      return new Response(
        JSON.stringify({
          sourceId,
          title,
          sourceType: 'channel',
          thumbnail,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Cache-Control': 'public, max-age=3600',
          },
        }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err?.message || 'Failed to resolve channel handle' }),
        { status: 500, headers: corsHeaders }
      );
    }
  }

  return null;
}
