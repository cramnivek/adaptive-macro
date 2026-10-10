import { describe, expect, it } from 'vitest';
import { suggestNextLoad } from '../workouts.ts';

const KG_STEP = 2.5;

describe('suggestNextLoad', () => {
  it('adds about five percent when the set was easy', () => {
    // RPE 7 = three in reserve. 100 kg × 1.05 = 105.
    expect(suggestNextLoad(100, 7, KG_STEP)).toEqual({ weightKg: 105, reason: 'room-to-add' });
  });

  it('takes the smallest step when the set was in the right zone', () => {
    expect(suggestNextLoad(100, 8, KG_STEP)).toEqual({ weightKg: 102.5, reason: 'small-step' });
  });

  it('holds the weight when the set was near the limit', () => {
    expect(suggestNextLoad(100, 9, KG_STEP)).toEqual({ weightKg: 100, reason: 'hold' });
    expect(suggestNextLoad(100, 10, KG_STEP)).toEqual({ weightKg: 100, reason: 'hold' });
  });

  it('treats the zone boundaries the way the scale reads them', () => {
    expect(suggestNextLoad(100, 7.5, KG_STEP)?.reason).toBe('small-step');
    expect(suggestNextLoad(100, 8.5, KG_STEP)?.reason).toBe('small-step');
    expect(suggestNextLoad(100, 6.5, KG_STEP)?.reason).toBe('room-to-add');
  });

  it('always lands on a weight the plates can make', () => {
    // 47.5 × 1.05 = 49.875, which is not loadable; 50 is.
    expect(suggestNextLoad(47.5, 7, KG_STEP)?.weightKg).toBe(50);
    for (const weight of [33, 61.2, 97.5, 142.5]) {
      for (const rpe of [6, 8, 9.5]) {
        const next = suggestNextLoad(weight, rpe, KG_STEP)?.weightKg ?? 0;
        expect(next % KG_STEP).toBeCloseTo(0);
      }
    }
  });

  it('still moves a light weight, where five percent rounds to nothing', () => {
    // 20 kg × 1.05 = 21, which snaps back to 20 — no progress at all.
    expect(suggestNextLoad(20, 6, KG_STEP)?.weightKg).toBe(22.5);
  });

  it('respects a pound step for someone lifting in pounds', () => {
    const fiveLbInKg = 5 * 0.45359237;
    const next = suggestNextLoad(100, 8, fiveLbInKg)?.weightKg ?? 0;
    expect(next / fiveLbInKg).toBeCloseTo(Math.round(next / fiveLbInKg));
  });

  it('says nothing without a rating, rather than inventing one', () => {
    expect(suggestNextLoad(100, null, KG_STEP)).toBeNull();
  });

  it('says nothing for a bodyweight set with no added load', () => {
    expect(suggestNextLoad(null, 8, KG_STEP)).toBeNull();
    expect(suggestNextLoad(0, 8, KG_STEP)).toBeNull();
  });
});
