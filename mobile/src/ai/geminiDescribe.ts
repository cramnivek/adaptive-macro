import { routeFor } from '../api/gemini';
import { type DescribeResult, MealEstimateSchema, SYSTEM_PROMPT } from './describeMeal';

/**
 * Meal estimation through Gemini.
 *
 * Exists because the local model cannot be a default: it needs the user's own
 * machine running Ollama on an address the phone can reach, which is true for
 * exactly one user. Accuracy is measured by the existing meal-estimation eval;
 * availability is why this is the default regardless of what it measures.
 *
 * The prompt is `SYSTEM_PROMPT` verbatim, shared with the Claude path, so the
 * eval compares providers rather than prompts.
 */

const MODEL = 'gemini-3.5-flash';

/** No web search here, so structured output is honoured and this can be quick. */
const TIMEOUT_MS = 30_000;

/**
 * Mirrors `MealEstimateSchema`, which zod still enforces on the parsed result.
 *
 * This is a hint that shapes what the model emits; it is not validation. A
 * response can satisfy Gemini and still be wrong for the app, so the zod parse
 * below is what actually decides whether anything reaches the diary.
 */
const MEAL_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          grams: { type: 'number' },
          kcal: { type: 'number' },
          proteinG: { type: 'number' },
          carbsG: { type: 'number' },
          fatG: { type: 'number' },
          fiberG: { type: 'number' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          assumption: { type: 'string' },
        },
        required: [
          'name', 'grams', 'kcal', 'proteinG', 'carbsG', 'fatG', 'fiberG',
          'confidence', 'assumption',
        ],
      },
    },
    notes: { type: 'string' },
    notFood: { type: 'boolean' },
  },
  required: ['items', 'notes', 'notFood'],
} as const;

const textOf = (response: unknown): string => {
  const parts = (response as any)?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
};

export const describeMealWithGemini = async (
  description: string,
  apiKey: string,
): Promise<DescribeResult> => {
  const route = routeFor(MODEL, apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let payload: any;
  try {
    const response = await fetch(route.url, {
      method: 'POST',
      signal: controller.signal,
      headers: route.headers,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: description.trim() }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: MEAL_RESPONSE_SCHEMA,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`The estimate service returned ${response.status}.`);
    }
    payload = await response.json();
  } finally {
    clearTimeout(timer);
  }

  const text = textOf(payload);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini replied in a form this app could not read. Try rephrasing.');
  }

  // zod, not Gemini, is the boundary. Same rule as the Claude path: a response
  // that does not validate is rejected rather than half-read into the diary.
  const estimate = MealEstimateSchema.parse(parsed);

  const usage = payload?.usageMetadata ?? {};
  return {
    estimate,
    usage: {
      inputTokens: typeof usage.promptTokenCount === 'number' ? usage.promptTokenCount : 0,
      outputTokens: typeof usage.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : 0,
    },
    model: MODEL,
    raw: { stopReason: null, text },
  };
};
