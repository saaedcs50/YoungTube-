/**
 * Pure guardrails for the initial Catalog V2 Shadow verification sample.
 * The scheduler persists the number of unique video slots already reserved,
 * so Cron invocations cannot reset the limit when a prior sample is pending
 * or has already completed.
 */
export const AUTO_REVIEW_SHADOW_SAMPLE_LIMIT = 10;

export function remainingShadowSampleSlots(reservedCount: unknown, limit = AUTO_REVIEW_SHADOW_SAMPLE_LIMIT): number {
  if (typeof reservedCount !== 'number' || !Number.isFinite(reservedCount)) return 0;
  if (!Number.isFinite(limit) || limit < 0) return 0;
  return Math.max(0, Math.floor(limit) - Math.max(0, Math.floor(reservedCount)));
}
