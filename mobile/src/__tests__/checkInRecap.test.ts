import { describe, expect, it } from 'vitest';
import type { WeeklyExtractedMetrics } from '../ai/weeklyReview';
import type { MonthlyExtractedMetrics } from '../ai/monthlyReview';
import { buildCheckInRecap } from '../checkInRecap';

const weekly: WeeklyExtractedMetrics = {
  period: { from: '2026-10-12', to: '2026-10-18' },
  weight: {
    loggedDays: 5,
    startWeightKg: 80.2,
    endWeightKg: 80.4,
    deltaKg: 0.2,
    percentBwChange: 0.2,
    avgWeightKg: 80.3,
  },
  nutrition: {
    loggedDays: 6,
    avgCalories: 2140.4,
    targetCalories: 2200,
    avgExpenditure: 2500,
    avgEnergyDeltaKcal: -360,
    avgProteinG: 140,
    targetProteinG: 150,
  },
  training: {
    sessionsCount: 3,
    totalWorkingSets: 42,
    totalVolumeKg: 12000,
    progressions: [],
    underVolumeGroups: [],
    optimalVolumeGroups: [],
    overVolumeGroups: [],
  },
  confidence: 'moderate',
  activity: { avgSteps: null, stepDays: 0, priorAvgSteps: null },
  body: null,
  previous: null,
};

const monthly: MonthlyExtractedMetrics = {
  period: { from: '2026-09-21', to: '2026-10-18' },
  weeks: 4,
  weeklyAdherence: [],
  overallAdherence: { score: 80, rating: 'Consistent', adherenceSummary: 'summary' },
  weight: {
    startWeightKg: null,
    endWeightKg: null,
    deltaKg: null,
    percentBwChange: null,
    avgWeightKg: null,
    totalLoggedDays: 0,
  },
  nutrition: {
    totalLoggedDays: 0,
    avgCalories: null,
    targetCalories: 2200,
    avgExpenditure: null,
    expenditureChangeKcal: null,
    avgProteinG: null,
  },
  training: { totalSessions: 0, avgSessionsPerWeek: 0, totalWorkingSets: 0, totalVolumeKg: 0, progressions: [] },
  confidence: 'low',
};

