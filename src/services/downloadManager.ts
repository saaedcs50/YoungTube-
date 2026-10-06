import db, { DownloadItem } from '../db';
import {
  downloadVideo,
  isNativeDownloadAvailable,
  addDownloadProgressListener,
  deleteDownloadedFile,
  type DownloadProgressPayload,
  type DownloadResult,
} from '../plugins/youngtubeDownloader';

export type DownloadVideoParams = {
  videoId: string;
  title: string;
  thumbnailUrl?: string;
  channelTitle?: string;
  channelId?: string;
};

// Map of active in-flight progress subscriptions
const activeListeners = new Map<string, { remove: () => void }>();

/**
 * Lists all downloads sorted newest first.
 */
export async function listDownloads(): Promise<DownloadItem[]> {
  try {
    const items = await db.downloads.toArray();
    return items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch (err) {
    console.error('Failed to list downloads from db:', err);
    return [];
  }
}

/**
 * Gets a download record by videoId.
 */
export async function getDownloadByVideoId(videoId: string): Promise<DownloadItem | undefined> {
  try {
    return await db.downloads.where('videoId').equals(videoId).first();
  } catch (err) {
    console.error('Failed to get download by videoId:', err);
    return undefined;
  }
}

/**
 * Upserts a download record in Dexie.
 */
export async function upsertDownload(item: Partial<DownloadItem> & { videoId: string }): Promise<void> {
  const existing = await getDownloadByVideoId(item.videoId);
  const now = Date.now();
  if (existing && existing.id) {
    await db.downloads.update(existing.id, {
      ...item,
      updatedAt: now,
    });
  } else {
    await db.downloads.add({
      videoId: item.videoId,
      title: item.title || item.videoId,
      thumbnailUrl: item.thumbnailUrl,
      channelTitle: item.channelTitle,
      channelId: item.channelId,
      status: item.status || 'queued',
      path: item.path,
      errorMessage: item.errorMessage,
      bytesDownloaded: item.bytesDownloaded || 0,
      totalBytes: item.totalBytes ?? null,
      percent: item.percent ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }
}

/**
 * Removes download records from DB and attempts to delete the underlying native file.
 */
export async function removeDownloads(videoIds: string[]): Promise<void> {
  if (!videoIds || videoIds.length === 0) return;

  for (const videoId of videoIds) {
    try {
      const item = await getDownloadByVideoId(videoId);
      if (item) {
        if (item.path && isNativeDownloadAvailable()) {
          try {
            await deleteDownloadedFile(item.path);
          } catch (delErr) {
            console.warn('Native deleteDownloadedFile warning:', delErr);
          }
        }
        if (item.id) {
          await db.downloads.delete(item.id);
        }
      }
    } catch (err) {
      console.error(`Failed to remove download record for videoId ${videoId}:`, err);
    }
  }
}

/**
 * Starts a video download with live progress subscription and updates the Dexie catalog.
 */
export async function startDownload(video: DownloadVideoParams): Promise<DownloadResult> {
  const { videoId, title, thumbnailUrl, channelTitle, channelId } = video;
  const now = Date.now();

  // 1. Upsert status = downloading and reset progress fields
  await upsertDownload({
    videoId,
    title,
    thumbnailUrl: thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    channelTitle,
    channelId,
    status: 'downloading',
    bytesDownloaded: 0,
    totalBytes: null,
    percent: 0,
    errorMessage: undefined,
    createdAt: now,
    updatedAt: now,
  });

  // 2. Attach progress listener if supported on native platform
  if (isNativeDownloadAvailable()) {
    try {
      // Remove any existing listener for this videoId
      if (activeListeners.has(videoId)) {
        activeListeners.get(videoId)?.remove();
        activeListeners.delete(videoId);
      }

      const listenerHandle = await addDownloadProgressListener((payload: DownloadProgressPayload) => {
        if (payload && payload.videoId === videoId) {
          void (async () => {
            try {
              const current = await getDownloadByVideoId(videoId);
              if (current && current.id && current.status === 'downloading') {
                await db.downloads.update(current.id, {
                  bytesDownloaded: payload.bytesDownloaded,
                  totalBytes: payload.totalBytes,
                  percent: payload.percent,
                  updatedAt: Date.now(),
                });
              }
            } catch (err) {
              console.warn('Failed to update progress in db:', err);
            }
          })();
        }
      });

      if (listenerHandle) {
        activeListeners.set(videoId, listenerHandle);
      }
    } catch (err) {
      console.warn('Could not attach progress listener:', err);
    }
  }

  // 3. Trigger native download engine
  try {
    const result = await downloadVideo({ videoId, title });

    // Cleanup listener
    if (activeListeners.has(videoId)) {
      activeListeners.get(videoId)?.remove();
      activeListeners.delete(videoId);
    }

    if (result.ok && typeof result.path === 'string' && result.path.trim().length > 0) {
      const cleanPath = result.path.trim();
      await upsertDownload({
        videoId,
        status: 'done',
        path: cleanPath,
        percent: 100,
        errorMessage: undefined,
      });
      return {
        ...result,
        path: cleanPath,
      };
    } else if (result.ok) {
      const friendlyError = 'تم الإبلاغ عن نجاح التنزيل لكن مسار الملف المحلي غير صالح';
      await upsertDownload({
        videoId,
        status: 'failed',
        errorMessage: friendlyError,
      });
      return {
        ok: false,
        code: 'NATIVE_ERROR',
        message: friendlyError,
      };
    } else {
      const failResult = result as { ok: false; code: 'UNSUPPORTED_PLATFORM' | 'NOT_IMPLEMENTED' | 'INVALID' | 'EMPTY_FILE' | 'NATIVE_ERROR'; message: string };
      let friendlyError = failResult.message || 'فشل التنزيل';
      if (failResult.code === 'UNSUPPORTED_PLATFORM') {
        friendlyError = 'ميزة التنزيل متاحة على تطبيق الأندرويد فقط';
      } else if (failResult.code === 'NOT_IMPLEMENTED') {
        friendlyError = 'ميزة التنزيل غير مهيأة بعد على هذا الجهاز';
      }
      await upsertDownload({
        videoId,
        status: 'failed',
        errorMessage: friendlyError,
      });
      return {
        ok: false,
        code: failResult.code,
        message: friendlyError,
      };
    }
  } catch (err: any) {
    // Cleanup listener
    if (activeListeners.has(videoId)) {
      activeListeners.get(videoId)?.remove();
      activeListeners.delete(videoId);
    }

    const friendlyError = err?.message || 'خطأ غير متوقع أثناء التنزيل';
    await upsertDownload({
      videoId,
      status: 'failed',
      errorMessage: friendlyError,
    });
    return {
      ok: false,
      code: 'NATIVE_ERROR',
      message: friendlyError,
    };
  }
}
