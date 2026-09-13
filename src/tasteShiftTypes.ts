/** Shared Taste Shift types (Phase B). */

export type TasteShiftEventType =
  | 'offered'
  | 'chosen'
  | 'impressed'
  | 'opened'
  | 'completed'
  | 'skipped_early'
  | 'liked'
  | 'disliked';

export interface TasteShiftEvent {
  id?: number;
  ts: number;
  categoryId: string;
  videoId?: string;
  type: TasteShiftEventType;
  meta?: { watchMs?: number; position?: number };
}

export interface PerCategoryState {
  effectiveShare: number;
  streakAccept: number;
  streakReject: number;
  lastShownAt?: number;
  cooldownUntil?: number;
  totalShown: number;
  totalAccepted: number;
  totalRejected: number;
}

export interface TasteShiftConfig {
  enabled: boolean;
  targetCategories: string[];
  startDate: string;
  weeklyStepPercent: number;
  capPercent: number;
  activeCategoryThisWeek?: string;
  choiceWeekNumber?: number;
  perCategory?: Record<string, PerCategoryState>;
}

export function emptyPerCategory(baseShare = 0): PerCategoryState {
  return {
    effectiveShare: baseShare,
    streakAccept: 0,
    streakReject: 0,
    totalShown: 0,
    totalAccepted: 0,
    totalRejected: 0,
  };
}
