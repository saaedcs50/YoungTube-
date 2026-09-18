import { WORKER_URL } from '../config';

export const DISMISSED_KEY = 'yt_announcements_dismissed_v1';

export interface Announcement {
  id: string;
  title: string;
  body?: string;
  severity?: 'info' | 'warning';
  active?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Loads the map of dismissed announcements from localStorage.
 * Format: Record<id, dismissedAtMs>
 */
export function loadDismissed(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Marks an announcement as dismissed with current timestamp.
 */
export function markDismissed(id: string): void {
  if (!id || typeof window === 'undefined') return;
  try {
    const current = loadDismissed();
    current[id] = Date.now();
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(current));
  } catch (err) {
    console.warn('Failed to save dismissed announcement:', err);
  }
}

/**
 * Fetches active announcements from Worker with ~8s timeout.
 * Normalizes list to keep only valid items with id + title.
 * Returns empty array on network/parse failure (fail-open).
 */
export async function fetchAnnouncements(): Promise<Announcement[]> {
  try {
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), 8000);

    let res: Response;
    try {
      res = await fetch(`${WORKER_URL}/api/announcements`, {
        signal: controller.signal,
      });
    } catch {
      res = await fetch('/api/announcements', {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutTimer);
    }

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      return [];
    }

    const items: Announcement[] = [];
    for (const raw of data) {
      const id = typeof raw?.id === 'string' ? raw.id.trim() : String(raw?.id || '').trim();
      const title = typeof raw?.title === 'string' ? raw.title.trim() : '';
      if (!id || !title) continue;

      const body = typeof raw?.body === 'string' && raw.body.trim() ? raw.body.trim() : undefined;
      const severity: 'info' | 'warning' = raw?.severity === 'warning' ? 'warning' : 'info';
      const active = raw?.active !== false;
      const createdAt = typeof raw?.createdAt === 'number' ? raw.createdAt : undefined;
      const updatedAt = typeof raw?.updatedAt === 'number' ? raw.updatedAt : undefined;

      items.push({
        id,
        title,
        body,
        severity,
        active,
        createdAt,
        updatedAt,
      });
    }

    return items;
  } catch (err) {
    console.warn('fetchAnnouncements failed (fail-open):', err);
    return [];
  }
}

/**
 * Filters out dismissed announcements.
 * If announcement was updated after it was dismissed (updatedAt > dismissedAt),
 * it is shown again so users see edited notices.
 */
export function getVisibleAnnouncements(list: Announcement[]): Announcement[] {
  if (!Array.isArray(list) || list.length === 0) return [];
  const dismissedMap = loadDismissed();

  return list.filter((item) => {
    if (!item || !item.id || !item.title) return false;
    if (item.active === false) return false;

    const dismissedAt = dismissedMap[item.id];
    if (typeof dismissedAt === 'number') {
      // Re-show if announcement was edited after dismissal
      if (typeof item.updatedAt === 'number' && item.updatedAt > dismissedAt) {
        return true;
      }
      return false;
    }
    return true;
  });
}
