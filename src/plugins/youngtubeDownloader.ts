import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';

export type DownloadRequest = {
  videoId: string;
  title?: string;
};

export type DownloadResult =
  | { ok: true; status: 'queued' | 'done'; path?: string; message?: string }
  | {
      ok: false;
      code: 'UNSUPPORTED_PLATFORM' | 'NOT_IMPLEMENTED' | 'INVALID' | 'EMPTY_FILE' | 'NATIVE_ERROR';
      message: string;
    };

export type DownloadProgressPayload = {
  videoId: string;
  bytesDownloaded: number;
  totalBytes: number | null;
  percent: number | null;
};

export type DeleteFileResult =
  | { ok: true; message?: string }
  | {
      ok: false;
      code: 'UNSUPPORTED_PLATFORM' | 'INVALID' | 'NATIVE_ERROR';
      message: string;
    };

interface YoungTubeDownloaderPluginInterface {
  download(options: DownloadRequest): Promise<DownloadResult>;
  deleteFile(options: { path: string }): Promise<DeleteFileResult>;
  addListener(
    eventName: 'downloadProgress',
    listenerFunc: (progress: DownloadProgressPayload) => void
  ): Promise<PluginListenerHandle>;
}

const YoungTubeDownloaderNative = registerPlugin<YoungTubeDownloaderPluginInterface>(
  'YoungTubeDownloader'
);

export function isNativeDownloadAvailable(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform();
}

/**
 * Downloads a video using NewPipe Extractor locked to ~360p progressive stream.
 */
export async function downloadVideo(req: DownloadRequest): Promise<DownloadResult> {
  if (!req || !req.videoId) {
    return {
      ok: false,
      code: 'INVALID',
      message: 'معرف الفيديو غير صالح (Video ID is invalid)',
    };
  }

  if (!isNativeDownloadAvailable()) {
    return {
      ok: false,
      code: 'UNSUPPORTED_PLATFORM',
      message: 'ميزة التنزيل متاحة على تطبيق الأندرويد فقط',
    };
  }

  try {
    const res = await YoungTubeDownloaderNative.download(req);
    return res;
  } catch (err: any) {
    return {
      ok: false,
      code: 'NATIVE_ERROR',
      message: err?.message || 'خطأ في الاتصال بإضافة الأندرويد',
    };
  }
}

/**
 * Deletes a previously downloaded local file by its absolute path.
 */
export async function deleteDownloadedFile(path: string): Promise<DeleteFileResult> {
  if (!path || !path.trim()) {
    return {
      ok: false,
      code: 'INVALID',
      message: 'مسار الملف غير محدد',
    };
  }

  if (!isNativeDownloadAvailable()) {
    return {
      ok: false,
      code: 'UNSUPPORTED_PLATFORM',
      message: 'ميزة حذف الملفات متاحة على تطبيق الأندرويد فقط',
    };
  }

  try {
    const res = await YoungTubeDownloaderNative.deleteFile({ path: path.trim() });
    return res;
  } catch (err: any) {
    return {
      ok: false,
      code: 'NATIVE_ERROR',
      message: err?.message || 'خطأ أثناء محاولة حذف الملف',
    };
  }
}

/**
 * Subscribes to download progress events emitted by the native downloader.
 * Returns a handle that can be used to remove the listener.
 */
export async function addDownloadProgressListener(
  callback: (progress: DownloadProgressPayload) => void
): Promise<PluginListenerHandle | null> {
  if (!isNativeDownloadAvailable()) {
    return null;
  }

  try {
    return await YoungTubeDownloaderNative.addListener('downloadProgress', callback);
  } catch (err) {
    console.warn('Failed to attach downloadProgress listener:', err);
    return null;
  }
}
