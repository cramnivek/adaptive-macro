# Grounded Food Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a food search returns nothing usable, look the item up with a web-grounded Gemini call and offer it as a food the user can confirm and save.

**Architecture:** One Gemini request carries the query, the user's country, the `google_search` tool and a `responseSchema`, returning per-portion nutrients plus the URLs it read. The app derives `per100g` itself, runs the engine's existing consistency check, shows the source domains, and only writes to the `foods` table on explicit confirmation. A response carrying no grounding URLs is treated as a failed lookup, never as an answer.

**Tech Stack:** TypeScript, React Native / Expo (expo-router, expo-sqlite), vitest, zod v4, Gemini REST API (`generativelanguage.googleapis.com`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-17-grounded-food-lookup-design.md`. Read it before Task 1.
- `aiProvider` (`'ollama' | 'anthropic'`) must **not** gain a third value. Food lookup is configured separately under `foodLookup`.
- The model never performs arithmetic the app can do exactly. It returns per-portion values; the app derives `per100g`.
- A response with zero grounding URLs is a failure. Never save, never display as a result.
- Reuse `isNutritionallyConsistent` from `@adaptive-macros/engine` at its existing default tolerance of `0.15`. Do not introduce a second threshold.
- API keys are user-supplied, stored in device settings only, never committed and never hardcoded.
- `MIGRATIONS` in `mobile/src/db/schema.ts` is append-only. Never edit a shipped entry.
- Match existing file style: explanatory block comments stating *why*, not *what*.
- The mobile workspace currently has no test runner. Task 3 adds vitest as its first step, because it is the first task needing one.

---

### Task 1: Engine — per-portion to per-100 g derivation and the `sources` field

**Files:**
- Modify: `packages/engine/src/foods.ts`
- Test: `packages/engine/test/foods.test.ts` (create)

**Interfaces:**
- Consumes: `Nutrients` from `./types`, existing `scaleNutrients`.
- Produces: `per100gFromPortion(nutrients: Nutrients, grams: number): Nutrients`, and `Food.sources?: string[]`.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/test/foods.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { per100gFromPortion, scaleNutrients } from '../src/foods';

/**
 * Restaurant food is published per portion ("1 piece, 380 kcal"), never per
 * 100 g. These cover the conversion into the app's canonical basis, including
 * the degenerate inputs a model can return.
 */
describe('per100gFromPortion', () => {
  it('scales a portion up to a 100 g basis', () => {
    const result = per100gFromPortion(
      { kcal: 380, proteinG: 15, carbsG: 15, fatG: 21, fiberG: 1 },
      200,
    );
    expect(result.kcal).toBeCloseTo(190);
    expect(result.proteinG).toBeCloseTo(7.5);
    expect(result.carbsG).toBeCloseTo(7.5);
    expect(result.fatG).toBeCloseTo(10.5);
    expect(result.fiberG).toBeCloseTo(0.5);
  });

  it('is the exact inverse of scaleNutrients', () => {
    const per100g = { kcal: 190, proteinG: 7.5, carbsG: 7.5, fatG: 10.5, fiberG: 0.5 };
    const portion = scaleNutrients(per100g, 411);
    const recovered = per100gFromPortion(portion, 411);
    expect(recovered.kcal).toBeCloseTo(per100g.kcal);
    expect(recovered.proteinG).toBeCloseTo(per100g.proteinG);
  });

  // A model returning 0 g would otherwise produce Infinity and poison every
  // later calculation silently.
  it('throws on a non-positive portion weight', () => {
    const n = { kcal: 100, proteinG: 1, carbsG: 1, fatG: 1, fiberG: 0 };
    expect(() => per100gFromPortion(n, 0)).toThrow();
    expect(() => per100gFromPortion(n, -5)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @adaptive-macros/engine`
Expected: FAIL — `per100gFromPortion` is not exported from `../src/foods`.

- [ ] **Step 3: Write minimal implementation**

In `packages/engine/src/foods.ts`, add `sources` to the `Food` interface, directly beneath `fetchedAt`:

```ts
  /**
   * URLs a grounded lookup actually read to produce this food. Present only
   * for `source: 'ai'` records that came from a web lookup; a photo or
   * description estimate has nothing to cite. Stored so a number's provenance
   * survives long after the lookup, rather than living only in the moment of
   * confirmation.
   */
  sources?: string[];
```

Then append, next to `scaleNutrients`:

```ts
/**
 * Converts nutrients stated for a portion into the per-100 g basis everything
 * is stored in.
 *
 * The inverse of `scaleNutrients`. This exists because restaurant and menu
 * data is published per serving — "1 piece, 380 kcal" — and doing the division
 * here means no caller, and in particular no language model, is trusted with
 * arithmetic the app can perform exactly.
 */
export const per100gFromPortion = (nutrients: Nutrients, grams: number): Nutrients => {
  if (!Number.isFinite(grams) || grams <= 0) {
    throw new Error(`portion weight must be a positive number of grams, got ${grams}`);
  }
  const factor = 100 / grams;
  return {
    kcal: nutrients.kcal * factor,
    proteinG: nutrients.proteinG * factor,
    carbsG: nutrients.carbsG * factor,
    fatG: nutrients.fatG * factor,
    fiberG: (nutrients.fiberG ?? 0) * factor,
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @adaptive-macros/engine`
Expected: PASS, all three cases.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean. `Food.sources` is optional, so no existing construction site breaks.

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/foods.ts packages/engine/test/foods.test.ts
git commit -m "feat(engine): add per100gFromPortion and Food.sources"
```

---

### Task 2: Database — persist `sources`

**Files:**
- Modify: `mobile/src/db/schema.ts`
- Modify: `mobile/src/db/index.ts:100-160`

**Interfaces:**
- Consumes: `Food.sources` from Task 1.
- Produces: `saveFood` persists `sources`; `rowToFood` returns it.

**Verification note:** expo-sqlite has no node driver, so this task is verified by typecheck plus a round-trip in the running app, not by a unit test. Do not fake a test that does not exercise the database.

- [ ] **Step 1: Append migration v2**

In `mobile/src/db/schema.ts`, append a new entry to `MIGRATIONS` (do not edit v1):

```ts
  // v2 — provenance for grounded lookups
  `
  ALTER TABLE foods ADD COLUMN sources TEXT;
  `,
```

- [ ] **Step 2: Read the column**

In `mobile/src/db/index.ts`, add to `interface FoodRow`, after `fetched_at`:

```ts
  sources: string | null;
```

And in `rowToFood`, after the `fetchedAt` line:

```ts
  sources: row.sources ? (JSON.parse(row.sources) as string[]) : undefined,
```

- [ ] **Step 3: Write the column**

In `saveFood`, extend the column list, the placeholder list, the `DO UPDATE SET` clause, and the argument list. The statement becomes:

```ts
  await db.runAsync(
    `INSERT INTO foods (id, name, brand, barcode, source, kcal, protein_g, carbs_g, fat_g, fiber_g, portions, fetched_at, sources)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, brand = excluded.brand, barcode = excluded.barcode,
       kcal = excluded.kcal, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g,
       fat_g = excluded.fat_g, fiber_g = excluded.fiber_g, portions = excluded.portions,
       fetched_at = excluded.fetched_at, sources = excluded.sources`,
    food.id,
    food.name,
    food.brand ?? null,
    food.barcode ?? null,
    food.source,
    food.per100g.kcal,
    food.per100g.proteinG,
    food.per100g.carbsG,
    food.per100g.fatG,
    food.per100g.fiberG ?? 0,
    JSON.stringify(food.portions),
    food.fetchedAt ?? new Date().toISOString(),
    food.sources?.length ? JSON.stringify(food.sources) : null,
  );
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Verify the migration on a device**

Run: `npm start`, open the app on a device that already has data.
Expected: the app launches, the diary still renders, and previously saved foods still open. That proves v2 applied to an existing database rather than only to a fresh one.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/db/schema.ts mobile/src/db/index.ts
git commit -m "feat(db): persist grounded lookup sources on foods"
```

---

### Task 3: Gemini grounded lookup client

The core of the feature. All parsing is pure and tested; only `lookupFood` touches the network.

**Files:**
- Create: `mobile/src/api/gemini.ts`
- Test: `mobile/src/api/__tests__/gemini.test.ts` (create)
- Create: `mobile/vitest.config.ts`
- Modify: `mobile/package.json`

**Interfaces:**
- Consumes: `per100gFromPortion`, `Food`, `FoodPortion` from `@adaptive-macros/engine`; `FoodApiError` from `./http`.
- Produces:
  - `GroundedLookupError` (class, `name: 'GroundedLookupError'`)
  - `UngroundedResponseError` (class, `name: 'UngroundedResponseError'`)
  - `toCandidateFood(raw: unknown, sources: string[]): Food` — throws on unusable input
  - `extractSourceUrls(response: unknown): string[]`
  - `sourceDomains(urls: string[]): string[]`
  - `lookupFood(query: string, country: string, apiKey: string): Promise<Food>`

- [ ] **Step 0: Add the test runner**

The mobile workspace has only `typecheck`, and the tests below need a runner.
Set it up here rather than as its own task — it is scaffolding for this
deliverable, not a deliverable itself.

Create `mobile/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

/**
 * Only the pure modules under src/api and src/ai are tested here. Anything
 * touching expo-sqlite or React Native native modules has no node driver and
 * is verified in the running app instead.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
```

Add to `mobile/package.json` scripts, after `"web"`:

```json
    "test": "vitest run",
```

And add `vitest` to `devDependencies` (create the block if absent), matching
the engine's pin:

```json
  "devDependencies": {
    "vitest": "^2.1.8"
  },
```

Run: `npm install`
Expected: completes; `npm run test --workspace @adaptive-macros/mobile` now
resolves to vitest and reports no test files found, which is correct until
Step 2 writes them.

- [ ] **Step 1: Confirm the model id and response shape against the live API**

Do not guess the model string. With the user's key in `GEMINI_KEY`, run:

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_KEY" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=JSON.parse(s).models||[];m.filter(x=>/gemini-3/.test(x.name)).forEach(x=>console.log(x.name,'|',(x.supportedGenerationMethods||[]).join(',')))})"
```

Record the exact model name supporting `generateContent` and use it for `MODEL` below. Then capture one real grounded response to confirm the grounding-metadata path before writing the parser:

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models/<MODEL>:generateContent?key=$GEMINI_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"contents":[{"parts":[{"text":"Jollibee Chickenjoy nutrition per piece, Philippines"}]}],"tools":[{"google_search":{}}]}' \
  > /tmp/gemini-raw.json; node -e "console.log(JSON.stringify(Object.keys(require('/tmp/gemini-raw.json').candidates[0]),null,2))"
```

Expected: `groundingMetadata` present among the candidate's keys. If the URI path differs from `groundingMetadata.groundingChunks[].web.uri`, adjust `extractSourceUrls` and its test to the shape actually returned. **The observed shape wins over this plan.**

- [ ] **Step 2: Write the failing tests**

Create `mobile/src/api/__tests__/gemini.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractSourceUrls, sourceDomains, toCandidateFood } from '../gemini';

const validRaw = {
  name: 'Chickenjoy',
  brand: 'Jollibee',
  portionLabel: '1 piece',
  portionGrams: 100,
  kcal: 380,
  proteinG: 15,
  carbsG: 15,
  fatG: 21,
  fiberG: 1,
};

describe('toCandidateFood', () => {
  it('derives per100g and keeps both portions', () => {
    const food = toCandidateFood(validRaw, ['https://example.com/a']);
    expect(food.per100g.kcal).toBeCloseTo(380);
    expect(food.source).toBe('ai');
    expect(food.sources).toEqual(['https://example.com/a']);
    expect(food.portions[0]).toEqual({ label: '100 g', grams: 100 });
    expect(food.portions[1]).toEqual({ label: '1 piece', grams: 100 });
  });

  it('scales correctly when the portion is not 100 g', () => {
    const food = toCandidateFood({ ...validRaw, portionGrams: 411, kcal: 610 }, ['https://x.dev']);
    expect(food.per100g.kcal).toBeCloseTo(148.42, 1);
  });

  it('rejects a missing name', () => {
    expect(() => toCandidateFood({ ...validRaw, name: '' }, ['https://x.dev'])).toThrow();
  });

  it('rejects a non-positive portion weight', () => {
    expect(() => toCandidateFood({ ...validRaw, portionGrams: 0 }, ['https://x.dev'])).toThrow();
  });

  it('rejects garbage shapes', () => {
    expect(() => toCandidateFood(null, ['https://x.dev'])).toThrow();
    expect(() => toCandidateFood({ name: 'x' }, ['https://x.dev'])).toThrow();
    expect(() => toCandidateFood({ ...validRaw, kcal: 'lots' }, ['https://x.dev'])).toThrow();
  });

  it('treats a missing fibre value as zero rather than failing', () => {
    const { fiberG, ...noFibre } = validRaw;
    expect(toCandidateFood(noFibre, ['https://x.dev']).per100g.fiberG).toBe(0);
  });
});

describe('extractSourceUrls', () => {
  it('pulls web uris out of grounding metadata', () => {
    const response = {
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'https://a.example/one' } },
              { web: { uri: 'https://b.example/two' } },
            ],
          },
        },
      ],
    };
    expect(extractSourceUrls(response)).toEqual([
      'https://a.example/one',
      'https://b.example/two',
    ]);
  });

  // The load-bearing case: a confident answer straight from the model's
  // weights, with nothing behind it.
  it('returns empty when the model did not ground', () => {
    expect(extractSourceUrls({ candidates: [{ content: {} }] })).toEqual([]);
    expect(extractSourceUrls({})).toEqual([]);
    expect(extractSourceUrls(null)).toEqual([]);
  });

  it('skips chunks with no uri and de-duplicates', () => {
    const response = {
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'https://a.example/one' } },
              { web: {} },
              {},
              { web: { uri: 'https://a.example/one' } },
            ],
          },
        },
      ],
    };
    expect(extractSourceUrls(response)).toEqual(['https://a.example/one']);
  });
});

describe('sourceDomains', () => {
  it('reduces urls to unique hostnames without www', () => {
    expect(
      sourceDomains([
        'https://www.jollibeefoods.com/nutrition',
        'https://jollibeefoods.com/menu',
        'https://nutritionx.us/x',
      ]),
    ).toEqual(['jollibeefoods.com', 'nutritionx.us']);
  });

  it('ignores unparseable urls instead of throwing', () => {
    expect(sourceDomains(['not a url', 'https://ok.example/a'])).toEqual(['ok.example']);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test --workspace @adaptive-macros/mobile`
Expected: FAIL — cannot resolve `../gemini`.

- [ ] **Step 4: Implement the client**

Create `mobile/src/api/gemini.ts`:

```ts
import { type Food, type FoodPortion, per100gFromPortion } from '@adaptive-macros/engine';

/**
 * Grounded food lookup.
 *
 * Search and Open Food Facts cover packaged goods; neither covers restaurant
 * menus, which is where this exists. Gemini searches the web, reads what it
 * finds, and returns the numbers a source actually states, along with the URLs
 * it read.
 *
 * Two rules hold this together. The model returns per-portion values and never
 * per-100 g, because that division is exact arithmetic the app can do itself.
 * And a response carrying no grounding URLs is a failure, not an answer — an
 * ungrounded reply is the model's own guess wearing a web lookup's clothes,
 * which is the one outcome this feature must never present as sourced.
 */

// Confirmed against the Models API during implementation; see the plan's Task 4
// Step 1. Change here only, never inline at a call site.
const MODEL = 'REPLACE_WITH_MODEL_CONFIRMED_IN_STEP_1';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Grounded search reads pages, so it is far slower than a database lookup. */
const TIMEOUT_MS = 30_000;

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

const promptFor = (query: string, country: string) =>
  `Find published nutrition information for: ${query}\n\n` +
  `Market: ${country === 'world' ? 'any' : country.toUpperCase()}. Prefer the ` +
  `operator's or manufacturer's own published figures for that market, and ` +
  `prefer a single named menu item or product over a combo or meal deal.\n\n` +
  `Report the values exactly as the source states them, for one stated ` +
  `serving. Give that serving's weight in grams. Do not convert to a 100 g ` +
  `basis and do not average across sources. If you cannot find published ` +
  `figures, say so rather than estimating.`;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

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

  const label = typeof r.portionLabel === 'string' && r.portionLabel.trim()
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

/** Every distinct web URL the model actually read, in the order cited. */
export const extractSourceUrls = (response: unknown): string[] => {
  const chunks = (response as any)?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];

  const urls: string[] = [];
  for (const chunk of chunks) {
    const uri = chunk?.web?.uri;
    if (typeof uri === 'string' && uri && !urls.includes(uri)) urls.push(uri);
  }
  return urls;
};

