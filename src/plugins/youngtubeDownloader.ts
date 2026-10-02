import { registerPlugin, Capacitor } from '@capacitor/core';

export type DownloadRequest = {
  videoId: string;
  title?: string;
};

export type DownloadResult =
  | { ok: true; status: 'queued' | 'done'; path?: string; message?: string }
  | {
      ok: false;
      code: 'UNSUPPORTED_PLATFORM' | 'NOT_IMPLEMENTED' | 'INVALID' | 'NATIVE_ERROR';
      message: string;
    };

interface YoungTubeDownloaderPluginInterface {
  download(options: DownloadRequest): Promise<DownloadResult>;
}

const YoungTubeDownloaderNative = registerPlugin<YoungTubeDownloaderPluginInterface>(
  'YoungTubeDownloader'
);

export function isNativeDownloadAvailable(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform();
}

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
