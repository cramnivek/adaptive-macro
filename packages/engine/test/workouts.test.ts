import { describe, expect, it } from 'vitest';
import {
  effectiveLoadKg,
  isWorkingSet,
  progressionFor,
  sessionEnergyKcal,
  weeklyVolume,
} from '../src/workouts.ts';
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

describe('progressionFor', () => {
  const bw = new Map<string, number>([
    ['2025-01-01', 80],
    ['2025-01-08', 79],
    ['2025-01-15', 78],
  ]);

  const s = (
    date: string,
    over: Partial<WorkoutSet> & { exerciseName?: string } = {},
  ): { date: string; set: WorkoutSet } => ({
    date,
    set: set({ id: `${date}-${over.setIndex ?? 0}`, sessionId: date, ...over }),
  });

  it('reports the heaviest working set and the total working volume per session', () => {
    const points = progressionFor(
      [
        s('2025-01-01', { weightKg: 60, reps: 10, setIndex: 0 }),
        s('2025-01-01', { weightKg: 70, reps: 5, setIndex: 1 }),
      ],
      bw,
    );

    expect(points).toHaveLength(1);
    expect(points[0].heaviestWorkingSetKg).toBe(70);
    expect(points[0].workingVolumeKg).toBe(60 * 10 + 70 * 5);
  });

  it('excludes warmups from both the heaviest set and the volume', () => {
    const points = progressionFor(
      [
        s('2025-01-01', { weightKg: 100, reps: 5, setType: 'warmup', setIndex: 0 }),
        s('2025-01-01', { weightKg: 60, reps: 10, setIndex: 1 }),
      ],
      bw,
    );

    expect(points[0].heaviestWorkingSetKg).toBe(60);
    expect(points[0].workingVolumeKg).toBe(600);
  });

  it('counts dropsets and failure sets, which are real work', () => {
    const points = progressionFor(
      [
        s('2025-01-01', { weightKg: 60, reps: 8, setType: 'failure', setIndex: 0 }),
        s('2025-01-01', { weightKg: 50, reps: 12, setType: 'dropset', setIndex: 1 }),
      ],
      bw,
    );

    expect(points[0].heaviestWorkingSetKg).toBe(60);
    expect(points[0].workingVolumeKg).toBe(60 * 8 + 50 * 12);
  });

  // The slip case: excluded entirely rather than scored as zero.
  it('drops sets with no usable weight rather than counting them as zero', () => {
    const points = progressionFor(
      [
        s('2025-01-01', { weightKg: null, reps: 5, setIndex: 0 }),
        s('2025-01-01', { weightKg: 60, reps: 10, setIndex: 1 }),
      ],
      bw,
    );

    expect(points[0].heaviestWorkingSetKg).toBe(60);
    expect(points[0].workingVolumeKg).toBe(600);
  });

  it('drops sets with no reps, which cannot contribute volume', () => {
    const points = progressionFor(
      [
        s('2025-01-01', { weightKg: 60, reps: null, setIndex: 0 }),
        s('2025-01-01', { weightKg: 60, reps: 10, setIndex: 1 }),
      ],
      bw,
    );

    expect(points[0].workingVolumeKg).toBe(600);
  });

  it('produces no point for a session whose sets are all unusable', () => {
    const points = progressionFor(
      [
        s('2025-01-01', { weightKg: null, reps: null, setIndex: 0 }),
        s('2025-01-08', { weightKg: 60, reps: 10, setIndex: 0 }),
      ],
      bw,
    );

    expect(points.map((p) => p.date)).toEqual(['2025-01-08']);
  });

  // The reason this module knows about bodyweight at all: a pull-up series
  // must move with the user's weight rather than sit flat at zero.
  it('scores a pull-up series off bodyweight, and it moves as bodyweight does', () => {
    const pull = { exerciseName: 'Pull Up', bodyweightBased: true, weightKg: null, reps: 8 };
    const points = progressionFor(
      [s('2025-01-01', { ...pull, setIndex: 0 }), s('2025-01-15', { ...pull, setIndex: 0 })],
      bw,
    );

    expect(points[0].heaviestWorkingSetKg).toBe(80);
    expect(points[1].heaviestWorkingSetKg).toBe(78);
    expect(points[0].workingVolumeKg).toBe(80 * 8);
  });

  it('marks a session that beats everything before it, and not one that ties', () => {
    const points = progressionFor(
      [
        s('2025-01-01', { weightKg: 60, reps: 5, setIndex: 0 }),
        s('2025-01-08', { weightKg: 70, reps: 5, setIndex: 0 }),
        s('2025-01-15', { weightKg: 70, reps: 5, setIndex: 0 }),
      ],
      bw,
    );

    expect(points.map((p) => p.isRecord)).toEqual([true, true, false]);
  });

  it('orders points by date regardless of input order', () => {
    const points = progressionFor(
      [
        s('2025-01-15', { weightKg: 70, reps: 5, setIndex: 0 }),
        s('2025-01-01', { weightKg: 60, reps: 5, setIndex: 0 }),
      ],
      bw,
    );

    expect(points.map((p) => p.date)).toEqual(['2025-01-01', '2025-01-15']);
  });
});

describe('sessionEnergyKcal', () => {
  // Deliberately a band, not a point. MET values for resistance training are
  // wide, and a single number would read as a measurement.
  it('returns a band around the MET estimate', () => {
    const band = sessionEnergyKcal(80, 60);

    expect(band).not.toBeNull();
    expect(band!.lo).toBeLessThan(band!.mid);
    expect(band!.mid).toBeLessThan(band!.hi);
  });

  it('scales with bodyweight and with duration', () => {
    const light = sessionEnergyKcal(60, 60)!;
    const heavy = sessionEnergyKcal(90, 60)!;
    const longer = sessionEnergyKcal(60, 120)!;

    expect(heavy.mid).toBeGreaterThan(light.mid);
    expect(longer.mid).toBeCloseTo(light.mid * 2, 5);
  });

  // Same rule as estimateCostUsd returning null for an unpriced model rather
  // than pricing it from the wrong list: a missing input is stated, not
  // defaulted.
  it('returns null when an input is missing, rather than defaulting', () => {
    expect(sessionEnergyKcal(null, 60)).toBeNull();
    expect(sessionEnergyKcal(80, null)).toBeNull();
    expect(sessionEnergyKcal(80, 0)).toBeNull();
  });
});

describe('weeklyVolume', () => {
  const bw = new Map<string, number>([['2025-01-06', 80], ['2025-01-13', 80]]);

  it('sums working volume into weeks starting Monday', () => {
    const points = weeklyVolume(
      [
        { date: '2025-01-06', set: set({ weightKg: 50, reps: 10 }) },
        { date: '2025-01-13', set: set({ weightKg: 60, reps: 10 }) },
      ],
      bw,
    );

    expect(points).toEqual([
      { weekStart: '2025-01-06', volumeKg: 500 },
      { weekStart: '2025-01-13', volumeKg: 600 },
    ]);
  });

  it('applies the same exclusions as progression', () => {
    const points = weeklyVolume(
      [
        { date: '2025-01-06', set: set({ weightKg: 100, reps: 5, setType: 'warmup' }) },
        { date: '2025-01-06', set: set({ weightKg: null, reps: 5 }) },
        { date: '2025-01-06', set: set({ weightKg: 50, reps: 10 }) },
      ],
      bw,
    );

    expect(points).toEqual([{ weekStart: '2025-01-06', volumeKg: 500 }]);
  });
});
