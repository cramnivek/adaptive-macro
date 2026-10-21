import { describe, expect, it } from 'vitest';
import { checkInWeekFor, weeklyCheckIn } from '../checkIn.ts';
import { DEFAULT_MODEL_OPTIONS, estimateExpenditure } from '../expenditure.ts';
import { simulate } from '../simulate.ts';
import { DEFAULT_TARGET_OPTIONS } from '../targets.ts';
import type { DailyObservation, Goal } from '../types.ts';

const LOSE: Goal = { direction: 'lose', rateKgPerWeek: 0.5 };

const run = (observations: DailyObservation[], today: string) => {
  const result = estimateExpenditure(observations, {
    ...DEFAULT_MODEL_OPTIONS,
    kcalPerKgTissue: 7700,
    initialExpenditureKcal: 2200,
  });
  return weeklyCheckIn({
    today,
    observations,
    series: result.series,
    filtered: result.filtered,
    latest: result.latest,
    goal: LOSE,
    options: { ...DEFAULT_TARGET_OPTIONS, kcalPerKgTissue: 7700 },
  });
};

describe('checkInWeekFor', () => {
  it('is last Monday to Sunday from any day of this week', () => {
    // 2026-10-12 is a Monday, 2026-10-18 a Sunday.
    expect(checkInWeekFor('2026-10-12')).toEqual({ start: '2026-10-05', end: '2026-10-11' });
    expect(checkInWeekFor('2026-10-14')).toEqual({ start: '2026-10-05', end: '2026-10-11' });
    expect(checkInWeekFor('2026-10-18')).toEqual({ start: '2026-10-05', end: '2026-10-11' });
  });

  it('moves on when the next week starts', () => {
    expect(checkInWeekFor('2026-10-19')).toEqual({ start: '2026-10-12', end: '2026-10-18' });
  });

  it('can end the week on another day, for someone who checks in on a Friday', () => {
    // 5 is Friday. 2026-10-16 is a Friday, 2026-10-21 a Wednesday.
    expect(checkInWeekFor('2026-10-21', 5)).toEqual({ start: '2026-10-10', end: '2026-10-16' });
    expect(checkInWeekFor('2026-10-16', 5)).toEqual({ start: '2026-10-03', end: '2026-10-09' });
    expect(checkInWeekFor('2026-10-17', 5)).toEqual({ start: '2026-10-10', end: '2026-10-16' });
  });
});

describe('weeklyCheckIn', () => {
  // Six weeks from Monday 2026-08-31, eating 2000 against a true 2500.
  const sim = simulate({
    startDate: '2026-08-31',
    days: 42,
    startKg: 85,
    tdeeOn: () => 2500,
    intakeOn: () => 2000,
    kcalPerKgTissue: 7700,
    scaleNoiseSdKg: 0.5,
    seed: 3,
  });
  // The day after the history ends: Monday 2026-10-12, reviewing 5-11 Oct.
  const today = '2026-10-12';

  it('reviews last week only', () => {
    const checkIn = run(sim.observations, today)!;
    expect(checkIn.weekStart).toBe('2026-10-05');
    expect(checkIn.weekEnd).toBe('2026-10-11');
    expect(checkIn.daysCounted).toBe(7);
    expect(checkIn.weighIns).toBe(7);
    expect(checkIn.averageIntakeKcal).toBe(2000);
  });

  it('reports the trend moving the way a 500 kcal deficit moves it', () => {
    // 500 × 7 / 7700 = 0.45 kg a week.
    const checkIn = run(sim.observations, today)!;
    expect(checkIn.trendChangeKg).toBeLessThan(-0.25);
    expect(checkIn.trendChangeKg).toBeGreaterThan(-0.65);
  });

  it('builds both targets from the same goal, so the difference is the estimate’s alone', () => {
    const checkIn = run(sim.observations, today)!;
    // A 0.5 kg/week loss is 550 kcal a day under expenditure, both weeks.
    expect(checkIn.targetThenKcal).toBe(Math.round(checkIn.expenditureThenKcal - 550));
    expect(checkIn.targetNowKcal).toBe(Math.round(checkIn.expenditureNowKcal - 550));
  });

  it('takes "then" from what the filter knew at the time, not from hindsight', () => {
    const result = estimateExpenditure(sim.observations, {
      ...DEFAULT_MODEL_OPTIONS,
      kcalPerKgTissue: 7700,
      initialExpenditureKcal: 2200,
    });
    const filteredSunday = result.filtered.find((d) => d.date === '2026-10-04')!;
    expect(run(sim.observations, today)!.expenditureThenKcal).toBe(filteredSunday.expenditureKcal);
  });

  it('counts only days the estimate used, and averages those', () => {
    const fewer = sim.observations.map((o) =>
      o.date === '2026-10-07' || o.date === '2026-10-08' ? { date: o.date, weightKg: o.weightKg } : o,
    );
    const checkIn = run(fewer, today)!;
    expect(checkIn.daysCounted).toBe(5);
    expect(checkIn.averageIntakeKcal).toBe(2000);
  });

  it('leaves the trend change out of a week with no weigh-in', () => {
    const noScale = sim.observations.map((o) =>
      o.date >= '2026-10-05' ? { date: o.date, intakeKcal: o.intakeKcal } : o,
    );
    expect(run(noScale, today)!.trendChangeKg).toBeNull();
  });

  it('has nothing to say before any estimate exists, or when it began after last week', () => {
    expect(run([], today)).toBeNull();
    const lateStart = sim.observations.filter((o) => o.date >= '2026-10-12');
    expect(run(lateStart, '2026-10-14')).toBeNull();
  });
});
