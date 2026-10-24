import { describe, expect, it } from 'vitest';
import { patchPeriodReview, reviewStateFor } from '../periodReviewState';

describe('period-bound review state', () => {
  it('does not expose a previous review or applied flag while another period loads', () => {
    const state = patchPeriodReview({}, 'week-a', { review: { title: 'Earlier advice' }, applied: true, loading: false });
    expect(reviewStateFor(state, 'week-b')).toEqual({ review: null, applied: false, loading: true, error: null });
  });
  it('keeps an old request completion and error from replacing a newer period', () => {
    let state = patchPeriodReview<{ title: string }>({}, 'week-a', { loading: true });
    state = patchPeriodReview(state, 'week-b', { review: { title: 'Current advice' }, applied: false, loading: false });
    state = patchPeriodReview(state, 'week-a', { review: { title: 'Late advice' }, error: 'Earlier error', loading: false });
    expect(reviewStateFor(state, 'week-b')).toEqual({ review: { title: 'Current advice' }, applied: false, loading: false, error: null });
    expect(reviewStateFor(state, 'week-a').review?.title).toBe('Late advice');
  });
  it('has no loading or actionable review without an eligible period', () => {
    expect(reviewStateFor({}, null)).toEqual({ review: null, applied: false, loading: false, error: null });
  });
});
