import db, { type FeedItem } from '../../db';
import { getChannelBySourceId } from '../../data/channelRegistry';
import { loadCachedBlocks } from '../globalBlocks';
import { getDownloadByVideoId } from '../downloadManager';

export type PlaylistSafetyReason =
  | 'hidden'
  | 'blocked_channel'
  | 'disabled_channel'
  | 'blocked_source_playlist'
  | 'portrait'
  | 'short'
  | 'too_short'
  | 'unavailable'
  | 'offline_unavailable';

export type PlaylistSafetyResult = { allowed: boolean; reason?: PlaylistSafetyReason; feed?: FeedItem; localPath?: string };

// Child safety oracle contract: canPlayVideoInChildContext(videoId, { online?, requireDownloaded? }).
export async function canPlayVideoInChildContext(
  videoId: string,
  options: { online?: boolean; requireDownloaded?: boolean } = {},
): Promise<PlaylistSafetyResult> {
  const online = options.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine);
  const feed = await db.feedCache.get(videoId);
  const blocks = loadCachedBlocks();
  if (!feed) return { allowed: false, reason: 'unavailable' };
  if (feed.hidden === true) return { allowed: false, reason: 'hidden', feed };
  if (blocks.channelIds.includes(feed.channelId)) return { allowed: false, reason: 'blocked_channel', feed };
  const channel = await getChannelBySourceId(feed.channelId);
  if (!channel || channel.enabled === false || channel.autoDisabled === true || channel.status === 'disabled') {
    return { allowed: false, reason: 'disabled_channel', feed };
  }
  if (feed.isPortrait !== false) return { allowed: false, reason: 'portrait', feed };

  const settings = await db.settings.get('main');
  const hasFamilyKey = Boolean(settings?.familyYoutubeApiKey?.trim());
  if (settings?.hideMusicVideos === true && feed.hasMusic === true) {
    return { allowed: false, reason: 'blocked_source_playlist', feed };
  }
  if (
    hasFamilyKey &&
    (typeof feed.videoDuration !== 'number' ||
      !Number.isFinite(feed.videoDuration) ||
      feed.videoDuration < 120)
  ) {
    return { allowed: false, reason: 'too_short', feed };
  }
  if (options.requireDownloaded || !online) {
    const rec = await getDownloadByVideoId(videoId);
    if (!rec || rec.status !== 'done' || !rec.path?.trim()) {
      return { allowed: false, reason: 'offline_unavailable', feed };
    }
    return { allowed: true, feed, localPath: rec.path.trim() };
  }
  return { allowed: true, feed };
}

