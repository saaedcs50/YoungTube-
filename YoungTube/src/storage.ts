export type StoragePersistenceStatus = 'granted' | 'denied' | 'unsupported';

export interface StoragePersistenceResult {
  status: StoragePersistenceStatus;
  persisted: boolean;
  message: string;
  quota?: {
    usageMb: number;
    quotaMb: number;
    percentage: number;
  };
  timestamp?: string;
}

/**
 * Checks and requests persistent storage from the browser via navigator.storage.persist().
 * When granted, browser guarantees cached feeds and IndexedDB tables will not be evicted
 * under storage pressure.
 */
export async function checkAndRequestStoragePersistence(): Promise<StoragePersistenceResult> {
  const timeString = new Date().toLocaleTimeString('ar-EG');

  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persist) {
    return {
      status: 'unsupported',
      persisted: false,
      message: 'خاصية التخزين الدائم (Storage Persistence API) غير مدعومة في بيئة التصفح الحالية.',
      timestamp: timeString,
    };
  }

  try {
    let isPersisted = false;

    // Check if already persisted
    if (typeof navigator.storage.persisted === 'function') {
      isPersisted = await navigator.storage.persisted();
    }

    // If not yet persisted, request persistence
    if (!isPersisted) {
      isPersisted = await navigator.storage.persist();
    }

    // Estimate storage quota if available
    let quotaInfo: StoragePersistenceResult['quota'] | undefined = undefined;
    if (typeof navigator.storage.estimate === 'function') {
      try {
        const estimate = await navigator.storage.estimate();
        if (estimate.usage !== undefined && estimate.quota !== undefined && estimate.quota > 0) {
          quotaInfo = {
            usageMb: Math.round((estimate.usage / (1024 * 1024)) * 10) / 10,
            quotaMb: Math.round(estimate.quota / (1024 * 1024)),
            percentage: Math.min(100, Math.round((estimate.usage / estimate.quota) * 100)),
          };
        }
      } catch {
        // Non-blocking if estimate fails
      }
    }

    if (isPersisted) {
      return {
        status: 'granted',
        persisted: true,
        message: 'ممنوحة (Storage Granted) — المتصفح لن يحذف بيانات التطبيق أو قاعدة البيانات تلقائياً عند انخفاض الذاكرة.',
        quota: quotaInfo,
        timestamp: timeString,
      };
    } else {
      return {
        status: 'denied',
        persisted: false,
        message: 'مرفوضة (Best-Effort Storage) — يعمل التخزين بنظام المحاولة الفضلى وقد يتم تنظيف الكاش عند امتلاء القرص تماماً.',
        quota: quotaInfo,
        timestamp: timeString,
      };
    }
  } catch (err) {
    return {
      status: 'denied',
      persisted: false,
      message: `تعذر تفعيل التخزين الدائم: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`,
      timestamp: timeString,
    };
  }
}
