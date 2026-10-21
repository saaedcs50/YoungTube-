/**
 * Shared title-based "explicit no-music claim" detection for YoungTube.
 *
 * Single source of truth used by BOTH:
 * - the kid client (`src/filtering.ts`, archive sync classification), and
 * - the Worker (`worker/routes/public-read.ts`, search-archive classification).
 *
 * Policy (Phase 2, intentionally narrow):
 * - Only UNAMBIGUOUS, EXPLICIT no-music claims in the title qualify:
 *   "no music" / "without music", and the Arabic phrase families
 *   بدون / بلا / من دون + موسيقى with their common spelling variants.
 * - The following do NOT qualify, because they do not prove the absence of
 *   music: «بدون إيقاع» (no rhythm), "vocals only" (no instruments claim),
 *   and «بدون مؤثرات موسيقية» (no music effects). They stay classified by
 *   the callers' existing default.
 * - Callers keep the existing boolean contract and default:
 *   `hasMusic = !hasExplicitNoMusicClaim(title)`.
 *
 * Limitation: a title claim is the publisher's statement, not an audio
 * analysis. This helper detects that a claim was made; it cannot verify
 * that the video's actual audio contains no music.
 */

/**
 * Phrases are stored in their NORMALIZED form (see
 * normalizeTitleForMusicMatch): Arabic ى is unified to ي, so موسيقى is
 * matched as "موسيقي", while the موسيقا spelling (final ا) stays distinct
 * and is listed separately.
 */
const EXPLICIT_NO_MUSIC_PHRASES: readonly string[] = [
  'no music',
  'without music',
  'بدون موسيقي',
  'بدون موسيقا',
  'بلا موسيقي',
  'بلا موسيقا',
  'من دون موسيقي',
  'من دون موسيقا',
];

/**
 * Escapes configured phrases before compiling them as regular expressions.
 * The phrase list is static, but escaping keeps the matcher safe if punctuation
 * is added to a supported phrase in the future.
 */
function escapeRegExp(phrase: string): string {
  return phrase.replace(/[.*+?^${}()|[\]{}\\]/g, '\\$&');
}

/**
 * Require each phrase to be bounded by the string edge or a non-letter,
 * non-number character. Unicode properties are essential here because \\b
 * does not provide reliable Arabic word boundaries. The lookarounds are
 * intentionally avoided for older WebViews; consuming the delimiters is
 * sufficient because this is a boolean test and the regex is not global.
 */
