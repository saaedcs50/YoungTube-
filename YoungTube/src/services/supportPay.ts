import { WORKER_URL } from '../config';

export interface SupportPayData {
  v: number;
  updatedAt: string;
  instapay?: {
    label?: string;
    phone?: string;
    ipa?: string;
    url?: string;
    name?: string;
  };
  vodafoneCash?: {
    label?: string;
    phone?: string;
    name?: string;
  };
  note?: string;
}

export interface SupportPayResponse {
  payload: SupportPayData;
  signed: boolean;
  sig?: string;
  alg?: string;
}

const STORAGE_KEY = 'yt_support_pay_snapshot_v1';
let memorySnapshot: SupportPayData | null = null;
let activeFetchPromise: Promise<SupportPayData | null> | null = null;

/**
 * Returns cached snapshot from memory or localStorage without initiating network request.
 */
export function getCachedSupportPay(): SupportPayData | null {
  if (memorySnapshot) return memorySnapshot;
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        memorySnapshot = parsed;
        return memorySnapshot;
      }
    }
  } catch {}
  return null;
}

/**
 * Fetches remote support pay settings from the worker.
 * Uses cache: 'no-store' per specification.
 * Falls back to offline snapshot if network request fails.
 */
export async function loadSupportPay(forceRefresh = false): Promise<SupportPayData | null> {
  if (!forceRefresh && activeFetchPromise) {
    return activeFetchPromise;
  }

  activeFetchPromise = (async () => {
    try {
      let res: Response;
      try {
        res = await fetch(`${WORKER_URL}/api/support-pay`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
      } catch {
        res = await fetch('/api/support-pay', {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
      }

      if (res.ok) {
        const data = (await res.json()) as SupportPayResponse;
        if (data && data.payload && typeof data.payload === 'object') {
          memorySnapshot = data.payload;
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data.payload));
          } catch {}
          return data.payload;
        }
      }

      if (res.status === 404) {
        // Explicitly unconfigured on server
        return null;
      }
    } catch (err) {
      console.warn('Failed to fetch remote support pay, falling back to cache:', err);
    }

    return getCachedSupportPay();
  })();

  try {
    return await activeFetchPromise;
  } finally {
    activeFetchPromise = null;
  }
}
