import type { FeedItem } from '../db';

/**
 * Normalizes text for kid search:
 * - lowercase & trim
 * - collapses multiple whitespaces
 * - strips Arabic tashkeel / diacritics
 * - normalizes Arabic alef variants (أ / إ / آ / ٱ -> ا)
 * - normalizes taa-marbuta (ة -> ه)
 * - normalizes Arabic yaa variants (ى -> ي)
 * - strips Arabic tatweel / kashida (ـ)
 * - preserves Latin letters and numbers intact
 */
export function normalizeSearchText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '') // tashkeel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\u0640/g, '') // tatweel
    .replace(/\s+/g, ' ');
}

/**
 * Splits normalized text into searchable tokens.
 */
export function tokenizeSearchText(text: string): string[] {
  const norm = normalizeSearchText(text);
  if (!norm) return [];
  return norm
    .split(/[\s,.\-_/\\()[\]+!؟?؛;:|"'`~@#$%^&*]+/g)
    .filter((t) => t.length > 0);
}

/**
 * Fast bounded Levenshtein distance.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > 2) return 99;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    const temp = prev;
    prev = curr;
    curr = temp;
  }
  return prev[b.length];
}

/**
 * Checks whether a single candidate token fuzzy-matches a single query token
 * according to the bounded rules:
 * - distance 1 for tokens of length 3..4
 * - distance 2 only when token length is >= 5
 * - distance 0 for length < 3
 */
function isFuzzyTokenMatch(queryToken: string, candToken: string): boolean {
  if (queryToken === candToken) return true;
  if (candToken.startsWith(queryToken)) return true;

  const qLen = queryToken.length;
  if (qLen < 3) return false;

  const maxDist = qLen >= 5 ? 2 : 1;
  if (Math.abs(candToken.length - qLen) > maxDist) return false;

  const dist = levenshteinDistance(queryToken, candToken);
  return dist <= maxDist;
}

/**
 * Explicit, curated child channel & topic alias map.
 * All canonical channels exist in channels_seed.json.
 */
export interface SearchAliasEntry {
  canonicalTitle: string;
  channelId?: string;
  aliases: string[];
}

export const KID_SEARCH_ALIASES: SearchAliasEntry[] = [
  {
    canonicalTitle: 'Cosmic Kids Yoga',
    channelId: 'UC5uIZ2KOZZeQDQo_Gsi_qbQ',
    aliases: ['يوغا', 'yoga', 'يوجا', 'كوزميك', 'كوزمك', 'تمارين يوغا', 'رياضه اطفال'],
  },
  {
    canonicalTitle: 'Numberblocks',
    channelId: 'UCPlwvN0w4qFSP1FllALB92w',
    aliases: ['نمبر', 'numberblocks', 'ارقام', 'الارقام', 'نمبربلوكس', 'حساب', 'رياضيات', 'ارقام اطفال'],
  },
  {
    canonicalTitle: 'Alphablocks',
    channelId: 'UC_qs3c0ehDvZkbiEbOj6Drg',
    aliases: ['حروف', 'alphablocks', 'الفابلكس', 'الحروف', 'احرف', 'الفا', 'انجليزي', 'حروف انجليزي'],
  },
  {
    canonicalTitle: 'Art for Kids Hub',
    channelId: 'UC5XMF3Inoi8R9nSI8ChOsdQ',
    aliases: ['رسم', 'تلوين', 'art for kids', 'art for kids hub', 'الرسم', 'التلوين', 'تلوين ورسم'],
  },
  {
    canonicalTitle: 'Arabian Fairy Tales',
    channelId: 'UCazFScO30FKY3YoNNDfNY5g',
    aliases: ['حكاية', 'قصة', 'fairy', 'حكايات', 'قصص', 'fairy tales', 'arabian fairy tales', 'قصص اطفال', 'حكايات اطفال'],
  },
  {
    canonicalTitle: '5-Minute Crafts PLAY',
    channelId: 'UC57XAjJ04TY8gNxOWf-Sy0Q',
    aliases: ['اشغال', 'حرف', 'ابتكارات', 'crafts', '5 minute crafts', 'كرتون اشغال'],
  },
  {
    canonicalTitle: 'Bluey',
    channelId: 'UCm0El674XYsAp0nAB2pHrRg',
    aliases: ['بلوي', 'bluey', 'كلب بلوي'],
  },
  {
    canonicalTitle: 'Blippi Plays',
    channelId: 'UCTHDPeOUn0xGxsKv6j_-oZQ',
    aliases: ['بليبي', 'blippi'],
  },
];

export type SearchMatchReason =
  | 'title_exact'
  | 'title_prefix'
  | 'title_substring'
  | 'channel_prefix'
  | 'channel_substring'
  | 'alias_match'
  | 'fuzzy_match';

export interface SearchMatchResult {
  matched: boolean;
  score: number;
  reason?: SearchMatchReason;
}

/**
 * Checks whether an alias entry matches the normalized query or its tokens.
 */
function queryMatchesAlias(normQuery: string, queryTokens: string[], entry: SearchAliasEntry): boolean {
  for (const alias of entry.aliases) {
    const normAlias = normalizeSearchText(alias);
    if (!normAlias) continue;
    if (normAlias === normQuery || normQuery.includes(normAlias) || normAlias.includes(normQuery)) {
      return true;
    }
    // Also check token level match
    if (queryTokens.length > 0 && queryTokens.some((t) => t.length >= 3 && normAlias.includes(t))) {
      return true;
    }
  }
  return false;
}

/**
 * Scores a candidate item against a normalized search query and its tokens.
 */
export function scoreFeedItem(
  video: { videoId: string; title: string; channelId: string },
  channelTitle: string | undefined,
  normQuery: string,
  queryTokens: string[],
  isSavedOrLoved = false
): SearchMatchResult {
  if (!normQuery) {
    return { matched: true, score: 0 };
  }

  const normTitle = normalizeSearchText(video.title);
  const normChannel = normalizeSearchText(channelTitle || '');

  // 1. Exact title match
  if (normTitle === normQuery) {
    const score = 100 + (isSavedOrLoved ? 15 : 0);
    return { matched: true, score, reason: 'title_exact' };
  }

  // 2. Title prefix match
  if (normTitle.startsWith(normQuery)) {
    const score = 90 + (isSavedOrLoved ? 15 : 0);
    return { matched: true, score, reason: 'title_prefix' };
  }

  // 3. Title contains full normalized query
  if (normTitle.includes(normQuery)) {
    const score = 75 + (isSavedOrLoved ? 15 : 0);
    return { matched: true, score, reason: 'title_substring' };
  }

  // 4. Channel prefix match
  if (normChannel && normChannel.startsWith(normQuery)) {
    const score = 65 + (isSavedOrLoved ? 15 : 0);
    return { matched: true, score, reason: 'channel_prefix' };
  }

  // 5. Channel contains full normalized query
  if (normChannel && normChannel.includes(normQuery)) {
    const score = 55 + (isSavedOrLoved ? 15 : 0);
    return { matched: true, score, reason: 'channel_substring' };
  }

  // 6. Explicit alias match
  for (const entry of KID_SEARCH_ALIASES) {
    const channelMatches = entry.channelId === video.channelId ||
      (entry.canonicalTitle && normChannel.includes(normalizeSearchText(entry.canonicalTitle)));
    if (channelMatches && queryMatchesAlias(normQuery, queryTokens, entry)) {
      const score = 45 + (isSavedOrLoved ? 15 : 0);
      return { matched: true, score, reason: 'alias_match' };
    }
  }

  // 7. Bounded fuzzy token match on title + channel tokens
  if (queryTokens.length > 0) {
    const titleTokens = tokenizeSearchText(video.title);
    const channelTokens = tokenizeSearchText(channelTitle || '');
    const candTokens = [...titleTokens, ...channelTokens];

    let matchedQueryTokens = 0;
    for (const qToken of queryTokens) {
      const hasMatch = candTokens.some((cToken) => isFuzzyTokenMatch(qToken, cToken));
      if (hasMatch) {
        matchedQueryTokens += 1;
      }
    }

    // Require all tokens if query has 1-2 tokens, or at least 60% of tokens for 3+ tokens
    const requiredMatches = queryTokens.length <= 2
      ? queryTokens.length
      : Math.ceil(queryTokens.length * 0.6);

    if (matchedQueryTokens >= requiredMatches && matchedQueryTokens > 0) {
      const ratio = matchedQueryTokens / queryTokens.length;
      const score = Math.round(25 + ratio * 15) + (isSavedOrLoved ? 15 : 0);
      return { matched: true, score, reason: 'fuzzy_match' };
    }
  }

  return { matched: false, score: 0 };
}

/**
 * Filters and ranks a list of FeedItem candidates by query relevance.
 * When query is empty, preserves candidate order untouched.
 */

export interface NamedSearchCandidate {
  id: string;
  name: string;
  channelId?: string;
}

/**
 * Scores a named candidate with the same exact/prefix/substring/fuzzy semantics
 * used by the video search engine. Channel aliases are optional so playlists
 * never inherit the channel alias relationship.
 */
function scoreNamedCandidate(
  candidate: NamedSearchCandidate,
  normQuery: string,
  queryTokens: string[],
  useChannelAliases: boolean
): SearchMatchResult {
  if (!normQuery) {
    return { matched: true, score: 0 };
  }

  const normName = normalizeSearchText(candidate.name);

  if (normName === normQuery) {
    return { matched: true, score: 100, reason: 'title_exact' };
  }

  if (normName.startsWith(normQuery)) {
    return { matched: true, score: 90, reason: 'title_prefix' };
  }

  if (normName.includes(normQuery)) {
    return { matched: true, score: 75, reason: 'title_substring' };
  }

  if (useChannelAliases) {
    const candidateChannelId = candidate.channelId || candidate.id;
    for (const entry of KID_SEARCH_ALIASES) {
      const channelMatches = entry.channelId === candidateChannelId ||
        (entry.canonicalTitle && normName.includes(normalizeSearchText(entry.canonicalTitle)));
      if (channelMatches && queryMatchesAlias(normQuery, queryTokens, entry)) {
        return { matched: true, score: 45, reason: 'alias_match' };
      }
    }
  }

  if (queryTokens.length > 0) {
    const candidateTokens = tokenizeSearchText(candidate.name);
    let matchedQueryTokens = 0;

    for (const qToken of queryTokens) {
      if (candidateTokens.some((candidateToken) => isFuzzyTokenMatch(qToken, candidateToken))) {
        matchedQueryTokens += 1;
      }
    }

    const requiredMatches = queryTokens.length <= 2
      ? queryTokens.length
      : Math.ceil(queryTokens.length * 0.6);

    if (matchedQueryTokens >= requiredMatches && matchedQueryTokens > 0) {
      const ratio = matchedQueryTokens / queryTokens.length;
      const score = Math.round(25 + ratio * 15);
      return { matched: true, score, reason: 'fuzzy_match' };
    }
  }

  return { matched: false, score: 0 };
}

/**
 * Filters and ranks named child-facing candidates (channels or playlists).
 * When query is empty, preserves candidate order. Results are capped and tie-broken
 * deterministically by candidate ID and then normalized name.
 */
export function searchAndRankNamedItems<T extends NamedSearchCandidate>(
  items: T[],
  query: string,
  options?: {
    useChannelAliases?: boolean;
    maxResults?: number;
  }
): T[] {
  const normQuery = normalizeSearchText(query);
  if (!normQuery) {
    return items.slice(0, options?.maxResults ?? 20);
  }

  const queryTokens = tokenizeSearchText(query);
  const useChannelAliases = options?.useChannelAliases === true;
  const maxResults = options?.maxResults ?? 20;
  const scored: Array<{ item: T; score: number }> = [];

  for (const item of items) {
    const result = scoreNamedCandidate(item, normQuery, queryTokens, useChannelAliases);
    if (result.matched) {
      scored.push({ item, score: result.score });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const idTie = a.item.id.localeCompare(b.item.id);
    if (idTie !== 0) return idTie;
    return normalizeSearchText(a.item.name).localeCompare(normalizeSearchText(b.item.name));
  });

  return scored.slice(0, maxResults).map(({ item }) => item);
}

export function searchAndRankVideos(
  items: FeedItem[],
  query: string,
  channelMap: Map<string, { title: string; categories?: string[]; enabled?: boolean }>,
  options?: {
    isSavedOrLovedItem?: (videoId: string) => boolean;
  }
): FeedItem[] {
  const normQuery = normalizeSearchText(query);
  if (!normQuery) {
    return items;
  }

  const queryTokens = tokenizeSearchText(query);
  const scored: Array<{ item: FeedItem; score: number }> = [];

  for (const item of items) {
    const channelInfo = channelMap.get(item.channelId);
    const isSaved = options?.isSavedOrLovedItem ? options.isSavedOrLovedItem(item.videoId) : false;
    const res = scoreFeedItem(item, channelInfo?.title, normQuery, queryTokens, isSaved);
    if (res.matched) {
      scored.push({ item, score: res.score });
    }
  }

  // Sort by score desc, ties broken by videoId asc
  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.item.videoId.localeCompare(b.item.videoId);
  });

  return scored.map((s) => s.item);
}