describe('buildCheckInRecap', () => {
  it('uses weekly period, logged food, scale and training facts', () => {
    const recap = buildCheckInRecap(weekly, 'metric', 'Hold current targets');

    expect(recap.periodLabel).toBe('YOUR WEEK');
    expect(recap.chapters.map((chapter) => chapter.kind)).toEqual([
      'period', 'food', 'body', 'training', 'next',
    ]);
    expect(recap.chapters[1]).toMatchObject({ value: '2,140', label: 'AVG KCAL / LOGGED DAY' });
    expect(recap.chapters[1].detail).toContain('Food logged 6 of 7 days');
    expect(recap.chapters[2]).toMatchObject({ value: '80.3 kg', label: 'WEIGHT ESTIMATE' });
    expect(recap.chapters[2].detail).toContain('Estimated trend weight changed +0.2 kg');
    expect(recap.chapters[2].detail).not.toContain('fat');
    expect(recap.chapters[3]).toMatchObject({ value: '42', label: 'WORKING SETS' });
    expect(recap.chapters[3].detail).toContain('3 training sessions');
  });

  it.each([
    [4, 'YOUR MONTH'],
    [13, 'YOUR QUARTER'],
  ] as const)('labels a %s-week recap correctly', (weeks, label) => {
    const recap = buildCheckInRecap({ ...monthly, weeks }, 'metric', 'Review your plan');
    expect(recap.periodLabel).toBe(label);
    expect(recap.chapters[0].detail).toContain(`${weeks * 7} days`);
  });

  it('keeps missing food and weight as absent values', () => {
    const recap = buildCheckInRecap(monthly, 'metric', 'Review your nutrition insight');

    expect(recap.chapters[1]).toMatchObject({ value: '—', label: 'AVERAGE INTAKE' });
    expect(recap.chapters[1].detail).toContain('No food was logged');
    expect(recap.chapters[2]).toMatchObject({ value: '—', label: 'WEIGHT ESTIMATE' });
    expect(recap.chapters[2].detail).toContain('No weight estimate is available');
    expect(recap.chapters[3]).toMatchObject({ value: '0', label: 'WORKING SETS' });
    expect(recap.chapters[3].detail).toContain('No training sessions were logged');
  });

  it('formats the average scale weight in pounds when requested', () => {
    const recap = buildCheckInRecap(weekly, 'imperial', 'Hold current targets');
    expect(recap.chapters[2].value).toBe('177.0 lb');
    expect(recap.chapters[2].detail).toContain('+0.4 lb');
  });

  it('leads with recorded sessions and logging coverage, and uses the review next step', () => {
    const recap = buildCheckInRecap(weekly, 'metric', 'Hold current targets');

    expect(recap.chapters[0]).toMatchObject({ value: '3', label: 'WORKOUTS RECORDED' });
    expect(recap.chapters[0].detail).toContain('Mon, 12 Oct 2026 – Sun, 18 Oct 2026');
    expect(recap.chapters[0].detail).toContain('Food logged 6 of 7 days');
    expect(recap.chapters[3]).toMatchObject({ value: '42', label: 'WORKING SETS' });
    expect(recap.chapters[3].detail).toContain('3 training sessions');
    expect(recap.chapters[4]).toMatchObject({ value: 'Hold current targets', label: 'RECOMMENDED NEXT STEP' });
  });

  it('rounds calorie averages and treats non-finite values as missing', () => {
    const rounded = buildCheckInRecap(weekly, 'metric', 'Review your plan');
    const missing = buildCheckInRecap(
      { ...weekly, nutrition: { ...weekly.nutrition, avgCalories: Number.NaN } },
      'metric',
      'Review your plan',
    );

    expect(rounded.chapters[1].value).toBe(Math.round(weekly.nutrition.avgCalories!).toLocaleString());
    expect(missing.chapters[1]).toMatchObject({ value: '—', label: 'AVERAGE INTAKE' });
    expect(missing.chapters[1].detail).toContain('Food averages are unavailable');
  });

  it('uses only measured readings inside the period and ignores estimated metrics', () => {
    const recap = buildCheckInRecap(
      { ...weekly, weight: { ...weekly.weight, avgWeightKg: 91, deltaKg: 4 } },
      'metric',
      'Hold current targets',
      [
        { date: '2026-10-19', kg: 100 },
        { date: '2026-10-18', kg: 80.8 },
        { date: '2026-10-10', kg: 90 },
        { date: '2026-10-12', kg: 80 },
      ],
    );

    expect(recap.chapters[2]).toMatchObject({ value: '80.4 kg', label: 'AVERAGE WEIGH-IN' });
    expect(recap.chapters[2].detail).toContain('Scale weight changed +0.8 kg across 2 weigh-ins');
  });

  it('shows measured weight as missing when no period readings are provided', () => {
    const recap = buildCheckInRecap(weekly, 'metric', 'Hold current targets', []);

    expect(recap.chapters[2]).toMatchObject({ value: '—', label: 'AVERAGE WEIGH-IN' });
    expect(recap.chapters[2].detail).toContain('No weigh-ins were recorded');
  });

  it('formats the measured average and first-to-last change in pounds', () => {
    const recap = buildCheckInRecap(
      { ...weekly, weight: { ...weekly.weight, avgWeightKg: 70, deltaKg: -10 } },
      'imperial',
      'Hold current targets',
      [
        { date: '2026-10-12', kg: 80.2 },
        { date: '2026-10-18', kg: 80.4 },
      ],
    );

    expect(recap.chapters[2]).toMatchObject({ value: '177.0 lb', label: 'AVERAGE WEIGH-IN' });
    expect(recap.chapters[2].detail).toContain('+0.4 lb');
  });
});
