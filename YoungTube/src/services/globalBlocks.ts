import { WORKER_URL } from '../config';

export const STORAGE_KEY = 'yt_global_blocks_v1';

export interface GlobalBlocks {
  channelIds: string[];
  playlistIds: string[];
  fetchedAt: number;
}

const DEFAULT_BLOCKS: GlobalBlocks = {
  channelIds: [],
  playlistIds: [],
  fetchedAt: 0,
};

let inFlightFetch: Promise<GlobalBlocks> | null = null;

/**
 * Loads cached global blocks from localStorage synchronously.
 * Returns empty arrays if missing, unparseable, or invalid.
 */
export function loadCachedBlocks(): GlobalBlocks {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_BLOCKS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BLOCKS };
    const parsed = JSON.parse(raw);
    const channelIds: string[] = Array.isArray(parsed?.channelIds)
      ? Array.from(
          new Set<string>(
            parsed.channelIds
              .map((id: any) => String(id || '').trim())
              .filter(Boolean)
          )
        )
      : [];
    const playlistIds: string[] = Array.isArray(parsed?.playlistIds)
      ? Array.from(
          new Set<string>(
            parsed.playlistIds
              .map((id: any) => String(id || '').trim())
              .filter(Boolean)
          )
        )
      : [];
    const fetchedAt = typeof parsed?.fetchedAt === 'number' ? parsed.fetchedAt : 0;
    return { channelIds, playlistIds, fetchedAt };
  } catch {
    return { ...DEFAULT_BLOCKS };
  }
}

/**
 * Saves global blocks to localStorage cache.
 */
export function saveCachedBlocks(b: GlobalBlocks): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch (err) {
    console.warn('Failed to save cached global blocks:', err);
  }
}

/**
 * Fetches latest global blocks from the Worker with ~8s timeout.
 * Normalizes channelIds and playlistIds to trimmed, unique strings.
 * Shares concurrent in-flight requests and falls back to cached blocks on failure.
 */
export async function fetchGlobalBlocks(): Promise<GlobalBlocks> {
  if (inFlightFetch) return inFlightFetch;

  inFlightFetch = (async () => {
    try {
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), 8000);

      let res: Response;
      try {
        res = await fetch(`${WORKER_URL}/api/global-blocks`, {
          signal: controller.signal,
        });
      } catch {
        res = await fetch('/api/global-blocks', {
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutTimer);
      }

      if (!res.ok) {
        return loadCachedBlocks();
      }

      const data = await res.json();
      const channelIds: string[] = Array.isArray(data?.channelIds)
        ? Array.from(
            new Set<string>(
              data.channelIds
                .map((id: any) => String(id || '').trim())
                .filter(Boolean)
            )
          )
        : [];
      const playlistIds: string[] = Array.isArray(data?.playlistIds)
        ? Array.from(
            new Set<string>(
              data.playlistIds
                .map((id: any) => String(id || '').trim())
                .filter(Boolean)
            )
          )
        : [];

      const blocks: GlobalBlocks = {
        channelIds,
        playlistIds,
        fetchedAt: Date.now(),
      };

      saveCachedBlocks(blocks);
      return blocks;
    } catch (err) {
      console.warn('fetchGlobalBlocks failed, using cached fallback:', err);
      return loadCachedBlocks();
    } finally {
      inFlightFetch = null;
    }
  })();

  return inFlightFetch;
}

/**
 * Checks if a channel ID is in the global blocked list.
 */
export function isChannelBlocked(channelId: string, blocks?: GlobalBlocks): boolean {
  if (!channelId) return false;
  const b = blocks ?? loadCachedBlocks();
  const set = new Set(b.channelIds);
  return set.has(channelId.trim());
}

/**
 * Checks if a playlist ID is in the global blocked list.
 */
export function isPlaylistBlocked(playlistId: string, blocks?: GlobalBlocks): boolean {
  if (!playlistId) return false;
  const b = blocks ?? loadCachedBlocks();
  const set = new Set(b.playlistIds);
  return set.has(playlistId.trim());
}
