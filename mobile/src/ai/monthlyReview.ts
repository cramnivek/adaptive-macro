import { z } from 'zod';
import type {
  DailyEstimate,
  DailyObservation,
  DatedSet,
  Goal,
  ISODate,
  VolumeDiagnostics,
} from '@adaptive-macros/engine';
import { addDays, todayISO } from '@adaptive-macros/engine';
import { ALLOWANCE_USED_MESSAGE, SIGN_IN_AGAIN_MESSAGE, fetchGemini, isPersonalLimit } from '../api/gemini';
import type { AppPersonality, UnitSystem } from '../state/settings';

const MODEL = 'gemini-3.5-flash';
const TIMEOUT_MS = 30_000;

export const MonthlyReviewSchema = z.object({
  headline: z.string(),
  dataConfidence: z.enum(['high', 'moderate', 'low']),
  confidenceRationale: z.string(),
  adherenceScore: z.number().min(0).max(100),
  adherenceVerdict: z.string(),
  keyWins: z.array(z.string()).min(1).max(5),
  synthesis: z.string(),
  plainSummary: z.string().optional(),
  trainingInsight: z.string(),
  nutritionInsight: z.string(),
  monthAheadStrategy: z.string(),
  scienceExplanation: z.string().optional(),
  suggestedAdjustment: z.object({
    hasAdjustment: z.boolean(),
    type: z.enum(['calories', 'protein', 'volume', 'deload', 'none']),
    title: z.string(),
    deltaKcal: z.number().optional(),
    deltaSets: z.number().optional(),
    rationale: z.string(),
  }),
});

export type MonthlyReviewResult = z.infer<typeof MonthlyReviewSchema>;

export const MONTHLY_REVIEW_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'Punchy 5-10 word headline summarizing the 30-day month in friendly terms' },
    dataConfidence: { type: 'string', enum: ['high', 'moderate', 'low'] },
    confidenceRationale: { type: 'string', description: 'Plain English reason for this confidence level' },
    adherenceScore: { type: 'number', description: 'Overall monthly nutrition adherence score from 0 to 100' },
    adherenceVerdict: {
      type: 'string',
      description: 'Comprehensive analysis of how consistently the lifter adhered to weekly calorie and macro adjustments, and how that shaped their progress',
    },
    keyWins: {
      type: 'array',
      items: { type: 'string' },
      description: '2 to 5 monthly milestone wins celebrating weight goals, strength PRs, and habits',
    },
    synthesis: {
      type: 'string',
      description: 'Cohesive narrative connecting 4 weeks of training, weekly calorie adjustments, metabolic adaptation, and physique trends',
    },
    plainSummary: {
      type: 'string',
      description: 'Simple 2-3 sentence monthly summary for someone without a fitness background',
    },
    trainingInsight: {
      type: 'string',
      description: 'Mesocycle training analysis covering volume landmarks, progressive overload, and recovery',
    },
    nutritionInsight: {
      type: 'string',
      description: 'Actionable nutrition advice based on 4-week intake trends and metabolic response',
    },
    monthAheadStrategy: {
      type: 'string',
      description: 'Clear strategic game plan for the upcoming 30 days (phase continuation, diet break, volume ramp, etc.)',
    },
    scienceExplanation: {
      type: 'string',
      description: 'Deep dive into physiological concepts: metabolic adaptation, energy balance over time, mesocycle periodization',
    },
    suggestedAdjustment: {
      type: 'object',
      properties: {
        hasAdjustment: { type: 'boolean' },
        type: { type: 'string', enum: ['calories', 'protein', 'volume', 'deload', 'none'] },
        title: { type: 'string', description: 'Action title e.g. "+150 kcal/day" or "Deload Week"' },
        deltaKcal: { type: 'number', description: 'Recommended calorie delta (+/- kcal), if applicable' },
        deltaSets: { type: 'number', description: 'Recommended sets delta (+/- sets), if applicable' },
        rationale: { type: 'string', description: 'Clear rationale in plain English' },
      },
      required: ['hasAdjustment', 'type', 'title', 'rationale'],
    },
  },
  required: [
    'headline',
    'dataConfidence',
    'confidenceRationale',
    'adherenceScore',
    'adherenceVerdict',
    'keyWins',
    'synthesis',
    'trainingInsight',
    'nutritionInsight',
    'monthAheadStrategy',
    'suggestedAdjustment',
  ],
};

