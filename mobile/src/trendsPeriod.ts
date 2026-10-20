import { addDays, diffDays, type DailyEstimate, type ISODate } from '@adaptive-macros/engine';

/**
 * The numbers on Trends' overview tiles, for the period selected above them.
 *
 * The tiles used to show the same current weight and the same calorie plan
 * whichever period was picked, so switching between a week, a month and a
 * year changed the workouts count and nothing else. These follow the period:
 * what the trend did over it, and what was eaten in it.
 */

/** A day within this share of the target counts as on target. */
export const ON_TARGET_SHARE = 0.1;

export interface PeriodCoverage {
  /** Days the selected view covers: 7, 30 or 365. */
  windowDays: number;
  /** Days of it since logging began. Less than `windowDays` early on. */
  dataDays: number;
  /** The first day the view actually shows. */
  from: ISODate;
}

/**
 * How much of the selected period has data behind it. With twenty days
 * logged, the month and the year views draw the same twenty days, and saying
 * so is better than leaving the two to look identical for no stated reason.
 */
export const periodCoverage = (
  windowDays: number,
  today: ISODate,
  firstLogged: ISODate | null,
): PeriodCoverage => {
  const windowFrom = addDays(today, -(windowDays - 1));
  if (firstLogged === null) return { windowDays, dataDays: 0, from: windowFrom };
  const from = firstLogged > windowFrom ? firstLogged : windowFrom;
  return { windowDays, dataDays: Math.max(0, diffDays(from, today) + 1), from };
};

export interface TrendChange {
  changeKg: number;
  /** Days between the two trend points it is measured across. */
  days: number;
}

/**
 * The trend's change across the period: from its first estimate on or after
 * `from` to the latest. Null with fewer than two estimates in range, where a
 * "change" would be one number compared with itself.
 */
export const trendChange = (series: readonly DailyEstimate[], from: ISODate): TrendChange | null => {
  const inRange = series.filter((d) => d.date >= from);
  if (inRange.length < 2) return null;
  const first = inRange[0];
  const last = inRange[inRange.length - 1];
  return { changeKg: last.trendWeightKg - first.trendWeightKg, days: diffDays(first.date, last.date) };
};

export interface IntakeSummary {
  /** Average over counted days, or null when none were. */
  averageKcal: number | null;
  countedDays: number;
  /** Counted days within ON_TARGET_SHARE of the target; null without a target. */
  onTargetDays: number | null;
}

/**
 * Intake over the period, from counted days only: a day marked as partly
 * logged would pull the average down by what was never written in.
 */
export const intakeSummary = (
  intake: readonly { date: ISODate; kcal: number }[],
  dayStatus: ReadonlyMap<ISODate, boolean>,
  from: ISODate,
  to: ISODate,
  targetKcal: number | null,
): IntakeSummary => {
  const counted = intake.filter(
    (row) => row.date >= from && row.date <= to && row.kcal > 0 && dayStatus.get(row.date) !== false,
  );
  if (counted.length === 0) return { averageKcal: null, countedDays: 0, onTargetDays: targetKcal ? 0 : null };
  const averageKcal = counted.reduce((sum, row) => sum + row.kcal, 0) / counted.length;
  const onTargetDays = targetKcal
    ? counted.filter((row) => Math.abs(row.kcal - targetKcal) <= targetKcal * ON_TARGET_SHARE).length
    : null;
  return { averageKcal, countedDays: counted.length, onTargetDays };
};
