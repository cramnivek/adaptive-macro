import { type Food, type FoodPortion, per100gFromPortion } from '@adaptive-macros/engine';

/**
 * Grounded food lookup.
 *
 * Search and Open Food Facts cover packaged goods; neither covers restaurant
 * menus, which is where this exists. Gemini searches the web, reads what it
 * finds, and reports the numbers a source actually states, along with the
 * domains it read them from.
 *
 * Two rules hold this together. The model returns per-portion values and never
 * per-100 g, because that division is exact arithmetic the app can do itself.
 * And a response carrying no grounding is a failure, not an answer — an
 * ungrounded reply is the model's own guess wearing a web lookup's clothes,
 * which is the one outcome this feature must never present as sourced.
 *
 * It takes two calls because grounding and structured output are mutually
 * exclusive: asking for a `responseSchema` alongside `google_search` returns
 * perfectly valid JSON with the citations silently stripped out. So the first
 * call searches and keeps the citations, and the second reshapes its prose
 * with no tools attached. Only the first carries a grounding charge.
 */

const MODEL = 'gemini-3.5-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Grounded search reads pages, so it is far slower than a database lookup. */
const GROUNDED_TIMEOUT_MS = 30_000;
/** The structuring call does no I/O of its own and should be quick. */
const STRUCTURE_TIMEOUT_MS = 15_000;

export class GroundedLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroundedLookupError';
  }
}

export class UngroundedResponseError extends Error {
  constructor() {
    super('The model answered without citing any web source');
    this.name = 'UngroundedResponseError';
  }
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    brand: { type: 'string', nullable: true },
    portionLabel: { type: 'string' },
    portionGrams: { type: 'number' },
    kcal: { type: 'number' },
    proteinG: { type: 'number' },
    carbsG: { type: 'number' },
    fatG: { type: 'number' },
    fiberG: { type: 'number', nullable: true },
  },
  required: ['name', 'portionLabel', 'portionGrams', 'kcal', 'proteinG', 'carbsG', 'fatG'],
} as const;

const searchPromptFor = (query: string, country: string) =>
  `Find published nutrition information for: ${query}\n\n` +
  `Market: ${country === 'world' ? 'any' : country.toUpperCase()}. Prefer the ` +
  `operator's or manufacturer's own published figures for that market, and ` +
  `prefer a single named menu item over a combo or meal deal.\n\n` +
  `Report the values exactly as the source states them, for one stated ` +
  `serving, and give that serving's weight in grams. Do not convert to a ` +
  `100 g basis and do not average across sources. If you cannot find ` +
  `published figures, say so plainly rather than estimating.`;

const structurePromptFor = (text: string) =>
  `Extract the nutrition figures from the text below into the required ` +
  `fields. Use only what the text states — do not add, correct or estimate ` +
  `anything. If it describes several variants, use the first one it presents ` +
  `as the primary answer. Values are for one serving, not per 100 g.\n\n` +
  `---\n${text}`;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const postJson = async (
  model: string,
  body: unknown,
  apiKey: string,
  timeoutMs: number,
): Promise<any> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      throw new GroundedLookupError('The lookup took too long. Try again.');
    }
    throw new GroundedLookupError('Could not reach Gemini. Check your connection.');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 400 || response.status === 403) {
    throw new GroundedLookupError('That Gemini API key was rejected. Check it in Settings.');
  }
  // Grounding is metered separately and needs billing enabled on the project;
  // without it every grounded call returns 429 while plain ones still succeed.
  if (response.status === 429) {
    throw new GroundedLookupError(
      'Gemini quota reached. Web lookup needs billing enabled on your Google Cloud project.',
    );
  }
  if (!response.ok) {
    throw new GroundedLookupError(`Gemini returned ${response.status}`);
  }

  return response.json();
};

