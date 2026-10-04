import db from '../db';

/**
 * Returns the family-owned YouTube Data API key stored locally in Dexie.
 * This key is intentionally client-provided and never falls back to the
 * server's YOUTUBE_API_KEY.
 */
export async function getFamilyYoutubeApiKey(): Promise<string> {
  try {
    const settings = await db.settings.get('main');
    return settings?.familyYoutubeApiKey?.trim() || '';
  } catch {
    return '';
  }
}

/**
 * Builds request headers for Worker endpoints that consume YouTube quota.
 * Never returns the server/admin key and never logs the value.
 */
export async function getFamilyYoutubeApiHeaders(): Promise<Record<string, string>> {
  const key = await getFamilyYoutubeApiKey();
  return key ? { 'X-Family-Youtube-Key': key } : {};
}