/**
 * Hostnames for display.
 *
 * Shown without any authority badge, deliberately. Any cheap test for "is this
 * the brand's own site" marks an SEO aggregate like jollibeemenuupdates.com as
 * official, and a false badge is worse than none.
 */
export const sourceDomains = (urls: string[]): string[] => {
  const domains: string[] = [];
  for (const url of urls) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      if (!domains.includes(host)) domains.push(host);
    } catch {
      // A citation we cannot parse is not worth failing the whole lookup over.
    }
  }
  return domains;
};

export const lookupFood = async (
  query: string,
  country: string,
  apiKey: string,
): Promise<Food> => {
  if (!apiKey.trim()) {
    throw new GroundedLookupError('Add a Gemini API key in Settings to look foods up.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(
      `${ENDPOINT}/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptFor(query, country) }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      },
    );
  } catch (error) {
    clearTimeout(timer);
    if ((error as Error)?.name === 'AbortError') {
      throw new GroundedLookupError('The lookup took too long. Try again.');
    }
    throw new GroundedLookupError('Could not reach Gemini. Check your connection.');
  }
  clearTimeout(timer);

  if (response.status === 400 || response.status === 403) {
    throw new GroundedLookupError('That Gemini API key was rejected. Check it in Settings.');
  }
  if (response.status === 429) {
    throw new GroundedLookupError('Gemini rate limit or quota reached. Try again later.');
  }
  if (!response.ok) {
    throw new GroundedLookupError(`Gemini returned ${response.status}`);
  }

  const body = await response.json();

  // Before anything else: if it did not search, it did not look anything up.
  const sources = extractSourceUrls(body);
  if (sources.length === 0) throw new UngroundedResponseError();

  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    throw new GroundedLookupError('The lookup returned no usable data');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GroundedLookupError('The lookup returned malformed data');
  }

  return toCandidateFood(parsed, sources);
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test --workspace @adaptive-macros/mobile`
Expected: PASS, all cases.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/api/gemini.ts mobile/src/api/__tests__/gemini.test.ts mobile/vitest.config.ts mobile/package.json package-lock.json
git commit -m "feat(api): grounded food lookup via Gemini with source extraction"
```

---

### Task 4: Settings — `foodLookup` configuration

**Files:**
- Modify: `mobile/src/state/settings.ts:20-65`
- Modify: `mobile/app/(tabs)/settings.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `settings.foodLookup: { enabled: boolean; geminiApiKey: string }`.

- [ ] **Step 1: Extend the settings type**

In `mobile/src/state/settings.ts`, add to `AppSettings` after `anthropicApiKey`:

```ts
  /**
   * Web-grounded lookup for restaurant and chain food, which no packaged-goods
   * database carries. Kept separate from `aiProvider` on purpose: that setting
   * chooses who estimates a described meal, and the local model there is
   * deliberate. Choosing a lookup provider must not quietly move meal
   * estimation off it.
   */
  foodLookup: {
    enabled: boolean;
    geminiApiKey: string;
  };
```

And to `DEFAULT_SETTINGS`, after `anthropicApiKey: ''`:

```ts
  foodLookup: { enabled: false, geminiApiKey: '' },
```

- [ ] **Step 2: Typecheck to find every construction site**

Run: `npm run typecheck`
Expected: clean if settings are merged against defaults on load; if any site constructs `AppSettings` literally, the error names it — fix by spreading `DEFAULT_SETTINGS`.

- [ ] **Step 3: Add the Settings UI**

In `mobile/app/(tabs)/settings.tsx`, following the existing section pattern used for the Anthropic key, add a "Looking up restaurant food" section containing a `Field` bound to `foodLookup.geminiApiKey` and explanatory copy. Enablement follows the key rather than a separate switch — one less state to get wrong:

```tsx
<Text style={styles.sectionNote}>
  Chain and restaurant meals are not in the food databases. With a Gemini API
  key, searches that come back empty can offer a web lookup, which shows you
  the sources it read before you save anything. Grounded lookups are free up
  to a monthly allowance on Google's own plans.
</Text>
<Field
  label="Gemini API key"
  value={settings.foodLookup.geminiApiKey}
  onChangeText={(geminiApiKey) =>
    void update({
      foodLookup: { ...settings.foodLookup, geminiApiKey, enabled: geminiApiKey.trim().length > 0 },
    })
  }
  placeholder="AIza…"
  autoCapitalize="none"
  secureTextEntry
/>
```

Match the surrounding code's exact `update`/`setSettings` call convention — read the Anthropic key block immediately above and mirror it.

- [ ] **Step 4: Verify in the app**

Run: `npm start`, open Settings.
Expected: the new section renders, a typed key persists across an app reload.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/state/settings.ts "mobile/app/(tabs)/settings.tsx"
git commit -m "feat(settings): add foodLookup Gemini key, separate from aiProvider"
```

---

### Task 5: Search screen — the lookup button and confirmation

**Files:**
- Create: `mobile/src/components/LookupCandidateSheet.tsx`
- Modify: `mobile/app/search.tsx:90-145`

**Interfaces:**
- Consumes: `lookupFood`, `sourceDomains`, `UngroundedResponseError` from `../src/api/gemini`; `isNutritionallyConsistent` from the engine (already imported in `search.tsx`); `saveFood` from `../src/db`.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Build the confirmation sheet**

Create `mobile/src/components/LookupCandidateSheet.tsx`, modelled on the existing `LogFoodSheet` (read it first and match its modal structure, prop shape and styling):

```tsx
import { type Food, isNutritionallyConsistent } from '@adaptive-macros/engine';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { sourceDomains } from '../api/gemini';
import { radius, space, useTheme } from '../theme';
import { Button } from './Controls';

/**
 * Shows what a grounded lookup found, and where it came from, before anything
 * is written.
 *
 * The domains are listed plainly with no authority badge. The user is the one
 * who can tell an operator's own figures from an aggregate that invented them,
 * and a badge claiming otherwise would launder a guess as a source.
 */
export const LookupCandidateSheet = ({
  food,
  onCancel,
  onSave,
}: {
  food: Food | null;
  onCancel: () => void;
  onSave: (food: Food) => void;
}) => {
  const { colors } = useTheme();
  if (!food) return null;

  const portion = food.portions.find((p) => p.grams !== 100) ?? food.portions[0];
  const consistent = isNutritionallyConsistent(food.per100g);
  const domains = sourceDomains(food.sources ?? []);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <ScrollView style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[styles.name, { color: colors.text }]}>{food.name}</Text>
          {food.brand ? (
            <Text style={[styles.meta, { color: colors.textFaint }]}>{food.brand}</Text>
          ) : null}

          <Text style={[styles.meta, { color: colors.text }]}>
            {portion.label} ({Math.round(portion.grams)} g) ·{' '}
            {Math.round((food.per100g.kcal * portion.grams) / 100)} kcal
          </Text>
          <Text style={[styles.meta, { color: colors.textFaint }]}>
            Per 100 g: {Math.round(food.per100g.kcal)} kcal · P{' '}
            {Math.round(food.per100g.proteinG)} · C {Math.round(food.per100g.carbsG)} · F{' '}
            {Math.round(food.per100g.fatG)}
          </Text>

          {!consistent && (
            <Text style={[styles.warning, { color: colors.warning }]}>
              Its macros do not add up to its calories — one of the two is wrong.
            </Text>
          )}

          <Text style={[styles.sourcesLabel, { color: colors.textFaint }]}>Read from</Text>
          {domains.map((domain) => (
            <Text key={domain} style={[styles.source, { color: colors.textFaint }]}>
              {domain}
            </Text>
          ))}

          <Text style={[styles.disclaimer, { color: colors.textFaint }]}>
            Estimated from web sources, not a verified label. Check it against the
            packaging or receipt when you can.
          </Text>

          <View style={styles.actions}>
            <Button label="Save this food" onPress={() => onSave(food)} />
            <Button label="Discard" variant="subtle" onPress={onCancel} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' },
  sheet: {
    maxHeight: '80%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.lg,
  },
  name: { fontSize: 18, fontWeight: '600' },
  meta: { fontSize: 13, marginTop: space.xs },
  warning: { fontSize: 12, marginTop: space.sm, lineHeight: 17 },
  sourcesLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: space.lg,
  },
  source: { fontSize: 12, marginTop: 2 },
  disclaimer: { fontSize: 12, marginTop: space.lg, lineHeight: 17 },
  actions: { marginTop: space.lg, gap: space.sm },
});
```

- [ ] **Step 2: Wire the button into the search footer**

In `mobile/app/search.tsx`, add state and the handler above the `return`:

```tsx
const [candidate, setCandidate] = useState<Food | null>(null);
const [lookingUp, setLookingUp] = useState(false);

