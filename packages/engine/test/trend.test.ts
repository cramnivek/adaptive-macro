import { describe, expect, it } from 'vitest';
import { addDays } from '../src/dates';
import type { DailyEstimate } from '../src/expenditure';
import { daysToTarget, projectedDate, trendRate } from '../src/trend';

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
