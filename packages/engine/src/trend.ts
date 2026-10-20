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

export type RateVerdict =
  /** The trend fell by more than its own uncertainty can explain. */
  | 'losing'
  | 'gaining'
  /** Known well enough to rule out any change larger than `STEADY_LIMIT_KG`. */
  | 'steady'
  /** Neither: the change so far could still be noise. */
  | 'unclear';

/** A change over the window smaller than this counts as holding steady. */
export const STEADY_LIMIT_KG = 0.5;

/** Fewest weigh-ins in the window before the rate is judged at all. */
export const MIN_READINGS_FOR_VERDICT = 5;

/**
 * Whether the rate is real yet, which the bare number does not say: "-0.39
 * kg/wk" reads the same on day five as on day fifty.
 *
 * Fits a straight line through the weigh-ins themselves over the window and
 * judges its slope against how far the readings scatter around it: the
 * standard error of a regression slope. The smoothed trend is not used for
 * this, because neighbouring smoothed days move together and their
 * uncertainties cannot be added up as if they were independent; doing so
 * called a clear 1.7 kg loss over 19 days "too early to tell".
 *
 * Two standard errors either way. A change across the window beyond that is
 * called; when even the far end of that range is under `STEADY_LIMIT_KG`, the
 * weight is holding steady. Water and gut contents swing for a few days at a
 * time, so readings are not fully independent; fewer than
 * `MIN_READINGS_FOR_VERDICT` gives no verdict at all.
 */
export const rateVerdict = (
  readings: { date: ISODate; kg: number }[],
  lookbackDays = 14,
): RateVerdict | null => {
  if (readings.length === 0) return null;
  const last = readings[readings.length - 1].date;
  const window = readings.filter((r) => {
    const age = diffDays(r.date, last);
    return age >= 0 && age < lookbackDays;
  });
  if (window.length < MIN_READINGS_FOR_VERDICT) return null;

  const xs = window.map((r) => diffDays(window[0].date, r.date));
  const n = window.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = window.reduce((sum, r) => sum + r.kg, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - meanX) ** 2;
    sxy += (xs[i] - meanX) * (window[i].kg - meanY);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  let residuals = 0;
  for (let i = 0; i < n; i++) residuals += (window[i].kg - (meanY + slope * (xs[i] - meanX))) ** 2;
  const slopeSe = Math.sqrt(residuals / (n - 2) / sxx);

  // In kg across the span the readings cover, which is what the steady limit
  // is stated in.
  const span = xs[n - 1] - xs[0];
  const change = slope * span;
  const changeSe = slopeSe * span;
  if (Math.abs(change) >= 2 * changeSe) return change < 0 ? 'losing' : 'gaining';
  if (Math.abs(change) + 2 * changeSe <= STEADY_LIMIT_KG) return 'steady';
  return 'unclear';
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
