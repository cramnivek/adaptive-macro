import { describe, expect, it } from 'vitest';
import type { DatedSet } from '../workouts';
import {
  computeVolumeDiagnostics,
  evaluateLegBalance,
  evaluatePushPull,
  evaluateVolumeZone,
  type MuscleRegion,
} from '../volumeLandmarks';

describe('volumeLandmarks - evaluateVolumeZone', () => {
  it('returns untrained for 0 sets', () => {
    const res = evaluateVolumeZone(0, 8, 12, 18);
    expect(res.zone).toBe('untrained');
    expect(res.zoneLabel).toBe('UNTRAINED');
  });

  it('returns maintenance below MEV', () => {
    const res = evaluateVolumeZone(6, 8, 12, 18);
    expect(res.zone).toBe('maintenance');
    expect(res.zoneLabel).toBe('MAINTENANCE');
  });

  it('returns effective between MEV and MAV min', () => {
    const res = evaluateVolumeZone(10, 8, 12, 18);
    expect(res.zone).toBe('effective');
    expect(res.zoneLabel).toBe('GROWTH');
  });

  it('returns optimal within MAV range', () => {
    const res = evaluateVolumeZone(15, 8, 12, 18);
    expect(res.zone).toBe('optimal');
    expect(res.zoneLabel).toBe('OPTIMAL (MAV)');
  });

  it('returns overreaching above MAV max', () => {
    const res = evaluateVolumeZone(22, 8, 12, 18);
    expect(res.zone).toBe('overreaching');
    expect(res.zoneLabel).toBe('HIGH FATIGUE');
  });
});

describe('volumeLandmarks - movement balance evaluation', () => {
  it('evaluates push:pull balance correctly', () => {
    expect(evaluatePushPull(12, 12).status).toBe('balanced');
    expect(evaluatePushPull(13, 12).status).toBe('balanced');
    expect(evaluatePushPull(18, 10).status).toBe('push-dominant');
    expect(evaluatePushPull(6, 14).status).toBe('pull-dominant');
    expect(evaluatePushPull(0, 0).status).toBe('insufficient-data');
  });

  it('evaluates leg anterior:posterior balance correctly', () => {
    expect(evaluateLegBalance(10, 10).status).toBe('balanced');
    expect(evaluateLegBalance(16, 8).status).toBe('quad-dominant');
    expect(evaluateLegBalance(6, 14).status).toBe('posterior-dominant');
    expect(evaluateLegBalance(0, 0).status).toBe('insufficient-data');
  });
});

describe('volumeLandmarks - computeVolumeDiagnostics', () => {
  const regions: Record<string, { primary: MuscleRegion; secondary: MuscleRegion[] }> = {
    'Bench Press': { primary: 'chest', secondary: ['triceps', 'shoulders'] },
    'Barbell Row': { primary: 'upper_back', secondary: ['biceps', 'lats'] },
    'Back Squat': { primary: 'quads', secondary: ['glutes'] },
    'Romanian Deadlift': { primary: 'hamstrings', secondary: ['glutes', 'lower_back'] },
    'Overhead Press': { primary: 'shoulders', secondary: ['triceps'] },
    'Bicep Curl': { primary: 'biceps', secondary: ['forearms'] },
  };

  const createSet = (
    exerciseName: string,
    date: string,
    setType: 'normal' | 'warmup' = 'normal',
  ): DatedSet => ({
    date,
    set: {
      id: `s_${Math.random()}`,
      sessionId: 'session_1',
      exerciseName,
      setIndex: 0,
      weightKg: 80,
      reps: 10,
      setType,
      rpe: 8,
      bodyweightBased: false,
    },
  });

  it('computes 7-day weekly volume and landmarks correctly', () => {
    const sets: DatedSet[] = [
      // 12 sets Bench Press (Chest primary, Shoulders/Triceps secondary)
      ...Array.from({ length: 12 }, () => createSet('Bench Press', '2026-10-10')),
      // 14 sets Barbell Row (Back primary, Biceps secondary)
      ...Array.from({ length: 14 }, () => createSet('Barbell Row', '2026-10-11')),
      // 12 sets Back Squat (Quads primary, Glutes secondary)
      ...Array.from({ length: 12 }, () => createSet('Back Squat', '2026-10-12')),
      // 10 sets Romanian Deadlift (Hamstrings/Glutes primary)
      ...Array.from({ length: 10 }, () => createSet('Romanian Deadlift', '2026-10-13')),
      // 2 warmups (must be excluded)
      createSet('Bench Press', '2026-10-10', 'warmup'),
      createSet('Back Squat', '2026-10-12', 'warmup'),
    ];

    const result = computeVolumeDiagnostics({
      sets,
      exerciseRegions: regions,
      from: '2026-10-09',
      to: '2026-10-15',
      periodDays: 7,
    });

    expect(result.totalWorkingSets).toBe(48);
    expect(result.weeklyWorkingSets).toBe(48);

    const chest = result.muscleVolumes.find((m) => m.key === 'chest')!;
    expect(chest.directSets).toBe(12);
    expect(chest.effectiveWeeklySets).toBe(12);
    expect(chest.zone).toBe('optimal'); // 12 in MAV [12, 18]

    const back = result.muscleVolumes.find((m) => m.key === 'back')!;
    expect(back.directSets).toBe(14);
    expect(back.zone).toBe('optimal'); // 14 in MAV [14, 22]

    const quads = result.muscleVolumes.find((m) => m.key === 'quads')!;
    expect(quads.directSets).toBe(12);
    expect(quads.zone).toBe('optimal');

    const posterior = result.muscleVolumes.find((m) => m.key === 'posterior')!;
    // 10 direct RDL + (12 * 0.5) indirect from squats = 10 + 6 = 16 effective
    expect(posterior.directSets).toBe(10);
    expect(posterior.effectiveWeeklySets).toBe(16);
    expect(posterior.zone).toBe('optimal');

    // Balance checks
    expect(result.pushPullBalance.status).toBe('balanced');
    expect(result.legBalance.status).toBe('balanced');
  });

  it('scales 30-day period volume down to 7-day weekly rate', () => {
    // 30 sets over 30 days = 7 sets per week
    const sets = Array.from({ length: 30 }, () =>
      createSet('Bench Press', '2026-10-05'),
    );

    const result = computeVolumeDiagnostics({
      sets,
      exerciseRegions: regions,
      from: '2026-09-16',
      to: '2026-10-15',
      periodDays: 30,
    });

    const chest = result.muscleVolumes.find((m) => m.key === 'chest')!;
    expect(chest.directSets).toBe(30);
    expect(chest.effectiveWeeklySets).toBe(7); // 30 * (7/30) = 7 sets/wk
    expect(chest.zone).toBe('maintenance'); // 7 is below MEV 8
  });
});