// Three rather than zero: the case this exists for returned one irrelevant
// result, not an empty list.
const THIN_RESULT_COUNT = 3;
const canLookUp =
  !showingFrequent &&
  !loading &&
  settings.foodLookup.enabled &&
  shown.length < THIN_RESULT_COUNT;

const runLookup = useCallback(async () => {
  setLookingUp(true);
  setErrors([]);
  try {
    const food = await lookupFood(
      query.trim(),
      settings.foodCountry,
      settings.foodLookup.geminiApiKey,
    );
    setCandidate(food);
  } catch (error) {
    setErrors([
      error instanceof UngroundedResponseError
        ? 'Could not find published figures for that. Try a more specific name, or add it yourself.'
        : (error as Error).message,
    ]);
  } finally {
    setLookingUp(false);
  }
}, [query, settings.foodCountry, settings.foodLookup.geminiApiKey]);
```

Add to the `ListFooterComponent`, after the "Create a food" button:

```tsx
{canLookUp && (
  <Button
    label={lookingUp ? 'Looking it up…' : 'Look it up with AI'}
    variant="subtle"
    disabled={lookingUp}
    onPress={() => void runLookup()}
  />
)}
```

And render the sheet beside `LogFoodSheet`:

```tsx
<LookupCandidateSheet
  food={candidate}
  onCancel={() => setCandidate(null)}
  onSave={(food) => {
    void saveFood(food).then(() => {
      setCandidate(null);
      setSelected(food);
    });
  }}
