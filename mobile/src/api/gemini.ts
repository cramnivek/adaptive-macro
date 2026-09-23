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

/**
 * Where the app talks to Gemini when the user has supplied no key of their own.
 *
 * Set per environment so the route can be exercised against a local dev server
 * without deploying.
 */
// TODO(Task 2D): replace with the deployed Cloud Run URL.
const PROXY_BASE = process.env.EXPO_PUBLIC_API_BASE ?? '<PROXY_BASE from Task 2>';
const PROXY_TOKEN = process.env.EXPO_PUBLIC_PROXY_TOKEN ?? '';

export interface GeminiRoute {
  url: string;
  headers: Record<string, string>;
  viaProxy: boolean;
}

/**
 * Chooses between the user's own key and the hosted proxy.
 *
 * A key in Settings always wins. That keeps bring-your-own-key users off the
 * shared quota, and makes a proxy outage degrade to "enter a key" rather than
 * to a broken feature.
 */
export const routeFor = (model: string, apiKey: string): GeminiRoute => {
  const key = apiKey.trim();

  if (key) {
    return {
      url: `${ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(key)}`,
      headers: { 'Content-Type': 'application/json' },
      viaProxy: false,
    };
  }

  return {
    url: `${PROXY_BASE}/api/gemini`,
    headers: {
      'Content-Type': 'application/json',
      'x-proxy-token': PROXY_TOKEN,
      'x-gemini-model': model,
    },
    viaProxy: true,
  };
};

/**
 * Grounded search reads pages, so it is far slower than a database lookup.
 *
 * 90s rather than 30s because the eval showed 30 was cutting off the lookups
 * that needed the most work: 4 of 14 runs timed out, and the hardest case — UK
 * figures published only inside a PDF leaflet — never completed in two
 * attempts, while every lookup that did finish was exact. The failure mode was
 * a missing answer, not a wrong one, so the ceiling was patience rather than
 * capability.
 */
const GROUNDED_TIMEOUT_MS = 90_000;
/** The structuring call does no I/O of its own and should be quick. */
const STRUCTURE_TIMEOUT_MS = 15_000;

/**
 * Above this, a food with no macros at all is not a real figure.
 *
 * 20 kcal sits above anything genuinely macro-free that someone would log — a
 * black coffee, a tea, a diet drink — and far below a portion of food, so the
 * guard it backs never fires on the honest cases.
 */
const ZERO_MACRO_KCAL_FLOOR = 20;

export class GroundedLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroundedLookupError';
  }
}

export class UngroundedResponseError extends Error {
  constructor(message = 'The model answered without citing any web source') {
    super(message);
    this.name = 'UngroundedResponseError';
  }
}

/**
 * `found` closes a gap the grounding gate cannot: grounding proves a search
 * happened, not that the numbers that follow came from what was found. The
 * search call can search, read nothing usable, and still say so in prose —
 * that response still carries grounding chunks, so it clears the
 * `sources.length === 0` gate below. Call two then hits a schema that
 * requires kcal/protein/carbs/fat, and would otherwise force the model to
 * invent them for an item it just said it could not find. `found` lets the
 * model report that outcome instead of papering over it, and `lookupFood`
 * treats `found: false` as a rejection before the numeric fields are ever
 * trusted.
 */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean' },
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
  required: ['found', 'name', 'portionLabel', 'portionGrams', 'kcal', 'proteinG', 'carbsG', 'fatG'],
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
  `Set "found" to true only if the text states published nutrition figures ` +
  `for the item. Set it to false if the text says it could not find any, or ` +
  `otherwise does not state actual figures — in that case the numeric fields ` +
  `are meaningless, so fill them with 0.\n\n` +
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
  const route = routeFor(model, apiKey);

  try {
    const response = await fetch(route.url, {
      method: 'POST',
      signal: controller.signal,
      headers: route.headers,
      body: JSON.stringify(body),
    });

    // Same status, different cause. On the direct path the user's own key was
    // rejected and they can fix it; on the proxy path the key is the author's
    // and "check it in Settings" would send them looking for a field that is
    // empty on purpose.
    if (response.status === 400 || response.status === 403) {
      throw new GroundedLookupError(
        route.viaProxy
          ? 'The lookup service is unavailable. Try again later, or add your own Gemini API key in Settings.'
          : 'That Gemini API key was rejected. Check it in Settings.',
      );
    }
    if (response.status === 401) {
      throw new GroundedLookupError(
        'This build cannot reach the lookup service. Add your own Gemini API key in Settings.',
      );
    }
    // Grounding is metered separately and needs billing enabled on the project;
    // without it every grounded call returns 429 while plain ones still succeed.
    if (response.status === 429) {
      throw new GroundedLookupError(
        route.viaProxy
          ? 'The shared lookup allowance is used up for now. Try again later, or add your own Gemini API key in Settings.'
          : 'Gemini quota reached. Web lookup needs billing enabled on your Google Cloud project.',
      );
    }
    if (!response.ok) {
      throw new GroundedLookupError(`Gemini returned ${response.status}`);
    }

    try {
      return await response.json();
    } catch {
      throw new GroundedLookupError('Gemini returned a malformed response');
    }
  } catch (error) {
    if (error instanceof GroundedLookupError) throw error;
    if ((error as Error)?.name === 'AbortError') {
      throw new GroundedLookupError('The lookup took too long. Try again.');
    }
    throw new GroundedLookupError('Could not reach Gemini. Check your connection.');
  } finally {
    clearTimeout(timer);
  }
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

  // Calories are made of macros, so an all-zero split under a real calorie
  // figure describes nothing that exists. It is what the structuring step
  // produces when the source text gave it a calorie count and no macros: the
  // schema requires the fields, so it fills them with zeros. Observed on a real
  // lookup that offered "220 kcal, P0 C0 F0" for saving.
  //
  // The floor keeps genuinely empty items — black coffee, tea, diet drinks —
  // out of the guard, since for those the zeros are the truth and the calorie
  // figure is near zero to match.
  const macrosAllZero = r.proteinG === 0 && r.carbsG === 0 && r.fatG === 0;
  if (macrosAllZero && (r.kcal as number) > ZERO_MACRO_KCAL_FLOOR) {
    throw new GroundedLookupError(
      'The lookup returned calories with no macros, which no source states. Try a more specific name, or add it yourself.',
    );
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

  // See the comment on RESPONSE_SCHEMA: grounding only proves a search
  // happened, not that these numbers came from it. This is the check that
  // actually enforces that distinction.
  // Anything but an explicit `true` is a rejection, not just an explicit
  // `false`: a response that omits the field entirely is exactly as unproven
  // as one that denies it, and this gate is the last thing standing between a
  // model's guess and the user's diary.
  if ((parsed as { found?: unknown })?.found !== true) {
    throw new UngroundedResponseError('No published nutrition figures were found for that item');
  }

  return toCandidateFood(parsed, sources);
};
