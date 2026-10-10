import { describe, expect, it } from 'vitest';
import { sameAsLabel } from '../mealRepeat';

describe('sameAsLabel', () => {
  it('says yesterday for the day before', () => {
    expect(sameAsLabel('2026-10-10', '2026-10-11')).toBe('Same as yesterday');
  });

  it('names the weekday for anything further back in the week', () => {
    // 2026-10-08 is a Thursday.
    expect(sameAsLabel('2026-10-08', '2026-10-11')).toBe('Same as Thursday');
    expect(sameAsLabel('2026-10-04', '2026-10-11')).toBe('Same as Sunday');
  });

  it('counts from the day being viewed, not from today', () => {
    expect(sameAsLabel('2026-10-07', '2026-10-08')).toBe('Same as yesterday');
  });
});
