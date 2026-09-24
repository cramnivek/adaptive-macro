import { describe, expect, it } from 'vitest';
import { effectiveLoadKg, isWorkingSet } from '../src/workouts.ts';
import type { WorkoutSet } from '../src/workouts.ts';

const set = (over: Partial<WorkoutSet> = {}): WorkoutSet => ({
  id: 's1',
  sessionId: 'w1',
  exerciseName: 'Bench Press (Barbell)',
  setIndex: 0,
  weightKg: 60,
  reps: 8,
  setType: 'normal',
  rpe: null,
  bodyweightBased: false,
  ...over,
});

describe('effectiveLoadKg', () => {
  it('uses the bar weight for an ordinary loaded set', () => {
    expect(effectiveLoadKg(set({ weightKg: 60 }), 80)).toBe(60);
  });

  // 453 sets of this history are bodyweight work. Scoring them off the
  // weight column renders them as a flat zero line; they are the user's own
  // mass, which this app knows from the Kalman trend.
  it('uses bodyweight for a bodyweight set carrying no weight', () => {
    expect(effectiveLoadKg(set({ bodyweightBased: true, weightKg: null }), 80)).toBe(80);
  });

  // The Chest Dip -> Chest Dip (Weighted) transition. Treating added load as
  // the whole load breaks one progression into two unrelated lines.
  it('adds the extra plate to bodyweight, keeping a weighted-dip series continuous', () => {
    expect(effectiveLoadKg(set({ bodyweightBased: true, weightKg: 20 }), 80)).toBe(100);
  });

  // Three Bench Press and two Deadlift rows in the real export have no
  // weight. Those are data-entry slips, and calling them 0 kg would drag a
  // real progression line down.
  it('returns null, not zero, for a loaded exercise with no weight recorded', () => {
    expect(effectiveLoadKg(set({ bodyweightBased: false, weightKg: null }), 80)).toBeNull();
  });

  // Falling back to the added load alone would report a weighted dip as 20 kg
  // rather than 100 kg — wrong by a factor, and silently so.
  it('returns null for a bodyweight set when that date has no bodyweight', () => {
    expect(effectiveLoadKg(set({ bodyweightBased: true, weightKg: null }), null)).toBeNull();
    expect(effectiveLoadKg(set({ bodyweightBased: true, weightKg: 20 }), null)).toBeNull();
  });

  it('is unaffected by a missing bodyweight when the exercise is loaded', () => {
    expect(effectiveLoadKg(set({ bodyweightBased: false, weightKg: 60 }), null)).toBe(60);
  });
});

describe('isWorkingSet', () => {
  // Warmups in a progression series flatten the line and hide the trend.
  it('excludes warmups', () => {
    expect(isWorkingSet(set({ setType: 'warmup' }))).toBe(false);
  });

  // A dropset and a set taken to failure are both real work. The export
  // carries 7 `failure` sets; `dropset` is handled because Hevy emits it.
  it('counts normal, dropset and failure as working sets', () => {
    expect(isWorkingSet(set({ setType: 'normal' }))).toBe(true);
    expect(isWorkingSet(set({ setType: 'dropset' }))).toBe(true);
    expect(isWorkingSet(set({ setType: 'failure' }))).toBe(true);
  });
});