/>
```

Add the imports: `lookupFood`, `UngroundedResponseError` from `../src/api/gemini`; `LookupCandidateSheet` from `../src/components/LookupCandidateSheet`; `saveFood` from `../src/db`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Verify the whole path in the app**

Run: `npm start`. With a Gemini key saved, search "Jollibee Chickenjoy".
Expected: sources listed, numbers plausible, saving it makes it appear top of the results on the next identical search with an `Estimate` badge, and no further API call.
Then search a nonsense string such as "qwertyuiop food".
Expected: either a not-found message or the ungrounded message — never a confident invented food.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/LookupCandidateSheet.tsx mobile/app/search.tsx
git commit -m "feat(search): offer grounded lookup when results are thin"
```

---

### Task 6: Acceptance eval

Unit tests prove the plumbing. This answers whether the feature is worth having.

**Files:**
- Create: `evals/food-lookup/cases.json`
- Create: `evals/food-lookup/run-lookup-eval.mjs`

**Interfaces:**
- Consumes: `lookupFood` from `mobile/src/api/gemini.ts`, imported the way `evals/meal-estimation/run-eval.mjs` imports `mobile/src/ai/describeMeal.ts`.
- Produces: `results.jsonl` scored per case.

- [ ] **Step 1: Build the case set from published figures**

