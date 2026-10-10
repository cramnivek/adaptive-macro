import { describe, expect, it } from 'vitest';
import { nextLoadHint } from '../suggestion';

const set = (weightKg: number | null, reps: number, rpe: number | null, setType = 'normal' as const) => ({
  weightKg,
  reps,
  rpe,
  setType,
});

describe('nextLoadHint', () => {
  it('reads the top set and suggests from its rating', () => {
    expect(nextLoadHint([set(80, 8, 7), set(100, 5, 8)], 'metric')).toBe(
      'Last top set 100 × 5 @8 — try 102.5 kg.',
    );
  });

  it('says to hold when the top set was near the limit', () => {
    expect(nextLoadHint([set(100, 5, 9.5)], 'metric')).toBe(
      'Last top set 100 × 5 @9.5 — near the limit. Hold 100 kg.',
    );
  });

  it('gives nothing when the top set was not rated, even if a lighter one was', () => {
    // The lighter set's effort is not the top set's effort.
    expect(nextLoadHint([set(80, 8, 7), set(100, 5, null)], 'metric')).toBeNull();
  });

  it('ignores warmups when finding the top set', () => {
    const warmup = { weightKg: 140, reps: 1, rpe: 6, setType: 'warmup' as const };
    expect(nextLoadHint([warmup, set(100, 5, 8)], 'metric')).toContain('100 × 5');
  });

  it('gives nothing with no history to read', () => {
    expect(nextLoadHint([], 'metric')).toBeNull();
  });

  it('gives nothing for bodyweight work with no added load', () => {
    expect(nextLoadHint([set(null, 10, 8)], 'metric')).toBeNull();
  });

  it('speaks in pounds, and in a weight the plates can make', () => {
    // 102.058 kg is 225 lb — two plates a side. One small step up is 230.
    const hint = nextLoadHint([set(102.058, 5, 8)], 'imperial') ?? '';
    expect(hint).toContain('lb');
    expect(hint).toMatch(/try 230 lb/);
  });
});