const EXPLICIT_NO_MUSIC_PATTERNS: readonly RegExp[] = EXPLICIT_NO_MUSIC_PHRASES.map(
  (phrase) =>
    new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapeRegExp(phrase)}($|[^\\p{L}\\p{N}])`,
      'u'
    )
);
/**
 * Normalizes a title for phrase matching without changing its meaning:
 * lowercases, strips Arabic diacritics (harakat) and tatweel (kashida),
 * unifies hamza/madda alef forms (أ إ آ) to bare alef (ا), and unifies
 * alef maksura (ى) to yaa (ي) so spelling variants of the same word match.
 */
export function normalizeTitleForMusicMatch(title: string): string {
  return (title || '')
    .toLowerCase()
    // Arabic diacritics (harakat U+064B-U+065F, superscript alef U+0670).
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Tatweel / kashida (U+0640).
    .replace(/\u0640/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي');
}

/**
 * Returns true only when the title carries an explicit, unambiguous
 * no-music claim (see the policy note above). Any other title — ordinary,
 * ambiguous, or claim-free — returns false, and callers apply their
 * existing default classification.
 */
export function hasExplicitNoMusicClaim(title: string): boolean {
  if (!title) return false;
  const normalized = normalizeTitleForMusicMatch(title);
  return EXPLICIT_NO_MUSIC_PATTERNS.some((pattern) => pattern.test(normalized));
}

// ---- Taxonomy-plan v1: video-level song/nasheed variant classification ----

export const MUSIC_CLASSIFICATION_VERSION = 'youngtube-song-variant-v1';

export type SongVariant =
  | 'STANDARD_OR_UNSPECIFIED'
  | 'NO_MUSIC_CLAIMED'
  | 'NO_MUSIC_WITH_RHYTHM'
  | 'NO_RHYTHM_CLAIMED'
  | 'RHYTHM_ONLY'
  | 'NO_DUFF_CLAIMED'
  | 'NO_INSTRUMENTS_CLAIMED'
  | 'VOCALS_ONLY_CLAIMED'
  | 'AMBIGUOUS';

export type PublicSongCategory = 'music_songs' | 'music_songs_no_music';

export interface SongVariantClassification {
  variant: SongVariant;
  publicCategory: PublicSongCategory;
  additionalClaims: SongVariant[];
  matchedPhrase: string | null;
  matchedField: 'title' | 'description' | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  classificationStatus: 'AUTO_CLASSIFIED' | 'NEEDS_REVIEW' | 'UNSPECIFIED';
  ruleVersion: string;
  evidenceMeaning: 'PUBLISHER_METADATA_CLAIM_NOT_AUDIO_VERIFIED';
}

type NormalizedText = { text: string; offsets: Array<{ start: number; end: number }> };
type SongPhrase = { phrase: string; normalized: string; pattern: RegExp };
type SongPhraseHit = { phrase: string; start: number; end: number };

const SONG_FORMAT_PHRASES = [
  // Arabic has spelling variants worth listing explicitly. Do not globally
  // replace taa marbuta with haa; doing so changes unrelated words.
  'أغنية', 'اغنية', 'أغنيه', 'اغنيه', 'أغنيات', 'اغنيات', 'أغاني', 'اغاني',
  'أنشودة', 'انشودة', 'أنشوده', 'انشوده', 'أناشيد', 'اناشيد', 'نشيد', 'كليب غنائي',
  'song', 'songs', 'nursery rhyme', 'nursery rhymes', 'rhymes',
  'sing along', 'lullaby', 'nasheed', 'anasheed', 'kids song',
  'kids songs', 'children song', 'children songs',
] as const;

const NO_MUSIC_CLAIM_PHRASES = [
  'بدون موسيقى', 'بدون موسيقا', 'بدون موسيقي', 'بدون موسقى',
  'بلا موسيقى', 'بلا موسيقا', 'بلا موسيقي',
  'من دون موسيقى', 'من دون موسيقا', 'من دون موسيقي',
  'دون موسيقى', 'دون موسيقا', 'من غير موسيقى', 'من غير موسيقا',
  'لا موسيقى', 'خالي من الموسيقى', 'خالية من الموسيقى', 'خال من الموسيقى',
  'خال من الموسيقا', 'خالية تماما من الموسيقى', 'خال تماما من الموسيقى',
  'بدون موسيقى نهائيا', 'نسخة بدون موسيقى', 'نسخة بلا موسيقى',
  'no music version', 'no music', 'no-music version',
  'without the music', 'without music', 'music-free', 'music free', 'no music cover',
] as const;

const NO_RHYTHM_CLAIM_PHRASES = [
  'بدون ايقاع موسيقي', 'بدون ايقاع', 'بلا ايقاع', 'من دون ايقاع',
  'دون ايقاع', 'من غير ايقاع', 'لا ايقاع',
  'بدون مؤثرات ايقاعية', 'بدون اي مؤثرات ايقاعية', 'دون مؤثرات ايقاعية',
  'no rhythm', 'without rhythm', 'no percussion', 'without percussion',
] as const;

const RHYTHM_ONLY_CLAIM_PHRASES = [
  'نسخة ايقاع فقط', 'بالايقاع فقط', 'ايقاع فقط', 'دفوف فقط', 'دف فقط', 'طبلة فقط',
  'rhythm only', 'percussion only',
] as const;

const NO_DUFF_CLAIM_PHRASES = [
  'بدون دفوف', 'بدون دف', 'بلا دفوف', 'بلا دف', 'من دون دفوف', 'من دون دف',
] as const;

const NO_INSTRUMENTS_CLAIM_PHRASES = [
  'بدون آلات موسيقية', 'بلا آلات موسيقية', 'من دون آلات موسيقية',
  'بدون معازف', 'بلا معازف', 'من دون معازف',
  'بدون خلفية موسيقية', 'دون خلفية موسيقية',
  'بدون مؤثرات موسيقية', 'دون مؤثرات موسيقية', 'بدون مصاحبة موسيقية',
  'without instruments', 'no instruments', 'instrument free', 'instrument-free',
] as const;

const VOCALS_ONLY_CLAIM_PHRASES = [
  'اصوات بشرية فقط', 'صوت بشري فقط', 'باصوات بشرية فقط', 'اداء صوتي فقط',
  'vocals only', 'vocal only', 'voice only', 'only vocals', 'a cappella',
  'acapella', 'acapella version',
] as const;

const NO_MUSIC_EFFECTS_ONLY_PHRASES = [
  'no music effects', 'without music effects', 'no musical effects',
  'without musical effects', 'بدون مؤثرات موسيقية', 'دون مؤثرات موسيقية',
] as const;

function normalizeWithOffsets(input: string): NormalizedText {
  const chars: string[] = [];
  const offsets: Array<{ start: number; end: number }> = [];
  let index = 0;
  while (index < input.length) {
    const codePoint = input.codePointAt(index);
    if (codePoint === undefined) break;
    const current = String.fromCodePoint(codePoint);
    const start = index;
    index += current.length;
    const normalized = current
      .normalize('NFD')
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/gu, '')
      .replace(/\u0640/gu, '')
      .toLowerCase()
      .replace(/[أإآٱ]/gu, 'ا')
      .replace(/ى/gu, 'ي')
      .replace(/[ؤئ]/gu, 'ء')
      .replace(/[\p{P}\p{S}]/gu, ' ');
    for (const ch of normalized) {
      if (/\s/u.test(ch)) {
        if (chars.length > 0 && chars[chars.length - 1] === ' ') {
          offsets[offsets.length - 1].end = index;
        } else if (chars.length > 0) {
          chars.push(' ');
          offsets.push({ start, end: index });
        }
      } else {
        chars.push(ch);
        offsets.push({ start, end: index });
      }
    }
  }
  while (chars[0] === ' ') { chars.shift(); offsets.shift(); }
  while (chars[chars.length - 1] === ' ') { chars.pop(); offsets.pop(); }
  return { text: chars.join(''), offsets };
}

function normalizePhraseForSongMatch(phrase: string): string {
  return normalizeWithOffsets(phrase).text;
}

function compileSongPhrases(phrases: readonly string[]): SongPhrase[] {
  return phrases
    .map((phrase) => {
      const normalized = normalizePhraseForSongMatch(phrase);
      const body = normalized.split(' ').filter(Boolean).join('\\s+');
      return {
        phrase,
        normalized,
        pattern: new RegExp('(^|[^\\p{L}\\p{N}])' + body + '($|[^\\p{L}\\p{N}])', 'u'),
      };
    })
    .filter((item) => item.normalized.length > 0)
    .sort((a, b) => b.normalized.length - a.normalized.length);
}

function findSongPhrase(input: string, phrases: SongPhrase[]): SongPhraseHit | null {
  const normalized = normalizeWithOffsets(input);
  for (const item of phrases) {
    const match = item.pattern.exec(normalized.text);
    if (!match || match.index === undefined) continue;
    const phraseStart = match.index + match[1].length;
    const phraseEnd = phraseStart + item.normalized.length;
    const startOffset = normalized.offsets[phraseStart];
    const endOffset = normalized.offsets[phraseEnd - 1];
    if (!startOffset || !endOffset) continue;
    return { phrase: input.slice(startOffset.start, endOffset.end), start: startOffset.start, end: endOffset.end };
  }
  return null;
}

const SONG_FORMAT_MATCHERS = compileSongPhrases(SONG_FORMAT_PHRASES);
const NO_MUSIC_CLAIM_MATCHERS = compileSongPhrases(NO_MUSIC_CLAIM_PHRASES);
const NO_RHYTHM_CLAIM_MATCHERS = compileSongPhrases(NO_RHYTHM_CLAIM_PHRASES);
const RHYTHM_ONLY_CLAIM_MATCHERS = compileSongPhrases(RHYTHM_ONLY_CLAIM_PHRASES);
const NO_DUFF_CLAIM_MATCHERS = compileSongPhrases(NO_DUFF_CLAIM_PHRASES);
const NO_INSTRUMENTS_CLAIM_MATCHERS = compileSongPhrases(NO_INSTRUMENTS_CLAIM_PHRASES);
const VOCALS_ONLY_CLAIM_MATCHERS = compileSongPhrases(VOCALS_ONLY_CLAIM_PHRASES);
const NO_MUSIC_EFFECTS_MATCHERS = compileSongPhrases(NO_MUSIC_EFFECTS_ONLY_PHRASES);

/** Use only title-specific format/audio cues; a channel category by itself is not proof. */
export function isLikelySongContentTitle(title: string): boolean {
  if (!title || !title.trim()) return false;
  // Only a song/nasheed-format cue can identify the format. Audio claims like
  // "without music" do not by themselves prove the item is a song.
  return Boolean(findSongPhrase(title, SONG_FORMAT_MATCHERS));
}

/**
 * Classify song/nasheed title claims. Description evidence is stored for review
 * but cannot automatically move an item to the visible no-music category.
 */
/** True when an explicit audio-variant phrase is present; use only with an independent song-format signal. */
export function hasSongVariantClaim(title: string): boolean {
  if (!title) return false;
  return Boolean(
    findSongPhrase(title, NO_MUSIC_CLAIM_MATCHERS) ||
    findSongPhrase(title, NO_RHYTHM_CLAIM_MATCHERS) ||
    findSongPhrase(title, RHYTHM_ONLY_CLAIM_MATCHERS) ||
    findSongPhrase(title, NO_DUFF_CLAIM_MATCHERS) ||
    findSongPhrase(title, NO_INSTRUMENTS_CLAIM_MATCHERS) ||
    findSongPhrase(title, VOCALS_ONLY_CLAIM_MATCHERS)
  );
}

/** Video-level song eligibility: a source/channel tag is never enough; require a song-format cue in this video's title. */
export function isSongContentCandidate(title: string, _sourceCategoryHints: string[] = []): boolean {
  // The channel/source hints are accepted for forward-compatible callers but are
  // deliberately ignored: one source can contain songs, lessons, cartoons and
  // general shows. Ambiguous claims lacking a video-level song/nasheed format
  // cue remain outside the public song paths until reviewed video metadata exists.
  return isLikelySongContentTitle(title || '');
}

/** Shared classification entrypoint for client sync and Worker archive search. */
export function classifySongVariantForCandidate(input: {
  title: string;
  description?: string;
  sourceCategoryHints?: string[];
}): SongVariantClassification | null {
  const isSongContent = isSongContentCandidate(input.title, input.sourceCategoryHints || []);
  return isSongContent
    ? classifySongVariant({ title: input.title || '', description: input.description, isSongContent: true })
    : null;
}

export function classifySongVariant(input: {
  title: string;
  description?: string;
  isSongContent: boolean;
}): SongVariantClassification | null {
  if (input.isSongContent !== true) return null;
  const title = typeof input.title === 'string' ? input.title : '';
  const description = typeof input.description === 'string' ? input.description : '';
  const noMusic = findSongPhrase(title, NO_MUSIC_CLAIM_MATCHERS);
  const noRhythm = findSongPhrase(title, NO_RHYTHM_CLAIM_MATCHERS);
  const rhythmOnly = findSongPhrase(title, RHYTHM_ONLY_CLAIM_MATCHERS);
  const noDuff = findSongPhrase(title, NO_DUFF_CLAIM_MATCHERS);
  const noInstruments = findSongPhrase(title, NO_INSTRUMENTS_CLAIM_MATCHERS);
  const vocalsOnly = findSongPhrase(title, VOCALS_ONLY_CLAIM_MATCHERS);
  const noMusicEffectsOnly = findSongPhrase(title, NO_MUSIC_EFFECTS_MATCHERS);
  const normalizedTitle = normalizeTitleForMusicMatch(title).replace(/[-—–_]+/gu, ' ');
  const hasPositiveRhythm = /(^|[^\p{L}\p{N}])(?:مع\s+(?:ايقاع|دف|دفوف)|with\s+(?:rhythm|percussion))($|[^\p{L}\p{N}])/u
    .test(normalizedTitle);
  let variant: SongVariant = 'STANDARD_OR_UNSPECIFIED';
  let matchedPhrase: string | null = null;
  let matchedField: 'title' | 'description' | null = null;
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  let classificationStatus: 'AUTO_CLASSIFIED' | 'NEEDS_REVIEW' | 'UNSPECIFIED' =
    title ? 'UNSPECIFIED' : 'NEEDS_REVIEW';
  const additionalClaims: SongVariant[] = [];

  if (noMusicEffectsOnly) {
    variant = 'NO_INSTRUMENTS_CLAIMED';
    matchedPhrase = noMusicEffectsOnly.phrase;
    matchedField = 'title';
    confidence = 'MEDIUM';
    classificationStatus = 'NEEDS_REVIEW';
  } else if (noMusic && hasPositiveRhythm) {
    variant = 'NO_MUSIC_WITH_RHYTHM';
    matchedPhrase = noMusic.phrase;
    matchedField = 'title';
    confidence = 'MEDIUM';
    classificationStatus = 'NEEDS_REVIEW';
    if (rhythmOnly) additionalClaims.push('RHYTHM_ONLY');
  } else if (noMusic && noRhythm && rhythmOnly) {
    variant = 'AMBIGUOUS';
    matchedPhrase = noMusic.phrase;
    matchedField = 'title';
    confidence = 'LOW';
    classificationStatus = 'NEEDS_REVIEW';
    additionalClaims.push('NO_RHYTHM_CLAIMED', 'RHYTHM_ONLY');
  } else if (noMusic) {
    variant = 'NO_MUSIC_CLAIMED';
    matchedPhrase = noMusic.phrase;
    matchedField = 'title';
    confidence = 'HIGH';
    classificationStatus = 'AUTO_CLASSIFIED';
    if (noRhythm) additionalClaims.push('NO_RHYTHM_CLAIMED');
    if (noInstruments) additionalClaims.push('NO_INSTRUMENTS_CLAIMED');
    if (vocalsOnly) additionalClaims.push('VOCALS_ONLY_CLAIMED');
    if (noDuff) additionalClaims.push('NO_DUFF_CLAIMED');
  } else if (noRhythm && rhythmOnly) {
    variant = 'AMBIGUOUS';
    matchedPhrase = noRhythm.phrase;
    matchedField = 'title';
    confidence = 'LOW';
    classificationStatus = 'NEEDS_REVIEW';
    additionalClaims.push('NO_RHYTHM_CLAIMED', 'RHYTHM_ONLY');
  } else if (rhythmOnly) {
    variant = 'RHYTHM_ONLY';
    matchedPhrase = rhythmOnly.phrase;
    matchedField = 'title';
    confidence = 'HIGH';
    classificationStatus = 'NEEDS_REVIEW';
  } else if (noRhythm) {
    variant = 'NO_RHYTHM_CLAIMED';
    matchedPhrase = noRhythm.phrase;
    matchedField = 'title';
    confidence = 'HIGH';
    classificationStatus = 'NEEDS_REVIEW';
  } else if (noInstruments) {
    variant = 'NO_INSTRUMENTS_CLAIMED';
    matchedPhrase = noInstruments.phrase;
    matchedField = 'title';
    confidence = 'HIGH';
    classificationStatus = 'NEEDS_REVIEW';
  } else if (vocalsOnly) {
    variant = 'VOCALS_ONLY_CLAIMED';
    matchedPhrase = vocalsOnly.phrase;
    matchedField = 'title';
    confidence = 'HIGH';
    classificationStatus = 'NEEDS_REVIEW';
  } else if (noDuff) {
    variant = 'NO_DUFF_CLAIMED';
    matchedPhrase = noDuff.phrase;
    matchedField = 'title';
    confidence = 'HIGH';
    classificationStatus = 'NEEDS_REVIEW';
  }

  if (!matchedPhrase && description) {
    const descHit =
      findSongPhrase(description, NO_MUSIC_CLAIM_MATCHERS) ||
      findSongPhrase(description, NO_RHYTHM_CLAIM_MATCHERS) ||
      findSongPhrase(description, RHYTHM_ONLY_CLAIM_MATCHERS) ||
      findSongPhrase(description, NO_DUFF_CLAIM_MATCHERS) ||
      findSongPhrase(description, NO_INSTRUMENTS_CLAIM_MATCHERS) ||
      findSongPhrase(description, VOCALS_ONLY_CLAIM_MATCHERS);
    if (descHit) {
      matchedPhrase = descHit.phrase;
      matchedField = 'description';
      confidence = 'MEDIUM';
      classificationStatus = 'NEEDS_REVIEW';
      if (findSongPhrase(description, NO_MUSIC_CLAIM_MATCHERS)) variant = 'NO_MUSIC_CLAIMED';
      else if (findSongPhrase(description, NO_RHYTHM_CLAIM_MATCHERS)) variant = 'NO_RHYTHM_CLAIMED';
      else if (findSongPhrase(description, RHYTHM_ONLY_CLAIM_MATCHERS)) variant = 'RHYTHM_ONLY';
      else if (findSongPhrase(description, NO_DUFF_CLAIM_MATCHERS)) variant = 'NO_DUFF_CLAIMED';
      else if (findSongPhrase(description, NO_INSTRUMENTS_CLAIM_MATCHERS)) variant = 'NO_INSTRUMENTS_CLAIMED';
      else if (findSongPhrase(description, VOCALS_ONLY_CLAIM_MATCHERS)) variant = 'VOCALS_ONLY_CLAIMED';
    }
  }

  const publicNoMusic =
    matchedField === 'title' &&
    confidence === 'HIGH' &&
    variant === 'NO_MUSIC_CLAIMED';

  return {
    variant,
    publicCategory: publicNoMusic ? 'music_songs_no_music' : 'music_songs',
    additionalClaims,
    matchedPhrase,
    matchedField,
    confidence,
    classificationStatus,
    ruleVersion: MUSIC_CLASSIFICATION_VERSION,
    evidenceMeaning: 'PUBLISHER_METADATA_CLAIM_NOT_AUDIO_VERIFIED',
  };
}

export function matchesPublicSongCategory(input: {
  title: string;
  description?: string;
  isSongContent?: boolean;
}, selectedCategory: string): boolean {
  if (selectedCategory !== 'music_songs' && selectedCategory !== 'music_songs_no_music') return false;
  const songContent = input.isSongContent === true || isLikelySongContentTitle(input.title || '');
  const result = classifySongVariant({
    title: input.title || '',
    description: input.description,
    isSongContent: songContent,
  });
  return Boolean(result && result.publicCategory === selectedCategory);
}