/**
 * The domains behind a grounded answer.
 *
 * Read from each chunk's `title`, not its `uri`: the uri is an opaque
 * vertexaisearch redirect, so parsing it would label every source
 * "vertexaisearch.cloud.google.com" and tell the user nothing.
 */
export const sourceDomainsFrom = (response: unknown): string[] => {
  const chunks = (response as any)?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];

  const domains: string[] = [];
  for (const chunk of chunks) {
    const title = chunk?.web?.title;
    if (typeof title !== 'string') continue;
    const domain = title.trim().replace(/^www\./, '');
    if (domain && !domains.includes(domain)) domains.push(domain);
  }
  return domains;
};

const textOf = (response: unknown): string => {
  const parts = (response as any)?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
};

/**
 * Validates a model response and converts it into a Food.
 *
 * Every field is checked rather than trusted: this is the boundary between a
 * language model's output and the user's diary, and a silently-wrong number
 * here becomes a silently-wrong calorie target weeks later.
 */
export const toCandidateFood = (raw: unknown, sources: string[]): Food => {
  if (!raw || typeof raw !== 'object') {
    throw new GroundedLookupError('The lookup returned no usable data');
  }
  const r = raw as Record<string, unknown>;

  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name) throw new GroundedLookupError('The lookup returned a food with no name');

  if (!isFiniteNumber(r.portionGrams) || r.portionGrams <= 0) {
    throw new GroundedLookupError('The lookup returned no usable serving weight');
  }
  for (const key of ['kcal', 'proteinG', 'carbsG', 'fatG'] as const) {
    if (!isFiniteNumber(r[key]) || (r[key] as number) < 0) {
      throw new GroundedLookupError(`The lookup returned no usable ${key} value`);
    }
  }

  const portionGrams = r.portionGrams;
  const per100g = per100gFromPortion(
    {
      kcal: r.kcal as number,
      proteinG: r.proteinG as number,
      carbsG: r.carbsG as number,
      fatG: r.fatG as number,
      fiberG: isFiniteNumber(r.fiberG) && r.fiberG >= 0 ? r.fiberG : 0,
    },
    portionGrams,
  );

  const label =
    typeof r.portionLabel === 'string' && r.portionLabel.trim()
      ? r.portionLabel.trim()
      : '1 serving';
  const portions: FoodPortion[] = [
    { label: '100 g', grams: 100 },
    { label, grams: portionGrams },
  ];

  return {
    id: `ai:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    brand: typeof r.brand === 'string' && r.brand.trim() ? r.brand.trim() : undefined,
    source: 'ai',
    per100g,
    portions,
    fetchedAt: new Date().toISOString(),
    sources,
  };
};

export const lookupFood = async (
  query: string,
  country: string,
  apiKey: string,
): Promise<Food> => {
  if (!apiKey.trim()) {
    throw new GroundedLookupError('Add a Gemini API key in Settings to look foods up.');
  }

  // Call one: search the web and keep the citations.
  const grounded = await postJson(
    MODEL,
    {
      contents: [{ parts: [{ text: searchPromptFor(query, country) }] }],
      tools: [{ google_search: {} }],
    },
    apiKey,
    GROUNDED_TIMEOUT_MS,
  );

  // Before anything else: if it did not search, it did not look anything up.
  const sources = sourceDomainsFrom(grounded);
  if (sources.length === 0) throw new UngroundedResponseError();

  const prose = textOf(grounded);
  if (!prose) throw new GroundedLookupError('The lookup returned no usable data');

  // Call two: reshape that prose. No tools, so no grounding charge, and the
  // schema is honoured because nothing is competing with it.
  const structured = await postJson(
    MODEL,
    {
      contents: [{ parts: [{ text: structurePromptFor(prose) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    },
    apiKey,
    STRUCTURE_TIMEOUT_MS,
  );

  const json = textOf(structured);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new GroundedLookupError('The lookup returned malformed data');
  }

  return toCandidateFood(parsed, sources);
};