Create `evals/food-lookup/cases.json`. Ground truth comes from Jollibee USA's published nutrition PDF and equivalent operator-published sources — **not** from any number this project produced:

```json
[
  {
    "id": "chickenjoy-1pc",
    "query": "Jollibee Chickenjoy 1 piece",
    "country": "us",
    "reference": { "kcal": 380, "proteinG": 15, "carbsG": 15, "fatG": 21 },
    "referenceSource": "https://jollibee-prod-media.s3.us-west-2.amazonaws.com/JB_USA_Nutrition_Facts_2024_August_08_09_24_f8c100835c.pdf"
  }
]
```

Add at least six more cases from operator-published data before running. Record `referenceSource` for every one; a case whose reference cannot be traced to a published figure does not belong in the set.

- [ ] **Step 2: Write the runner**

Create `evals/food-lookup/run-lookup-eval.mjs`, mirroring `evals/meal-estimation/run-eval.mjs` in structure — argument parsing, per-case loop, JSONL output. Score three things per case:

```js
const grade = (result, reference) => {
  const portion = result.portions.find((p) => p.grams !== 100) ?? result.portions[0];
  const kcalForPortion = (result.per100g.kcal * portion.grams) / 100;
  const errPct = ((kcalForPortion - reference.kcal) / reference.kcal) * 100;
  return {
    grounded: (result.sources ?? []).length > 0,
    kcal_ok: Math.abs(errPct) <= 10 ? 1 : 0,
    kcal_bias_pct: errPct,
    source_domains: sourceDomains(result.sources ?? []),
  };
};
```