export interface WeeklyAdherenceBreakdown {
  weekNumber: number; // 1, 2, 3, 4
  period: { from: ISODate; to: ISODate };
  targetKcal: number;
  avgActualKcal: number;
  deltaKcal: number;
  adherencePct: number;
  status: 'on_target' | 'over' | 'under';
  loggedDays: number;
  avgWeightKg: number | null;
}

export interface MonthlyExtractedMetrics {
  period: { from: ISODate; to: ISODate };
  weeklyAdherence: WeeklyAdherenceBreakdown[];
  overallAdherence: {
    score: number;
    rating: 'Elite' | 'Consistent' | 'Variable' | 'Needs Focus';
    adherenceSummary: string;
  };
  weight: {
    startWeightKg: number | null;
    endWeightKg: number | null;
    deltaKg: number | null;
    percentBwChange: number | null;
    avgWeightKg: number | null;
    totalLoggedDays: number;
  };
  nutrition: {
    totalLoggedDays: number;
    avgCalories: number | null;
    targetCalories: number | null;
    avgExpenditure: number | null;
    expenditureChangeKcal: number | null; // end TDEE - start TDEE (metabolic adaptation)
    avgProteinG: number | null;
  };
  training: {
    totalSessions: number;
    avgSessionsPerWeek: number;
    totalWorkingSets: number;
    totalVolumeKg: number;
    progressions: { exercise: string; current: string; previous: string; delta: string }[];
  };
  confidence: 'high' | 'moderate' | 'low';
}

export interface MonthlyMetricsInput {
  series: DailyEstimate[];
  observations?: DailyObservation[];
  intake?: { date: ISODate; kcal: number; proteinG?: number }[];
  sets: DatedSet[];
  diagnostics?: VolumeDiagnostics | null;
  goal?: Goal;
  targetKcal?: number;
  targetProteinG?: number;
  units?: UnitSystem;
  endDate?: ISODate;
}

/**
 * Deterministically computes 30-day metrics, breaking down the 4 distinct weeks
 * to evaluate adherence to weekly calorie/macro targets and overall progress.
 */
