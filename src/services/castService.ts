import { Capacitor, registerPlugin } from '@capacitor/core';

type NativeCastPlugin = {
  castVideo: (options: { videoId: string; title?: string }) => Promise<{ ok: boolean; code?: string; message?: string }>;
  openChooser: () => Promise<{ ok: boolean; code?: string; message?: string }>;
};

const NativeCast = registerPlugin<NativeCastPlugin>('YoungTubeCast');

export type CastResult = { ok: boolean; message: string };

export async function castYouTubeVideo(videoId: string, title?: string): Promise<CastResult> {
  if (!videoId) return { ok: false, message: 'معرف الفيديو غير صالح.' };

  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      const result = await NativeCast.castVideo({ videoId, title });
      return {
        ok: result?.ok === true,
        message: result?.message || (result?.ok ? 'تم إرسال الفيديو إلى الشاشة.' : 'تعذر بدء البث إلى الشاشة.'),
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'تعذر الوصول إلى أجهزة العرض الخارجية.',
      };
    }
  }

  const cast = (window as any)?.cast;
  const chromeCast = (window as any)?.chrome?.cast;
  if (cast?.framework?.CastContext && chromeCast?.media) {
    try {
      const context = cast.framework.CastContext.getInstance();
      context.setOptions({
        receiverApplicationId: chromeCast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: chromeCast.AutoJoinPolicy.ORIGIN_SCOPED,
      });
      const session = await context.requestSession();
      if (!session) return { ok: false, message: 'لم يتم اختيار شاشة.' };
      return {
        ok: false,
        message: 'تم الاتصال بجهاز Cast، لكن فيديو YouTube يحتاج Receiver مخصصًا ليعمل مباشرة من التطبيق.',
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'تعذر بدء اتصال Cast.' };
    }
  }

  return {
    ok: false,
    message: 'ميزة البث متاحة على Android مع أجهزة Google Cast أو شاشات خارجية متوافقة. في المتصفح استخدم Cast من قائمة Chrome.',
  };
}

export async function openCastPicker(): Promise<CastResult> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      const result = await NativeCast.openChooser();
      return {
        ok: result?.ok === true,
        message: result?.message || (result?.ok ? 'اختار الشاشة التي تريد استخدام YoungTube عليها.' : 'تعذر فتح اختيار الشاشة.'),
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'تعذر الوصول إلى أجهزة العرض الخارجية.' };
    }
  }

  const cast = (window as any)?.cast;
  const chromeCast = (window as any)?.chrome?.cast;
  if (cast?.framework?.CastContext && chromeCast?.media) {
    try {
      const context = cast.framework.CastContext.getInstance();
      context.setOptions({
        receiverApplicationId: chromeCast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: chromeCast.AutoJoinPolicy.ORIGIN_SCOPED,
      });
      await context.requestSession();
      return { ok: true, message: 'تم فتح اختيار أجهزة Cast.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'تعذر فتح اختيار أجهزة Cast.' };
    }
  }

  return {
    ok: false,
    message: 'ميزة البث متاحة على Android مع أجهزة Google Cast أو شاشات خارجية متوافقة. في المتصفح استخدم Cast من قائمة Chrome.',
  };
}
