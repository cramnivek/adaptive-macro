import { diffDays } from './dates.ts';
import type { DailyEstimate } from './expenditure.ts';
import type { ISODate } from './types.ts';

export interface TrendSummary {
  /** How many days of trend actually went into the fit. */
  windowDays: number;
  startKg: number;
  endKg: number;
  totalChangeKg: number;
  /** Ordinary-least-squares slope over the window, converted to kg/week. */
  rateKgPerWeek: number;
}

/**
 * Rate of weight change over the trailing window.
 *
 * Fits a straight line rather than differencing the endpoints: the trend series
 * is already smooth, but a regression still uses every day in the window, so a
 * single slightly-off endpoint cannot swing the headline number the way it
 * would with `end - start`.
 */
export const trendRate = (
  series: DailyEstimate[],
  lookbackDays = 14,
): TrendSummary | null => {
  if (series.length < 2) return null;

  const window = series.slice(-Math.max(2, lookbackDays));
  const first = window[0];
  const last = window[window.length - 1];

  const n = window.length;
  // x is days elapsed from the window's first day, so the slope comes out in
  // kg/day directly regardless of where the window sits on the calendar.
  const xs = window.map((point) => diffDays(first.date, point.date));
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = window.reduce((sum, p) => sum + p.trendWeightKg, 0) / n;

  let covariance = 0;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    covariance += dx * (window[i].trendWeightKg - meanY);
    variance += dx * dx;
  }

  const slopeKgPerDay = variance === 0 ? 0 : covariance / variance;

  return {
    windowDays: diffDays(first.date, last.date) + 1,
    startKg: first.trendWeightKg,
    endKg: last.trendWeightKg,
    totalChangeKg: last.trendWeightKg - first.trendWeightKg,
    rateKgPerWeek: slopeKgPerDay * 7,
  };
};

/**
 * Days until `targetKg` at the current rate, or null when the rate is flat or
 * pointing away from the target. Returning null rather than Infinity forces the
 * caller to render "no estimate" instead of a nonsense date.
 */
export const daysToTarget = (
  currentKg: number,
  targetKg: number,
  rateKgPerWeek: number,
): number | null => {
  const remaining = targetKg - currentKg;
  if (rateKgPerWeek === 0) return null;
  const days = (remaining / rateKgPerWeek) * 7;
  return days > 0 ? Math.ceil(days) : null;
};

export const projectedDate = (
  from: ISODate,
  currentKg: number,
  targetKg: number,
  rateKgPerWeek: number,
): ISODate | null => {
  const days = daysToTarget(currentKg, targetKg, rateKgPerWeek);
  if (days === null) return null;
  const ms = new Date(`${from}T00:00:00Z`).getTime() + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
};
