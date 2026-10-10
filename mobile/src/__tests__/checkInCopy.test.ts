import type { WeeklyCheckIn } from '@adaptive-macros/engine';
import { describe, expect, it } from 'vitest';
import { checkInCopy } from '../checkInCopy';

const week = (patch: Partial<WeeklyCheckIn> = {}): WeeklyCheckIn => ({
  weekStart: '2026-10-05',
  weekEnd: '2026-10-11',
  daysCounted: 7,
  averageIntakeKcal: 2012.4,
  weighIns: 6,
  trendChangeKg: -0.42,
  expenditureThenKcal: 2480,
  expenditureNowKcal: 2540,
  targetThenKcal: 1930,
  targetNowKcal: 1990,
  ...patch,
});

const LOSE = { direction: 'lose' as const, rateKgPerWeek: 0.5 };

describe('checkInCopy', () => {
  it('leads with the target and gives the estimate as the reason', () => {
    const copy = checkInCopy(week(), LOSE, 'metric');
    expect(copy.headline).toBe('Your target rises by 60 to 1,990 kcal.');
    expect(copy.reason).toBe('Your expenditure estimate moved from 2,480 to 2,540 kcal.');
  });

  it('says a drop is a drop', () => {
    const copy = checkInCopy(week({ targetNowKcal: 1850, expenditureNowKcal: 2400 }), LOSE, 'metric');
    expect(copy.headline).toBe('Your target drops by 80 to 1,850 kcal.');
  });

  it('calls a change under 25 kcal holding, not news', () => {
    const copy = checkInCopy(week({ targetNowKcal: 1942, expenditureNowKcal: 2492 }), LOSE, 'metric');
    expect(copy.headline).toBe('Your target holds at 1,942 kcal.');
    expect(copy.reason).toBe('Your expenditure estimate held at about 2,492 kcal.');
  });

  it('reports logging and the weight trend against the goal', () => {
    const copy = checkInCopy(week(), LOSE, 'metric');
    expect(copy.logged).toBe('7 of 7 days counted, averaging 2,012 kcal.');
    expect(copy.weight).toBe('Weight trend −0.4 kg (goal −0.5 kg a week).');
    expect(copy.week).toBe('5 Oct – 11 Oct');
  });

  it('speaks pounds to someone in pounds', () => {
    const copy = checkInCopy(week({ trendChangeKg: 0.3 }), { direction: 'gain', rateKgPerWeek: 0.25 }, 'imperial');
    expect(copy.weight).toBe('Weight trend +0.7 lb (goal +0.6 lb a week).');
  });

  it('describes a maintenance goal as holding steady', () => {
    expect(checkInCopy(week(), { direction: 'maintain', rateKgPerWeek: 0 }, 'metric').weight).toContain(
      'goal: hold steady',
    );
  });

  it('says so plainly when there was nothing to go on', () => {
    const copy = checkInCopy(week({ daysCounted: 0, averageIntakeKcal: null, trendChangeKg: null, weighIns: 0 }), LOSE, 'metric');
    expect(copy.logged).toBe('No days counted towards the estimate.');
    expect(copy.weight).toBe('No weigh-ins, so no weight trend for the week.');
  });

  it('asks for more data only when the week was thin', () => {
    expect(checkInCopy(week(), LOSE, 'metric').nudge).toBeNull();
    expect(checkInCopy(week({ daysCounted: 4 }), LOSE, 'metric').nudge).toContain('five days');
    expect(checkInCopy(week({ weighIns: 2 }), LOSE, 'metric').nudge).toContain('three');
  });
});