export const extractMonthlyMetrics = (input: MonthlyMetricsInput): MonthlyExtractedMetrics => {
  const to = input.endDate ?? todayISO();
  const from = addDays(to, -27); // 4 full 7-day weeks = 28 days

  // Goal calorie adjustment delta
  const goalDirection = input.goal?.direction ?? 'maintain';
  const goalRateKg = input.goal?.rateKgPerWeek ?? 0;
  const goalAdjustmentKcal =
    goalDirection === 'lose'
      ? -Math.round((goalRateKg * 7700) / 7)
      : goalDirection === 'gain'
        ? Math.round((goalRateKg * 7700) / 7)
        : 0;

  // 1. Weekly Adherence across 4 consecutive 7-day blocks
  const weeklyAdherence: WeeklyAdherenceBreakdown[] = [];
  let totalAdherenceSum = 0;
  let weeksWithDataCount = 0;

  for (let w = 0; w < 4; w++) {
    const wFrom = addDays(from, w * 7);
    const wTo = addDays(wFrom, 6);

    const weekSeries = input.series.filter((s) => s.date >= wFrom && s.date <= wTo);
    const weekObs = (input.observations ?? []).filter((o) => o.date >= wFrom && o.date <= wTo);
    const weekIntake = (input.intake ?? []).filter((i) => i.date >= wFrom && i.date <= wTo && i.kcal > 0);

    const calorieValues =
      weekObs.length > 0 && weekObs.some((o) => (o.intakeKcal ?? 0) > 0)
        ? weekObs
            .map((o) => o.intakeKcal)
            .filter((c): c is number => c !== undefined && Number.isFinite(c) && c > 0)
        : weekIntake.map((i) => i.kcal);

    const weightValues =
      weekObs.length > 0 && weekObs.some((o) => o.weightKg != null)
        ? weekObs
            .map((o) => o.weightKg)
            .filter((wVal): wVal is number => wVal !== undefined && Number.isFinite(wVal))
        : weekSeries
            .map((s) => s.trendWeightKg)
            .filter((wVal): wVal is number => Number.isFinite(wVal));

    const avgWeightKg =
      weightValues.length > 0
        ? Math.round((weightValues.reduce((a, b) => a + b, 0) / weightValues.length) * 10) / 10
        : null;

    // Average weekly target: from expenditure + goal adjustment, or fallback to current targetKcal
    const avgExp =
      weekSeries.length > 0
        ? weekSeries.reduce((sum, s) => sum + s.expenditureKcal, 0) / weekSeries.length
        : null;

    const computedTarget =
      avgExp !== null ? Math.round(avgExp + goalAdjustmentKcal) : input.targetKcal ?? 2000;

    const avgActualKcal =
      calorieValues.length > 0
        ? Math.round(calorieValues.reduce((a, b) => a + b, 0) / calorieValues.length)
        : 0;

    const deltaKcal = avgActualKcal > 0 ? avgActualKcal - computedTarget : 0;

    // Adherence scoring: 100% within 5% leeway; linear falloff beyond
    let adherencePct = 0;
    let status: 'on_target' | 'over' | 'under' = 'on_target';

    if (avgActualKcal > 0) {
      const diffRatio = Math.abs(deltaKcal) / computedTarget;
      if (diffRatio <= 0.05) {
        adherencePct = 100;
        status = 'on_target';
      } else {
        adherencePct = Math.max(0, Math.round((1 - (diffRatio - 0.05) * 1.5) * 100));
        status = deltaKcal > 0 ? 'over' : 'under';
      }
      totalAdherenceSum += adherencePct;
      weeksWithDataCount++;
    }

    weeklyAdherence.push({
      weekNumber: w + 1,
      period: { from: wFrom, to: wTo },
      targetKcal: computedTarget,
      avgActualKcal,
      deltaKcal,
      adherencePct,
      status,
      loggedDays: calorieValues.length,
      avgWeightKg,
    });
  }

  const overallScore =
    weeksWithDataCount > 0 ? Math.round(totalAdherenceSum / weeksWithDataCount) : 0;

  const rating: 'Elite' | 'Consistent' | 'Variable' | 'Needs Focus' =
    overallScore >= 90
      ? 'Elite'
      : overallScore >= 78
        ? 'Consistent'
        : overallScore >= 60
          ? 'Variable'
          : 'Needs Focus';

  const adherenceSummary =
    weeksWithDataCount > 0
      ? `${rating} adherence (${overallScore}%) across ${weeksWithDataCount} tracked weeks`
      : 'Insufficient weekly logs to compute monthly adherence';

  // 2. 30-Day Bodyweight Trends
  const all30Obs = (input.observations ?? []).filter((o) => o.date >= from && o.date <= to);
  const all30Series = input.series.filter((s) => s.date >= from && s.date <= to);

  const all30Weights =
    all30Obs.length > 0 && all30Obs.some((o) => o.weightKg != null)
      ? all30Obs
          .map((o) => o.weightKg)
          .filter((wVal): wVal is number => wVal !== undefined && Number.isFinite(wVal))
      : all30Series
          .map((s) => s.trendWeightKg)
          .filter((wVal): wVal is number => Number.isFinite(wVal));

  const startWeightKg = all30Weights.length > 0 ? all30Weights[0] : null;
  const endWeightKg = all30Weights.length > 0 ? all30Weights[all30Weights.length - 1] : null;
  const deltaKg =
    startWeightKg !== null && endWeightKg !== null
      ? Math.round((endWeightKg - startWeightKg) * 10) / 10
      : null;
  const percentBwChange =
    deltaKg !== null && startWeightKg && startWeightKg > 0
      ? Math.round((deltaKg / startWeightKg) * 1000) / 10
      : null;
  const avgWeightKg =
    all30Weights.length > 0
      ? Math.round((all30Weights.reduce((a, b) => a + b, 0) / all30Weights.length) * 10) / 10
      : null;

  // 3. 30-Day Nutrition & Metabolic Adaptation
  const all30Intake = (input.intake ?? []).filter((i) => i.date >= from && i.date <= to && i.kcal > 0);
  const all30Calories =
    all30Obs.length > 0 && all30Obs.some((o) => (o.intakeKcal ?? 0) > 0)
      ? all30Obs
          .map((o) => o.intakeKcal)
          .filter((c): c is number => c !== undefined && Number.isFinite(c) && c > 0)
      : all30Intake.map((i) => i.kcal);

  const all30Protein = all30Intake
    .map((i) => i.proteinG)
    .filter((p): p is number => p !== undefined && Number.isFinite(p) && p > 0);

  const avgCalories =
    all30Calories.length > 0
      ? Math.round(all30Calories.reduce((a, b) => a + b, 0) / all30Calories.length)
      : null;

  const avgProteinG =
    all30Protein.length > 0
      ? Math.round(all30Protein.reduce((a, b) => a + b, 0) / all30Protein.length)
      : null;

  const startExp = all30Series.length > 0 ? all30Series[0].expenditureKcal : null;
  const endExp = all30Series.length > 0 ? all30Series[all30Series.length - 1].expenditureKcal : null;
  const avgExpenditure =
    all30Series.length > 0
      ? Math.round(all30Series.reduce((sum, s) => sum + s.expenditureKcal, 0) / all30Series.length)
      : null;

  const expenditureChangeKcal =
    startExp !== null && endExp !== null ? Math.round(endExp - startExp) : null;

  // 4. 30-Day Training & Progressive Overload
  const monthSets = input.sets.filter((s) => s.date >= from && s.date <= to);
  const priorSets = input.sets.filter(
    (s) => s.date >= addDays(from, -28) && s.date < from,
  );

  const sessionIds = new Set(monthSets.map((s) => (s.set as any).sessionId || s.date));
  const workingSets = monthSets.filter((s) => s.set.setType !== 'warmup');
  const totalVolumeKg = Math.round(
    workingSets.reduce((sum, s) => sum + (s.set.weightKg ?? 0) * (s.set.reps ?? 0), 0),
  );

  const currentBestByExercise: Record<string, { weight: number; reps: number }> = {};
  for (const s of workingSets) {
    if (s.set.weightKg !== null && s.set.weightKg > 0 && s.set.reps && s.set.reps > 0) {
      const prev = currentBestByExercise[s.set.exerciseName];
      if (!prev || s.set.weightKg > prev.weight || (s.set.weightKg === prev.weight && s.set.reps > prev.reps)) {
        currentBestByExercise[s.set.exerciseName] = { weight: s.set.weightKg, reps: s.set.reps };
      }
    }
  }

  const priorBestByExercise: Record<string, { weight: number; reps: number }> = {};
  for (const s of priorSets) {
    if (s.set.weightKg !== null && s.set.weightKg > 0 && s.set.reps && s.set.reps > 0) {
      const prev = priorBestByExercise[s.set.exerciseName];
      if (!prev || s.set.weightKg > prev.weight || (s.set.weightKg === prev.weight && s.set.reps > prev.reps)) {
        priorBestByExercise[s.set.exerciseName] = { weight: s.set.weightKg, reps: s.set.reps };
      }
    }
  }

  const progressions: { exercise: string; current: string; previous: string; delta: string }[] = [];
  const unit = input.units === 'imperial' ? 'lb' : 'kg';
  const weightFactor = input.units === 'imperial' ? 2.20462 : 1;

  for (const [name, curr] of Object.entries(currentBestByExercise)) {
    const prev = priorBestByExercise[name];
    if (prev) {
      const currDisp = Math.round(curr.weight * weightFactor * 10) / 10;
      const prevDisp = Math.round(prev.weight * weightFactor * 10) / 10;
      const weightDiff = Math.round((currDisp - prevDisp) * 10) / 10;
      const repsDiff = curr.reps - prev.reps;

      let deltaText = '';
      if (weightDiff > 0) deltaText = `+${weightDiff} ${unit}`;
      else if (weightDiff < 0) deltaText = `${weightDiff} ${unit}`;
      else if (repsDiff > 0) deltaText = `+${repsDiff} reps`;
      else if (repsDiff < 0) deltaText = `${repsDiff} reps`;
      else deltaText = 'Maintained';

      progressions.push({
        exercise: name,
        current: `${currDisp} ${unit} × ${curr.reps}`,
        previous: `${prevDisp} ${unit} × ${prev.reps}`,
        delta: deltaText,
      });
    }
  }

  // 5. Confidence
  let confidence: 'high' | 'moderate' | 'low' = 'low';
  if (all30Weights.length >= 14 && all30Calories.length >= 16) {
    confidence = 'high';
  } else if (all30Weights.length >= 7 || all30Calories.length >= 8) {
    confidence = 'moderate';
  }

  return {
    period: { from, to },
    weeklyAdherence,
    overallAdherence: {
      score: overallScore,
      rating,
      adherenceSummary,
    },
    weight: {
      startWeightKg,
      endWeightKg,
      deltaKg,
      percentBwChange,
      avgWeightKg,
      totalLoggedDays: all30Weights.length,
    },
    nutrition: {
      totalLoggedDays: all30Calories.length,
      avgCalories,
      targetCalories: input.targetKcal ?? null,
      avgExpenditure,
      expenditureChangeKcal,
      avgProteinG,
    },
    training: {
      totalSessions: sessionIds.size,
      avgSessionsPerWeek: Math.round((sessionIds.size / 4) * 10) / 10,
      totalWorkingSets: workingSets.length,
      totalVolumeKg,
      progressions: progressions.slice(0, 5),
    },
    confidence,
  };
};

