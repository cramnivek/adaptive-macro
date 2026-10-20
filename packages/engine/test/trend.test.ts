import { describe, expect, it } from 'vitest';
import { addDays } from '../src/dates';
import type { DailyEstimate } from '../src/expenditure';
import { STEADY_LIMIT_KG, daysToTarget, projectedDate, rateVerdict, trendRate } from '../src/trend';

const series = (weights: number[]): DailyEstimate[] =>
  weights.map((kg, i) => ({
    date: addDays('2026-01-01', i),
    trendWeightKg: kg,
    trendWeightSdKg: 0.2,
    expenditureKcal: 2500,
    expenditureSdKcal: 60,
    hasWeightObservation: true,
    hasIntakeObservation: true,
    weightOutlier: false,
  }));

describe('trendRate', () => {
  it('recovers a known slope', () => {
    // 0.1 kg lost per day = 0.7 kg/week.
    const points = series(Array.from({ length: 14 }, (_, i) => 90 - i * 0.1));
    const rate = trendRate(points, 14);
    expect(rate!.rateKgPerWeek).toBeCloseTo(-0.7, 6);
    expect(rate!.windowDays).toBe(14);
    expect(rate!.totalChangeKg).toBeCloseTo(-1.3, 6);
  });

  it('reports zero for a flat trend', () => {
    expect(trendRate(series(new Array(14).fill(80)))!.rateKgPerWeek).toBeCloseTo(0, 10);
  });

  it('only looks at the trailing window', () => {
    // Fast loss for 30 days, then flat for 14. A 14-day window sees only flat.
    const points = series([
      ...Array.from({ length: 30 }, (_, i) => 100 - i * 0.2),
      ...new Array(14).fill(94),
    ]);
    expect(trendRate(points, 14)!.rateKgPerWeek).toBeCloseTo(0, 6);
    expect(trendRate(points, 44)!.rateKgPerWeek).toBeLessThan(-0.5);
  });

  it('needs at least two points', () => {
    expect(trendRate(series([80]))).toBeNull();
  });
});

describe('daysToTarget', () => {
  it('projects forward at the current rate', () => {
    expect(daysToTarget(90, 85, -0.5)).toBe(70);
  });

  it('returns null when moving away from the target', () => {
    expect(daysToTarget(90, 85, 0.5)).toBeNull();
    expect(daysToTarget(90, 85, 0)).toBeNull();
  });

  it('projects a calendar date', () => {
    expect(projectedDate('2026-01-01', 90, 89, -0.5)).toBe('2026-01-15');
    expect(projectedDate('2026-01-01', 90, 89, 0.5)).toBeNull();
  });
});

describe('rateVerdict', () => {
  const readings = (kgs: (number | null)[]) =>
    kgs.flatMap((kg, i) => (kg === null ? [] : [{ date: addDays('2026-10-01', i), kg }]));

  // The series the weight tab was checked with: about 0.55 kg a week down,
  // with ordinary day-to-day swings and a two-day gap.
  const real = [76.0, 76.4, 75.6, 75.9, 76.2, 75.3, 75.8, 75.5, null, null, 74.9, 75.3, 75.0, 74.6, 75.2, 74.8, 74.4, 75.0, 74.5, 74.3];

  it('calls a steady loss that the swings cannot explain', () => {
    expect(rateVerdict(readings(real))).toBe('losing');
    expect(rateVerdict(readings(real.map((kg) => (kg === null ? null : 150 - kg))))).toBe('gaining');
  });

  it('will not call a drift that the swings could explain', () => {
    // 0.2 kg lower across the fortnight, under swings of half a kilo.
    expect(rateVerdict(readings([75.5, 75.0, 75.6, 74.9, 75.4, 75.1, 75.6, 74.8, 75.3, 75.2, 74.9, 75.5, 75.0, 75.1]))).toBe('unclear');
  });

  it('says steady when even the far end of the range is small', () => {
    expect(rateVerdict(readings([80.0, 80.1, 79.9, 80.0, 80.1, 80.0, 79.9, 80.0, 80.1, 80.0, 79.9, 80.0, 80.1, 80.0]))).toBe('steady');
    expect(STEADY_LIMIT_KG).toBe(0.5);
  });

  it('only looks at the last fortnight', () => {
    // A big early drop, then flat: the window sees only the flat part.
    const early = Array.from({ length: 10 }, (_, i) => 90 - i);
    const flat = new Array(14).fill(80).map((kg, i) => kg + (i % 2 ? 0.05 : -0.05));
    expect(rateVerdict(readings([...early, ...flat]))).toBe('steady');
  });

  it('gives no verdict on too few weigh-ins', () => {
    expect(rateVerdict(readings([80, 79, 78, 77]))).toBeNull();
    expect(rateVerdict([])).toBeNull();
  });
});
