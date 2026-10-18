import { z } from 'zod';
import type {
  DailyEstimate,
  DailyObservation,
  DatedSet,
  ISODate,
  VolumeDiagnostics,
} from '@adaptive-macros/engine';
import { addDays, todayISO } from '@adaptive-macros/engine';
import { ALLOWANCE_USED_MESSAGE, SIGN_IN_AGAIN_MESSAGE, fetchGemini, isPersonalLimit } from '../api/gemini';
import type { UnitSystem } from '../state/settings';

const MODEL = 'gemini-3.5-flash';
const TIMEOUT_MS = 25_000;

export const WeeklyReviewSchema = z.object({
  headline: z.string(),
  dataConfidence: z.enum(['high', 'moderate', 'low']),
  confidenceRationale: z.string(),
  keyWins: z.array(z.string()).min(1).max(4),
  synthesis: z.string(),
  plainSummary: z.string().optional(),
  trainingInsight: z.string(),
  nutritionInsight: z.string(),
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

export type WeeklyReviewResult = z.infer<typeof WeeklyReviewSchema>;

export const WEEKLY_REVIEW_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'Punchy 5-10 word headline summarizing the week in friendly terms' },
    dataConfidence: { type: 'string', enum: ['high', 'moderate', 'low'] },
    confidenceRationale: { type: 'string', description: 'Plain English reason for this confidence level' },
    keyWins: {
      type: 'array',
      items: { type: 'string' },
      description: '1 to 4 friendly bullet points celebrating achievements, PRs, or consistency',
    },
    synthesis: {
      type: 'string',
      description: 'Easy-to-understand narrative explaining how nutrition and workouts worked together',
    },
    plainSummary: {
      type: 'string',
      description: 'Simple 2-3 sentence summary written for someone with zero fitness or science background',
    },
    trainingInsight: {
      type: 'string',
      description: 'Actionable, easy-to-understand gym advice in plain English',
    },
    nutritionInsight: {
      type: 'string',
      description: 'Actionable, easy-to-understand eating & calorie advice in plain English',
    },
    scienceExplanation: {
      type: 'string',
      description: 'Detailed physiological explanation citing scientific concepts and researchers (Schoenfeld, Israetel, Helms) for users who want to know the deep science',
    },
    suggestedAdjustment: {
      type: 'object',
      properties: {
        hasAdjustment: { type: 'boolean' },
        type: { type: 'string', enum: ['calories', 'protein', 'volume', 'deload', 'none'] },
        title: { type: 'string', description: 'Short action title e.g. "+150 kcal/day"' },
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
    'keyWins',
    'synthesis',
    'trainingInsight',
    'nutritionInsight',
    'suggestedAdjustment',
  ],
};

export interface WeeklyMetricsInput {
  series: DailyEstimate[];
  observations?: DailyObservation[];
  intake?: { date: ISODate; kcal: number; proteinG?: number }[];
  sets: DatedSet[];
  diagnostics?: VolumeDiagnostics | null;
  goalDirection?: 'lose' | 'maintain' | 'gain';
  targetKcal?: number;
  targetProteinG?: number;
  units?: UnitSystem;
  endDate?: ISODate;
}

export interface WeeklyExtractedMetrics {
  period: { from: ISODate; to: ISODate };
  weight: {
    loggedDays: number;
    startWeightKg: number | null;
    endWeightKg: number | null;
    deltaKg: number | null;
    percentBwChange: number | null;
    avgWeightKg: number | null;
  };
  nutrition: {
    loggedDays: number;
    avgCalories: number | null;
    targetCalories: number | null;
    avgExpenditure: number | null;
    avgEnergyDeltaKcal: number | null;
    avgProteinG: number | null;
    targetProteinG: number | null;
  };
  training: {
    sessionsCount: number;
    totalWorkingSets: number;
    totalVolumeKg: number;
    progressions: { exercise: string; current: string; previous: string; delta: string }[];
    underVolumeGroups: string[];
    optimalVolumeGroups: string[];
    overVolumeGroups: string[];
  };
  confidence: 'high' | 'moderate' | 'low';
}

/**
 * Deterministically aggregates the past 7 days of training, weight, and nutrition ground truth.
 */
export const extractWeeklyMetrics = (input: WeeklyMetricsInput): WeeklyExtractedMetrics => {
  const to = input.endDate ?? todayISO();
  const from = addDays(to, -6);

  // 1. Weight & Nutrition over current 7 days
  const currentDays = input.series.filter((d) => d.date >= from && d.date <= to);
  const currentObs = (input.observations ?? []).filter((o) => o.date >= from && o.date <= to);

  const weightEntries =
    currentObs.length > 0 && currentObs.some((o) => o.weightKg != null)
      ? currentObs
          .map((o) => o.weightKg)
          .filter((w): w is number => w !== undefined && Number.isFinite(w))
      : currentDays
          .map((d) => d.trendWeightKg)
          .filter((w): w is number => Number.isFinite(w));

  const intakeEntries = (input.intake ?? []).filter((i) => i.date >= from && i.date <= to && i.kcal > 0);

  const calorieEntries =
    currentObs.length > 0 && currentObs.some((o) => (o.intakeKcal ?? 0) > 0)
      ? currentObs
          .map((o) => o.intakeKcal)
          .filter((c): c is number => c !== undefined && Number.isFinite(c) && c > 0)
      : intakeEntries.map((i) => i.kcal);

  const proteinEntries = intakeEntries
    .map((i) => i.proteinG)
    .filter((p): p is number => p !== undefined && Number.isFinite(p) && p > 0);

  const expenditureEntries = currentDays
    .map((d) => d.expenditureKcal)
    .filter((e): e is number => Number.isFinite(e));

  const startWeightKg = weightEntries.length > 0 ? weightEntries[0] : null;
  const endWeightKg = weightEntries.length > 0 ? weightEntries[weightEntries.length - 1] : null;
  const deltaKg =
    startWeightKg !== null && endWeightKg !== null ? Math.round((endWeightKg - startWeightKg) * 10) / 10 : null;
  const percentBwChange =
    deltaKg !== null && startWeightKg && startWeightKg > 0
      ? Math.round((deltaKg / startWeightKg) * 1000) / 10
      : null;
  const avgWeightKg =
    weightEntries.length > 0
      ? Math.round((weightEntries.reduce((a, b) => a + b, 0) / weightEntries.length) * 10) / 10
      : null;

  const avgCalories =
    calorieEntries.length > 0
      ? Math.round(calorieEntries.reduce((a, b) => a + b, 0) / calorieEntries.length)
      : null;
  const avgProteinG =
    proteinEntries.length > 0
      ? Math.round(proteinEntries.reduce((a, b) => a + b, 0) / proteinEntries.length)
      : null;
  const avgExpenditure =
    expenditureEntries.length > 0
      ? Math.round(expenditureEntries.reduce((a, b) => a + b, 0) / expenditureEntries.length)
      : null;
  const avgEnergyDeltaKcal =
    avgCalories !== null && avgExpenditure !== null ? avgCalories - avgExpenditure : null;

  // 2. Training over current 7 days vs prior 14 days
  const currentSets = input.sets.filter((s) => s.date >= from && s.date <= to);
  const priorSets = input.sets.filter((s) => s.date >= addDays(from, -14) && s.date < from);

  const currentSessionIds = new Set(
    currentSets.map((s) => (s.set as any).sessionId || s.date),
  );
  const workingSets = currentSets.filter((s) => s.set.setType !== 'warmup');
  const totalVolumeKg = Math.round(
    workingSets.reduce((sum, s) => sum + (s.set.weightKg ?? 0) * (s.set.reps ?? 0), 0),
  );

  // Progressive Overload Comparison
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

  // 3. Volume Landmarks
  const underVolumeGroups: string[] = [];
  const optimalVolumeGroups: string[] = [];
  const overVolumeGroups: string[] = [];

  if (input.diagnostics?.muscleVolumes) {
    for (const mv of input.diagnostics.muscleVolumes) {
      if (mv.effectiveWeeklySets < mv.mev) underVolumeGroups.push(mv.label);
      else if (mv.effectiveWeeklySets > mv.mrv) overVolumeGroups.push(mv.label);
      else optimalVolumeGroups.push(mv.label);
    }
  }

  // 4. Data Confidence
  let confidence: 'high' | 'moderate' | 'low' = 'low';
  if (weightEntries.length >= 4 && calorieEntries.length >= 4) {
    confidence = 'high';
  } else if (weightEntries.length >= 2 || calorieEntries.length >= 3) {
    confidence = 'moderate';
  }

  return {
    period: { from, to },
    weight: {
      loggedDays: weightEntries.length,
      startWeightKg,
      endWeightKg,
      deltaKg,
      percentBwChange,
      avgWeightKg,
    },
    nutrition: {
      loggedDays: calorieEntries.length,
      avgCalories,
      targetCalories: input.targetKcal ?? null,
      avgExpenditure,
      avgEnergyDeltaKcal,
      avgProteinG,
      targetProteinG: input.targetProteinG ?? null,
    },
    training: {
      sessionsCount: currentSessionIds.size,
      totalWorkingSets: workingSets.length,
      totalVolumeKg,
      progressions: progressions.slice(0, 5),
      underVolumeGroups,
      optimalVolumeGroups,
      overVolumeGroups,
    },
    confidence,
  };
};

export const buildCoachingPrompt = (
  metrics: WeeklyExtractedMetrics,
  goal: 'lose' | 'maintain' | 'gain' = 'maintain',
): string => {
  return `You are a warm, encouraging, expert personal coach for Ascend.
Explain the lifter's actual 7-day progress in friendly, everyday language. Assume they have NO background in sports science or anatomy.

TONE & USER-FRIENDLY GUIDELINES:
1. Speak like an encouraging personal trainer who makes fitness easy to understand.
2. DO NOT use confusing scientific jargon in the main fields (avoid terms like 'hypertrophic stimulus', 'hypocaloric deficit', 'systemic fatigue', 'volume landmarks', etc.). Instead use simple terms like 'building muscle', 'eating in a deficit to lose fat', 'feeling tired', 'doing enough sets to grow'.
3. Always explain the "why" simply (e.g. "Because you're eating less food right now, it's completely normal to feel like you have a bit less energy on your heaviest sets.").
4. In 'plainSummary', write 2-3 friendly sentences summarizing the week for a beginner.
5. In 'scienceExplanation', provide the deep-dive exercise physiology explanation with specific scientific references (e.g., Brad Schoenfeld on volume, Eric Helms on deficit nutrition, Mike Israetel on recovery thresholds) for users who tap "Learn the Science".

ATHLETE DATA (PAST 7 DAYS):
- Goal: ${goal === 'lose' ? 'Fat Loss (Calorie Deficit)' : goal === 'gain' ? 'Muscle Building (Calorie Surplus)' : 'Weight Maintenance'}
- Data Confidence: ${metrics.confidence.toUpperCase()} (Weight logged: ${metrics.weight.loggedDays}/7 days, Nutrition logged: ${metrics.nutrition.loggedDays}/7 days)

WEIGHT & ENERGY BALANCE:
- Scale Weight Delta: ${metrics.weight.deltaKg !== null ? `${metrics.weight.deltaKg > 0 ? `+${metrics.weight.deltaKg}` : metrics.weight.deltaKg} kg (${metrics.weight.percentBwChange}% bodyweight)` : 'Sparse weigh-ins'}
- Average Calories Logged: ${metrics.nutrition.avgCalories ?? 'Not logged'} kcal/day (Target: ${metrics.nutrition.targetCalories ?? 'N/A'} kcal/day)
- Estimated Expenditure: ${metrics.nutrition.avgExpenditure ?? 'N/A'} kcal/day
- Net Energy Balance: ${metrics.nutrition.avgEnergyDeltaKcal !== null ? `${metrics.nutrition.avgEnergyDeltaKcal > 0 ? `+${metrics.nutrition.avgEnergyDeltaKcal} surplus` : `${metrics.nutrition.avgEnergyDeltaKcal} deficit`} kcal/day` : 'Unknown'}

TRAINING PERFORMANCE:
- Completed Workouts: ${metrics.training.sessionsCount} sessions
- Working Sets: ${metrics.training.totalWorkingSets} sets
- Total Volume Load: ${metrics.training.totalVolumeKg.toLocaleString()} kg
- Progressive Overload Highlights:
${metrics.training.progressions.map((p) => `  * ${p.exercise}: ${p.previous} -> ${p.current} (${p.delta})`).join('\n') || '  * No prior week baseline comparisons available'}
- Muscle Focus:
  * Muscles in the Growth Sweet Spot: ${metrics.training.optimalVolumeGroups.join(', ') || 'None'}
  * Muscles that could use more sets: ${metrics.training.underVolumeGroups.join(', ') || 'None'}
  * Muscles that might be doing too much: ${metrics.training.overVolumeGroups.join(', ') || 'None'}

INSTRUCTIONS:
1. Synthesize the interaction between nutrition energy balance, scale weight rate of change, and gym performance in plain, simple English.
2. State 2 to 3 concrete wins (celebrate specific PRs or consistency).
3. If data is sparse (<3 days logged), acknowledge uncertainty with kindness and encourage more logging.
4. If an adjustment to calories or volume is warranted, provide a clear, actionable recommendation with an exact number (e.g. +150 kcal/day or -2 sets for fatigued groups). If on track, recommend keeping things steady.`;
};

/**
 * Requests the weekly coaching review from Gemini with strict schema enforcement.
 */
export const requestWeeklyReview = async (
  metrics: WeeklyExtractedMetrics,
  apiKey = '',
  goal: 'lose' | 'maintain' | 'gain' = 'maintain',
): Promise<WeeklyReviewResult> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const prompt = buildCoachingPrompt(metrics, goal);

  try {
    const { response, route, rejectedSession } = await fetchGemini(MODEL, apiKey, {
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: 'You are a warm, encouraging personal fitness coach for everyday lifters. Speak in simple, friendly, motivating language. CRITICAL INSTRUCTION: NEVER refer to yourself as an AI, bot, virtual assistant, machine, or language model. NEVER use the acronyms MAV, MEV, MRV, RPE, or RIR in any field! The user does not know what they mean. Instead of MAV, say "growth sweet spot". Instead of MEV, say "muscle maintenance sets". Instead of MRV, say "fatigue limit". Output only valid JSON matching the schema.',
            },
          ],
        },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: WEEKLY_REVIEW_RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      }),
    });

    if (rejectedSession) throw new Error(SIGN_IN_AGAIN_MESSAGE);
    if (isPersonalLimit(response, route)) throw new Error(ALLOWANCE_USED_MESSAGE);
    if (response.status === 429) {
      throw new Error('Too many requests just now. Wait a moment and try again.');
    }
    if (!response.ok) {
      throw new Error(`The coaching service returned ${response.status}.`);
    }

    const payload = await response.json();
    const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = JSON.parse(rawText);

    const sanitizeJargon = (str: string): string =>
      str
        .replace(/\bMAV\b/g, 'growth sweet spot')
        .replace(/\bMEV\b/g, 'muscle maintenance sets')
        .replace(/\bMRV\b/g, 'fatigue limit')
        .replace(/\bRPE\s*([0-9.]+)/gi, 'effort level $1')
        .replace(/\bRIR\b/gi, 'reps in reserve');

    const sanitized = {
      ...parsed,
      headline: sanitizeJargon(parsed.headline || ''),
      synthesis: sanitizeJargon(parsed.synthesis || ''),
      plainSummary: parsed.plainSummary ? sanitizeJargon(parsed.plainSummary) : undefined,
      trainingInsight: sanitizeJargon(parsed.trainingInsight || ''),
      nutritionInsight: sanitizeJargon(parsed.nutritionInsight || ''),
      keyWins: (parsed.keyWins || []).map((w: string) => sanitizeJargon(w)),
      suggestedAdjustment: parsed.suggestedAdjustment
        ? {
            ...parsed.suggestedAdjustment,
            title: sanitizeJargon(parsed.suggestedAdjustment.title || ''),
            rationale: sanitizeJargon(parsed.suggestedAdjustment.rationale || ''),
          }
        : parsed.suggestedAdjustment,
    };

    return WeeklyReviewSchema.parse(sanitized);
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error('The review took too long to generate. Please check your connection and retry.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};
