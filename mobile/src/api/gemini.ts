import { type Food, type FoodPortion, per100gFromPortion } from '@adaptive-macros/engine';
import {
  ENRICHMENT_SCHEMA,
  enrichmentPromptFor,
  parseEnrichment,
  type EnrichedExercise,
} from '../ai/exercises';

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
const PROXY_BASE_OVERRIDE = process.env.EXPO_PUBLIC_API_BASE ?? '';
const CLOUD_RUN_BASE = 'https://gemini-proxy-297164004726.asia-southeast1.run.app';

/**
 * Empty in a browser, which makes the request URL relative.
 *
 * The site is served by the proxy itself, so a relative path is same-origin
 * whichever hostname Cloud Run answered on. An absolute base would be
 * cross-origin the moment the page was opened on the service's other hostname
 * — both resolve — and that is the CORS failure co-hosting exists to avoid.
 */
export const proxyBase = (): string =>
  PROXY_BASE_OVERRIDE || (typeof document === 'undefined' ? CLOUD_RUN_BASE : '');
export const PROXY_TOKEN = process.env.EXPO_PUBLIC_PROXY_TOKEN ?? '';

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
    url: `${proxyBase()}/api/gemini`,
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
 * Enrichment is slow because of what it writes, not because of any I/O.
 *
 * This was 15 s on the reasoning that it does no grounded I/O and should
 * therefore be as quick as the structuring call. Measured against the real API,
 * a full 20-name batch took 26.5 s: 2,066 output tokens of prose and, mostly,
 * 5,114 thinking tokens. So every full batch aborted, every run, and the abort
 * stopped the whole queue. A generation call is bounded by the tokens it emits
 * and the thinking it does first, neither of which the structuring call's ~10
 * scalars come anywhere near.
 *
 * Re-measured after muscle regions and numbered steps were added to the same
 * call, because the figure above was taken before they existed and a comment
 * that quietly stops being true is worse than no comment: the same 20-name
 * batch now takes **33.8 s**, 2,930 output tokens and 5,835 thinking tokens,
 * and returns all twenty entries complete. So 60 s is 1.77x the real thing
 * rather than the "over twice" this used to claim — still the right shape for a
 * one-off catalogue build the user is watching a progress line for, but
 * narrower than it reads, and worth re-measuring again before anything else is
 * added to this response.
 */
const ENRICH_TIMEOUT_MS = 60_000;

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

/**
 * A failure the next call will hit in exactly the same way.
 *
 * Rejected key, no key, quota gone: each of those answers every request
 * identically until something outside the app changes, so a caller working
 * through a queue of batches should stop rather than spend the rest of them
 * finding out. A timeout or a truncated body is the opposite — the next batch
 * asks about different names and may well succeed — and telling the two apart
 * is the difference between cataloguing 78 lifts and cataloguing the first 20
 * forever.
 *
 * A subclass rather than a flag, so the food lookup's callers, which care only
 * that the lookup failed, go on catching it as a `GroundedLookupError`.
 */
