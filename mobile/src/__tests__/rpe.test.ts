import { describe, expect, it } from 'vitest';
import { RPE_SCALE, formatRpe, rpeMeaning } from '../rpe';

describe('RPE_SCALE', () => {
  it('runs 6 to 10 in halves, which is what Hevy records', () => {
    expect([...RPE_SCALE]).toEqual([6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]);
  });

  it('glosses every value on the scale, so no option renders bare', () => {
    for (const value of RPE_SCALE) {
      expect(rpeMeaning(value)).not.toBeNull();
    }
  });
});

describe('formatRpe', () => {
  it('speaks a whole rating without a decimal', () => {
    expect(formatRpe(8)).toBe('8');
    expect(formatRpe(10)).toBe('10');
  });

  it('keeps the half', () => {
    expect(formatRpe(8.5)).toBe('8.5');
  });

  it('marks an unrated set rather than rendering an empty cell', () => {
    expect(formatRpe(null)).toBe('—');
  });

  it('rounds a value carrying float noise back onto the scale', () => {
    expect(formatRpe(8.499999999999998)).toBe('8.5');
  });
});

describe('rpeMeaning', () => {
  it('reads 8 as two reps left, which is what makes the number usable', () => {
    expect(rpeMeaning(8)).toBe('2 reps left');
  });

  it('reads 10 as nothing left', () => {
    expect(rpeMeaning(10)).toBe('nothing left');
  });

  it('returns null off the scale rather than inventing a gloss', () => {
    expect(rpeMeaning(3)).toBeNull();
    expect(rpeMeaning(11)).toBeNull();
  });
});
