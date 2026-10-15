import { describe, expect, it } from 'vitest';
import {
  bestHistoricalE1RM,
  estimate1RM,
  evaluatePRTarget,
  repsToBeat,
} from '../workouts.ts';
import type { DatedSet } from '../workouts.ts';

describe('estimate1RM', () => {
  it('returns the weight itself for 1 rep', () => {
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(225, 1)).toBe(225);
  });

  it('calculates Epley formula for multiple reps', () => {
    // 100 × (1 + 10/30) = 133.333...
    expect(estimate1RM(100, 10)).toBeCloseTo(133.333, 2);
    // 60 × (1 + 5/30) = 70
    expect(estimate1RM(60, 5)).toBe(70);
    // 85 × (1 + 6/30) = 102
    expect(estimate1RM(85, 6)).toBe(102);
  });

  it('returns 0 for non-positive weight or reps', () => {
    expect(estimate1RM(0, 5)).toBe(0);
    expect(estimate1RM(-10, 5)).toBe(0);
    expect(estimate1RM(100, 0)).toBe(0);
    expect(estimate1RM(100, -2)).toBe(0);
  });
});

describe('repsToBeat', () => {
  it('returns 1 if weight already exceeds target 1RM', () => {
    expect(repsToBeat(105, 100)).toBe(1);
    expect(repsToBeat(230, 225)).toBe(1);
  });

  it('returns 2 if weight ties target 1RM (since 1 rep ties)', () => {
    // 100 × (1 + 2/30) = 106.67 > 100
    expect(repsToBeat(100, 100)).toBe(2);
  });

  it('calculates exact reps needed when weight is below target', () => {
    // Target 100 kg.
    // 85 kg × 5 reps = 99.17 kg (< 100)
    // 85 kg × 6 reps = 102 kg (> 100)
    expect(repsToBeat(85, 100)).toBe(6);

    // Target 140 kg.
    // 120 kg × 5 reps = 140 kg (ties 140)
    // 120 kg × 6 reps = 144 kg (> 140)
    expect(repsToBeat(120, 140)).toBe(6);
  });

  it('returns null if weight is too low to beat target within maxReps', () => {
    // 20 kg against 200 kg 1RM
    expect(repsToBeat(20, 200, 30)).toBeNull();
  });

  it('returns null for non-positive inputs', () => {
    expect(repsToBeat(0, 100)).toBeNull();
    expect(repsToBeat(100, 0)).toBeNull();
    expect(repsToBeat(-50, 100)).toBeNull();
  });
});

describe('bestHistoricalE1RM', () => {
  const sets: DatedSet[] = [
    {
      date: '2026-09-01',
      set: {
        id: '1',
        sessionId: 's1',
        exerciseName: 'Bench Press',
        setIndex: 1,
        weightKg: 60,
        reps: 10, // e1rm = 80
        setType: 'warmup', // Should be ignored!
        rpe: null,
        bodyweightBased: false,
      },
    },
    {
      date: '2026-09-01',
      set: {
        id: '2',
        sessionId: 's1',
        exerciseName: 'Bench Press',
        setIndex: 2,
        weightKg: 80,
        reps: 5, // e1rm = 80 × (1 + 5/30) = 93.33
        setType: 'normal',
        rpe: 8,
        bodyweightBased: false,
      },
    },
    {
      date: '2026-09-10',
      set: {
        id: '3',
        sessionId: 's2',
        exerciseName: 'Bench Press',
        setIndex: 1,
        weightKg: 90,
        reps: 3, // e1rm = 90 × (1 + 3/30) = 99.0
        setType: 'normal',
        rpe: 9,
        bodyweightBased: false,
      },
    },
    {
      date: '2026-09-10',
      set: {
        id: '4',
        sessionId: 's2',
        exerciseName: 'Squat',
        setIndex: 1,
        weightKg: 140,
        reps: 1, // Squat, different exercise
        setType: 'normal',
        rpe: 9,
        bodyweightBased: false,
      },
    },
  ];

  it('finds the best e1RM for the requested exercise', () => {
    const pr = bestHistoricalE1RM(sets, 'Bench Press');
    expect(pr).not.toBeNull();
    expect(pr?.weight).toBe(90);
    expect(pr?.reps).toBe(3);
    expect(pr?.e1rm).toBe(99);
    expect(pr?.date).toBe('2026-09-10');
  });

  it('returns null if exercise has never been logged', () => {
    expect(bestHistoricalE1RM(sets, 'Deadlift')).toBeNull();
  });
});

describe('evaluatePRTarget', () => {
  const existingPR = {
    e1rm: 100,
    weight: 90,
    reps: 3.33,
    date: '2026-09-01' as const,
  };

  it('returns none when weight is non-positive', () => {
    expect(evaluatePRTarget({ weight: 0, reps: 5, bestPR: existingPR })).toEqual({ status: 'none' });
  });

  it('handles first-time exercise (no historical PR)', () => {
    // Weight entered, no reps yet
    expect(evaluatePRTarget({ weight: 60, reps: 0, bestPR: null })).toEqual({
      status: 'target',
      repsToBeat: 1,
      targetE1rm: 0,
      weight: 60,
    });

    // Weight and reps entered
    expect(evaluatePRTarget({ weight: 60, reps: 5, bestPR: null })).toEqual({
      status: 'pr',
      e1rm: 70,
      delta: 0,
      isFirstLog: true,
      reps: 5,
      weight: 60,
    });
  });

  it('identifies when current weight and reps beat the PR', () => {
    // 85 kg × 6 reps = 102 kg > 100 kg
    const result = evaluatePRTarget({ weight: 85, reps: 6, bestPR: existingPR });
    expect(result.status).toBe('pr');
    if (result.status === 'pr') {
      expect(result.e1rm).toBe(102);
      expect(result.delta).toBe(2);
      expect(result.isFirstLog).toBe(false);
    }
  });

  it('identifies when lifter is 1 rep away from beating the PR', () => {
    // 85 kg needs 6 reps to beat 100 kg. At 5 reps (99.17 kg), they are 1 rep away!
    const result = evaluatePRTarget({ weight: 85, reps: 5, bestPR: existingPR });
    expect(result).toEqual({
      status: 'close',
      repsAway: 1,
      repsToBeat: 6,
      targetE1rm: 100,
      weight: 85,
    });
  });

  it('shows target reps when weight is entered before reps', () => {
    const result = evaluatePRTarget({ weight: 85, reps: 0, bestPR: existingPR });
    expect(result).toEqual({
      status: 'target',
      repsToBeat: 6,
      targetE1rm: 100,
      weight: 85,
    });
  });

  it('clamps 1RM calculation at 10 reps to prevent high-rep endurance inflation', () => {
    // 50 kg × 25 reps uncapped would be 50 * (1 + 25/30) = 91.67 kg.
    // Clamped at 10 reps: 50 * (1 + 10/30) = 66.67 kg.
    expect(estimate1RM(50, 25)).toBe(66.67);
    expect(estimate1RM(100, 30)).toBe(133.33);
  });

  it('marks load as too-light when weight cannot challenge 1RM within 10 reps', () => {
    // Target 100 kg. At 50 kg, 10 reps yields only 66.67 kg.
    // The lifter must load at least ceil(100 / (1 + 10/30)) = 75 kg.
    const result = evaluatePRTarget({ weight: 50, reps: 0, bestPR: existingPR });
    expect(result.status).toBe('too-light');
    if (result.status === 'too-light') {
      expect(result.minWeightForPR).toBe(75);
      expect(result.targetE1rm).toBe(100);
    }
  });
});

