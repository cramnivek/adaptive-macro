import type { DailyEstimate } from '@adaptive-macros/engine';
import { describe, expect, it } from 'vitest';
import { intakeSummary, periodCoverage, trendChange } from '../trendsPeriod';

const day = (date: string, trendWeightKg: number) => ({ date, trendWeightKg }) as DailyEstimate;

describe('periodCoverage', () => {
  it('reports the whole window once logging began before it', () => {
    expect(periodCoverage(7, '2026-10-20', '2026-10-01')).toEqual({ windowDays: 7, dataDays: 7, from: '2026-10-14' });
  });

  it('reports only the days since logging began when that is shorter', () => {
    expect(periodCoverage(365, '2026-10-20', '2026-10-01')).toEqual({ windowDays: 365, dataDays: 20, from: '2026-10-01' });
  });

  it('has no data days before anything is logged', () => {
    expect(periodCoverage(30, '2026-10-20', null).dataDays).toBe(0);
  });
});

describe('trendChange', () => {
  const series = [day('2026-10-01', 76.1), day('2026-10-10', 75.9), day('2026-10-20', 75.2)];

  it('measures from the first estimate in the period to the latest', () => {
    const change = trendChange(series, '2026-10-05')!;
    expect(change.changeKg).toBeCloseTo(-0.7, 6);
    expect(change.days).toBe(10);
  });

  it('starts at the first estimate when the period begins before the data', () => {
    expect(trendChange(series, '2025-10-21')!.days).toBe(19);
  });

  it('is null with fewer than two estimates to compare', () => {
    expect(trendChange(series, '2026-10-15')).toBeNull();
  });
});

describe('intakeSummary', () => {
  const intake = [
    { date: '2026-10-14', kcal: 1800 },
    { date: '2026-10-15', kcal: 2100 },
    { date: '2026-10-16', kcal: 700 },
    { date: '2026-10-01', kcal: 1800 },
  ];

  it('averages counted days in range and counts those within 10% of target', () => {
    const summary = intakeSummary(intake, new Map([['2026-10-16', false]]), '2026-10-14', '2026-10-20', 1800);
    expect(summary).toEqual({ averageKcal: 1950, countedDays: 2, onTargetDays: 1 });
  });

  it('says nothing about target days without a target', () => {
    expect(intakeSummary(intake, new Map(), '2026-10-14', '2026-10-20', null).onTargetDays).toBeNull();
    expect(intakeSummary([], new Map(), '2026-10-14', '2026-10-20', 1800)).toEqual({
      averageKcal: null,
      countedDays: 0,
      onTargetDays: 0,
    });
  });
});
