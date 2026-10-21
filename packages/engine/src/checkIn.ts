import { addDays, diffDays, parseISODate } from './dates.ts';
import type { DailyEstimate } from './expenditure.ts';
import { calorieTarget, type TargetOptions } from './targets.ts';
import type { DailyObservation, Goal, ISODate } from './types.ts';

/**
 * The weekly check-in: what last week's data did to the target.
 *
 * The target moves a little every day as the expenditure estimate learns, and
 * on its own that reads as the app changing its mind for no reason. Once a
 * week this puts the movement next to its cause: how much was logged, how
 * the weight trend moved, and what that made of the estimate.
 */

export interface WeeklyCheckIn {
  /** The Monday and Sunday of the week being reviewed. */
  weekStart: ISODate;
  weekEnd: ISODate;
  /** Days whose intake the estimate counted: logged, and not marked incomplete. */
  daysCounted: number;
  averageIntakeKcal: number | null;
  weighIns: number;
  /** Trend weight at the end of the week minus at its start. Null with no weigh-in to anchor it. */
  trendChangeKg: number | null;
  /** The estimate as it stood going into the week, from the forward filter. */
  expenditureThenKcal: number;
  /** The estimate now — the one today's target is built on. */
  expenditureNowKcal: number;
  targetThenKcal: number;
  targetNowKcal: number;
}

/**
 * Last week, as seen from any day of this one. Monday to Sunday unless the
 * person ends their week on another day: `weekEndsOn` is that weekday, 0 for
 * Sunday through 6 for Saturday, so a Friday check-in reviews Saturday to
 * Friday.
 */
export const checkInWeekFor = (today: ISODate, weekEndsOn = 0): { start: ISODate; end: ISODate } => {
  // getUTCDay: 0 is Sunday. Days since this week's first day.
  const firstDay = (weekEndsOn + 1) % 7;
  const sinceStart = (parseISODate(today).getUTCDay() - firstDay + 7) % 7;
  const thisStart = addDays(today, -sinceStart);
  return { start: addDays(thisStart, -7), end: addDays(thisStart, -1) };
};

/** The last entry on or before `date`, from a list in date order. */
const onOrBefore = (days: DailyEstimate[], date: ISODate): DailyEstimate | undefined => {
  let found: DailyEstimate | undefined;
  for (const day of days) {
    if (diffDays(day.date, date) < 0) break;
    found = day;
  }
  return found;
};

export interface CheckInInput {
  today: ISODate;
  observations: DailyObservation[];
  /** Smoothed, for the weight trend: hindsight makes a past trend more accurate. */
  series: DailyEstimate[];
  /**
   * Forward-filtered, for the expenditure "then": the smoothed history has been
   * revised with what came later, so it is not what the app knew at the time.
   */
  filtered: DailyEstimate[];
  latest: DailyEstimate | null;
  goal: Goal;
  options: TargetOptions;
  /** The weekday the person's week ends on, as in checkInWeekFor. Sunday when absent. */
  weekEndsOn?: number;
}

/**
 * Null until there is a week to talk about: no estimate yet, or one that only
 * began after last week ended.
 *
 * Both targets use today's goal, so a goal changed mid-week does not show up
 * as a target change the data caused. The difference is the data's alone.
 */
export const weeklyCheckIn = (input: CheckInInput): WeeklyCheckIn | null => {
  const { start, end } = checkInWeekFor(input.today, input.weekEndsOn);
  if (input.latest === null || input.filtered.length === 0) return null;
  if (diffDays(input.filtered[0].date, end) < 0) return null;

  const inWeek = input.observations.filter(
    (o) => diffDays(start, o.date) >= 0 && diffDays(o.date, end) >= 0,
  );
  const intakes = inWeek.flatMap((o) => (typeof o.intakeKcal === 'number' ? [o.intakeKcal] : []));
  const weighIns = inWeek.filter((o) => typeof o.weightKg === 'number').length;

  // Going into the week: the day before it began, or the first estimate if
  // the history only started part-way through.
  const then = onOrBefore(input.filtered, addDays(start, -1)) ?? input.filtered[0];

  const trendStart = onOrBefore(input.series, addDays(start, -1)) ?? input.series[0];
  const trendEnd = onOrBefore(input.series, end);
  const trendChangeKg =
    weighIns > 0 && trendStart && trendEnd && trendStart !== trendEnd
      ? trendEnd.trendWeightKg - trendStart.trendWeightKg
      : null;

  return {
    weekStart: start,
    weekEnd: end,
    daysCounted: intakes.length,
    averageIntakeKcal: intakes.length ? intakes.reduce((a, b) => a + b, 0) / intakes.length : null,
    weighIns,
    trendChangeKg,
    expenditureThenKcal: then.expenditureKcal,
    expenditureNowKcal: input.latest.expenditureKcal,
    targetThenKcal: calorieTarget(then.expenditureKcal, input.goal, input.options).kcal,
    targetNowKcal: calorieTarget(input.latest.expenditureKcal, input.goal, input.options).kcal,
  };
};
