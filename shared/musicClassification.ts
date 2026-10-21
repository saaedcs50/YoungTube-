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
  return EXPLICIT_NO_MUSIC_PHRASES.some((phrase) => normalized.includes(phrase));
}
