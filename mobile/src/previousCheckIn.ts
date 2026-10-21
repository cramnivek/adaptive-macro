import type { ISODate } from '@adaptive-macros/engine';
import type { CheckInKind, CheckInPeriod } from './checkInSchedule';

/**
 * The check-in before this one, for two readers.
 *
 * The person, on a check-in that has not been earned yet: the screen used to
 * say only why, and showed nothing of the last one, so a thin week hid every
 * week before it. And the coach, which wrote each review fresh with no idea
 * what it had advised last time or whether that advice was taken, so it could
 * not follow up on it.
 */

export interface SavedCheckIn {
  period: CheckInPeriod;
  headline: string;
  /** The adjustment it suggested, in words, or null when it said to hold steady. */
  advice: string | null;
  applied: boolean;
}

/** The newest saved check-in of `kind` that finished before `before`. */
export const previousCheckIn = (
  saved: readonly SavedCheckIn[],
  kind: CheckInKind,
  before: ISODate,
): SavedCheckIn | null =>
  saved
    .filter((s) => s.period.kind === kind && s.period.to < before)
    .reduce<SavedCheckIn | null>((newest, s) => (newest === null || s.period.to > newest.period.to ? s : newest), null);

export const adviceOf = (review: {
  suggestedAdjustment?: { hasAdjustment: boolean; title: string };
}): string | null =>
  review.suggestedAdjustment?.hasAdjustment ? review.suggestedAdjustment.title : null;
