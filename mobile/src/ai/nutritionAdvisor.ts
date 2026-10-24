import { z } from 'zod';
import type {
  Goal,
  LogEntry,
  Nutrients,
  UserProfile,
} from '@adaptive-macros/engine';
import {
  analyzeMicronutrients,
  computeNutritionQualityScore,
  evaluateElectrolytes,
} from '@adaptive-macros/engine';
import { ALLOWANCE_USED_MESSAGE, SIGN_IN_AGAIN_MESSAGE, fetchGemini, isPersonalLimit } from '../api/gemini';
import { BRAND } from '../brand';
import type { AppPersonality } from '../state/settings';

const MODEL = 'gemini-3.5-flash';
const TIMEOUT_MS = 25_000;

export const NutritionAdviceSchema = z.object({
  headline: z.string(),
  qualityGrade: z.enum(['Elite', 'Great', 'Fair', 'Needs Focus']),
  summary: z.string(),
  keyWins: z.array(z.string()).min(1).max(3),
  gapAnalysis: z.array(
    z.object({
      nutrient: z.string(),
      status: z.string(),
      whyItMatters: z.string(),
      wholeFoodSources: z.array(z.string()).min(1),
    }),
  ).min(1).max(4),
  proteinTimingInsight: z.string(),
  electrolyteAdvice: z.string(),
  practicalSwaps: z.array(
    z.object({
      original: z.string(),
      betterChoice: z.string(),
      benefit: z.string(),
    }),
  ).max(3),
  scienceQuote: z.string().optional(),
});

export type NutritionAdviceResult = z.infer<typeof NutritionAdviceSchema>;

export const NUTRITION_ADVICE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'Punchy 5-10 word clinical nutrition summary' },
    qualityGrade: { type: 'string', enum: ['Elite', 'Great', 'Fair', 'Needs Focus'] },
    summary: { type: 'string', description: 'Plain English evaluation of today nutrition quality' },
    keyWins: {
      type: 'array',
      items: { type: 'string' },
      description: '1 to 3 positive nutritional habits noticed today',
    },
    gapAnalysis: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nutrient: { type: 'string', description: 'Name of the deficient or sub-optimal micronutrient' },
          status: { type: 'string', description: 'Current status e.g. "Low (35% of RDA)"' },
          whyItMatters: { type: 'string', description: 'Physiological impact for athletes or health' },
          wholeFoodSources: {
            type: 'array',
            items: { type: 'string' },
            description: 'Top whole foods rich in this nutrient that fit their calorie goal',
          },
        },
        required: ['nutrient', 'status', 'whyItMatters', 'wholeFoodSources'],
      },
    },
    proteinTimingInsight: {
      type: 'string',
      description: 'Assessment of protein distribution across meals (mTOR / muscle protein synthesis)',
    },
    electrolyteAdvice: {
      type: 'string',
      description: 'Guidance on hydration, sodium, potassium, and magnesium balance',
    },
    practicalSwaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          original: { type: 'string', description: 'Current food or habit' },
          betterChoice: { type: 'string', description: 'Recommended whole-food upgrade' },
          benefit: { type: 'string', description: 'Specific micronutrient or satiety benefit' },
        },
        required: ['original', 'betterChoice', 'benefit'],
      },
    },
    scienceQuote: {
      type: 'string',
      description: 'Optional evidence citation or sports nutrition guideline (e.g. ISSN, Morton 2018, Hall 2021)',
    },
  },
  required: [
    'headline',
    'qualityGrade',
    'summary',
    'keyWins',
    'gapAnalysis',
    'proteinTimingInsight',
    'electrolyteAdvice',
    'practicalSwaps',
  ],
} as const;

/**
 * Deterministic clinical diagnostics executed locally without network calls.
 */