export const buildMonthlyCoachingPrompt = (
  metrics: MonthlyExtractedMetrics,
  goal: Goal = { direction: 'maintain', rateKgPerWeek: 0 },
  personality: AppPersonality = 'ascend',
): string => {
  const personaBlock =
    personality === 'gymrat'
      ? `COACH PERSONA: GYMRAT MODE 🔥
You are a high-energy gym-bro coach speaking fluent gym culture & Gen Z fitness slang ("cooked", "we are so back", "locked in", "W", "gains", "beast mode").
- Deliver enthusiastic, hype-filled but direct monthly feedback on their 4-week mesocycle.
- Talk directly about their weekly calorie adherence ("you actually locked in on Week 2 but Week 3 was looking wild").
- Celebrate milestone PRs loudly.`
      : personality === 'classic'
        ? `COACH PERSONA: CLASSIC MODE
You are an objective, direct, and supportive personal coach.
- Tone: Professional, clear, concise, no excess slang, hype, or hyperbole.
- Deliver honest, constructive feedback on their adherence to weekly target adjustments.`
        : `COACH PERSONA: ASCEND MODE (DEFAULT)
You are a warm, encouraging personal fitness coach for everyday lifters.
- Tone: Friendly, motivating, empowering, and educational.
- Clearly explain how their adherence to weekly adjustments directly affected their weight trend and recovery.`;

  const weeklyAdherenceText = metrics.weeklyAdherence
    .map(
      (w) =>
        `  • Week ${w.weekNumber} (${w.period.from} to ${w.period.to}): Target ${w.targetKcal} kcal | Actual ${w.avgActualKcal} kcal (${w.deltaKcal >= 0 ? '+' : ''}${w.deltaKcal} kcal) | Adherence: ${w.adherencePct}% (${w.status}) | Logged: ${w.loggedDays}/7 days | Weight: ${w.avgWeightKg ?? '—'} kg`,
    )
    .join('\n');

  return `You are an expert personal coach for Ascend.
${personaBlock}

You are conducting a DEEP 30-DAY MONTHLY COACHING REVIEW.
The lifter wants a comprehensive retrospective taking more data into consideration, ESPECIALLY their adherence to weekly calorie & macro adjustments over the past 4 weeks.

=== 30-DAY GROUND TRUTH METRICS ===
Review Period: ${metrics.period.from} to ${metrics.period.to} (4 full weeks)
Goal: ${goal.direction.toUpperCase()} (${goal.rateKgPerWeek} kg/week target rate)
Data Confidence: ${metrics.confidence.toUpperCase()}

=== WEEKLY ADJUSTMENT ADHERENCE (CRITICAL) ===
Overall Adherence Score: ${metrics.overallAdherence.score}% (${metrics.overallAdherence.rating})
Summary: ${metrics.overallAdherence.adherenceSummary}
Weekly Breakdown:
${weeklyAdherenceText}

=== 30-DAY BODY COMPOSITION & METABOLISM ===
Start Weight: ${metrics.weight.startWeightKg ?? '—'} kg
End Weight: ${metrics.weight.endWeightKg ?? '—'} kg
Net Weight Change: ${metrics.weight.deltaKg !== null ? `${metrics.weight.deltaKg >= 0 ? '+' : ''}${metrics.weight.deltaKg} kg` : '—'} (${metrics.weight.percentBwChange ?? '—'}% BW)
Weigh-in Days: ${metrics.weight.totalLoggedDays}/28 days
Average Daily Intake: ${metrics.nutrition.avgCalories ?? '—'} kcal (Logged ${metrics.nutrition.totalLoggedDays}/28 days)
Average Daily Expenditure (TDEE): ${metrics.nutrition.avgExpenditure ?? '—'} kcal
Metabolic Adaptation / TDEE Shift: ${metrics.nutrition.expenditureChangeKcal !== null ? `${metrics.nutrition.expenditureChangeKcal >= 0 ? '+' : ''}${metrics.nutrition.expenditureChangeKcal} kcal/day` : '—'}

=== 30-DAY TRAINING & PROGRESSIVE OVERLOAD ===
Total Workouts: ${metrics.training.totalSessions} sessions (~${metrics.training.avgSessionsPerWeek} sessions/week)
Total Working Sets: ${metrics.training.totalWorkingSets} sets
Total Tonnage Moved: ${metrics.training.totalVolumeKg.toLocaleString()} kg
Key Strength Overload Progressions:
${metrics.training.progressions.length > 0 ? metrics.training.progressions.map((p) => `  • ${p.exercise}: ${p.previous} → ${p.current} (${p.delta})`).join('\n') : '  • No direct overload pairs across prior month'}

=== INSTRUCTIONS FOR YOUR ANALYSIS ===
1. Adherence Verdict: Explicitly evaluate their adherence to each of the 4 weekly adjustments. Did they respect the targets? Did over/under-eating in specific weeks cause stalls or surges in weight?
2. Synthesis: Explain the interplay between their weekly adherence, metabolic adaptation, and strength performance over the full 30 days.
3. Month-Ahead Strategy: Provide a concrete, strategic recommendation for the next 30 days (e.g., maintain the current deficit, schedule a 1-week diet break / maintenance phase, deload training volume, or push progressive overload).
4. Suggested Adjustment: Recommend an exact daily calorie or volume adjustment for the upcoming month block.
5. Plain Summary: A 2-3 sentence crystal-clear summary in your designated coach persona.`;
};

