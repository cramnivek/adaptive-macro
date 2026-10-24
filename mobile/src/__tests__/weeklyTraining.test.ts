import type { DatedSet, ISODate, SetType } from '@adaptive-macros/engine';
import { describe, expect, it } from 'vitest';
import { weeklyTotals, weeklyTotalsForPeriod } from '../weeklyTraining';
import type { SessionTimes } from '../weeklyTraining';

// 2026-10-12 is a Monday, so the week it ends is the one that began on it.
const TODAY: ISODate = '2026-10-12';

const set = (
  date: ISODate,
  weightKg: number | null,
  reps: number,
  setType: SetType = 'normal',
): DatedSet => ({
  date,
  set: {
    id: `${date}-${weightKg}-${reps}-${setType}`,
    sessionId: date,
    exerciseName: 'Squat',
    setIndex: 0,
    weightKg,
    reps,
    setType,
    rpe: null,
    bodyweightBased: false,
  },
});

const session = (date: ISODate, minutes: number): SessionTimes => {
  const start = new Date(`${date}T10:00:00Z`);
  return {
    id: date,
    date,
    startedAt: start.toISOString(),
    finishedAt: new Date(start.getTime() + minutes * 60000).toISOString(),
  };
};

describe('weeklyTotals', () => {
  it('returns twelve weeks, oldest first, the last one containing today', () => {
    const weeks = weeklyTotals([], [], '2026-10-15');
    expect(weeks).toHaveLength(12);
    expect(weeks[11]?.weekStart).toBe('2026-10-12');
    expect(weeks[0]?.weekStart).toBe('2026-07-27');
    const starts = weeks.map((w) => w.weekStart);
    expect([...starts].sort()).toEqual(starts);
  });

  it('keeps a week with nothing in it, as zeros', () => {
    const weeks = weeklyTotals([session('2026-10-13', 30)], [set('2026-10-13', 100, 5)], '2026-10-19');
    expect(weeks[9]).toEqual({ weekStart: '2026-10-05', minutes: 0, volumeKg: 0, sets: 0 });
    expect(weeks[10]?.sets).toBe(1);
  });

  it('counts a Sunday in the week that began the Monday before', () => {
    const weeks = weeklyTotals([session('2026-10-11', 40)], [set('2026-10-11', 50, 10)], TODAY);
    expect(weeks[10]).toEqual({ weekStart: '2026-10-05', minutes: 40, volumeKg: 500, sets: 1 });
    expect(weeks[11]).toEqual({ weekStart: '2026-10-12', minutes: 0, volumeKg: 0, sets: 0 });
  });

  it('leaves warm-ups out of both sets and volume', () => {
    const weeks = weeklyTotals(
      [],
      [set('2026-10-12', 20, 10, 'warmup'), set('2026-10-12', 100, 5)],
      TODAY,
    );
    expect(weeks[11]?.sets).toBe(1);
    expect(weeks[11]?.volumeKg).toBe(500);
  });

  it('counts bodyweight sets but adds no volume for them', () => {
    const weeks = weeklyTotals([], [set('2026-10-12', null, 12), set('2026-10-12', 10, 10)], TODAY);
    expect(weeks[11]?.sets).toBe(2);
    expect(weeks[11]?.volumeKg).toBe(100);
  });

  it('counts a set with no recorded reps but adds no volume for it', () => {
    const timed = set('2026-10-12', 20, 1);
    timed.set.reps = null;
    const weeks = weeklyTotals([], [timed], TODAY);
    expect(weeks[11]?.sets).toBe(1);
    expect(weeks[11]?.volumeKg).toBe(0);
  });

  it('sums minutes per week with a one-minute floor per session', () => {
    const quick = session('2026-10-13', 0);
    const weeks = weeklyTotals(
      [session('2026-10-12', 45), session('2026-10-14', 30), quick],
      [],
      '2026-10-18',
    );
    // 45 + 30 + the floor of 1 for the session that took no time at all.
    expect(weeks[11]?.minutes).toBe(76);
  });

  it('ignores data older than the window', () => {
    const weeks = weeklyTotals([session('2026-07-26', 60)], [set('2026-07-26', 100, 5)], TODAY);
    expect(weeks.every((w) => w.minutes === 0 && w.volumeKg === 0 && w.sets === 0)).toBe(true);
  });
});

describe('weeklyTotalsForPeriod', () => {
  it('uses one check-in-aligned bin for a complete seven-day window', () => {
    const weeks = weeklyTotalsForPeriod(
      [session('2026-10-06', 40)],
      [set('2026-10-07', 100, 5)],
      '2026-10-05',
      '2026-10-11',
    );

    expect(weeks).toEqual([{ weekStart: '2026-10-05', minutes: 40, volumeKg: 500, sets: 1 }]);
  });

  it('uses one bin when a short period fits inside a partial check-in week', () => {
    const weeks = weeklyTotalsForPeriod([], [set('2026-10-08', 60, 5)], '2026-10-07', '2026-10-11');

    expect(weeks).toEqual([{ weekStart: '2026-10-05', minutes: 0, volumeKg: 300, sets: 1 }]);
  });

  it('uses only the five aligned weeks that intersect a thirty-day window', () => {
    const weeks = weeklyTotalsForPeriod([], [], '2026-09-25', '2026-10-24');

    expect(weeks).toHaveLength(5);
    expect(weeks[0]?.weekStart).toBe('2026-09-21');
    expect(weeks[4]?.weekStart).toBe('2026-10-19');
  });

  it('excludes sessions and sets outside the selected dates', () => {
    const weeks = weeklyTotalsForPeriod(
      [session('2026-09-24', 20), session('2026-09-25', 30), session('2026-10-24', 40), session('2026-10-25', 50)],
      [set('2026-09-24', 100, 1), set('2026-09-25', 100, 2), set('2026-10-24', 100, 3), set('2026-10-25', 100, 4)],
      '2026-09-25',
      '2026-10-24',
    );

    expect(weeks.reduce((sum, week) => sum + week.minutes, 0)).toBe(70);
    expect(weeks.reduce((sum, week) => sum + week.sets, 0)).toBe(2);
    expect(weeks.reduce((sum, week) => sum + week.volumeKg, 0)).toBe(500);
  });
});