export class GeminiAccessError extends GroundedLookupError {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiAccessError';
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

/**
 * Operator figures first, but not operator figures only.
 *
 * Demanding that the operator published them sounds like rigour and in
 * practice refuses real answers. A regional chain like Mang Inasal publishes
 * nothing, so a sixty-second grounded search ended in "no published figures"
 * while the numbers sat in plain sight on third-party pages — findable by
 * anyone who typed the same words into Google.
 *
 * A figure someone else published is a different thing from one invented on
 * the spot, and the difference is shown rather than asserted: `sources` carries
 * the domains the lookup actually read, taken from the grounding metadata
 * rather than from the model's account of itself, and the candidate sheet lists
 * them before anything is saved.
 *
 * What stays strict: report what a source states, never average, never
 * estimate, and `UngroundedResponseError` still refuses an answer with no
 * grounding behind it at all.
 */
const searchPromptFor = (query: string, country: string) =>
  `Find published nutrition information for: ${query}\n\n` +
  `Market: ${country === 'world' ? 'any' : country.toUpperCase()}. Prefer the ` +
  `operator's or manufacturer's own published figures for that market, and ` +
  `prefer a single named menu item over a combo or meal deal.\n\n` +
  `If the operator publishes nothing, figures reported by a nutrition ` +
  `database, a publication or another third party are acceptable. Name who ` +
  `reported them, and say that the operator did not publish them.\n\n` +
  `Report the values exactly as the source states them, for one stated ` +
  `serving, and give that serving's weight in grams. Do not convert to a ` +
  `100 g basis and do not average across sources. If no source states ` +
  `figures at all, say so plainly rather than estimating.`;

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
  signal?: AbortSignal,
): Promise<any> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // The caller's signal and the timeout both abort the same request. A lookup
  // the user has typed past is a charged call nobody will ever see the result
  // of, so it is worth stopping rather than letting it run to ninety seconds.
  const abandon = () => controller.abort();
  signal?.addEventListener('abort', abandon);
  if (signal?.aborted) controller.abort();
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
      throw new GeminiAccessError(
        route.viaProxy
          ? 'The lookup service is unavailable. Try again later, or add your own Gemini API key in Settings.'
          : 'That Gemini API key was rejected. Check it in Settings.',
      );
    }
    if (response.status === 401) {
      throw new GeminiAccessError(
        'This build cannot reach the lookup service. Add your own Gemini API key in Settings.',
      );
    }
    // Grounding is metered separately and needs billing enabled on the project;
    // without it every grounded call returns 429 while plain ones still succeed.
    if (response.status === 429) {
      throw new GeminiAccessError(
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
    signal?.removeEventListener('abort', abandon);
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
/**
 * The lookup found the item and the figures are not enough to log.
 *
 * A real case rather than a hypothetical: searching a Mang Inasal menu item
 * finds it, because calorie counts are posted on menus under a Quezon City
 * ordinance — and that is all that is published. No serving weight, no macros.
 * The guards below are right to refuse it, since a food with a zero portion and
 * zero macros would quietly corrupt a day's tracking.
 *
 * But refusing after sixty seconds of waiting, with nothing to show for it, is
 * a dead end where an answer exists: the estimate path needs no published
 * figures at all. So this carries what was learned — the item's real name, and
 * the calorie figure if there was one — for the screen to offer onwards.
 */
export class PartialFiguresError extends GroundedLookupError {
  constructor(
    readonly foodName: string,
    readonly kcal: number | null,
  ) {
    super(
      kcal === null
        ? `Only part of the figures are published for ${foodName}.`
        : `Only calories are published for ${foodName} — ${Math.round(kcal)} kcal, with no serving weight or macros.`,
    );
    this.name = 'PartialFiguresError';
  }
}

export const toCandidateFood = (raw: unknown, sources: string[]): Food => {
  if (!raw || typeof raw !== 'object') {
    throw new GroundedLookupError('The lookup returned no usable data');
  }
  const r = raw as Record<string, unknown>;

  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name) throw new GroundedLookupError('The lookup returned a food with no name');

  if (!isFiniteNumber(r.portionGrams) || r.portionGrams <= 0) {
    throw new PartialFiguresError(name, isFiniteNumber(r.kcal) ? r.kcal : null);
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
    throw new PartialFiguresError(name, r.kcal as number);
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
  signal?: AbortSignal,
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
    signal,
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
    signal,
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

/**
 * Classifies a batch of exercise names and writes their how-to.
 *
 * One call, not two. `lookupFood` needs a grounded search first because macros
 * are published figures and an ungrounded answer is a fabrication. Which muscle
 * a press loads is general knowledge, so this asks for structured output
 * directly and carries no grounding charge.
 */
export const enrichExercises = async (
  names: string[],
  apiKey: string,
): Promise<{ entries: EnrichedExercise[]; missing: string[] }> => {
  if (names.length === 0) return { entries: [], missing: [] };

  const response = await postJson(
    MODEL,
    {
      contents: [{ role: 'user', parts: [{ text: enrichmentPromptFor(names) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: ENRICHMENT_SCHEMA,
      },
    },
    apiKey,
    ENRICH_TIMEOUT_MS,
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(textOf(response));
  } catch {
    throw new GroundedLookupError('The catalogue lookup returned a malformed response');
  }

  return parseEnrichment(parsed, names);
};
