import { describe, expect, it, vi } from 'vitest';

vi.mock('../../social/client', () => ({ supabase: null }));
import {
  WeeklyReviewSchema,
  buildCoachingPrompt,
  extractWeeklyMetrics,
  requestWeeklyReview,
  type WeeklyExtractedMetrics,
} from '../weeklyReview';
import type { DailyEstimate, DailyObservation, DatedSet } from '@adaptive-macros/engine';

describe('weeklyReview metrics extractor and schema', () => {
  const baseDate = '2026-10-17';

  const mockSeries: DailyEstimate[] = [
    {
      date: '2026-10-11',
      trendWeightKg: 80.5,
      trendWeightSdKg: 0.1,
      expenditureKcal: 2600,
      expenditureSdKcal: 100,
      hasWeightObservation: true,
      hasIntakeObservation: true,
      weightOutlier: false,
    },
    {
      date: '2026-10-13',
      trendWeightKg: 80.3,
      trendWeightSdKg: 0.1,
      expenditureKcal: 2600,
      expenditureSdKcal: 100,
      hasWeightObservation: true,
      hasIntakeObservation: true,
      weightOutlier: false,
    },
    {
      date: '2026-10-15',
      trendWeightKg: 80.1,
      trendWeightSdKg: 0.1,
      expenditureKcal: 2600,
      expenditureSdKcal: 100,
      hasWeightObservation: true,
      hasIntakeObservation: true,
      weightOutlier: false,
    },
    {
      date: '2026-10-17',
      trendWeightKg: 79.9,
      trendWeightSdKg: 0.1,
      expenditureKcal: 2600,
      expenditureSdKcal: 100,
      hasWeightObservation: true,
      hasIntakeObservation: true,
      weightOutlier: false,
    },
  ];

  const mockObservations: DailyObservation[] = [
    { date: '2026-10-11', weightKg: 80.5, intakeKcal: 2200 },
    { date: '2026-10-13', weightKg: 80.2, intakeKcal: 2150 },
    { date: '2026-10-15', weightKg: 80.0, intakeKcal: 2100 },
    { date: '2026-10-17', weightKg: 79.8, intakeKcal: 2150 },
  ];

  const mockSets: DatedSet[] = [
    // Prior week sets (Bench Press 80kg x 6)
    {
      date: '2026-10-08',
      set: {
        id: 's1',
        sessionId: 'sess1',
        setIndex: 0,
        bodyweightBased: false,
        exerciseName: 'Barbell Bench Press',
        weightKg: 80,
        reps: 6,
        setType: 'normal',
        rpe: 8,
      },
    },
    // Current week sets (Bench Press 82.5kg x 6 - Overload!)
    {
      date: '2026-10-12',
      set: {
        id: 's2',
        sessionId: 'sess2',
        setIndex: 0,
        bodyweightBased: false,
        exerciseName: 'Barbell Bench Press',
        weightKg: 82.5,
        reps: 6,
        setType: 'normal',
        rpe: 8.5,
      },
    },
    // Current week session 2
    {
      date: '2026-10-15',
      set: {
        id: 's3',
        sessionId: 'sess3',
        setIndex: 0,
        bodyweightBased: false,
        exerciseName: 'Barbell Squat',
        weightKg: 110,
        reps: 5,
        setType: 'normal',
        rpe: 8,
      },
    },
  ];

  it('accurately extracts 7-day weight, calorie, and overload metrics', () => {
    const metrics = extractWeeklyMetrics({
      series: mockSeries,
      observations: mockObservations,
      sets: mockSets,
      goalDirection: 'lose',
      targetKcal: 2100,
      units: 'metric',
      endDate: baseDate,
    });

    expect(metrics.weight.loggedDays).toBe(4);
    expect(metrics.weight.startWeightKg).toBe(80.5);
    expect(metrics.weight.endWeightKg).toBe(79.8);
    expect(metrics.weight.deltaKg).toBe(-0.7);
    expect(metrics.confidence).toBe('high');

    expect(metrics.nutrition.loggedDays).toBe(4);
    expect(metrics.nutrition.avgCalories).toBe(2150);
    expect(metrics.nutrition.avgEnergyDeltaKcal).toBe(-450); // 2150 - 2600

    expect(metrics.training.sessionsCount).toBe(2);
    expect(metrics.training.totalWorkingSets).toBe(2);
    expect(metrics.training.progressions).toHaveLength(1);
    expect(metrics.training.progressions[0]).toEqual({
      exercise: 'Barbell Bench Press',
      current: '82.5 kg × 6',
      previous: '80 kg × 6',
      delta: '+2.5 kg',
    });
  });

  it('builds a clear sports-science prompt from extracted metrics', () => {
    const metrics = extractWeeklyMetrics({
      series: mockSeries,
      observations: mockObservations,
      sets: mockSets,
      goalDirection: 'lose',
      targetKcal: 2100,
      units: 'metric',
      endDate: baseDate,
    });

    const prompt = buildCoachingPrompt(metrics, 'lose');
    expect(prompt).toContain('- Goal: Fat Loss (Calorie Deficit)');
    expect(prompt).toContain('-0.7 kg');
    expect(prompt).toContain('Barbell Bench Press: 80 kg × 6 -> 82.5 kg × 6 (+2.5 kg)');
    expect(prompt).toContain('HIGH');
  });

  it('validates a conforming coaching review response schema', () => {
    const validJson = {
      headline: 'Bench press progressive overload achieved despite steady fat loss',
      dataConfidence: 'high',
      confidenceRationale: 'Weigh-ins and nutrition logs were consistent across 4 of 7 days.',
      keyWins: [
        'Added +2.5 kg to Barbell Bench Press while in a caloric deficit',
        'Maintained an average daily deficit of ~450 kcal',
        'Scale weight decreased by 0.7 kg (-0.9% bodyweight)',
      ],
      synthesis:
        'Your weight loss is tracking at a rapid pace while upper body strength is advancing. Recovery capacity is holding steady.',
      trainingInsight:
        'Chest pressing shows true progressive overload with controlled RPE. Continue with current working set ramp.',
      nutritionInsight:
        'Adherence was tight to target (2,150 kcal logged vs 2,100 kcal target). Deficit depth is safe.',
      suggestedAdjustment: {
        hasAdjustment: false,
        type: 'none',
        title: 'Maintain Current Targets',
        rationale: 'Fat loss rate and gym performance are perfectly aligned.',
      },
    };

    const parsed = WeeklyReviewSchema.parse(validJson);
    expect(parsed.headline).toBe(validJson.headline);
    expect(parsed.suggestedAdjustment.type).toBe('none');
  });

  it('requests and parses weekly review via Gemini response', async () => {
    const metrics: WeeklyExtractedMetrics = {
      period: { from: '2026-10-11', to: '2026-10-17' },
      weight: {
        loggedDays: 7,
        startWeightKg: 80,
        endWeightKg: 79.5,
        deltaKg: -0.5,
        percentBwChange: -0.6,
        avgWeightKg: 79.7,
      },
      nutrition: {
        loggedDays: 7,
        avgCalories: 2100,
        targetCalories: 2100,
        avgExpenditure: 2500,
        avgEnergyDeltaKcal: -400,
        avgProteinG: null,
        targetProteinG: 160,
      },
      training: {
        sessionsCount: 4,
        totalWorkingSets: 16,
        totalVolumeKg: 12000,
        progressions: [],
        underVolumeGroups: [],
        optimalVolumeGroups: ['Chest', 'Back'],
        overVolumeGroups: [],
      },
      confidence: 'high',
    };

    const mockPayload = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  headline: 'Consistent training and steady fat loss',
                  dataConfidence: 'high',
                  confidenceRationale: 'Full 7-day logging consistency.',
                  keyWins: ['4 sessions completed', '100% adherence to calorie target'],
                  synthesis: 'Steady 0.5 kg drop with strong energy throughout the week.',
                  trainingInsight: 'Volume landmarks in MAV for Chest and Back.',
                  nutritionInsight: 'Clean 400 kcal deficit.',
                  suggestedAdjustment: {
                    hasAdjustment: false,
                    type: 'none',
                    title: 'Keep Targets Stable',
                    rationale: 'No adjustment needed.',
                  },
                }),
              },
            ],
          },
        },
      ],
    };

    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => mockPayload,
    }));

    const result = await requestWeeklyReview(metrics, 'test-key', 'lose');
    expect(result.headline).toBe('Consistent training and steady fat loss');
    expect(result.dataConfidence).toBe('high');
    expect(result.keyWins).toHaveLength(2);
  });

  it('aggregates daily protein intake and target protein in nutrition metrics', () => {
    const metrics = extractWeeklyMetrics({
      series: mockSeries,
      observations: mockObservations,
      intake: [
        { date: '2026-10-11', kcal: 2200, proteinG: 160 },
        { date: '2026-10-13', kcal: 2150, proteinG: 155 },
        { date: '2026-10-15', kcal: 2100, proteinG: 165 },
        { date: '2026-10-17', kcal: 2150, proteinG: 160 },
      ],
      sets: mockSets,
      goalDirection: 'lose',
      targetKcal: 2100,
      targetProteinG: 160,
      units: 'metric',
      endDate: baseDate,
    });

    expect(metrics.nutrition.avgProteinG).toBe(160);
    expect(metrics.nutrition.targetProteinG).toBe(160);
  });

  it('customizes coaching prompt based on user personality', () => {
    const dummyMetrics: WeeklyExtractedMetrics = {
      period: { from: '2026-10-11', to: '2026-10-17' },
      weight: { loggedDays: 7, startWeightKg: 80, endWeightKg: 79.5, deltaKg: -0.5, percentBwChange: -0.6, avgWeightKg: 79.8 },
      nutrition: { loggedDays: 7, avgCalories: 2200, targetCalories: 2200, avgExpenditure: 2600, avgEnergyDeltaKcal: -400, avgProteinG: 160, targetProteinG: 160 },
      training: { sessionsCount: 4, totalWorkingSets: 16, totalVolumeKg: 10000, progressions: [], underVolumeGroups: [], optimalVolumeGroups: [], overVolumeGroups: [] },
      confidence: 'high',
    };

    const gymratPrompt = buildCoachingPrompt(dummyMetrics, 'lose', 'gymrat');
    expect(gymratPrompt).toContain('GYMRAT MODE');
    expect(gymratPrompt).toContain('cooked');

    const classicPrompt = buildCoachingPrompt(dummyMetrics, 'lose', 'classic');
    expect(classicPrompt).toContain('CLASSIC MODE');
    expect(classicPrompt).toContain('objective, direct');

    const ascendPrompt = buildCoachingPrompt(dummyMetrics, 'lose', 'ascend');
    expect(ascendPrompt).toContain('ASCEND MODE');
    expect(ascendPrompt).toContain('warm, encouraging');
  });
});
