import { describe, expect, it } from 'vitest';
import { milestonesOn } from '../workouts.ts';
import type { DatedSet, MilestoneLadders, SetType } from '../workouts.ts';

const set = (
  date: string,
  exerciseName: string,
  weightKg: number | null,
  reps: number | null,
  setType: SetType = 'normal',
  bodyweightBased = false,
): DatedSet => ({
  date,
  set: {
    id: `${date}-${exerciseName}-${weightKg}-${reps}-${setType}`,
    sessionId: date,
    exerciseName,
    setIndex: 0,
    weightKg,
    reps,
    setType,
    rpe: null,
    bodyweightBased,
  },
});

const NO_BODYWEIGHT = new Map<string, number>();

const LADDERS: MilestoneLadders = {
  loadKg: [60, 80, 100, 120],
  volumeKg: [10_000, 50_000],
  sessions: [2, 10],
};

describe('milestonesOn — load', () => {
  it('fires the first time a lift passes a round number', () => {
    const found = milestonesOn(
      [set('2026-01-01', 'Squat', 95, 5), set('2026-01-08', 'Squat', 100, 5)],
      NO_BODYWEIGHT,
      '2026-01-08',
      LADDERS,
    );
    expect(found).toContainEqual({ kind: 'load', value: 100, exercise: 'Squat' });
  });

  it('does not fire again for a weight already passed', () => {
    const found = milestonesOn(
      [set('2026-01-01', 'Squat', 100, 5), set('2026-01-08', 'Squat', 100, 5)],
      NO_BODYWEIGHT,
      '2026-01-08',
      LADDERS,
    );
    expect(found.filter((m) => m.kind === 'load')).toEqual([]);
  });

  it('reports the highest rung when a jump clears several', () => {
    const found = milestonesOn(
      [set('2026-01-01', 'Squat', 55, 5), set('2026-01-08', 'Squat', 105, 5)],
      NO_BODYWEIGHT,
      '2026-01-08',
      LADDERS,
    );
    const loads = found.filter((m) => m.kind === 'load');
    expect(loads).toEqual([{ kind: 'load', value: 100, exercise: 'Squat' }]);
  });

  it('judges each lift on its own history', () => {
    const found = milestonesOn(
      [
        set('2026-01-01', 'Squat', 120, 5),
        set('2026-01-08', 'Squat', 120, 5),
        set('2026-01-08', 'Bench', 80, 5),
      ],
      NO_BODYWEIGHT,
      '2026-01-08',
      LADDERS,
    );
    expect(found.filter((m) => m.kind === 'load')).toEqual([
      { kind: 'load', value: 80, exercise: 'Bench' },
    ]);
  });

  it('ignores warmups, which are not what the lift went up to', () => {
    const found = milestonesOn(
      [set('2026-01-08', 'Squat', 100, 5, 'warmup')],
      NO_BODYWEIGHT,
      '2026-01-08',
      LADDERS,
    );
    expect(found.filter((m) => m.kind === 'load')).toEqual([]);
  });

  it('counts bodyweight work at what it actually moved', () => {
    const found = milestonesOn(
      [set('2026-01-08', 'Pull Up', 20, 5, 'normal', true)],
      new Map([['2026-01-08', 85]]),
      '2026-01-08',
      LADDERS,
    );
    expect(found).toContainEqual({ kind: 'load', value: 100, exercise: 'Pull Up' });
  });

  it('does not count a set of zero reps as having lifted the weight', () => {
    const found = milestonesOn(
      [set('2026-01-08', 'Squat', 100, 0)],
      NO_BODYWEIGHT,
      '2026-01-08',
      LADDERS,
    );
    expect(found.filter((m) => m.kind === 'load')).toEqual([]);
  });
});

describe('milestonesOn — volume and sessions', () => {
  it('fires when lifetime volume crosses a rung', () => {
    const found = milestonesOn(
      [set('2026-01-01', 'Squat', 100, 60), set('2026-01-08', 'Squat', 100, 50)],
      NO_BODYWEIGHT,
      '2026-01-08',
      LADDERS,
    );
    // 6,000 kg before; 11,000 after.
    expect(found).toContainEqual({ kind: 'volume', value: 10_000 });
  });

  it('does not fire for volume already passed on an earlier day', () => {
    const found = milestonesOn(
      [set('2026-01-01', 'Squat', 100, 120), set('2026-01-08', 'Squat', 100, 5)],
      NO_BODYWEIGHT,
      '2026-01-08',
      LADDERS,
    );
    expect(found.filter((m) => m.kind === 'volume')).toEqual([]);
  });

  it('fires on the session count, which is distinct days not sets', () => {
    const found = milestonesOn(
      [
        set('2026-01-01', 'Squat', 60, 5),
        set('2026-01-08', 'Squat', 60, 5),
        set('2026-01-08', 'Bench', 60, 5),
      ],
      NO_BODYWEIGHT,
      '2026-01-08',
      LADDERS,
    );
    expect(found).toContainEqual({ kind: 'sessions', value: 2 });
  });
});

describe('milestonesOn — choosing between them', () => {
  it('puts the lift first, because that is the one you would mention', () => {
    const found = milestonesOn(
      [set('2026-01-01', 'Squat', 55, 5), set('2026-01-08', 'Squat', 100, 120)],
      NO_BODYWEIGHT,
      '2026-01-08',
      LADDERS,
    );
    expect(found.length).toBeGreaterThan(1);
    expect(found[0]?.kind).toBe('load');
  });

  it('finds nothing on an ordinary day, which is most days', () => {
    // Third session at a weight already reached: the session rung was crossed
    // on day two, and nothing else moved.
    const found = milestonesOn(
      [
        set('2026-01-01', 'Squat', 100, 5),
        set('2026-01-08', 'Squat', 100, 5),
        set('2026-01-15', 'Squat', 100, 5),
      ],
      NO_BODYWEIGHT,
      '2026-01-15',
      LADDERS,
    );
    expect(found).toEqual([]);
  });

  it('finds nothing on a day with no training at all', () => {
    expect(
      milestonesOn([set('2026-01-01', 'Squat', 100, 5)], NO_BODYWEIGHT, '2026-02-01', LADDERS),
    ).toEqual([]);
  });
});