Tolerance is 10% here, tighter than meal estimation's 15%, because a published per-item figure is a far harder reference than a plausible range for a described meal.

- [ ] **Step 3: Run it**

Run: `node --experimental-strip-types evals/food-lookup/run-lookup-eval.mjs --model gemini --reps 2`
Expected: a `results.jsonl` with a row per case and rep.

- [ ] **Step 4: Report and decide**

Summarise `kcal_ok` out of the total, mean `kcal_bias_pct`, and the distribution of `source_domains` — specifically how often an operator's own domain appears versus an aggregator.

The comparison that matters: the local model scored −18.75% on `vague-fish-and-chips` across every rep in v3, and 15/15 with −2.5% bias on precise weighed items. If grounded lookup cannot beat the local model on named dishes, the honest outcome is to say so in the results and reconsider the feature rather than ship it on the strength of it being new.

- [ ] **Step 5: Commit**

```bash
git add evals/food-lookup
git commit -m "test(eval): acceptance eval for grounded food lookup"
```

---

## Self-review notes

**Spec coverage.** Provider choice and free-tier reasoning → Task 4 plus the constants in Task 3. Configuration boundary (`aiProvider` untouched) → Task 4 Step 1 and Global Constraints. Entry point and the three-result threshold → Task 5 Step 2. Data flow → Tasks 3 and 5. Schema and arithmetic boundary → Tasks 1 and 3. Coherence validation → Task 5 Step 1 (reusing the engine's existing helper, per the spec correction). Provenance storage → Tasks 1 and 2; display without badges → Task 5 Step 1. Permanent marking → already present in `search.tsx:162` and preserved. Error handling table → Task 3 Step 4 and Task 5 Step 2. Timeout → Task 3 (`TIMEOUT_MS`). Testing and the acceptance criterion → Tasks 3 and 6.

**Known deviations from the spec, deliberate.**
1. The spec proposed a new 10% coherence constant. The engine already exports `isNutritionallyConsistent` at 0.15 and `search.tsx` already uses it. The plan reuses it; the spec has been corrected to match. The 10% figure survives only as the eval's scoring tolerance in Task 7, where it grades against a published reference rather than a food's internal consistency — a different question.
2. The spec did not mention that mobile has no test runner. Task 3 Step 0 adds vitest, because the spec's testing requirements are otherwise unmeetable. It is folded into the task that needs it rather than standing alone, so no task exists whose only deliverable is a test asserting nothing.
3. `foodLookup.enabled` is derived from the presence of a key rather than being a separate toggle, removing a state that can contradict itself.

**Unresolved until implementation.** The exact Gemini model id and the grounding-metadata path are confirmed against the live API in Task 4 Step 1 rather than guessed here. If the observed response shape differs from the parser in Step 4, the observed shape wins and its test is updated to match.
