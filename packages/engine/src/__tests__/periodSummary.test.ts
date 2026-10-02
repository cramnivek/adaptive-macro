import { describe, expect, it } from 'vitest';
import { summarisePeriod } from '../workouts.ts';
import type { DatedSet, SetType } from '../workouts.ts';

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

describe('summarisePeriod', () => {
  it('counts sessions by distinct date, not by set', () => {
    const summary = summarisePeriod(
      [
        set('2026-01-05', 'Squat', 100, 5),
        set('2026-01-05', 'Squat', 100, 5),
        set('2026-01-07', 'Squat', 100, 5),
      ],
      NO_BODYWEIGHT,
      '2026-01-01',
      '2026-01-31',
    );
    expect(summary.sessions).toBe(2);
    expect(summary.workingSets).toBe(3);
  });

  it('sums volume as load times reps', () => {
    const summary = summarisePeriod(
      [set('2026-01-05', 'Squat', 100, 5), set('2026-01-05', 'Bench', 60, 10)],
      NO_BODYWEIGHT,
      '2026-01-01',
      '2026-01-31',
    );
    expect(summary.volumeKg).toBe(100 * 5 + 60 * 10);
  });

  it('excludes warmups from every figure', () => {
    const summary = summarisePeriod(
      [set('2026-01-05', 'Squat', 100, 5), set('2026-01-05', 'Squat', 40, 10, 'warmup')],
      NO_BODYWEIGHT,
      '2026-01-01',
      '2026-01-31',
    );
    expect(summary.workingSets).toBe(1);
    expect(summary.volumeKg).toBe(500);
  });

  it('counts bodyweight work at what it actually moved', () => {
    const summary = summarisePeriod(
      [set('2026-01-05', 'Pull Up', null, 10, 'normal', true)],
      new Map([['2026-01-05', 80]]),
      '2026-01-01',
      '2026-01-31',
    );
    expect(summary.volumeKg).toBe(800);
  });

  it('skips a bodyweight set with no bodyweight to score it against', () => {
    const summary = summarisePeriod(
      [set('2026-01-05', 'Pull Up', null, 10, 'normal', true)],
      NO_BODYWEIGHT,
      '2026-01-01',
      '2026-01-31',
    );
    expect(summary.workingSets).toBe(0);
    expect(summary.sessions).toBe(0);
  });

  it('ignores sets outside the range at both ends, and includes both ends', () => {
    const history = [
      set('2026-01-04', 'Squat', 100, 5),
      set('2026-01-05', 'Squat', 100, 5),
      set('2026-01-11', 'Squat', 100, 5),
      set('2026-01-12', 'Squat', 100, 5),
    ];
    const summary = summarisePeriod(history, NO_BODYWEIGHT, '2026-01-05', '2026-01-11');
    expect(summary.sessions).toBe(2);
  });

  it('judges a record against all of history, not just the period', () => {
    const history = [
      // A heavier day before the period means the period's day is no record.
      set('2026-01-01', 'Squat', 140, 5),
      set('2026-01-20', 'Squat', 100, 5),
    ];
    const summary = summarisePeriod(history, NO_BODYWEIGHT, '2026-01-15', '2026-01-31');
    expect(summary.records).toBe(0);
  });

  it('counts a record that does land inside the period', () => {
    const history = [
      set('2026-01-01', 'Squat', 100, 5),
      set('2026-01-20', 'Squat', 140, 5),
    ];
    const summary = summarisePeriod(history, NO_BODYWEIGHT, '2026-01-15', '2026-01-31');
    expect(summary.records).toBe(1);
  });

  it('counts records per exercise rather than per day', () => {
    const history = [
      set('2026-01-01', 'Squat', 100, 5),
      set('2026-01-01', 'Bench', 60, 5),
      set('2026-01-20', 'Squat', 140, 5),
      set('2026-01-20', 'Bench', 80, 5),
    ];
    const summary = summarisePeriod(history, NO_BODYWEIGHT, '2026-01-15', '2026-01-31');
    expect(summary.records).toBe(2);
  });

  it('lists each exercise once, in the order it was first trained', () => {
    const summary = summarisePeriod(
      [
        set('2026-01-05', 'Squat', 100, 5),
        set('2026-01-05', 'Bench', 60, 5),
        set('2026-01-06', 'Squat', 100, 5),
      ],
      NO_BODYWEIGHT,
      '2026-01-01',
      '2026-01-31',
    );
    expect(summary.exercises).toEqual(['Squat', 'Bench']);
  });

  it('returns an empty summary for a period with nothing in it', () => {
    const summary = summarisePeriod(
      [set('2026-01-05', 'Squat', 100, 5)],
      NO_BODYWEIGHT,
      '2026-02-01',
      '2026-02-28',
    );
    expect(summary).toEqual({
      sessions: 0,
      workingSets: 0,
      volumeKg: 0,
      records: 0,
      exercises: [],
    });
  });

  it('does not count a set with zero reps as training that happened', () => {
    const summary = summarisePeriod(
      [set('2026-01-05', 'Squat', 100, 0)],
      NO_BODYWEIGHT,
      '2026-01-01',
      '2026-01-31',
    );
    expect(summary.sessions).toBe(0);
    expect(summary.volumeKg).toBe(0);
  });
});