export interface AutocompleteSuggestion {
  id: string;
  text: string;
  type: 'channel' | 'video';
  channelTitle?: string;
  score: number;
}

/**
 * Generates autocomplete suggestions ONLY from approved local data.
 * - Channels first when query strongly matches channel prefix/title
 * - Followed by video titles from loaded feed / favorites
 * - Max 6-8 suggestions
 * - Deduplicated by normalized text
 */
export function getAutocompleteSuggestions(options: {
  query: string;
  channelMap: Map<
    string,
    { title: string; enabled?: boolean; autoDisabled?: boolean; blocked?: boolean; categories?: string[] }
  >;
  feedVideos: FeedItem[];
  favoritesVideos?: FeedItem[];
  savedAndLovedVideos?: FeedItem[];
  limit?: number;
}): AutocompleteSuggestion[] {
  const { query, channelMap, feedVideos, favoritesVideos = [], savedAndLovedVideos = [], limit = 7 } = options;
  const normQuery = normalizeSearchText(query);
  if (!normQuery || normQuery.length < 1) {
    return [];
  }

  const queryTokens = tokenizeSearchText(query);
  const channelSuggestions: AutocompleteSuggestion[] = [];
  const videoSuggestions: AutocompleteSuggestion[] = [];
  const seenTexts = new Set<string>();

  // 1. Channel suggestions from enabled channelMap
  channelMap.forEach((info, channelId) => {
    if (info.enabled === false || info.autoDisabled === true || info.blocked === true) return;
    const channelTitle = info.title;
    if (!channelTitle) return;

    const normCh = normalizeSearchText(channelTitle);
    let matched = false;
    let score = 0;

    if (normCh === normQuery) {
      matched = true;
      score = 95;
    } else if (normCh.startsWith(normQuery)) {
      matched = true;
      score = 85;
    } else if (normCh.includes(normQuery)) {
      matched = true;
      score = 65;
    } else {
      // Check alias
      for (const entry of KID_SEARCH_ALIASES) {
        if (entry.channelId === channelId && queryMatchesAlias(normQuery, queryTokens, entry)) {
          matched = true;
          score = 60;
          break;
        }
      }
    }

    if (matched && !seenTexts.has(normCh)) {
      seenTexts.add(normCh);
      channelSuggestions.push({
        id: `ch:${channelId}`,
        text: channelTitle,
        type: 'channel',
        score,
      });
    }
  });

  // 2. Video suggestions from safe local videos
  const pool = [...feedVideos, ...favoritesVideos, ...savedAndLovedVideos];
  const seenVideoIds = new Set<string>();

  for (const video of pool) {
    if (!video || !video.videoId || seenVideoIds.has(video.videoId)) continue;
    seenVideoIds.add(video.videoId);

    // Fail closed: only videos explicitly confirmed as non-portrait (isPortrait === false) are allowed
    if (video.hidden === true || video.isPortrait !== false) continue;

    const channelInfo = channelMap.get(video.channelId);
    if (channelInfo && (channelInfo.enabled === false || channelInfo.autoDisabled === true || channelInfo.blocked === true)) continue;

    const res = scoreFeedItem(video, channelInfo?.title, normQuery, queryTokens, false);
    if (res.matched && res.score >= 50) {
      const normText = normalizeSearchText(video.title);
      if (!seenTexts.has(normText)) {
        seenTexts.add(normText);
        videoSuggestions.push({
          id: `vid:${video.videoId}`,
          text: video.title,
          type: 'video',
          channelTitle: channelInfo?.title,
          score: res.score,
        });
      }
    }
  }

  // Sort channels by score desc
  channelSuggestions.sort((a, b) => b.score - a.score);
  // Sort videos by score desc
  videoSuggestions.sort((a, b) => b.score - a.score);

  // If there's a strong channel match (score >= 80), put channels first
  const strongChannels = channelSuggestions.filter((c) => c.score >= 80);
  const remainingChannels = channelSuggestions.filter((c) => c.score < 80);

  const combined: AutocompleteSuggestion[] = [
    ...strongChannels,
    ...videoSuggestions,
    ...remainingChannels,
  ];

  return combined.slice(0, limit);
}