export const runLocalNutritionDiagnostics = (params: {
  consumed: Nutrients;
  entries: LogEntry[];
  profile: UserProfile;
  goal: Goal;
}) => {
  const { consumed, entries, profile } = params;
  const quality = computeNutritionQualityScore(consumed, profile.sex, profile.age);
  const electrolytes = evaluateElectrolytes(consumed.micros);
  const microsList = analyzeMicronutrients(consumed.micros, profile.sex, profile.age);

  // Protein timing analysis
  const mealsMap = new Map<string, number>();
  for (const entry of entries) {
    mealsMap.set(entry.meal, (mealsMap.get(entry.meal) ?? 0) + entry.nutrients.proteinG);
  }

  const mealProteins = Array.from(mealsMap.values());
  const optimalDoses = mealProteins.filter((p) => p >= 25 && p <= 50).length;

  let proteinTimingAdvice = '';
  if (entries.length === 0) {
    proteinTimingAdvice = 'No meals logged yet today.';
  } else if (mealProteins.length <= 1 && consumed.proteinG > 60) {
    proteinTimingAdvice =
      'Most protein was consumed in a single meal. Distributing 25–40g doses across 3–4 meals maximizes muscle protein synthesis (MPS).';
  } else if (optimalDoses >= 2) {
    proteinTimingAdvice =
      `Excellent protein distribution! You hit the leucine threshold (25g+ protein) across ${optimalDoses} separate meals.`;
  } else {
    proteinTimingAdvice =
      'To optimize recovery, aim for at least 25–35g of high-quality protein per meal to trigger muscle protein synthesis.';
  }

  // Key deficiencies: prioritize nutrients the user is actively consuming but under-hitting,
  // before flagging nutrients that may simply be unlisted in food database labels.
  const withIntake = microsList
    .filter((a) => (a.status === 'deficient' || a.status === 'low') && a.target.category !== 'lipids' && a.consumed > 0)
    .sort((a, b) => a.pctOfRda - b.pctOfRda);
  const zeroIntake = microsList
    .filter((a) => (a.status === 'deficient' || a.status === 'low') && a.target.category !== 'lipids' && a.consumed === 0);

  const topGaps = (withIntake.length > 0 ? [...withIntake, ...zeroIntake] : zeroIntake).slice(0, 4);

  return {
    quality,
    electrolytes,
    microsList,
    proteinTimingAdvice,
    topGaps,
  };
};

/**
 * Requests deep AI nutritional recommendations and food additions from Gemini.
 */
export const requestAiNutritionReview = async (params: {
  consumed: Nutrients;
  entries: LogEntry[];
  profile: UserProfile;
  goal: Goal;
  personality?: AppPersonality;
  apiKey?: string;
}): Promise<NutritionAdviceResult> => {
  const { consumed, entries, profile, goal, personality = 'ascend', apiKey = '' } = params;
  const diagnostics = runLocalNutritionDiagnostics(params);

  const prompt = `You are ${BRAND.name}'s Chief Clinical Sports Nutritionist and Evidence-Based Dietitian.
Analyze this user's nutritional intake for today, identifying micronutrient deficiencies, electrolyte balance, protein pacing, and food quality.

User Profile:
- Biological Sex: ${profile.sex}
- Age: ${profile.age} years
- Primary Goal: ${goal.direction === 'lose' ? 'Fat Loss' : goal.direction === 'gain' ? 'Muscle Hypertrophy' : 'Maintenance'} (${goal.rateKgPerWeek} kg/week)
- App Tone Preference: ${personality}

Today's Logged Macros:
- Calories: ${Math.round(consumed.kcal)} kcal
- Protein: ${Math.round(consumed.proteinG)} g
- Carbs: ${Math.round(consumed.carbsG)} g
- Fat: ${Math.round(consumed.fatG)} g
- Fiber: ${Math.round(consumed.fiberG ?? 0)} g

Logged Foods (${entries.length} items):
${entries.map((e) => `- ${e.foodName} (${Math.round(e.grams)}g, ${e.meal}): ${Math.round(e.nutrients.kcal)} kcal, ${Math.round(e.nutrients.proteinG)}g P, ${Math.round(e.nutrients.carbsG)}g C, ${Math.round(e.nutrients.fatG)}g F`).join('\n')}

Electrolyte Balance:
- Sodium: ${Math.round(diagnostics.electrolytes.sodiumMg)} mg
- Potassium: ${Math.round(diagnostics.electrolytes.potassiumMg)} mg
- Magnesium: ${Math.round(diagnostics.electrolytes.magnesiumMg)} mg
- Na:K Ratio: ${diagnostics.electrolytes.ratio ? `${diagnostics.electrolytes.ratio}:1` : 'Unknown'}

Top Micronutrient Gaps:
${diagnostics.topGaps.map((g) => `- ${g.target.name}: ${Math.round(g.consumed)} ${g.target.unit} (${g.pctOfRda}% of RDA)`).join('\n') || '- None flagged'}

Personality Guidelines:
- If 'gymrat': Energetic, athletic, motivating, focus on muscle retention, pumps, and recovery, but scientifically accurate.
- If 'classic': Warm, supportive, approachable, simple whole-food habits.
- If 'ascend': Direct, high-precision, athletic, scientific, elegant.

Respond strictly conforming to the JSON schema.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const { response, route, rejectedSession } = await fetchGemini(MODEL, apiKey, {
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: NUTRITION_ADVICE_RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      }),
    });

    clearTimeout(timer);
    if (rejectedSession) throw new Error(SIGN_IN_AGAIN_MESSAGE);
    if (isPersonalLimit(response, route)) throw new Error(ALLOWANCE_USED_MESSAGE);
    if (response.status === 429) {
      throw new Error('Too many requests just now. Wait a moment and try again.');
    }
    if (!response.ok) {
      throw new Error(`The nutrition service returned ${response.status}.`);
    }

    const payload = await response.json();
    const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsedJson = JSON.parse(rawText);
    return NutritionAdviceSchema.parse(parsedJson);
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      throw new Error('AI nutrition consultation took too long. Try again.');
    }
    throw err;
  }
};
