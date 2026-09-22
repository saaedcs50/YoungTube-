/**
 * Central catalog for Cloudflare KV storage keys used in CHANNELS_ARCHIVE.
 * 
 * CRITICAL RULE:
 * Never modify the underlying string values of production KV keys without a documented migration.
 */

// Static KV Keys
export const CHANNELS_LATEST_MERGED = '_channels_latest_merged';
export const RSS_REFRESH_CURSOR = '_rss_refresh_cursor';
export const BACKFILL_ALL_CURSOR = '_backfill_all_cursor';
export const MAINTENANCE_CURSOR = 'maintenance_cursor';
export const MAINTENANCE_LOCK = 'maintenance_lock';
export const MAINTENANCE_STATUS = 'maintenance_status';
export const CLEANUP_DEAD_VIDEOS_CURSOR = '_cleanup_dead_videos_cursor';
export const SCAN_CLEANUP_CURSOR = '_scan_cleanup_cursor';
export const LAST_CRON_TASK = '_last_cron_task';
export const GLOBAL_BLOCKS = 'global_blocks';
export const ANNOUNCEMENTS = 'announcements';
export const CUSTOM_CATEGORIES = 'custom_categories';
export const TELEMETRY_INDEX = 'telemetry_index';

// Helper Functions for Dynamic KV Keys
export function channelArchiveKey(sourceId: string): string {
  return sourceId;
}

export function channelPageTokenKey(sourceId: string): string {
  return `_channel_pagetoken:${sourceId}`;
}

export function scanCleanupVideoOffsetKey(sourceId: string): string {
  return `_scan_cleanup_video_offset:${sourceId}`;
}

export function scanCleanupOffsetKey(sourceId: string): string {
  return scanCleanupVideoOffsetKey(sourceId);
}

export function telemetryDailyKey(date: string): string {
  return `telemetry_daily:${date}`;
}

export function telemetryUniquesKey(date: string): string {
  return `telemetry_uniques:${date}`;
}

export function telemetryFunnelDailyKey(date: string): string {
  return `telemetry_funnel:${date}`;
}

export function telemetryFunnelUniquesKey(date: string): string {
  return `telemetry_funnel_uniques:${date}`;
}

export const STATIC_KV_KEYS = [
  CHANNELS_LATEST_MERGED,
  RSS_REFRESH_CURSOR,
  BACKFILL_ALL_CURSOR,
  MAINTENANCE_CURSOR,
  MAINTENANCE_LOCK,
  MAINTENANCE_STATUS,
  CLEANUP_DEAD_VIDEOS_CURSOR,
  SCAN_CLEANUP_CURSOR,
  LAST_CRON_TASK,
  GLOBAL_BLOCKS,
  ANNOUNCEMENTS,
  CUSTOM_CATEGORIES,
  TELEMETRY_INDEX,
] as const;

/**
 * Dynamic KV key patterns summary:
 * - Channel archives: sourceId (raw string, no prefix)
 * - Channel pagination tokens: _channel_pagetoken:${sourceId}
 * - Scan cleanup video offsets: _scan_cleanup_video_offset:${sourceId}
 * - Telemetry daily stats: telemetry_daily:${date}
 * - Telemetry daily uniques: telemetry_uniques:${date}
 * - Telemetry funnel daily stats: telemetry_funnel:${date}
 * - Telemetry funnel daily uniques: telemetry_funnel_uniques:${date}
 */
