export interface PeriodReviewState<T> {
  review: T | null;
  applied: boolean;
  loading: boolean;
  error: string | null;
}

export type PeriodReviews<T> = Record<string, PeriodReviewState<T>>;

const empty = { review: null, applied: false, loading: false, error: null };

/** A cache read or request for another period must never supply this one's Apply action. */
export const reviewStateFor = <T>(states: PeriodReviews<T>, key: string | null): PeriodReviewState<T> =>
  key === null ? empty : states[key] ?? { ...empty, loading: true };

export const patchPeriodReview = <T>(
  states: PeriodReviews<T>, key: string, patch: Partial<PeriodReviewState<T>>,
): PeriodReviews<T> => ({ ...states, [key]: { ...empty, ...states[key], ...patch } });
