import { describe, expect, it, vi } from 'vitest';

vi.mock('../../social/client', () => ({ supabase: null }));
import {
  MonthlyReviewSchema,
  buildMonthlyCoachingPrompt,
  extractMonthlyMetrics,
  type MonthlyExtractedMetrics,
} from '../monthlyReview';
import type { DailyEstimate, DailyObservation, DatedSet } from '@adaptive-macros/engine';
import { addDays } from '@adaptive-macros/engine';

describe('monthlyReview metrics extractor and schema', () => {
  const endDate = '2026-10-28';

  const mockSeries: DailyEstimate[] = [];
  const mockObservations: DailyObservation[] = [];

  // Generate 28 days of mock data across 4 weeks
  for (let i = 27; i >= 0; i--) {
    const d = new Date('2026-10-28T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().slice(0, 10);

    mockSeries.push({
      date: dateStr,
      trendWeightKg: 80 - (27 - i) * 0.05,
      trendWeightSdKg: 0.1,
      expenditureKcal: 2500 - (27 - i) * 2, // slight metabolic adaptation
      expenditureSdKcal: 100,
      hasWeightObservation: true,
      hasIntakeObservation: true,
      weightOutlier: false,
    });

    mockObservations.push({
      date: dateStr,
      weightKg: 80.2 - (27 - i) * 0.05,
      intakeKcal: 2100 + (i % 3) * 50,
    });
  }

  const mockSets: DatedSet[] = [
    {
      date: '2026-10-05',
      set: {
        id: 's1',
        sessionId: 'sess1',
        setIndex: 0,
        bodyweightBased: false,
        exerciseName: 'Barbell Squat',
        weightKg: 100,
        reps: 5,
        rpe: null,
        setType: 'normal',
      },
    },
    {
      date: '2026-10-25',
      set: {
        id: 's2',
        sessionId: 'sess2',
        setIndex: 0,
        bodyweightBased: false,
        exerciseName: 'Barbell Squat',
        weightKg: 105,
        reps: 5,
        rpe: null,
        setType: 'normal',
      },
    },
  ];

  it('correctly partitions 28 days into 4 distinct weekly adherence blocks', () => {
    const metrics: MonthlyExtractedMetrics = extractMonthlyMetrics({
      series: mockSeries,
      observations: mockObservations,
      sets: mockSets,
      goal: { direction: 'lose', rateKgPerWeek: 0.5 },
      targetKcal: 2000,
      units: 'metric',
      endDate,
    });

    expect(metrics.weeklyAdherence).toHaveLength(4);
    expect(metrics.weeklyAdherence[0].weekNumber).toBe(1);
    expect(metrics.weeklyAdherence[3].weekNumber).toBe(4);
    expect(metrics.weeklyAdherence[0].loggedDays).toBe(7);
    expect(metrics.weeklyAdherence[3].loggedDays).toBe(7);
    expect(metrics.overallAdherence.score).toBeGreaterThan(0);
    expect(metrics.weight.startWeightKg).toBeDefined();
    expect(metrics.weight.endWeightKg).toBeDefined();
    expect(metrics.weight.deltaKg).toBeLessThan(0); // lost weight
    expect(metrics.training.totalSessions).toBeGreaterThanOrEqual(2);
  });

  it('constructs a coaching prompt containing weekly adherence breakdown and 30-day metrics', () => {
    const metrics: MonthlyExtractedMetrics = extractMonthlyMetrics({
      series: mockSeries,
      observations: mockObservations,
      sets: mockSets,
      goal: { direction: 'lose', rateKgPerWeek: 0.5 },
      targetKcal: 2000,
      units: 'metric',
      endDate,
    });

    const prompt = buildMonthlyCoachingPrompt(
      metrics,
      { direction: 'lose', rateKgPerWeek: 0.5 },
      'gymrat',
    );

    expect(prompt).toContain('GYMRAT MODE');
    expect(prompt).toContain('WEEKLY ADJUSTMENT ADHERENCE');
    expect(prompt).toContain('Week 1');
    expect(prompt).toContain('Week 4');
    // The review covers four 7-day weeks, and the prompt now says so; it used
    // to tell the model "30-DAY" about 28 days of data.
    expect(prompt).toContain('28-DAY BODY COMPOSITION & METABOLISM');
  });

  it('runs the same review over a 13-week quarter, in its own words', () => {
    const metrics = extractMonthlyMetrics({
      series: mockSeries,
      observations: mockObservations,
      sets: mockSets,
      goal: { direction: 'lose', rateKgPerWeek: 0.5 },
      targetKcal: 2000,
      units: 'metric',
      endDate,
      weeks: 13,
    });
    expect(metrics.weeks).toBe(13);
    expect(metrics.weeklyAdherence).toHaveLength(13);
    expect(metrics.period.from).toBe(addDays(endDate, -90));

    const prompt = buildMonthlyCoachingPrompt(metrics, { direction: 'lose', rateKgPerWeek: 0.5 }, 'ascend');
    expect(prompt).toContain('91-DAY QUARTERLY COACHING REVIEW');
    expect(prompt).toContain('(13 full weeks)');
    expect(prompt).toContain('Week 13');
    expect(prompt).not.toContain('30-DAY');
  });

  it('validates a schema-compliant monthly review response', () => {
    const sample = {
      headline: 'Crushed the monthly cut with 94% adherence',
      dataConfidence: 'high',
      confidenceRationale: 'Logged 28/28 days of scale weight and calories',
      adherenceScore: 94,
      adherenceVerdict:
        'Outstanding adherence to all 4 weekly adjustments. You hit targets consistently.',
      keyWins: [
        'Dropped 1.4 kg of pure fat mass',
        'Squat increased +5 kg despite calorie deficit',
        'Maintained 94% average target adherence',
      ],
      synthesis:
        'Over the last 4 weeks, your disciplined compliance with weekly deficit targets kept weight dropping at a steady 0.35 kg/week pace.',
      plainSummary:
        'You had an incredible month! You stayed on track with your food almost every day and got stronger.',
      trainingInsight: 'Squat progressive overload was steady; volume recovered well.',
      nutritionInsight:
        'Protein was consistently optimal. Keep salt and potassium high for cellular hydration.',
      monthAheadStrategy:
        'Continue the current deficit for 2 more weeks, then schedule a 1-week diet break at maintenance.',
      scienceExplanation:
        'Metabolic adaptation dropped TDEE by ~50 kcal, which is normal adaptive thermogenesis.',
      suggestedAdjustment: {
        hasAdjustment: true,
        type: 'calories',
        title: '-75 kcal/day',
        deltaKcal: -75,
        rationale: 'Small adjustment to offset metabolic downshift and maintain fat loss velocity.',
      },
    };

    const parsed = MonthlyReviewSchema.parse(sample);
    expect(parsed.headline).toBe('Crushed the monthly cut with 94% adherence');
    expect(parsed.adherenceScore).toBe(94);
    expect(parsed.suggestedAdjustment.deltaKcal).toBe(-75);
  });
});
