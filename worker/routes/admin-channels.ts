import channelsSeed from '../../channels_seed.json';
import { corsHeaders, checkAdminAuth, resolveYouTubeApiKey } from '../lib/cors';
import {
  mergeAndStoreKVArchive,
  refreshChannelsBatch,
  MAX_YOUTUBE_PAGES_PER_CHANNEL_PER_INVOCATION,
  YOUTUBE_PAGE_SIZE,
} from '../lib/helpers';
import { CHANNELS_LATEST_MERGED, channelArchiveKey, channelPageTokenKey } from '../lib/kv-keys';
import { Env, VideoItem } from '../lib/types';

export async function handleAdminChannelsRoutes(
  request: Request,
  env: Env,
  url: URL
): Promise<Response | null> {
  // 1. POST /api/admin/backfill-channel (Admin single channel backfill)
  if (url.pathname === '/api/admin/backfill-channel' && request.method === 'POST') {
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

    try {
      const reset = body && body.reset === true;
      let pageToken: string | undefined = undefined;
      let pageTokenCleared = false;

      if (reset && env.CHANNELS_ARCHIVE) {
        try {
          await env.CHANNELS_ARCHIVE.delete(channelPageTokenKey(sourceId));
          pageTokenCleared = true;
        } catch {}
      } else if (env.CHANNELS_ARCHIVE) {
        try {
          const savedToken = await env.CHANNELS_ARCHIVE.get(channelPageTokenKey(sourceId));
          if (savedToken && savedToken.trim()) {
            pageToken = savedToken.trim();
          }
        } catch {}
      }

      const hadResumeToken = Boolean(pageToken);
      const uploadsPlaylistId = sourceId.startsWith('UC') ? 'UU' + sourceId.slice(2) : sourceId;
      let allFetchedVideos: VideoItem[] = [];
      let nextPageToken: string | undefined = undefined;
      let hasRecovered = false;

      while (true) {
        allFetchedVideos = [];
        let pageCount = 0;
        nextPageToken = undefined;
        let currentToken = pageToken;
        let encounteredInvalidToken = false;

        while (pageCount < MAX_YOUTUBE_PAGES_PER_CHANNEL_PER_INVOCATION) {
          const apiUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
          apiUrl.searchParams.set('part', 'snippet');
          apiUrl.searchParams.set('playlistId', uploadsPlaylistId);
          apiUrl.searchParams.set('maxResults', YOUTUBE_PAGE_SIZE.toString());
          if (currentToken) apiUrl.searchParams.set('pageToken', currentToken);
          apiUrl.searchParams.set('key', apiKey);

          const res = await fetch(apiUrl.toString());
          if (!res.ok) {
            const errText = await res.text();
            const isInvalidToken =
              res.status === 400 &&
              (errText.includes('invalidPageToken') ||
                errText.toLowerCase().includes('invalid page token'));

            if (isInvalidToken) {
              if (env.CHANNELS_ARCHIVE) {
                try {
                  await env.CHANNELS_ARCHIVE.delete(channelPageTokenKey(sourceId));
                } catch {}
              }
              pageTokenCleared = true;

              if (hadResumeToken && !hasRecovered) {
                hasRecovered = true;
                pageToken = undefined;
                encounteredInvalidToken = true;
                break;
              }
            }

            if (res.status === 403 || res.status === 429) {
              return new Response(
                JSON.stringify({ error: 'YouTube API quota or access error', details: errText }),
                { status: res.status === 429 ? 429 : 502, headers: corsHeaders }
              );
            }
            return new Response(
              JSON.stringify({ error: `YouTube API error (${res.status}): ${errText}` }),
              { status: res.status >= 500 ? 502 : res.status, headers: corsHeaders }
            );
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

          nextPageToken = data.nextPageToken;
          pageCount++;
          currentToken = nextPageToken;
          if (!nextPageToken || items.length === 0) break;
        }

        if (encounteredInvalidToken) {
          continue;
        }

        break;
      }

      if (nextPageToken && env.CHANNELS_ARCHIVE) {
        await env.CHANNELS_ARCHIVE.put(channelPageTokenKey(sourceId), nextPageToken);
      } else if (env.CHANNELS_ARCHIVE) {
        try {
          await env.CHANNELS_ARCHIVE.delete(channelPageTokenKey(sourceId));
        } catch {}
      }

      // Read existing archive length from KV before merge
      let previousLength = 0;
      if (env.CHANNELS_ARCHIVE) {
        try {
          const rawExisting = await env.CHANNELS_ARCHIVE.get(channelArchiveKey(sourceId));
          if (rawExisting) {
            const parsed = JSON.parse(rawExisting);
            if (Array.isArray(parsed)) {
              previousLength = parsed.length;
            }
          }
        } catch {}
      }

      const storeRes = await mergeAndStoreKVArchive(env, sourceId, allFetchedVideos);
      if (!storeRes.success) {
        return new Response(
          JSON.stringify({ error: storeRes.error || 'Failed to save to KV' }),
          { status: 500, headers: corsHeaders }
        );
      }

      const totalVideosInArchive = storeRes.newCount;
      const newlyAddedCount = Math.max(0, totalVideosInArchive - previousLength);
      const fetchedFromYoutubeCount = allFetchedVideos.length;

      const responsePayload: Record<string, any> = {
        sourceId,
        addedVideosCount: newlyAddedCount,
        fetchedFromYoutubeCount,
        totalVideosInArchive,
        hasMore: !!nextPageToken,
      };

      if (pageTokenCleared) {
        responsePayload.pageTokenCleared = true;
      }

      return new Response(
        JSON.stringify(responsePayload),
        { status: 200, headers: corsHeaders }
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return new Response(
        JSON.stringify({ error: errMsg || 'Failed to backfill channel' }),
        { status: 500, headers: corsHeaders }
      );
    }
  }

  // 2. POST/GET /api/admin/trigger-refresh (Manual trigger for testing the cron batch)
  if (
    url.pathname === '/api/admin/trigger-refresh' &&
    (request.method === 'POST' || request.method === 'GET')
  ) {
    const queryKey = url.searchParams.get('key');
    const isAuthorized =
      checkAdminAuth(request, env) || (Boolean(env.ADMIN_KEY) && queryKey === env.ADMIN_KEY);

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

  // 3. POST /api/admin/channels (Protected with Bearer ADMIN_KEY)
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
      const rawMerged = await env.CHANNELS_ARCHIVE.get(CHANNELS_LATEST_MERGED);
      if (rawMerged) {
        fullMergedList = JSON.parse(rawMerged);
      }
    } catch {}

    if (!Array.isArray(fullMergedList) || fullMergedList.length === 0) {
      fullMergedList = (channelsSeed as any[]).map((ch: any) => ({ ...ch, videos: [], videoCount: 0 }));
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

    await env.CHANNELS_ARCHIVE.put(CHANNELS_LATEST_MERGED, JSON.stringify(fullMergedList));

    return new Response(
      JSON.stringify({
        success: true,
        count: fullMergedList.length,
        message: 'Channels list updated successfully',
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  // 4. POST /api/admin/channel-video-delete (Protected with Bearer ADMIN_KEY)
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
      const rawChannel = await env.CHANNELS_ARCHIVE.get(channelArchiveKey(sourceId));
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

      await env.CHANNELS_ARCHIVE.put(channelArchiveKey(sourceId), JSON.stringify(filteredVideos));

      try {
        const rawMerged = await env.CHANNELS_ARCHIVE.get(CHANNELS_LATEST_MERGED);
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
                CHANNELS_LATEST_MERGED,
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

  return null;
}
