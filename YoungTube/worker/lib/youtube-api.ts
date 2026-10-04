/**
 * YouTube Data API v3 Client Helpers
 * Single source of truth for constructing and dispatching YouTube Data API requests.
 */

export const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
export const YOUTUBE_PAGE_SIZE = 50;

export interface FetchPlaylistItemsParams {
  apiKey: string;
  playlistId: string;
  pageToken?: string;
  maxResults?: number;
}

/**
 * Fetch a page of items from a playlist.
 * GET /playlistItems?part=snippet&playlistId=&maxResults=&pageToken=&key=
 */
export async function fetchPlaylistItemsPage(
  params: FetchPlaylistItemsParams
): Promise<Response> {
  const { apiKey, playlistId, pageToken, maxResults = YOUTUBE_PAGE_SIZE } = params;
  const url = new URL(`${YOUTUBE_API_BASE}/playlistItems`);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('playlistId', playlistId);
  url.searchParams.set('maxResults', String(maxResults));
  if (pageToken) {
    url.searchParams.set('pageToken', pageToken);
  }
  url.searchParams.set('key', apiKey);

  return fetch(url.toString());
}

export interface FetchSearchVideosParams {
  apiKey: string;
  channelId: string;
  q: string;
  maxResults?: number;
  pageToken?: string;
  safeSearch?: string;
}

/**
 * Search videos within a channel.
 * GET /search?part=snippet&type=video&channelId=&q=&maxResults=&safeSearch=&pageToken=&key=
 */
export async function fetchSearchVideos(
  params: FetchSearchVideosParams
): Promise<Response> {
  const {
    apiKey,
    channelId,
    q,
    maxResults = 25,
    pageToken,
    safeSearch = 'strict',
  } = params;
  const url = new URL(`${YOUTUBE_API_BASE}/search`);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('channelId', channelId);
  url.searchParams.set('q', q);
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('safeSearch', safeSearch);
  if (pageToken) {
    url.searchParams.set('pageToken', pageToken);
  }
  url.searchParams.set('key', apiKey);

  return fetch(url.toString());
}

export interface FetchVideosParams {
  apiKey: string;
  ids: string[];
  part: string;
}

/**
 * Fetch video details by ID list.
 * GET /videos?part=&id=&key=
 */
export async function fetchVideos(
  params: FetchVideosParams
): Promise<Response> {
  const { apiKey, ids, part } = params;
  const url = new URL(`${YOUTUBE_API_BASE}/videos`);
  url.searchParams.set('part', part);
  url.searchParams.set('id', ids.join(','));
  url.searchParams.set('key', apiKey);

  return fetch(url.toString());
}

export interface FetchChannelsParams {
  apiKey: string;
  id?: string;
  forHandle?: string;
  part?: string;
}

/**
 * Fetch channel details by ID or handle.
 * GET /channels?part=&id=|forHandle=&key=
 */
export async function fetchChannels(
  params: FetchChannelsParams
): Promise<Response> {
  const { apiKey, id, forHandle, part = 'snippet' } = params;
  const url = new URL(`${YOUTUBE_API_BASE}/channels`);
  url.searchParams.set('part', part);
  if (id) {
    url.searchParams.set('id', id);
  } else if (forHandle) {
    url.searchParams.set('forHandle', forHandle);
  }
  url.searchParams.set('key', apiKey);

  return fetch(url.toString());
}

/**
 * Parse ISO 8601 duration string (e.g. PT15M33S) into seconds.
 * Matches existing worker parsing logic.
 */
export function parseIso8601DurationToSeconds(durationStr: string): number {
  if (!durationStr) return 0;
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}
