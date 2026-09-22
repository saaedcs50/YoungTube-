import channelsSeed from '../../channels_seed.json';
import { corsHeaders, checkAdminAuth } from '../lib/cors';
import {
  checkMaintenanceLock,
  acquireMaintenanceLock,
  releaseMaintenanceLock,
  runBackfillAllBatch,
  runScheduledMaintenance,
  parseIsoDuration,
  getJpegDimensions,
  updateMergedListForChannel,
} from '../lib/helpers';
import {
  MAINTENANCE_CURSOR,
  BACKFILL_ALL_CURSOR,
  MAINTENANCE_STATUS,
  CLEANUP_DEAD_VIDEOS_CURSOR,
  SCAN_CLEANUP_CURSOR,
  CHANNELS_LATEST_MERGED,
  channelArchiveKey,
  scanCleanupOffsetKey,
} from '../lib/kv-keys';
import { Env, VideoItem } from '../lib/types';

export async function handleAdminBatchRoutes(
  request: Request,
  env: Env,
  url: URL
): Promise<Response | null> {
  // 1. POST /api/admin/backfill-all-batch
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

    const activeLock = await checkMaintenanceLock(env);
    if (activeLock) {
      return new Response(
        JSON.stringify({
          error: `Maintenance is currently in progress (locked until ${activeLock.until}). Please wait for the current batch to complete.`,
          lock: activeLock,
        }),
        { status: 409, headers: corsHeaders }
      );
    }

    let reset = false;
    try {
      const body: any = await request.json();
      if (body && typeof body === 'object' && body.reset === true) {
        reset = true;
      }
    } catch {}

    await acquireMaintenanceLock(env, 'manual_admin');
    try {
      const result = await runBackfillAllBatch(env, env.YOUTUBE_API_KEY, reset, 2);
      return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: err instanceof Error ? err.message : 'Error executing batch backfill',
        }),
        { status: 500, headers: corsHeaders }
      );
    } finally {
      await releaseMaintenanceLock(env);
    }
  }

  // 2. POST /api/admin/cleanup-dead-videos-batch
  if (url.pathname === '/api/admin/cleanup-dead-videos-batch' && request.method === 'POST') {
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

    const activeLock = await checkMaintenanceLock(env);
    if (activeLock) {
      return new Response(
        JSON.stringify({
          error: `Maintenance is currently in progress (locked until ${activeLock.until}). Please wait for the current batch to complete.`,
          lock: activeLock,
        }),
        { status: 409, headers: corsHeaders }
      );
    }

    let reset = false;
    try {
      const body: any = await request.json();
      if (body && typeof body === 'object' && body.reset === true) {
        reset = true;
      }
    } catch {}

    await acquireMaintenanceLock(env, 'manual_admin_cleanup');
    try {
      const totalChannels = (channelsSeed as any[]).length;
      let cursor = 0;
      if (!reset && env.CHANNELS_ARCHIVE) {
        try {
          const rawCursor = await env.CHANNELS_ARCHIVE.get(CLEANUP_DEAD_VIDEOS_CURSOR);
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

      const MAX_CHANNELS = 15;
      const MAX_VIDEOS = 2000;
      let channelsIncluded = 0;
      const batchChannels: { channel: any; videos: VideoItem[] }[] = [];
      const failedChannels: {
        sourceId: string;
        title: string;
        error: string;
        message?: string;
      }[] = [];
      let accumulatedVideoCount = 0;

      for (let step = 0; step < MAX_CHANNELS; step++) {
        const idx = (cursorBefore + step) % totalChannels;
        const seed: any = (channelsSeed as any[])[idx];
        const sourceId = seed.sourceId;

        let channelVideos: VideoItem[] = [];
        if (env.CHANNELS_ARCHIVE) {
          try {
            const raw = await env.CHANNELS_ARCHIVE.get(channelArchiveKey(sourceId));
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                channelVideos = parsed;
              }
            }
          } catch (err) {
            console.error(`Error reading archive for channel ${sourceId}:`, err);
            failedChannels.push({
              sourceId,
              title: seed.title || seed.name || sourceId,
              error: 'read_archive_failed',
              message: err instanceof Error ? err.message : String(err),
            });
            channelsIncluded++;
            continue;
          }
        }

        if (channelVideos.length === 0) {
          channelsIncluded++;
          batchChannels.push({ channel: seed, videos: [] });
          continue;
        }

        if (accumulatedVideoCount > 0 && accumulatedVideoCount + channelVideos.length > MAX_VIDEOS) {
          break;
        }

        channelsIncluded++;
        batchChannels.push({ channel: seed, videos: channelVideos });
        accumulatedVideoCount += channelVideos.length;
      }

      const allVideoIdSet = new Set<string>();
      for (const { videos } of batchChannels) {
        for (const v of videos) {
          if (v && v.videoId) {
            allVideoIdSet.add(v.videoId);
          }
        }
      }
      const allVideoIds = Array.from(allVideoIdSet);
      const aliveSet = new Set<string>();
      const CHUNK_SIZE = 50;

      for (let i = 0; i < allVideoIds.length; i += CHUNK_SIZE) {
        const chunk = allVideoIds.slice(i, i + CHUNK_SIZE);
        const apiUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
        apiUrl.searchParams.set('part', 'id');
        apiUrl.searchParams.set('id', chunk.join(','));
        apiUrl.searchParams.set('key', env.YOUTUBE_API_KEY);

        const res = await fetch(apiUrl.toString());
        if (!res.ok) {
          const errText = await res.text();
          const apiError = new Error(`YouTube API error (${res.status}): ${errText}`) as Error & { status?: number };
          apiError.status = res.status;
          throw apiError;
        }

        const data: any = await res.json();
        const items = data.items || [];
        for (const item of items) {
          if (item && item.id) {
            aliveSet.add(item.id);
          }
        }
      }

      let fullMergedList: any[] = [];
      if (env.CHANNELS_ARCHIVE) {
        try {
          const rawMerged = await env.CHANNELS_ARCHIVE.get(CHANNELS_LATEST_MERGED);
          if (rawMerged) {
            const parsed = JSON.parse(rawMerged);
            if (Array.isArray(parsed)) {
              fullMergedList = parsed;
            }
          }
        } catch {}

        if (fullMergedList.length === 0) {
          fullMergedList = (channelsSeed as any[]).map((ch: any) => ({
            ...ch,
            videos: [],
            videoCount: 0,
          }));
        }
      }

      const channelsProcessed: {
        sourceId: string;
        title: string;
        videosChecked: number;
        deadVideosRemoved: number;
      }[] = [];
      let totalDeadVideosRemoved = 0;

      for (const { channel, videos } of batchChannels) {
        const sourceId = channel.sourceId;
        const sourceType = channel.sourceType || 'channel';
        const title = channel.title || channel.name || sourceId;

        if (videos.length === 0) {
          channelsProcessed.push({
            sourceId,
            title,
            videosChecked: 0,
            deadVideosRemoved: 0,
          });
          continue;
        }

        try {
          const filtered = videos.filter((v) => aliveSet.has(v.videoId));
          const deadRemoved = videos.length - filtered.length;
          totalDeadVideosRemoved += deadRemoved;

          if (deadRemoved > 0 && env.CHANNELS_ARCHIVE) {
            await env.CHANNELS_ARCHIVE.put(channelArchiveKey(sourceId), JSON.stringify(filtered));
          }

          if (fullMergedList.length > 0) {
            const targetIdx = fullMergedList.findIndex((ch: any) => ch.sourceId === sourceId);
            const updatedChannel: any = {
              ...(targetIdx >= 0 ? fullMergedList[targetIdx] : { sourceId, sourceType }),
              sourceId,
              sourceType,
              videos: filtered.slice(0, 300),
              videoCount: Math.min(filtered.length, 300),
            };

            const seedChannel = (channelsSeed as any[]).find((ch: any) => ch.sourceId === sourceId);
            if (seedChannel) {
              Object.assign(updatedChannel, seedChannel, {
                videos: filtered.slice(0, 300),
                videoCount: Math.min(filtered.length, 300),
              });
            }

            if (targetIdx >= 0) {
              fullMergedList[targetIdx] = updatedChannel;
            } else {
              fullMergedList.push(updatedChannel);
            }
          }

          channelsProcessed.push({
            sourceId,
            title,
            videosChecked: videos.length,
            deadVideosRemoved: deadRemoved,
          });
        } catch (chErr) {
          console.error(`Error processing cleanup for channel ${sourceId}:`, chErr);
          failedChannels.push({
            sourceId,
            title,
            error: 'process_channel_failed',
            message: chErr instanceof Error ? chErr.message : String(chErr),
          });
        }
      }

      if (env.CHANNELS_ARCHIVE && totalDeadVideosRemoved > 0 && fullMergedList.length > 0) {
        try {
          await env.CHANNELS_ARCHIVE.put(
            CHANNELS_LATEST_MERGED,
            JSON.stringify(fullMergedList)
          );
        } catch (e) {
          console.error('Failed to update _channels_latest_merged after cleanup batch:', e);
        }
      }

      const cursorAfter = (cursorBefore + channelsIncluded) % totalChannels;
      if (env.CHANNELS_ARCHIVE) {
        try {
          await env.CHANNELS_ARCHIVE.put(
            CLEANUP_DEAD_VIDEOS_CURSOR,
            cursorAfter.toString()
          );
        } catch (e) {
          console.error('Failed to save _cleanup_dead_videos_cursor:', e);
        }
      }

      const wrappedAround = cursorAfter < cursorBefore;
      const totalVideosChecked = channelsProcessed.reduce((sum, ch) => sum + ch.videosChecked, 0);

      return new Response(
        JSON.stringify({
          channelsProcessed,
          failedChannels,
          totalVideosChecked,
          totalDeadVideosRemoved,
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
          error: err instanceof Error ? err.message : 'Error executing cleanup dead videos batch',
        }),
        { status: 500, headers: corsHeaders }
      );
    } finally {
      await releaseMaintenanceLock(env);
    }
  }

  // 3. POST /api/admin/scan-cleanup-batch
  if (url.pathname === '/api/admin/scan-cleanup-batch' && request.method === 'POST') {
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

    const activeLock = await checkMaintenanceLock(env);
    if (activeLock) {
      return new Response(
        JSON.stringify({
          error: `Maintenance is currently in progress (locked until ${activeLock.until}). Please wait for the current batch to complete.`,
          lock: activeLock,
        }),
        { status: 409, headers: corsHeaders }
      );
    }

    let reset = false;
    try {
      const body: any = await request.json();
      if (body && typeof body === 'object' && body.reset === true) {
        reset = true;
      }
    } catch {}

    await acquireMaintenanceLock(env, 'manual_admin_scan_cleanup');
    try {
      const totalChannels = (channelsSeed as any[]).length;
      let cursor = 0;
      if (!reset && env.CHANNELS_ARCHIVE) {
        try {
          const rawCursor = await env.CHANNELS_ARCHIVE.get(SCAN_CLEANUP_CURSOR);
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
      const seed: any = (channelsSeed as any[])[cursorBefore];
      const sourceId = seed.sourceId;
      const title = seed.title || seed.name || sourceId;

      const failedChannels: Array<{
        sourceId: string;
        title: string;
        error: string;
        status?: number;
        message?: string;
      }> = [];

      if (reset && env.CHANNELS_ARCHIVE) {
        try {
          await env.CHANNELS_ARCHIVE.delete(scanCleanupOffsetKey(sourceId));
        } catch {}
      }

      let channelVideos: VideoItem[] = [];
      if (env.CHANNELS_ARCHIVE) {
        try {
          const raw = await env.CHANNELS_ARCHIVE.get(channelArchiveKey(sourceId));
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              channelVideos = parsed;
            }
          }
        } catch (err) {
          console.error(`Error reading archive for channel ${sourceId}:`, err);
          const status = (err as any)?.status;
          if (status === 403 || status === 429) {
            failedChannels.push({
              sourceId,
              title,
              error: 'youtube_rate_limited',
              status,
            });
          } else {
            failedChannels.push({
              sourceId,
              title,
              error: 'other',
              message: err instanceof Error ? err.message : String(err || 'read_archive_failed'),
            });
          }
        }
      }

      if (channelVideos.length === 0 || failedChannels.length > 0) {
        let cursorAfter = cursorBefore;
        let isChannelComplete = true;

        if (failedChannels.length === 0) {
          cursorAfter = (cursorBefore + 1) % totalChannels;
          if (env.CHANNELS_ARCHIVE) {
            try {
              await env.CHANNELS_ARCHIVE.delete(scanCleanupOffsetKey(sourceId));
              await env.CHANNELS_ARCHIVE.put(SCAN_CLEANUP_CURSOR, cursorAfter.toString());
            } catch {}
          }
        } else {
          isChannelComplete = false;
        }

        const wrappedAround = cursorAfter < cursorBefore && isChannelComplete;

        return new Response(
          JSON.stringify({
            sourceId,
            title,
            videosCheckedThisCall: 0,
            removedShortDuration: 0,
            removedPortrait: 0,
            channelComplete: isChannelComplete,
            cursorBefore,
            cursorAfter,
            totalChannels,
            wrappedAround,
            failedChannels,
            totalVideosChecked: 0,
            totalRemovedShortDuration: 0,
            totalRemovedPortrait: 0,
            channelsProcessed: [
              {
                sourceId,
                title,
                videosChecked: 0,
                removedShortDuration: 0,
                removedPortrait: 0,
                channelComplete: isChannelComplete,
              },
            ],
          }),
          { status: 200, headers: corsHeaders }
        );
      }

      const allVideoIds = channelVideos.map((v) => v.videoId).filter(Boolean);
      const shortDurationVideoIds = new Set<string>();
      const CHUNK_SIZE = 50;

      try {
        for (let i = 0; i < allVideoIds.length; i += CHUNK_SIZE) {
          const chunk = allVideoIds.slice(i, i + CHUNK_SIZE);
          const apiUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
          apiUrl.searchParams.set('part', 'contentDetails');
          apiUrl.searchParams.set('id', chunk.join(','));
          apiUrl.searchParams.set('key', env.YOUTUBE_API_KEY);

          const res = await fetch(apiUrl.toString());
          if (!res.ok) {
            const errText = await res.text();
            const apiError = new Error(`YouTube API error (${res.status}): ${errText}`) as Error & { status?: number };
            apiError.status = res.status;
            throw apiError;
          }

          const data: any = await res.json();
          const items = data.items || [];
          for (const item of items) {
            const vId = item?.id;
            const durationStr = item?.contentDetails?.duration;
            if (vId && durationStr) {
              const seconds = parseIsoDuration(durationStr);
              if (seconds < 120) {
                shortDurationVideoIds.add(vId);
              }
            }
          }
        }
      } catch (durationErr) {
        console.error(`Error checking video durations for channel ${sourceId}:`, durationErr);
        const status = (durationErr as any)?.status;
        if (status === 403 || status === 429) {
          failedChannels.push({
            sourceId,
            title,
            error: 'youtube_rate_limited',
            status,
          });
        } else {
          failedChannels.push({
            sourceId,
            title,
            error: 'other',
            message: durationErr instanceof Error ? durationErr.message : String(durationErr),
          });
        }

        return new Response(
          JSON.stringify({
            sourceId,
            title,
            videosCheckedThisCall: 0,
            removedShortDuration: 0,
            removedPortrait: 0,
            channelComplete: false,
            cursorBefore,
            cursorAfter: cursorBefore,
            totalChannels,
            wrappedAround: false,
            failedChannels,
            totalVideosChecked: 0,
            totalRemovedShortDuration: 0,
            totalRemovedPortrait: 0,
            channelsProcessed: [],
          }),
          { status: 200, headers: corsHeaders }
        );
      }

      let remainingAfterDuration = channelVideos;
      let removedShortDuration = 0;

      if (shortDurationVideoIds.size > 0) {
        remainingAfterDuration = channelVideos.filter((v) => !shortDurationVideoIds.has(v.videoId));
        removedShortDuration = channelVideos.length - remainingAfterDuration.length;

        if (env.CHANNELS_ARCHIVE) {
          try {
            await env.CHANNELS_ARCHIVE.put(channelArchiveKey(sourceId), JSON.stringify(remainingAfterDuration));
            await updateMergedListForChannel(env, sourceId, remainingAfterDuration);
          } catch (e) {
            console.error(`Failed to update archive/merged list after short-duration cleanup for ${sourceId}:`, e);
          }
        }
      }

      let offset = 0;
      const offsetKey = scanCleanupOffsetKey(sourceId);
      if (!reset && env.CHANNELS_ARCHIVE) {
        try {
          const rawOffset = await env.CHANNELS_ARCHIVE.get(offsetKey);
          if (rawOffset) {
            const parsed = parseInt(rawOffset, 10);
            if (!isNaN(parsed) && parsed >= 0) {
              offset = parsed;
            }
          }
        } catch {
          offset = 0;
        }
      }

      const MAX_PORTRAIT_CHECK_BATCH = 35;
      const sliceToProcess = remainingAfterDuration.slice(offset, offset + MAX_PORTRAIT_CHECK_BATCH);
      const portraitVideoIds = new Set<string>();

      for (const v of sliceToProcess) {
        if (!v || !v.videoId) continue;
        try {
          const thumbUrl = `https://i.ytimg.com/vi/${encodeURIComponent(v.videoId)}/frame0.jpg`;
          const dims = await getJpegDimensions(thumbUrl);
          if (dims && dims.height > dims.width) {
            portraitVideoIds.add(v.videoId);
          }
        } catch {}
      }

      let removedPortrait = 0;
      if (portraitVideoIds.size > 0) {
        removedPortrait = portraitVideoIds.size;
        remainingAfterDuration = remainingAfterDuration.filter((v) => !portraitVideoIds.has(v.videoId));

        if (env.CHANNELS_ARCHIVE) {
          try {
            await env.CHANNELS_ARCHIVE.put(channelArchiveKey(sourceId), JSON.stringify(remainingAfterDuration));
            await updateMergedListForChannel(env, sourceId, remainingAfterDuration);
          } catch (e) {
            console.error(`Failed to update archive/merged list after portrait cleanup for ${sourceId}:`, e);
          }
        }
      }

      const newOffset = offset + sliceToProcess.length;
      const isChannelComplete = newOffset >= remainingAfterDuration.length;

      let cursorAfter = cursorBefore;
      if (isChannelComplete) {
        cursorAfter = (cursorBefore + 1) % totalChannels;
        if (env.CHANNELS_ARCHIVE) {
          try {
            await env.CHANNELS_ARCHIVE.delete(offsetKey);
            await env.CHANNELS_ARCHIVE.put(SCAN_CLEANUP_CURSOR, cursorAfter.toString());
          } catch (e) {
            console.error(`Failed to delete offset key or update cursor for ${sourceId}:`, e);
          }
        }
      } else {
        if (env.CHANNELS_ARCHIVE) {
          try {
            await env.CHANNELS_ARCHIVE.put(offsetKey, newOffset.toString());
          } catch (e) {
            console.error(`Failed to save offset key for ${sourceId}:`, e);
          }
        }
      }

      const wrappedAround = cursorAfter < cursorBefore && isChannelComplete;
      const videosCheckedThisCall = allVideoIds.length + sliceToProcess.length;

      return new Response(
        JSON.stringify({
          sourceId,
          title,
          videosCheckedThisCall,
          removedShortDuration,
          removedPortrait,
          channelComplete: isChannelComplete,
          cursorBefore,
          cursorAfter,
          totalChannels,
          wrappedAround,
          failedChannels,
          totalVideosChecked: videosCheckedThisCall,
          totalRemovedShortDuration: removedShortDuration,
          totalRemovedPortrait: removedPortrait,
          channelsProcessed: [
            {
              sourceId,
              title,
              videosChecked: videosCheckedThisCall,
              removedShortDuration,
              removedPortrait,
              channelComplete: isChannelComplete,
            },
          ],
        }),
        { status: 200, headers: corsHeaders }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: err instanceof Error ? err.message : 'Error executing scan cleanup batch',
        }),
        { status: 500, headers: corsHeaders }
      );
    } finally {
      await releaseMaintenanceLock(env);
    }
  }

  // 4. GET /api/admin/maintenance-status
  if (url.pathname === '/api/admin/maintenance-status' && request.method === 'GET') {
    if (!checkAdminAuth(request, env)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid or missing Bearer ADMIN_KEY' }),
        { status: 401, headers: corsHeaders }
      );
    }

    let currentCursor = 0;
    if (env.CHANNELS_ARCHIVE) {
      try {
        const raw =
          (await env.CHANNELS_ARCHIVE.get(MAINTENANCE_CURSOR)) ||
          (await env.CHANNELS_ARCHIVE.get(BACKFILL_ALL_CURSOR));
        if (raw) currentCursor = parseInt(raw, 10) || 0;
      } catch {}
    }

    let statusData: any = {};
    if (env.CHANNELS_ARCHIVE) {
      try {
        const raw = await env.CHANNELS_ARCHIVE.get(MAINTENANCE_STATUS);
        if (raw) statusData = JSON.parse(raw);
      } catch {}
    }

    const activeLock = await checkMaintenanceLock(env);

    return new Response(
      JSON.stringify({
        lastRunTime: statusData.lastRunTime || null,
        cursor: currentCursor,
        lastError: statusData.lastError || null,
        isLocked: Boolean(activeLock),
        lock: activeLock || null,
        primaryTask: 'backfill-all-batch',
        batchSize: 2,
        totalChannels: (channelsSeed as any[]).length,
        lastProcessed: statusData.lastProcessed || [],
        lastFailed: statusData.lastFailed || [],
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  // 5. POST /api/admin/maintenance-run
  if (url.pathname === '/api/admin/maintenance-run' && request.method === 'POST') {
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

    const activeLock = await checkMaintenanceLock(env);
    if (activeLock) {
      return new Response(
        JSON.stringify({
          error: `Maintenance is currently in progress (locked until ${activeLock.until}).`,
          lock: activeLock,
        }),
        { status: 409, headers: corsHeaders }
      );
    }

    try {
      await runScheduledMaintenance(env);
      return new Response(
        JSON.stringify({ ok: true, message: 'Maintenance batch executed successfully' }),
        { status: 200, headers: corsHeaders }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: err instanceof Error ? err.message : 'Error executing scheduled maintenance',
        }),
        { status: 500, headers: corsHeaders }
      );
    }
  }

  return null;
}
