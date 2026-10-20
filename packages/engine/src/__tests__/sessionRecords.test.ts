import { describe, expect, it } from 'vitest';
import { recordsInSession } from '../workouts.ts';
import type { DatedSet, SetType } from '../workouts.ts';

const set = (
  date: string,
  setIndex: number,
  exerciseName: string,
  weightKg: number | null,
  reps: number | null,
  setType: SetType = 'normal',
  bodyweightBased = false,
): DatedSet => ({
  date,
  set: {
    id: `${date}-${exerciseName}-${setIndex}`,
    sessionId: date,
    exerciseName,
    setIndex,
    weightKg,
    reps,
    setType,
    rpe: null,
    bodyweightBased,
  },
});

const NO_BODYWEIGHT = new Map<string, number>();

describe('recordsInSession', () => {
  it('marks the set that beat the previous best estimated 1RM', () => {
    const records = recordsInSession(
      [set('2026-01-01', 0, 'Bench', 100, 5), set('2026-01-08', 0, 'Bench', 100, 4), set('2026-01-08', 1, 'Bench', 100, 6)],
      NO_BODYWEIGHT,
      '2026-01-08',
    );
    expect(records).toEqual([
      { exerciseName: 'Bench', setId: '2026-01-08-Bench-1', e1rm: 120, previousE1rm: expect.closeTo(116.67, 2) },
    ]);
  });

  it('marks one set per lift even when several beat the old best', () => {
    const records = recordsInSession(
      [
        set('2026-01-01', 0, 'Squat', 100, 5),
        set('2026-01-08', 0, 'Squat', 105, 5),
        set('2026-01-08', 1, 'Squat', 110, 5),
        set('2026-01-08', 2, 'Squat', 107.5, 5),
      ],
      NO_BODYWEIGHT,
      '2026-01-08',
    );
    expect(records.map((record) => record.setId)).toEqual(['2026-01-08-Squat-1']);
  });

  it('gives a tie to the set that got there first', () => {
    const records = recordsInSession(
      [set('2026-01-01', 0, 'Row', 80, 5), set('2026-01-08', 0, 'Row', 90, 5), set('2026-01-08', 1, 'Row', 90, 5)],
      NO_BODYWEIGHT,
      '2026-01-08',
    );
    expect(records.map((record) => record.setId)).toEqual(['2026-01-08-Row-0']);
  });

  it('marks nothing on a lift done for the first time', () => {
    expect(recordsInSession([set('2026-01-08', 0, 'Bench', 120, 3)], NO_BODYWEIGHT, '2026-01-08')).toEqual([]);
  });

  it('marks nothing when the session only matched the old best', () => {
    expect(
      recordsInSession(
        [set('2026-01-01', 0, 'Bench', 100, 5), set('2026-01-08', 0, 'Bench', 100, 5)],
        NO_BODYWEIGHT,
        '2026-01-08',
      ),
    ).toEqual([]);
  });

  it('ignores warm-ups and later sessions', () => {
    const records = recordsInSession(
      [
        set('2026-01-01', 0, 'Bench', 100, 5),
        set('2026-01-08', 0, 'Bench', 140, 5, 'warmup'),
        set('2026-01-08', 1, 'Bench', 102.5, 5),
        set('2026-01-15', 0, 'Bench', 150, 5),
      ],
      NO_BODYWEIGHT,
      '2026-01-08',
    );
    expect(records.map((record) => record.setId)).toEqual(['2026-01-08-Bench-1']);
  });

  it('scores a bodyweight lift with the body weight of its day', () => {
    const bodyweight = new Map([
      ['2026-01-01', 80],
      ['2026-01-08', 80],
    ]);
    const records = recordsInSession(
      [set('2026-01-01', 0, 'Dip', 10, 5, 'normal', true), set('2026-01-08', 0, 'Dip', 15, 5, 'normal', true)],
      bodyweight,
      '2026-01-08',
    );
    expect(records.map((record) => record.setId)).toEqual(['2026-01-08-Dip-0']);
  });

  it('returns nothing for a session it cannot find', () => {
    expect(recordsInSession([set('2026-01-01', 0, 'Bench', 100, 5)], NO_BODYWEIGHT, 'nope')).toEqual([]);
  });
});
