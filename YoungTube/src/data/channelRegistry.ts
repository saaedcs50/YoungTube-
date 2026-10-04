// only allowed here
import channelsSeed from '../../channels_seed.json';
import db, { type Channel } from '../db';

/**
 * Channel Source Precedence & Merge Order:
 * 1. Seed: Static curated seed list from channels_seed.json.
 * 2. DB Overrides: User-customized states and parent-added channels stored in Dexie (db.channels).
 *    Matches on sourceId. Overrides title, category, thumbnail, and enabled status.
 * 3. Remote Cache: Worker-provided channel updates stored in Dexie settings (remoteChannelsCache).
 *    Appended if sourceId is not present in seed or custom DB.
 */

export type RegistryChannel = Channel;

/**
 * Merges seed channels + Dexie db.channels overrides + remoteChannelsCache.
 * Single source of truth for channel list querying.
 */
export async function listRegistryChannels(): Promise<RegistryChannel[]> {
  try {
    const dbList = await db.channels.toArray();
    const dbMap = new Map<string, Channel>();
    for (const ch of dbList) {
      if (ch.sourceId) {
        dbMap.set(ch.sourceId, ch);
      }
    }

    const merged: RegistryChannel[] = [];
    const processedSourceIds = new Set<string>();

    // 1. Process all seed channels from channels_seed.json
    for (const seed of channelsSeed as any[]) {
      if (!seed.sourceId) continue;
      processedSourceIds.add(seed.sourceId);

      const dbOverride = dbMap.get(seed.sourceId);
      const cats: string[] = seed.categories || seed.category || [];
      const normalizedCats = Array.isArray(cats) ? cats : [cats];

      if (dbOverride) {
        merged.push({
          ...dbOverride,
          title: dbOverride.title || seed.title || seed.originalName || 'قناة أطفال',
          category:
            Array.isArray(dbOverride.category) && dbOverride.category.length > 0
              ? dbOverride.category
              : normalizedCats,
          thumbnail: dbOverride.thumbnail || seed.thumbnail,
          isPreloaded: true,
        });
      } else {
        merged.push({
          sourceType: (seed.sourceType as 'channel' | 'playlist') || 'channel',
          sourceId: seed.sourceId,
          title: seed.title || seed.originalName || 'قناة أطفال',
          thumbnail: seed.thumbnail,
          category: normalizedCats,
          isPreloaded: true,
          enabled: true,
        });
      }
    }

    // 2. Add custom parent-added channels in db.channels but not in channels_seed.json
    for (const ch of dbList) {
      if (ch.sourceId && !ch.sourceId.startsWith('@') && !processedSourceIds.has(ch.sourceId)) {
        processedSourceIds.add(ch.sourceId);
        merged.push(ch);
      }
    }

    // 3. Add remote channels from Worker live list (remoteChannelsCache) not in seed or custom DB
    const settings = await db.settings.get('main');
    const remoteChannels = settings?.remoteChannelsCache || [];
    for (const remote of remoteChannels) {
      if (remote.sourceId && !remote.sourceId.startsWith('@') && !processedSourceIds.has(remote.sourceId)) {
        processedSourceIds.add(remote.sourceId);
        const dbOverride = dbMap.get(remote.sourceId);
        if (dbOverride) {
          merged.push({
            ...dbOverride,
            title: dbOverride.title || remote.title || 'قناة أطفال',
            category:
              Array.isArray(dbOverride.category) && dbOverride.category.length > 0
                ? dbOverride.category
                : remote.categories,
            thumbnail: dbOverride.thumbnail || remote.thumbnail,
            isPreloaded: true,
          });
        } else {
          merged.push({
            sourceType: (remote.sourceType as 'channel' | 'playlist') || 'channel',
            sourceId: remote.sourceId,
            title: remote.title || 'قناة أطفال',
            thumbnail: remote.thumbnail,
            category: remote.categories || [],
            isPreloaded: true,
            enabled: true,
          });
        }
      }
    }

    return merged;
  } catch (err) {
    console.error('Failed to list registry channels:', err);
    return [];
  }
}

/**
 * Retrieves a single merged channel by sourceId.
 */
export async function getChannelBySourceId(sourceId: string): Promise<RegistryChannel | null> {
  if (!sourceId) return null;
  const all = await listRegistryChannels();
  return all.find((ch) => ch.sourceId === sourceId) || null;
}

/**
 * Returns all channels enabled for feed input (enabled !== false and autoDisabled !== true).
 */
export async function listEnabledChannelsForFeed(): Promise<RegistryChannel[]> {
  const all = await listRegistryChannels();
  return all.filter((ch) => ch.enabled !== false && ch.autoDisabled !== true);
}

/**
 * Returns a map of sourceId -> RegistryChannel for efficient lookup.
 */
export async function getRegistryChannelMap(): Promise<Map<string, RegistryChannel>> {
  const list = await listRegistryChannels();
  const map = new Map<string, RegistryChannel>();
  for (const ch of list) {
    if (ch.sourceId) map.set(ch.sourceId, ch);
  }
  return map;
}
