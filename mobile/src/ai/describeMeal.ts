import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';

/**
 * Natural-language meal logging.
 *
 * Searching a database for every component of a real meal is the slowest part
 * of tracking, and it is why people stop. Describing it in one line —
 * "two scrambled eggs in butter, sourdough toast, flat white" — is how anyone
 * would actually say it.
 *
 * The estimate is Claude's, and it is presented as Claude's: every item carries
 * the assumption behind it and a confidence, and nothing is logged until the
 * user has seen and accepted it. The app does not quietly adjust the numbers
 * afterwards — an estimate the user cannot inspect is worse than no estimate.
 */

export const DEFAULT_MODEL = 'claude-opus-5';

/**
 * List prices in US dollars per million tokens, per model.
 *
 * Keyed by model so the displayed cost cannot drift from the model actually
 * used — a single hardcoded pair silently misprices the moment anything else
 * is called, which is exactly what happens when the eval sweeps models.
 */
export const MODEL_PRICING: Record<string, { inPerMTok: number; outPerMTok: number }> = {
  'claude-opus-5': { inPerMTok: 5, outPerMTok: 25 },
  'claude-sonnet-5': { inPerMTok: 2, outPerMTok: 10 },
  'claude-haiku-4-5': { inPerMTok: 1, outPerMTok: 5 },
};

/** One component of the meal, as Claude read it. */
const EstimatedItemSchema = z.object({
  name: z
    .string()
    .describe('Short name of this single food, as a person would write it on a label.'),
  grams: z
    .number()
    .describe('Estimated weight of the portion actually eaten, in grams.'),
  kcal: z.number().describe('Calories for that portion, not per 100 g.'),
  proteinG: z.number().describe('Protein in grams for that portion.'),
  carbsG: z.number().describe('Carbohydrate in grams for that portion.'),
  fatG: z.number().describe('Fat in grams for that portion.'),
  fiberG: z.number().describe('Fibre in grams for that portion; 0 if negligible.'),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .describe(
      'high when the food and portion are both clearly specified; low when the portion or preparation had to be guessed.',
    ),
  assumption: z
    .string()
    .describe(
      'The specific assumption made about portion size, preparation or ingredients, in one short sentence. Empty string only if the description left nothing to assume.',
    ),
});

export const MealEstimateSchema = z.object({
  items: z.array(EstimatedItemSchema),
  /**
   * Claude's own note about what it could not determine, shown verbatim. This
   * is where "I assumed a medium apple" or "you did not say what was on the
   * toast" surfaces, rather than being buried per item.
   */
  notes: z
    .string()
    .describe(
      'Anything ambiguous about the description that materially affects the estimate, in one or two sentences. Empty string if the description was unambiguous.',
    ),
  /** Set when the text does not describe food at all. */
  notFood: z
    .boolean()
    .describe('True if the text does not describe food or drink that was eaten.'),
});

export type EstimatedItem = z.infer<typeof EstimatedItemSchema>;
export type MealEstimate = z.infer<typeof MealEstimateSchema>;

export const SYSTEM_PROMPT = `You estimate the nutrition of meals people describe in their own words, for a food logging app.

Break the description into individual foods. For each, estimate the portion actually eaten in grams, then the calories and macros for that portion — not per 100 g.

Portion sizes are the main source of error, so be explicit about them. When someone says "a coffee" or "some rice", pick a sensible everyday portion, state it in the assumption field, and mark confidence accordingly. Use the cooked weight where a food is described as cooked.

Be accurate rather than cautious. Do not inflate estimates to be safe — a systematically high estimate corrupts the user's expenditure calculation over time, which is worse than an honest estimate that is sometimes low.

Keep macros consistent with the calories you give: protein and carbohydrate are about 4 kcal per gram, fat about 9, so the macros should roughly account for the calorie figure.

If the text does not describe food that was eaten, set notFood and return no items.`;

export class MissingApiKeyError extends Error {
  constructor() {
    super('No Anthropic API key set');
    this.name = 'MissingApiKeyError';
  }
}

/**
 * The SDK refuses to run in a browser unless told to, because an API key in a
 * page is visible to anyone with devtools. That warning is about shipping a key
 * inside a product. Here the key is the user's own, they typed it into their
 * own copy of the app, and it is stored only on their device — so the risk is
 * theirs and understood. It must never be given a key that is not the user's.
 */
const buildClient = (apiKey: string) =>
  new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

export interface DescribeResult {
  estimate: MealEstimate;
  /** Input and output tokens, so the cost of a request can be shown honestly. */
  usage: { inputTokens: number; outputTokens: number };
  /** The model the API reports having served, not the one requested. */
  model: string;
  /** Raw response, for anything that needs the transcript (the eval does). */
  raw: { stopReason: string | null; text: string };
}

export const describeMeal = async (
  description: string,
  apiKey: string,
  model: string = DEFAULT_MODEL,
): Promise<DescribeResult> => {
  if (!apiKey.trim()) throw new MissingApiKeyError();

  const client = buildClient(apiKey.trim());

  const response = await client.messages.parse({
    model,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: description.trim() }],
    output_config: { format: zodOutputFormat(MealEstimateSchema) },
  });

  // parse() returns null when the response could not be validated against the
  // schema. Better to say so than to hand back a half-parsed meal.
  if (!response.parsed_output) {
    throw new Error('Claude replied in a form this app could not read. Try rephrasing.');
  }

  return {
    estimate: response.parsed_output,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    model: response.model,
    raw: {
      stopReason: response.stop_reason,
      text: response.content
        .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
        .map((block) => block.text)
        .join(''),
    },
  };
};

/**
 * Cost of one estimate in US dollars, at the given model's list price.
 *
 * Shown so the user can see what they are spending rather than guess. It is
 * list price and ignores any discount or cached input. An unknown model
 * returns null rather than a number from the wrong price list — a plausible
 * wrong figure is worse than an absent one.
 */
export const estimateCostUsd = (
  usage: DescribeResult['usage'],
  model: string = DEFAULT_MODEL,
): number | null => {
  const price = MODEL_PRICING[model];
  if (!price) return null;
  return (
    (usage.inputTokens / 1_000_000) * price.inPerMTok +
    (usage.outputTokens / 1_000_000) * price.outPerMTok
  );
};

/** Maps a friendly message onto the SDK's typed errors. */
export const describeErrorMessage = (error: unknown): string => {
  if (error instanceof MissingApiKeyError) {
    return 'Add your Anthropic API key in Settings to use this.';
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return 'That API key was rejected. Check it in Settings.';
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Rate limited by the API. Wait a moment and try again.';
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return 'Could not reach the API. Check your connection.';
  }
  if (error instanceof Anthropic.APIError) {
    return `The API returned an error (${error.status}). ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
};
