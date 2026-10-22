/**
 * Conservative, versioned Shorts inference. This deliberately does not use the
 * undocumented /shorts/{id} route as a standalone final decision.
 * Source of the date/ratio/duration rules: YouTube Help, "Understand three-minute YouTube Shorts":
 * https://support.google.com/youtube/answer/15424877
 */
export const SHORTS_POLICY_VERSION = 'youngtube-shorts-policy-v2';

export type ShortsCheckStatus =
  | 'SHORTS_LIKELY'
  | 'LONG_FORM_LIKELY'
  | 'NEEDS_REVIEW'
  | 'UNKNOWN';

export interface ShortsPolicyInput {
  durationSeconds?: number | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  /** True only when this is a signal from a /shorts/ URL or redirect, not proof by itself. */
  shortsPathSignal?: boolean;
  publishedAt?: string | null;
  officialArtistChannel?: boolean;
  /** Thumbnail dimensions are only a weak proxy for the actual video aspect ratio. */
  thumbnailIsPortrait?: boolean | null;
}

export interface ShortsPolicyResult {
  status: ShortsCheckStatus;
  reason:
    | 'square_or_vertical_under_policy_limit'
    | 'landscape_under_known_dimensions'
    | 'duration_over_policy_limit'
    | 'shorts_path_signal_only'
    | 'conflicting_signals'
    | 'missing_or_unreliable_metadata';
  policyVersion: string;
  evidence: {
    durationSeconds: number | null;
    aspectRatio: number | null;
    usedThumbnailProxy: boolean;
    shortsPathSignal: boolean;
    publishedAt: string | null;
    officialArtistChannel: boolean;
  };
}

const STANDARD_THREE_MINUTE_START = Date.parse('2024-10-15T00:00:00Z');
const ARTIST_THREE_MINUTE_START = Date.parse('2025-12-08T00:00:00Z');

export function evaluateShortsPolicy(input: ShortsPolicyInput): ShortsPolicyResult {
  const duration =
    typeof input.durationSeconds === 'number' && Number.isFinite(input.durationSeconds) && input.durationSeconds >= 0
      ? input.durationSeconds
      : null;
  const width =
    typeof input.videoWidth === 'number' && Number.isFinite(input.videoWidth) && input.videoWidth > 0
      ? input.videoWidth
      : null;
  const height =
    typeof input.videoHeight === 'number' && Number.isFinite(input.videoHeight) && input.videoHeight > 0
      ? input.videoHeight
      : null;
  const verifiedRatio = width !== null && height !== null ? width / height : null;
  const thumbnailProxy = verifiedRatio === null && input.thumbnailIsPortrait === true;
  const aspectRatio = verifiedRatio ?? (thumbnailProxy ? 0.75 : null);
  const shortsPathSignal = input.shortsPathSignal === true;
  const artist = input.officialArtistChannel === true;
  const publishedAt = typeof input.publishedAt === 'string' && input.publishedAt.trim() ? input.publishedAt.trim() : null;
  const publishedMs = publishedAt ? Date.parse(publishedAt) : NaN;

  const baseEvidence = {
    durationSeconds: duration,
    aspectRatio,
    usedThumbnailProxy: thumbnailProxy,
    shortsPathSignal,
    publishedAt,
    officialArtistChannel: artist,
  };

  const result = (
    status: ShortsCheckStatus,
    reason: ShortsPolicyResult['reason']
  ): ShortsPolicyResult => ({ status, reason, policyVersion: SHORTS_POLICY_VERSION, evidence: baseEvidence });

  if (shortsPathSignal && (duration === null || aspectRatio === null || Number.isNaN(publishedMs))) {
    return result('NEEDS_REVIEW', 'shorts_path_signal_only');
  }

  // The absolute three-minute ceiling rules out Shorts even when aspect ratio is
  // unavailable. A conflicting /shorts URL signal still requires manual review.
  if (duration !== null && duration > 180) {
    return result(
      shortsPathSignal ? 'NEEDS_REVIEW' : 'LONG_FORM_LIKELY',
      shortsPathSignal ? 'conflicting_signals' : 'duration_over_policy_limit'
    );
  }

  if (duration === null || aspectRatio === null || Number.isNaN(publishedMs)) {
    return result(
      shortsPathSignal ? 'NEEDS_REVIEW' : 'UNKNOWN',
      shortsPathSignal ? 'shorts_path_signal_only' : 'missing_or_unreliable_metadata'
    );
  }

  const isSquareOrVertical = aspectRatio <= 1;
  if (!isSquareOrVertical) {
    return result(shortsPathSignal ? 'NEEDS_REVIEW' : 'LONG_FORM_LIKELY',
      shortsPathSignal ? 'conflicting_signals' : 'landscape_under_known_dimensions');
  }

  let threeMinuteRuleApplies = false;
  if (artist) threeMinuteRuleApplies = publishedMs >= ARTIST_THREE_MINUTE_START;
  else threeMinuteRuleApplies = publishedMs >= STANDARD_THREE_MINUTE_START;

  // Before the policy cutoff, square/vertical items up to 60 seconds may already be Shorts.
  const limit = threeMinuteRuleApplies ? 180 : 60;
  if (duration <= limit) {
    if (thumbnailProxy) return result('NEEDS_REVIEW', 'missing_or_unreliable_metadata');
    return result(shortsPathSignal ? 'SHORTS_LIKELY' : 'SHORTS_LIKELY', 'square_or_vertical_under_policy_limit');
  }

  // Vertical/square 61-180s content predating the applicable cutoff remains long-form under
  // YouTube's published rule; a URL-route signal in conflict with that requires review.
  if (duration > limit) {
    if (shortsPathSignal) return result('NEEDS_REVIEW', 'conflicting_signals');
    return result('LONG_FORM_LIKELY', 'duration_over_policy_limit');
  }

  return result('UNKNOWN', 'missing_or_unreliable_metadata');
}
