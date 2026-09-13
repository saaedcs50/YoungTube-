import type { PerCategoryState, TasteShiftConfig, TasteShiftEventType } from './tasteShiftTypes';
import { emptyPerCategory } from './tasteShiftTypes';

const MS_DAY = 24 * 60 * 60 * 1000;
const COOLDOWN_DAYS = 3;
const ACCEPT_BUMP = 5;
const REJECT_DROP = 10;
const MAX_STREAK_BONUS = 3;

/** Week index since startDate (0 = first week). */
export function computeCurrentWeek(startDate: string | undefined, now = Date.now()): number {
  const parseTime = startDate ? Date.parse(startDate) : now;
  const validTime = Number.isNaN(parseTime) ? now : parseTime;
  const diffMs = Math.max(0, now - validTime);
  return Math.floor(diffMs / (7 * MS_DAY));
}

/** Base share from calendar progress only (before reaction adjustment). */
export function computeBaseShare(
  startDate: string | undefined,
  weeklyStepPercent: number,
  capPercent: number,
  now = Date.now()
): { currentWeek: number; baseShare: number } {
  const currentWeek = computeCurrentWeek(startDate, now);
  const step = weeklyStepPercent ?? 10;
  const cap = capPercent ?? 40;
  const baseShare = Math.min(cap, step * (currentWeek + 1));
  return { currentWeek, baseShare };
}

export function getOrInitCategoryState(
  config: TasteShiftConfig,
  categoryId: string,
  baseShare: number
): PerCategoryState {
  const existing = config.perCategory?.[categoryId];
  if (existing) return { ...existing };
  return emptyPerCategory(baseShare);
}

export function isCategoryInCooldown(
  state: PerCategoryState | undefined,
  now = Date.now()
): boolean {
  return Boolean(state?.cooldownUntil && state.cooldownUntil > now);
}

/**
 * Share actually used for feed mixing for the active category.
 * Respects cooldown (returns 0) and clamps to [0, cap].
 */
export function resolveEffectiveShare(
  config: TasteShiftConfig,
  categoryId: string,
  now = Date.now()
): number {
  const { baseShare } = computeBaseShare(
    config.startDate,
    config.weeklyStepPercent,
    config.capPercent,
    now
  );
  const state = getOrInitCategoryState(config, categoryId, baseShare);
  if (isCategoryInCooldown(state, now)) return 0;
  const cap = config.capPercent ?? 40;
  // Prefer stored effectiveShare when reactions have run; else baseShare
  const raw =
    state.totalAccepted + state.totalRejected > 0 ? state.effectiveShare : baseShare;
  return Math.max(0, Math.min(cap, raw));
}

/**
 * Apply one explicit child signal. Returns updated perCategory map (immutable-style).
 * Does not write to DB — caller persists.
 */
export function applyReactionEvent(
  config: TasteShiftConfig,
  categoryId: string,
  type: Extract<TasteShiftEventType, 'liked' | 'disliked' | 'completed' | 'skipped_early' | 'impressed'>,
  now = Date.now()
): Record<string, PerCategoryState> {
  const { baseShare } = computeBaseShare(
    config.startDate,
    config.weeklyStepPercent,
    config.capPercent,
    now
  );
  const cap = config.capPercent ?? 40;
  const prevMap = { ...(config.perCategory || {}) };
  const state = getOrInitCategoryState(config, categoryId, baseShare);

  if (type === 'impressed') {
    state.totalShown += 1;
    state.lastShownAt = now;
    prevMap[categoryId] = state;
    return prevMap;
  }

  const isAccept = type === 'liked' || type === 'completed';
  const isReject = type === 'disliked' || type === 'skipped_early';

  if (isAccept) {
    state.streakAccept = Math.min(MAX_STREAK_BONUS, state.streakAccept + 1);
    state.streakReject = 0;
    state.totalAccepted += 1;
    state.effectiveShare = Math.min(
      cap,
      Math.max(baseShare, state.effectiveShare || baseShare) + ACCEPT_BUMP * state.streakAccept
    );
  } else if (isReject) {
    state.streakReject = Math.min(MAX_STREAK_BONUS, state.streakReject + 1);
    state.streakAccept = 0;
    state.totalRejected += 1;
    const next = Math.max(
      0,
      (state.effectiveShare || baseShare) - REJECT_DROP * state.streakReject
    );
    state.effectiveShare = next;
    if (state.streakReject >= 3) {
      state.cooldownUntil = now + COOLDOWN_DAYS * MS_DAY;
      state.effectiveShare = Math.max(0, state.effectiveShare - 15);
    }
  }

  prevMap[categoryId] = state;
  return prevMap;
}

/**
 * On new week: clear active choice streaks but keep lifetime totals.
 * Caller should also clear activeCategoryThisWeek / set choiceWeekNumber.
 */
export function rollWeekPerCategory(
  config: TasteShiftConfig,
  now = Date.now()
): Record<string, PerCategoryState> {
  const { baseShare } = computeBaseShare(
    config.startDate,
    config.weeklyStepPercent,
    config.capPercent,
    now
  );
  const out: Record<string, PerCategoryState> = {};
  const src = config.perCategory || {};
  for (const [id, s] of Object.entries(src)) {
    out[id] = {
      ...s,
      streakAccept: 0,
      streakReject: 0,
      effectiveShare: baseShare,
      // keep cooldown if still active
      cooldownUntil: s.cooldownUntil && s.cooldownUntil > now ? s.cooldownUntil : undefined,
    };
  }
  return out;
}