export const requestMonthlyReview = async (
  metrics: MonthlyExtractedMetrics,
  apiKey: string,
  goal: Goal = { direction: 'maintain', rateKgPerWeek: 0 },
  personality: AppPersonality = 'ascend',
  signal?: AbortSignal,
): Promise<MonthlyReviewResult> => {
  const prompt = buildMonthlyCoachingPrompt(metrics, goal, personality);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const abandon = () => controller.abort();
  signal?.addEventListener('abort', abandon);
  if (signal?.aborted) controller.abort();

  let payload: any;
  try {
    const { response, route, rejectedSession } = await fetchGemini(MODEL, apiKey, {
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: 'You are an elite, evidence-based sports scientist and personal fitness coach.' }],
        },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: MONTHLY_REVIEW_RESPONSE_SCHEMA,
          temperature: 0.35,
        },
      }),
    });

    if (rejectedSession) {
      throw new Error(SIGN_IN_AGAIN_MESSAGE);
    }
    if (isPersonalLimit(response, route)) {
      throw new Error(ALLOWANCE_USED_MESSAGE);
    }
    if (!response.ok) {
      throw new Error(`The monthly review service returned ${response.status}.`);
    }

    payload = await response.json();
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('The monthly review took too long. Try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abandon);
  }

  const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Could not parse response from monthly coach.');
  }

  try {
    const json = JSON.parse(rawText);
    return MonthlyReviewSchema.parse(json);
  } catch (parseErr) {
    throw new Error('The monthly coach returned an unexpected format.');
  }
};
