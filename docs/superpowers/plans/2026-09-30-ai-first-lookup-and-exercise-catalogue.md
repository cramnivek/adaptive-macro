# AI-first lookup and exercise catalogue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI lookup automatic where the app would otherwise show a dead end, turn exercises from free-typed strings into catalogue entries with a movement pattern and a how-to, and give each one a glance-level icon.

**Architecture:** Food search gains a settle-delayed auto-lookup reusing the existing `runLookup()`. Exercises gain migration v4 (`exercise_catalogue` plus one nullable link column) that never rewrites `exercises.name`. Enrichment is a **single structured Gemini call** with no grounding, split pure-logic-in-`src/ai` from network-in-`src/api` the same way `importWorkouts.ts` is split from `runImport.ts`.

**Tech Stack:** Expo SDK 57, React Native 0.86, `react-native-web` 0.21, expo-router 57, expo-sqlite, `react-native-svg` (already a dependency), Vitest (node environment).

Spec: `docs/superpowers/specs/2026-09-30-ai-first-lookup-and-exercise-catalogue-design.md`

## Global Constraints

- **Two runtimes, one codebase.** Android ships a native APK; iOS ships as a PWA from the Cloud Run site. Every change must hold in both. Do not reach for `@expo/ui` — it has no web implementation, and on this project iOS *is* web.
- **`MIGRATIONS` is append-only.** Each entry has shipped to a real device. Add a new step; never edit one in place.
- **`exercises.name` is never written by this plan.** `sets` carries its own `exercise_name` copy and `listSetsForExercise` keys on it, so a rename silently rewrites history. `Bench Press` and `Bench Press (Smith Machine)` are deliberately different lifts.
- **Only pure modules are tested.** `mobile/vitest.config.ts` runs `environment: 'node'` with `include: ['src/**/__tests__/**/*.test.ts']`. Anything importing `react-native` — directly or transitively — fails to *run*, not merely to fail. Do not loosen the config and do not write a component rendering test.
- **`mobile/src/theme/palette.ts` must keep zero import statements** — the contrast test imports it under node.
- **Every `<Text>` needs an explicit `fontFamily`.** React Native Web falls back to the system font otherwise. Use `font.ui` / `font.uiStrong` / `font.figure` from `mobile/src/theme`. Never put a `fontWeight` beside a `fontFamily` from those families — it synthesises a faux-bold over a real one.
- **Touch targets stay >= `TOUCH_TARGET` (44)**, exported from `mobile/src/components/Controls.tsx`.
- **Never hardcode `'#FFFFFF'` on a filled control.** Use `colors.onFill`; the accent is near-white in dark mode.
- **Do not reformat, refactor, or improve code this plan does not name.**
- Every commit must leave `npm test` and `npm run typecheck` green.
- End every commit message with a `Co-Authored-By:` line naming the model that did the work.

## Verification reality

Tasks 1, 5, 6 and 8 change only what is drawn or require a database, and neither can be tested under node. They carry written browser procedures instead, with assertions chosen so they cannot pass by accident. Tasks 3 and 7 carry real automated tests.

Dev server, from `mobile/`:

```bash
npx expo start --web
```

**Do not prefix with `CI=1`** — that disables file watching and you will test a stale bundle. If Expo Router starts answering every path with "Unmatched Route", the Metro cache is stale: `npx expo start --web --clear`.

---

### Task 1: Food search looks up automatically on zero results

**Files:**
- Modify: `mobile/app/search.tsx`

**Interfaces:**
- Consumes: existing `runLookup()`, `lookingUp`, `lookupElapsed`, `latestQuery`, `results`, `showingFrequent`, `loading` — all already in the file.
- Produces: nothing exported.

- [ ] **Step 1: Add the delay constant**

In `mobile/app/search.tsx`, beside the existing `THIN_RESULT_COUNT`:

```tsx
  // On top of the 350ms search debounce, so the full sequence is: stop typing,
  // 350ms, database search, settles empty, then this before a call is spent.
  const AUTO_LOOKUP_DELAY_MS = 1200;
```

- [ ] **Step 2: Narrow the manual button to thin-but-nonzero**

Replace the `canLookUp` line:

```tsx
  // Zero results is now handled automatically below. The button survives for
  // one or two results, where a real database hit might still be the right
  // answer and spending a call would be presumptuous.
  const canLookUp =
    !showingFrequent && !loading && shown.length > 0 && shown.length < THIN_RESULT_COUNT;
```

- [ ] **Step 3: Add the attempted-query guard**

Beside the other refs near the top of the component:

```tsx
  // Every query the auto-lookup has already tried on this screen. Without it a
  // failed lookup refires the moment its error clears, and deleting a
  // character then retyping it spends a second call for the same question.
  const autoAttempted = useRef<Set<string>>(new Set());
```

- [ ] **Step 4: Add the auto-lookup effect**

Place it immediately after the existing search-debounce effect, and **after** `runLookup` is declared — `runLookup` is a `useCallback` and must exist before the effect referencing it:

```tsx
  // AI is not a thing you ask for here; it is what happens when the databases
  // have nothing. Only on zero results, only once per distinct query, and only
  // after typing has settled, so nothing fires mid-word.
  useEffect(() => {
    const trimmed = query.trim();
    if (showingFrequent || loading || lookingUp) return;
    if (results.length > 0 || trimmed.length < 2) return;
    if (autoAttempted.current.has(trimmed)) return;

    const timer = setTimeout(() => {
      if (!mounted.current || latestQuery.current !== trimmed) return;
      autoAttempted.current.add(trimmed);
      void runLookup();
    }, AUTO_LOOKUP_DELAY_MS);

    return () => clearTimeout(timer);
  }, [query, showingFrequent, loading, lookingUp, results.length, runLookup]);
```

- [ ] **Step 5: Say what is happening in the empty state**

Replace the `ListEmptyComponent` text expression:

```tsx
              {showingFrequent
                ? 'Search for a food, or scan a barcode from the Today tab.'
                : lookingUp
                  ? `Nothing found — looking it up… ${lookupElapsed}s`
                  : 'Nothing found. Try a shorter or more general term, or add it yourself.'}
```

The counter already exists because the grounded call can take 90 seconds and without a visible clock that reads as a hang.

- [ ] **Step 6: Typecheck and test**

```bash
cd mobile && npm run typecheck && npm test
```

Expected: clean, 152 tests across 8 files, unchanged. This task adds no test — nothing in it can run under node.

- [ ] **Step 7: Verify in a browser**

1. `npx expo start --web`, devtools device toolbar → iPhone.
2. Today → `+` on any meal.
3. Type a real food ("chicken"). Assert results appear and **no** lookup starts — the elapsed counter must not appear.
4. Type nonsense that no database will carry, e.g. `zzzqq pie`. Assert: results stay empty, then after about a second and a half the empty state changes to "Nothing found — looking it up… 1s" and the counter climbs.
5. While it runs, type another character. Assert the counter stops and no candidate sheet appears for the abandoned query.
6. Let one complete. Assert either a candidate sheet opens, or an error line appears — and that it does **not** immediately retry.
7. Clear the field and retype the exact same nonsense. Assert **no** second lookup fires. This is the guard working; if it fires again the `Set` is not being consulted.
8. Find a query returning one or two results. Assert the "Look it up with AI" button is present — it must survive for the thin case.

- [ ] **Step 8: Commit**

```bash
git add mobile/app/search.tsx
git commit -m "$(cat <<'EOF'
feat(search): look a food up automatically when the databases have nothing

The lookup path was already wired and already gated; the only thing missing was
the app doing it without being asked. Now a search that settles with zero
results waits for typing to stop and then spends the call itself.

Only on zero. One or two thin results keep the manual button, because a real
database hit might still be the right answer and spending a call there would be
presumptuous.

Guarded by the set of queries already attempted on this screen, so a failed
lookup cannot refire the moment its error clears, and retyping the same term
costs nothing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Migration v4 — the catalogue table, and backups that include it

**Files:**
- Modify: `mobile/src/db/schema.ts` (append one migration)
- Modify: `mobile/src/db/index.ts` (backup shape, export query, restore order)

**Interfaces:**
- Produces: tables `exercise_catalogue`, and `exercises.catalogue_id`.

- [ ] **Step 1: Append migration v4**

At the **end** of the `MIGRATIONS` array in `mobile/src/db/schema.ts`, after the v3 entry:

```ts
  // v4 — the exercise catalogue
  `
  CREATE TABLE IF NOT EXISTS exercise_catalogue (
    id               TEXT PRIMARY KEY NOT NULL,
    canonical_name   TEXT NOT NULL UNIQUE,
    movement_pattern TEXT NOT NULL,
    primary_muscle   TEXT NOT NULL,
    equipment        TEXT NOT NULL,
    bodyweight_based INTEGER NOT NULL DEFAULT 0,
    instructions     TEXT,
    created_at       TEXT NOT NULL
  );

  ALTER TABLE exercises ADD COLUMN catalogue_id TEXT REFERENCES exercise_catalogue (id);
  `,
```

`instructions` is nullable on purpose: an entry may exist as a classification before its how-to is generated, and a generation failure must not stop the entry existing.

- [ ] **Step 2: Add the table to the backup shape**

In `mobile/src/db/index.ts`, find the backup interface that declares `exercises?: Record<string, unknown>[];` and add beside it:

```ts
  exerciseCatalogue?: Record<string, unknown>[];
```

- [ ] **Step 3: Export the table**

In the same file, find the export object containing `exercises: await db.getAllAsync('SELECT * FROM exercises'),` and add:

```ts
    exerciseCatalogue: await db.getAllAsync('SELECT * FROM exercise_catalogue'),
```

- [ ] **Step 4: Restore it, in the right order**

Find the delete-order array containing `'routine_exercises'`, `'exercises'` and add `'exercise_catalogue'` **after** `'exercises'` — children are deleted before parents, and `exercises.catalogue_id` references the catalogue.

Then find the insert calls (`await insertRows(db, 'exercises', backup.exercises);`) and add **before** the `exercises` insert, because the foreign key points that way:

```ts
    await insertRows(db, 'exercise_catalogue', backup.exerciseCatalogue);
```

Read the surrounding lines before editing so the ordering is right. A backup that silently drops the catalogue would be worse than no backup, and `HANDOFF.md` states that backups hold everything.

- [ ] **Step 5: Typecheck and test**

```bash
cd mobile && npm run typecheck && npm test
```

Expected: clean, 152 tests unchanged.

- [ ] **Step 6: Verify the migration applies**

1. `npx expo start --web`, open the app, let it load.
2. Devtools console — assert no SQLite error is logged.
3. Settings → Your data → **Save a backup**. Open the downloaded JSON and assert it contains an `exerciseCatalogue` key (an empty array is correct at this point).
4. Assert the app still shows your existing exercises on Train — the migration must not have disturbed them.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/db/schema.ts mobile/src/db/index.ts
git commit -m "$(cat <<'EOF'
feat(db): migration v4 adds the exercise catalogue

One new table and one nullable link column on exercises. Additive, which is the
safest shape a migration has, and it never writes exercises.name — sets carry
their own exercise_name copy and listSetsForExercise keys on it, so a rename
would silently rewrite what past sessions say.

Backups carry the new table too, deleted after exercises and inserted before
it so the foreign key holds. A backup that quietly dropped the catalogue would
be worse than no backup.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The enrichment logic, pure and tested

This is the task with real TDD. Everything here is pure — no fetch, no React Native — so it runs under node.

**Files:**
- Create: `mobile/src/ai/exercises.ts`
- Test: `mobile/src/ai/__tests__/exercises.test.ts`

**Interfaces:**
- Produces, all from `mobile/src/ai/exercises.ts`:
  - `const MOVEMENT_PATTERNS: readonly ['push','pull','squat','hinge','lunge','carry','core','isolation']`
  - `type MovementPattern = (typeof MOVEMENT_PATTERNS)[number]`
  - `interface EnrichedExercise { requestedName: string; canonicalName: string; movementPattern: MovementPattern; primaryMuscle: string; equipment: string; bodyweightBased: boolean; instructions: string }`
  - `const BATCH_SIZE = 20`
  - `batchNames(names: string[], size?: number): string[][]`
  - `normalisePattern(raw: unknown): MovementPattern`
  - `enrichmentPromptFor(names: string[]): string`
  - `const ENRICHMENT_SCHEMA: Record<string, unknown>`
  - `class EnrichmentParseError extends Error`
  - `parseEnrichment(raw: unknown, requested: string[]): { entries: EnrichedExercise[]; missing: string[] }`

- [ ] **Step 1: Write the failing test**

Create `mobile/src/ai/__tests__/exercises.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  BATCH_SIZE,
  EnrichmentParseError,
  MOVEMENT_PATTERNS,
  batchNames,
  enrichmentPromptFor,
  normalisePattern,
  parseEnrichment,
} from '../exercises';

const entry = (name: string, pattern = 'push') => ({
  requestedName: name,
  canonicalName: name,
  movementPattern: pattern,
  primaryMuscle: 'chest',
  equipment: 'barbell',
  bodyweightBased: false,
  instructions: 'Lie on the bench. Lower the bar to your chest. Press it back up.',
});

describe('batchNames', () => {
  it('splits 41 names into 20, 20 and 1', () => {
    const names = Array.from({ length: 41 }, (_, i) => `Exercise ${i}`);
    const batches = batchNames(names);
    expect(batches.map((b) => b.length)).toEqual([20, 20, 1]);
    expect(batches.flat()).toEqual(names);
  });

  it('returns nothing for an empty list rather than one empty batch', () => {
    expect(batchNames([])).toEqual([]);
  });

  it('puts a single name in a single batch', () => {
    expect(batchNames(['Squat'])).toEqual([['Squat']]);
  });

  it('uses a batch size of 20', () => {
    expect(BATCH_SIZE).toBe(20);
  });
});

describe('normalisePattern', () => {
  it.each(MOVEMENT_PATTERNS)('passes %s through unchanged', (pattern) => {
    expect(normalisePattern(pattern)).toBe(pattern);
  });

  // The pattern drives icon selection, so an unrecognised value must land
  // somewhere honest rather than crash or render nothing.
  it.each([['sprint'], [''], [null], [undefined], [42], [{}]])(
    'falls back to isolation for %o',
    (raw) => {
      expect(normalisePattern(raw)).toBe('isolation');
    },
  );
});

describe('enrichmentPromptFor', () => {
  it('names every exercise it was given', () => {
    const prompt = enrichmentPromptFor(['Barbell Squat', 'Pull Up']);
    expect(prompt).toContain('Barbell Squat');
    expect(prompt).toContain('Pull Up');
  });

  it('lists the movement patterns the model may choose from', () => {
    const prompt = enrichmentPromptFor(['Squat']);
    for (const pattern of MOVEMENT_PATTERNS) expect(prompt).toContain(pattern);
  });
});

describe('parseEnrichment', () => {
  it('maps a well-formed response to entries', () => {
    const result = parseEnrichment({ exercises: [entry('Bench Press')] }, ['Bench Press']);
    expect(result.missing).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].canonicalName).toBe('Bench Press');
    expect(result.entries[0].movementPattern).toBe('push');
    expect(result.entries[0].bodyweightBased).toBe(false);
  });

  it('normalises an unrecognised pattern rather than rejecting the entry', () => {
    const result = parseEnrichment({ exercises: [entry('Farmer Carry', 'strongman')] }, [
      'Farmer Carry',
    ]);
    expect(result.entries[0].movementPattern).toBe('isolation');
  });

  // Silence here would mean an exercise stays unlinked with no explanation.
  it('names the exercises the model did not return', () => {
    const result = parseEnrichment({ exercises: [entry('Bench Press')] }, [
      'Bench Press',
      'Deadlift',
      'Pull Up',
    ]);
    expect(result.missing).toEqual(['Deadlift', 'Pull Up']);
    expect(result.entries).toHaveLength(1);
  });

  it('ignores an entry for a name it never asked about', () => {
    const result = parseEnrichment({ exercises: [entry('Bench Press'), entry('Leg Press')] }, [
      'Bench Press',
    ]);
    expect(result.entries.map((e) => e.requestedName)).toEqual(['Bench Press']);
  });

  it.each([[null], [undefined], [{}], [{ exercises: 'no' }], ['a string']])(
    'throws rather than writing partial data for %o',
    (raw) => {
      expect(() => parseEnrichment(raw, ['Squat'])).toThrow(EnrichmentParseError);
    },
  );

  it('throws when an entry is missing a required field', () => {
    const broken = { ...entry('Squat'), instructions: undefined };
    expect(() => parseEnrichment({ exercises: [broken] }, ['Squat'])).toThrow(
      EnrichmentParseError,
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd mobile && npx vitest run src/ai/__tests__/exercises.test.ts
```

Expected: FAIL — `Failed to resolve import "../exercises"`. The module does not exist yet.

- [ ] **Step 3: Write the module**

Create `mobile/src/ai/exercises.ts`. **It must not import anything from `react-native`, `expo-*`, or `../db`** — the test runs under node and any of those would stop it running at all.

```ts
/**
 * Turning an exercise name into a known thing.
 *
 * Pure by design: prompt construction and response parsing live here so they
 * can be tested under node, while the network call sits in `src/api/gemini.ts`.
 * The same split `importWorkouts.ts` has from `runImport.ts`, for the same
 * reason — `mobile/vitest.config.ts` runs `environment: 'node'`, where
 * anything reaching react-native fails to run rather than merely to fail.
 *
 * Unlike a food lookup this needs no grounding. A food's macros are published
 * figures and an ungrounded answer is a fabrication, which is why `lookupFood`
 * costs two calls and treats a missing grounding chunk as failure. Which muscle
 * a press loads is general knowledge, so this is one structured call.
 */

/** The patterns an icon exists for. Anything else is normalised into `isolation`. */
export const MOVEMENT_PATTERNS = [
  'push',
  'pull',
  'squat',
  'hinge',
  'lunge',
  'carry',
  'core',
  'isolation',
] as const;

export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export interface EnrichedExercise {
  /** The name as it exists in `exercises.name`. Never rewritten; used to link. */
  requestedName: string;
  canonicalName: string;
  movementPattern: MovementPattern;
  primaryMuscle: string;
  equipment: string;
  bodyweightBased: boolean;
  instructions: string;
}

/**
 * Names per call.
 *
 * One call per exercise would cost a Hevy history of eighty lifts eighty calls.
 * Twenty at a time makes that four.
 */
export const BATCH_SIZE = 20;

export class EnrichmentParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnrichmentParseError';
  }
}

export const batchNames = (names: string[], size: number = BATCH_SIZE): string[][] => {
  const batches: string[][] = [];
  for (let i = 0; i < names.length; i += size) batches.push(names.slice(i, i + size));
  return batches;
};

export const normalisePattern = (raw: unknown): MovementPattern =>
  typeof raw === 'string' && (MOVEMENT_PATTERNS as readonly string[]).includes(raw)
    ? (raw as MovementPattern)
    : 'isolation';

export const enrichmentPromptFor = (names: string[]): string =>
  [
    'You are cataloguing strength-training exercises.',
    'For each name below, return its canonical name, its movement pattern, the primary muscle it loads, the equipment it needs, whether it is loaded by bodyweight, and brief instructions for performing it.',
    `The movement pattern must be exactly one of: ${MOVEMENT_PATTERNS.join(', ')}.`,
    'Instructions should be two to four short sentences covering setup, the movement itself, and the one cue that most often goes wrong. Do not number them.',
    'Keep the canonical name close to the name given — do not merge a machine or variation into its barbell parent, because they load differently and are tracked separately.',
    'Return one entry per name given, using the name exactly as given in requestedName.',
    '',
    'Names:',
    ...names.map((name) => `- ${name}`),
  ].join('\n');

export const ENRICHMENT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    exercises: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          requestedName: { type: 'string' },
          canonicalName: { type: 'string' },
          movementPattern: { type: 'string', enum: [...MOVEMENT_PATTERNS] },
          primaryMuscle: { type: 'string' },
          equipment: { type: 'string' },
          bodyweightBased: { type: 'boolean' },
          instructions: { type: 'string' },
        },
        required: [
          'requestedName',
          'canonicalName',
          'movementPattern',
          'primaryMuscle',
          'equipment',
          'bodyweightBased',
          'instructions',
        ],
      },
    },
  },
  required: ['exercises'],
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

export const parseEnrichment = (
  raw: unknown,
  requested: string[],
): { entries: EnrichedExercise[]; missing: string[] } => {
  const list = (raw as { exercises?: unknown })?.exercises;
  if (!Array.isArray(list)) {
    throw new EnrichmentParseError('Enrichment response had no exercises array');
  }

  const wanted = new Set(requested);
  const entries: EnrichedExercise[] = [];

  for (const item of list) {
    const row = item as Record<string, unknown>;
    // An entry for something we never asked about tells us nothing and would
    // create a catalogue row no exercise links to.
    if (!isNonEmptyString(row.requestedName) || !wanted.has(row.requestedName)) continue;

    if (
      !isNonEmptyString(row.canonicalName) ||
      !isNonEmptyString(row.primaryMuscle) ||
      !isNonEmptyString(row.equipment) ||
      !isNonEmptyString(row.instructions) ||
      typeof row.bodyweightBased !== 'boolean'
    ) {
      throw new EnrichmentParseError(`Enrichment entry for ${row.requestedName} was incomplete`);
    }

    entries.push({
      requestedName: row.requestedName,
      canonicalName: row.canonicalName,
      movementPattern: normalisePattern(row.movementPattern),
      primaryMuscle: row.primaryMuscle,
      equipment: row.equipment,
      bodyweightBased: row.bodyweightBased,
      instructions: row.instructions,
    });
  }

  const returned = new Set(entries.map((e) => e.requestedName));
  return { entries, missing: requested.filter((name) => !returned.has(name)) };
};
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
cd mobile && npx vitest run src/ai/__tests__/exercises.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 5: Full suite and typecheck**

```bash
cd mobile && npm run typecheck && npm test
```

Expected: clean; the count rises from 152 by the number of generated cases. Report the new total.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/ai/exercises.ts mobile/src/ai/__tests__/exercises.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): exercise enrichment, pure and tested

Prompt construction and response parsing, with no network and no react-native
import, so they run under node — the same split importWorkouts.ts has from
runImport.ts and for the same reason.

Batches twenty names per call: one call per exercise would cost a Hevy history
of eighty lifts eighty calls, and this makes it four.

A malformed response throws rather than writing partial data, an unrecognised
movement pattern falls back to isolation because the pattern drives icon
selection, and names the model failed to return are reported rather than
silently dropped.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The enrichment call, and the catalogue's database layer

**Files:**
- Modify: `mobile/src/api/gemini.ts` (add `enrichExercises`)
- Modify: `mobile/src/db/index.ts` (catalogue queries)

**Interfaces:**
- Consumes: `enrichmentPromptFor`, `ENRICHMENT_SCHEMA`, `parseEnrichment`, `EnrichedExercise`, `MovementPattern` from `../ai/exercises` (Task 3).
- Produces, from `mobile/src/api/gemini.ts`:
  - `enrichExercises(names: string[], apiKey: string): Promise<{ entries: EnrichedExercise[]; missing: string[] }>`
- Produces, from `mobile/src/db/index.ts`:
  - `interface CatalogueEntry { id: string; canonicalName: string; movementPattern: MovementPattern; primaryMuscle: string; equipment: string; bodyweightBased: boolean; instructions: string | null }`
  - `upsertCatalogueEntry(entry: EnrichedExercise): Promise<string>` — returns the catalogue id
  - `linkExerciseToCatalogue(exerciseName: string, catalogueId: string): Promise<void>`
  - `listUnlinkedExerciseNames(): Promise<string[]>`
  - `searchCatalogue(term: string, limit?: number): Promise<CatalogueEntry[]>`
  - `catalogueEntryForExercise(exerciseName: string): Promise<CatalogueEntry | null>`

- [ ] **Step 1: Add the enrichment call to the Gemini client**

In `mobile/src/api/gemini.ts`, add the import at the top beside the existing imports:

```ts
import {
  ENRICHMENT_SCHEMA,
  enrichmentPromptFor,
  parseEnrichment,
  type EnrichedExercise,
} from '../ai/exercises';
```

Beside `STRUCTURE_TIMEOUT_MS`, add:

```ts
/**
 * Enrichment does no grounded I/O, so it should be as quick as the structuring
 * call. If it is not, something is wrong rather than merely slow.
 */
const ENRICH_TIMEOUT_MS = 15_000;
```

Then, at the end of the file:

```ts
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
```

`textOf`, `postJson`, `MODEL` and `GroundedLookupError` are all already in that file. If `textOf` is declared below this point, move your function after it rather than hoisting anything.

- [ ] **Step 2: Add the catalogue queries**

In `mobile/src/db/index.ts`, near the other exercise functions (after `setExerciseBodyweightBased`), add:

```ts
// --- the exercise catalogue ------------------------------------------------

export interface CatalogueEntry {
  id: string;
  canonicalName: string;
  movementPattern: MovementPattern;
  primaryMuscle: string;
  equipment: string;
  bodyweightBased: boolean;
  instructions: string | null;
}

interface CatalogueRow {
  id: string;
  canonical_name: string;
  movement_pattern: string;
  primary_muscle: string;
  equipment: string;
  bodyweight_based: number;
  instructions: string | null;
}

const toCatalogueEntry = (row: CatalogueRow): CatalogueEntry => ({
  id: row.id,
  canonicalName: row.canonical_name,
  movementPattern: normalisePattern(row.movement_pattern),
  primaryMuscle: row.primary_muscle,
  equipment: row.equipment,
  bodyweightBased: row.bodyweight_based === 1,
  instructions: row.instructions,
});

/** Creates the entry, or returns the id of the one already holding that name. */
export const upsertCatalogueEntry = async (entry: EnrichedExercise): Promise<string> => {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM exercise_catalogue WHERE canonical_name = ?',
    entry.canonicalName,
  );
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO exercise_catalogue
       (id, canonical_name, movement_pattern, primary_muscle, equipment, bodyweight_based, instructions, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    entry.canonicalName,
    entry.movementPattern,
    entry.primaryMuscle,
    entry.equipment,
    entry.bodyweightBased ? 1 : 0,
    entry.instructions,
    localStamp(),
  );
  return id;
};

/**
 * Links an exercise to its catalogue entry.
 *
 * Only ever writes `catalogue_id`. `exercises.name` is not touched here or
 * anywhere else: `sets` carries its own `exercise_name` copy and
 * `listSetsForExercise` keys on it, so a rename rewrites history silently.
 */
export const linkExerciseToCatalogue = async (
  exerciseName: string,
  catalogueId: string,
): Promise<void> => {
  const db = await getDb();
  await db.runAsync(
    'UPDATE exercises SET catalogue_id = ? WHERE name = ?',
    catalogueId,
    exerciseName,
  );
};

/** Exercise names with no catalogue entry yet — the seeding queue. */
export const listUnlinkedExerciseNames = async (): Promise<string[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT e.name
       FROM exercises e LEFT JOIN sets s ON s.exercise_id = e.id
      WHERE e.catalogue_id IS NULL
      GROUP BY e.id ORDER BY COUNT(s.id) DESC, e.name`,
  );
  return rows.map((r) => r.name);
};

export const searchCatalogue = async (term: string, limit = 30): Promise<CatalogueEntry[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<CatalogueRow>(
    `SELECT id, canonical_name, movement_pattern, primary_muscle, equipment,
            bodyweight_based, instructions
       FROM exercise_catalogue
      WHERE canonical_name LIKE ?
      ORDER BY canonical_name
      LIMIT ?`,
    `%${term}%`,
    limit,
  );
  return rows.map(toCatalogueEntry);
};

export const catalogueEntryForExercise = async (
  exerciseName: string,
): Promise<CatalogueEntry | null> => {
  const db = await getDb();
  const row = await db.getFirstAsync<CatalogueRow>(
    `SELECT c.id, c.canonical_name, c.movement_pattern, c.primary_muscle, c.equipment,
            c.bodyweight_based, c.instructions
       FROM exercises e JOIN exercise_catalogue c ON c.id = e.catalogue_id
      WHERE e.name = ?`,
    exerciseName,
  );
  return row ? toCatalogueEntry(row) : null;
};
```

Add to that file's imports:

```ts
import { normalisePattern, type EnrichedExercise, type MovementPattern } from '../ai/exercises';
```

`localStamp()` and `crypto.randomUUID()` are both already used elsewhere in this file — match whatever it already does for ids rather than introducing a new scheme.

- [ ] **Step 3: Typecheck and test**

```bash
cd mobile && npm run typecheck && npm test
```

Expected: clean, count unchanged from Task 3. `src/db/index.ts` cannot be unit-tested — it imports expo-sqlite — which is why the logic worth testing lives in `src/ai/exercises.ts`.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/api/gemini.ts mobile/src/db/index.ts
git commit -m "$(cat <<'EOF'
feat(ai): one structured call enriches a batch of exercises

enrichExercises asks for structured output directly rather than grounding
first. lookupFood needs two calls because a food's macros are published figures
and an ungrounded answer is a fabrication; which muscle a press loads is not a
sourced figure, so this carries no grounding charge and a 15s timeout.

The catalogue's queries only ever write catalogue_id. exercises.name is not
touched, here or anywhere.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Seed the catalogue from the history already on the device

**Files:**
- Modify: `mobile/app/(tabs)/settings.tsx` (a button inside the existing "Your data" section)

**Interfaces:**
- Consumes: `enrichExercises` (Task 4), `listUnlinkedExerciseNames`, `upsertCatalogueEntry`, `linkExerciseToCatalogue` (Task 4), `batchNames`, `BATCH_SIZE` (Task 3).

- [ ] **Step 1: Add the seeding handler**

In `mobile/app/(tabs)/settings.tsx`, beside the existing `exportData` / `restoreData` handlers. The file already has a `busy` state used by the demo-data buttons — reuse it rather than adding another.

```tsx
  const buildCatalogue = async () => {
    const names = await listUnlinkedExerciseNames();
    if (names.length === 0) {
      notify('Nothing to do', 'Every exercise on record already has a catalogue entry.');
      return;
    }

    const batches = batchNames(names);
    const missed: string[] = [];

    try {
      for (const [index, batch] of batches.entries()) {
        setBusy(`Batch ${index + 1} of ${batches.length}…`);
        const { entries, missing } = await enrichExercises(
          batch,
          settings.foodLookup.geminiApiKey,
        );
        for (const entry of entries) {
          const id = await upsertCatalogueEntry(entry);
          await linkExerciseToCatalogue(entry.requestedName, id);
        }
        missed.push(...missing);
      }

      notify(
        'Catalogue built',
        missed.length === 0
          ? `${names.length} exercises catalogued.`
          : `${names.length - missed.length} catalogued. Not recognised: ${missed.join(', ')}. Run it again to retry those.`,
      );
    } catch (error) {
      // Each batch commits as it completes, so what already linked stays
      // linked and running it again picks up where this stopped.
      notify('Stopped partway', `${(error as Error).message} Run it again to continue.`);
    } finally {
      setBusy(null);
    }
  };
```

Add the imports it needs to the existing import lines rather than duplicating them:

```tsx
import { BATCH_SIZE, batchNames } from '../../src/ai/exercises';
import { enrichExercises } from '../../src/api/gemini';
import {
  linkExerciseToCatalogue,
  listUnlinkedExerciseNames,
  upsertCatalogueEntry,
} from '../../src/db';
```

`BATCH_SIZE` is imported for the copy in Step 2; if you word that copy without it, do not import it.

- [ ] **Step 2: Add the button to "Your data"**

Inside the `Your data` `<Section>`, after the restore button:

```tsx
        <View style={{ height: space.sm }} />
        <Text style={[styles.note, { color: colors.textFaint, marginBottom: space.sm }]}>
          Gives every exercise you have on record a movement pattern, a primary muscle
          and instructions. Runs {BATCH_SIZE} at a time, so a long history costs a few
          calls rather than one per exercise. Safe to run again — it skips what is done.
        </Text>
        <Button
          label={busy ?? 'Build the exercise catalogue'}
          disabled={busy !== null}
          onPress={() => void buildCatalogue()}
        />
```

- [ ] **Step 3: Typecheck and test**

```bash
cd mobile && npm run typecheck && npm test
```

Expected: clean, count unchanged.

- [ ] **Step 4: Verify in a browser**

This one spends real Gemini calls. Run it once and read the result carefully.

1. `npx expo start --web`, Settings → Your data.
2. Assert the button and its explanatory line are present.
3. Tap it. Assert the label changes to "Batch 1 of N…" and that N matches roughly `ceil(distinct exercises / 20)`.
4. Wait for it to finish. Assert the notification states a count, and that the count is plausible against your training history.
5. Tap it a second time. Assert it reports "Nothing to do" — if it re-runs the whole set, `listUnlinkedExerciseNames` is not filtering on `catalogue_id IS NULL`.
6. Settings → Your data → Save a backup. Open the JSON and assert `exerciseCatalogue` now holds entries with `movement_pattern` and `instructions` populated.
7. Assert Train still lists your exercises under their original names. **If any name changed, stop — that is the one thing this design forbids.**

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/(tabs)/settings.tsx"
git commit -m "$(cat <<'EOF'
feat(settings): build the exercise catalogue from the history already here

Seeds from what you actually train rather than from a generic list, so the
catalogue starts relevant. Twenty names per call, so a Hevy history of eighty
lifts costs four calls.

Each batch commits as it completes and the queue is everything still unlinked,
so a failure partway leaves earlier work in place and running it again picks up
where it stopped rather than starting over.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The picker reads the catalogue, and enriches what it does not know

**Files:**
- Modify: `mobile/app/session.tsx` (the exercise picker)

**Interfaces:**
- Consumes: `searchCatalogue`, `upsertCatalogueEntry`, `linkExerciseToCatalogue`, `CatalogueEntry` (Task 4), `enrichExercises` (Task 4).

- [ ] **Step 1: Add catalogue state and the search effect**

In `mobile/app/session.tsx`, beside the existing `search` and `picking` state:

```tsx
  const [matches, setMatches] = useState<CatalogueEntry[]>([]);
  const [enriching, setEnriching] = useState(false);
  // Same guard as the food search: one automatic call per distinct term, so a
  // failed enrichment cannot refire and retyping costs nothing.
  const autoEnriched = useRef<Set<string>>(new Set());

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setMatches([]);
      return;
    }
    let current = true;
    void searchCatalogue(term).then((found) => {
      if (current) setMatches(found);
    });
    return () => {
      current = false;
    };
  }, [search]);
```

- [ ] **Step 2: Add the auto-enrichment effect**

```tsx
  // A name the catalogue does not know is the dead end worth removing. Wait for
  // typing to settle, then classify it and write its how-to, once.
  useEffect(() => {
    const term = search.trim();
    if (!picking || enriching || term.length < 2) return;
    if (matches.length > 0 || autoEnriched.current.has(term)) return;

    const timer = setTimeout(() => {
      autoEnriched.current.add(term);
      setEnriching(true);
      void enrichExercises([term], settings.foodLookup.geminiApiKey)
        .then(async ({ entries }) => {
          if (entries.length === 0) return;
          const id = await upsertCatalogueEntry(entries[0]);
          await linkExerciseToCatalogue(entries[0].requestedName, id);
          const found = await searchCatalogue(term);
          setMatches(found);
        })
        .catch(() => {
          // Typing the name still works; this only means it arrives without a
          // pattern or a how-to, which is better than blocking the set.
        })
        .finally(() => setEnriching(false));
    }, 1200);

    return () => clearTimeout(timer);
  }, [search, picking, enriching, matches.length, settings.foodLookup.geminiApiKey]);
```

- [ ] **Step 3: Render catalogue matches instead of raw names**

Replace the picker's `known.filter(...)` block with the catalogue results, keeping the existing `styles.pickRow` and the `Add "…"` fallback exactly as they are:

```tsx
            {matches.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => void addExercise(item.canonicalName)}
                style={[styles.pickRow, { borderColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontFamily: font.ui }}>
                    {item.canonicalName}
                  </Text>
                  <Text
                    style={{ color: colors.textFaint, fontSize: 12, fontFamily: font.ui }}
                  >
                    {item.primaryMuscle} · {item.equipment}
                    {item.bodyweightBased ? ' · bodyweight' : ''}
                  </Text>
                </View>
              </Pressable>
            ))}
            {enriching && (
              <Text
                style={{
                  color: colors.textFaint,
                  fontSize: 12,
                  fontFamily: font.ui,
                  padding: space.md,
                }}
              >
                Looking that exercise up…
              </Text>
            )}
```

Leave `known` and `listExerciseNames` in place — the picker still falls back to `addExercise(search)` for a name the catalogue rejected, and the `Add "…"` button already covers that path.

- [ ] **Step 4: Typecheck and test**

```bash
cd mobile && npm run typecheck && npm test
```

Expected: clean, count unchanged. If `known` is now unused, remove its state and its loader — but only if typecheck says so.

- [ ] **Step 5: Verify in a browser**

1. `npx expo start --web`, Train → Start a session → Add exercise.
2. Type the first letters of an exercise you seeded in Task 5. Assert it appears with its muscle and equipment underneath.
3. Tap it. Assert it is added to the session under that name and a set row appears.
4. Add another exercise, and type a movement you have never trained, e.g. `Zercher Squat`. Assert: no matches, then after about a second and a half "Looking that exercise up…" appears, then a row appears with a muscle and equipment.
5. Tap it and assert it adds normally.
6. Delete the text and retype `Zercher Squat`. Assert it now matches **instantly from the catalogue** with no lookup — it was written on the first attempt.
7. Type gibberish (`qqzz`). Assert one lookup attempt, and that retyping the same gibberish does **not** fire a second.

- [ ] **Step 6: Commit**

```bash
git add mobile/app/session.tsx
git commit -m "$(cat <<'EOF'
feat(session): the picker searches the catalogue and learns what it lacks

Exercises stop being whatever string was typed. The picker searches catalogue
entries and shows what each movement loads and what it needs, and a name it
does not know is classified automatically once typing settles rather than being
added as bare text.

Typing a genuinely new movement is still allowed — it just arrives as a proper
entry with a pattern and a how-to instead of a string.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The movement-pattern icon

**Files:**
- Create: `mobile/src/components/ExerciseIcon.tsx`
- Test: `mobile/src/components/__tests__/exerciseIconPaths.test.ts`
- Create: `mobile/src/ai/exerciseIconPaths.ts`

The drawing lives in a component that imports `react-native-svg`; the **path data** lives in a pure module so it can be tested under node. Without that split there is nothing here a test can reach.

**Interfaces:**
- Consumes: `MOVEMENT_PATTERNS`, `MovementPattern` (Task 3).
- Produces: `ICON_PATHS: Record<MovementPattern, string[]>` from `mobile/src/ai/exerciseIconPaths.ts`; `pathsFor(pattern: unknown): string[]`; and `<ExerciseIcon pattern={...} size={...} color={...} />`.

- [ ] **Step 1: Write the failing test**

Create `mobile/src/components/__tests__/exerciseIconPaths.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MOVEMENT_PATTERNS } from '../../ai/exercises';
import { ICON_PATHS, pathsFor } from '../../ai/exerciseIconPaths';

describe('ICON_PATHS', () => {
  it.each(MOVEMENT_PATTERNS)('has at least one path for %s', (pattern) => {
    expect(ICON_PATHS[pattern]).toBeDefined();
    expect(ICON_PATHS[pattern].length).toBeGreaterThan(0);
  });

  it('has no pattern the enum does not know', () => {
    expect(Object.keys(ICON_PATHS).sort()).toEqual([...MOVEMENT_PATTERNS].sort());
  });

  it('draws a different glyph for every pattern', () => {
    const drawn = Object.values(ICON_PATHS).map((paths) => paths.join('|'));
    expect(new Set(drawn).size).toBe(MOVEMENT_PATTERNS.length);
  });
});

describe('pathsFor', () => {
  it.each(MOVEMENT_PATTERNS)('resolves %s', (pattern) => {
    expect(pathsFor(pattern)).toBe(ICON_PATHS[pattern]);
  });

  // An icon is drawn from whatever the database holds, and a missing glyph is
  // an empty box on screen rather than an error anyone would see.
  it.each([['sprint'], [''], [null], [undefined], [7]])(
    'falls back to the isolation glyph for %o',
    (raw) => {
      expect(pathsFor(raw)).toBe(ICON_PATHS.isolation);
    },
  );
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd mobile && npx vitest run src/components/__tests__/exerciseIconPaths.test.ts
```

Expected: FAIL — `Failed to resolve import "../../ai/exerciseIconPaths"`.

- [ ] **Step 3: Write the path data**

Create `mobile/src/ai/exerciseIconPaths.ts`. It may import from `./exercises` and **nothing else** — no `react-native`, no `react-native-svg`, no `../db`. It is read by a test under node, where any of those would stop it running.

```ts
import { MOVEMENT_PATTERNS, normalisePattern, type MovementPattern } from './exercises';

/**
 * One glyph per movement pattern, on a 24x24 grid.
 *
 * A pattern rather than a drawing of each exercise: one honest glyph covers
 * every row variant, where per-exercise art would need a hundred icons and
 * still miss the next movement someone types. Inline paths rather than bundled
 * assets — no bytes in a PWA already fetching 300 KB of fonts, no licensing,
 * and they inherit currentColor so they theme for free.
 */
export const ICON_PATHS: Record<MovementPattern, string[]> = {
  // A bar pressed away from a body
  push: ['M4 12h6', 'M14 6v12', 'M17 8v8', 'M20 10v4'],
  // A bar drawn toward a body
  pull: ['M20 12h-6', 'M10 6v12', 'M7 8v8', 'M4 10v4'],
  // A loaded bar over bent legs
  squat: ['M4 7h16', 'M8 7v5l-2 6', 'M16 7v5l2 6', 'M8 12h8'],
  // A hinge at the hip, bar hanging
  hinge: ['M5 6h9a4 4 0 0 1 0 8H9', 'M9 14v5', 'M4 19h10'],
  // A split stance
  lunge: ['M7 5v6l-3 8', 'M7 11l6 3v5', 'M4 19h6', 'M13 19h6'],
  // Weight held at the sides, walking
  carry: ['M12 4v10', 'M9 19h6', 'M6 8v8', 'M18 8v8', 'M12 14l-2 5', 'M12 14l2 5'],
  // A braced trunk
  core: ['M4 16h16', 'M7 16a5 5 0 0 1 10 0', 'M12 6v5'],
  // A single joint moving
  isolation: ['M8 19V9a4 4 0 0 1 8 0v10', 'M6 19h12'],
};

export const pathsFor = (pattern: unknown): string[] => ICON_PATHS[normalisePattern(pattern)];
```

`MOVEMENT_PATTERNS` is imported here only to type the record; do **not** re-export it. The test imports it from `../../ai/exercises` directly, and a second export path for one constant is the kind of thing a reviewer rightly flags.

- [ ] **Step 4: Run the test and confirm it passes**

```bash
cd mobile && npx vitest run src/components/__tests__/exerciseIconPaths.test.ts
```

Expected: PASS. If "draws a different glyph for every pattern" fails, two patterns share path data — give them distinct glyphs rather than deleting the assertion.

- [ ] **Step 5: Write the component**

Create `mobile/src/components/ExerciseIcon.tsx`:

```tsx
import Svg, { Path } from 'react-native-svg';
import { pathsFor } from '../ai/exerciseIconPaths';

interface ExerciseIconProps {
  pattern: unknown;
  size?: number;
  color: string;
}

/** Draws the glyph for a movement pattern. Unknown patterns get the isolation glyph. */
export const ExerciseIcon = ({ pattern, size = 20, color }: ExerciseIconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    {pathsFor(pattern).map((d) => (
      <Path
        key={d}
        d={d}
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    ))}
  </Svg>
);
```

- [ ] **Step 6: Full suite and typecheck**

```bash
cd mobile && npm run typecheck && npm test
```

Expected: clean; the count rises by the generated icon cases. Report the new total.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/ai/exerciseIconPaths.ts mobile/src/components/ExerciseIcon.tsx mobile/src/components/__tests__/exerciseIconPaths.test.ts
git commit -m "$(cat <<'EOF'
feat(ui): a glyph per movement pattern

Eight inline stroke paths rather than per-exercise art: one honest glyph covers
every variant of a row, where a literal drawing would need a hundred icons and
still miss the next movement someone types. No asset bytes in a PWA already
fetching 300 KB of fonts, no licensing question, and they inherit currentColor
so they theme for free.

The path data sits in a pure module so it can be tested under node — the
component itself imports react-native-svg and cannot be. The test pins that
every pattern resolves, that no two share a glyph, and that an unknown pattern
falls back rather than rendering nothing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Show the icons, and the instructions behind a tap

**Files:**
- Create: `mobile/src/components/ExerciseInfoSheet.tsx`
- Modify: `mobile/app/session.tsx` (icons in the picker and block headers; open the sheet)

**Interfaces:**
- Consumes: `ExerciseIcon` (Task 7), `CatalogueEntry` and `catalogueEntryForExercise` (Task 4).
- Produces: `<ExerciseInfoSheet entry={CatalogueEntry | null} onClose={() => void} />`.

- [ ] **Step 1: Write the sheet**

Create `mobile/src/components/ExerciseInfoSheet.tsx`, following `EditEntrySheet`'s established Modal-plus-backdrop shape:

```tsx
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CatalogueEntry } from '../db';
import { font, radius, space, useTheme } from '../theme';
import { Button } from './Controls';
import { ExerciseIcon } from './ExerciseIcon';

interface ExerciseInfoSheetProps {
  entry: CatalogueEntry | null;
  onClose: () => void;
}

/**
 * What a movement is, and how to do it.
 *
 * Behind a tap rather than beside the set rows: it is reference material, and
 * the rows are what you are actually doing. The caveat is not decoration — a
 * wrong macro costs you an inaccurate day, a wrong cue under a loaded barbell
 * costs more.
 */
export const ExerciseInfoSheet = ({ entry, onClose }: ExerciseInfoSheetProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={entry !== null} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            paddingBottom: insets.bottom + space.lg,
          },
        ]}
      >
        {entry && (
          <ScrollView>
            <View style={styles.header}>
              <ExerciseIcon pattern={entry.movementPattern} size={28} color={colors.text} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{entry.canonicalName}</Text>
                <Text style={[styles.meta, { color: colors.textFaint }]}>
                  {entry.primaryMuscle} · {entry.equipment}
                  {entry.bodyweightBased ? ' · bodyweight' : ''}
                </Text>
              </View>
            </View>

            {entry.instructions ? (
              <Text style={[styles.body, { color: colors.textMuted }]}>{entry.instructions}</Text>
            ) : (
              <Text style={[styles.body, { color: colors.textFaint }]}>
                No instructions for this one yet.
              </Text>
            )}

            {entry.instructions && (
              <Text style={[styles.caveat, { color: colors.warning }]}>
                Written by a model. Check it against a source you trust before loading a bar.
              </Text>
            )}

            <View style={{ height: space.md }} />
            <Button label="Close" variant="subtle" onPress={onClose} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    maxHeight: '78%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  name: { fontFamily: font.uiStrong, fontSize: 17 },
  meta: { fontFamily: font.ui, fontSize: 12, marginTop: 2 },
  body: { fontFamily: font.ui, fontSize: 14, lineHeight: 21 },
  caveat: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, marginTop: space.md },
});
```

- [ ] **Step 2: Put an icon on every picker row**

In `mobile/app/session.tsx`, inside the picker row added in Task 6, before the text block:

```tsx
                <ExerciseIcon pattern={item.movementPattern} size={20} color={colors.textMuted} />
```

- [ ] **Step 3: Make the block header open the sheet**

Add the state:

```tsx
  const [info, setInfo] = useState<CatalogueEntry | null>(null);
```

Wrap the block header's exercise name in a `Pressable` that loads and opens the entry. The header currently renders `{block.name}` in a `<Text>`; it becomes:

```tsx
            <Pressable
              onPress={() => void catalogueEntryForExercise(block.name).then(setInfo)}
              style={{ flex: 1, minHeight: TOUCH_TARGET, justifyContent: 'center' }}
              accessibilityLabel={`How to do ${block.name}`}
            >
              <Text style={{ color: colors.accent, fontSize: 16, fontFamily: font.uiStrong }}>
                {block.name}
              </Text>
            </Pressable>
```

Then mount the sheet beside the picker:

```tsx
      <ExerciseInfoSheet entry={info} onClose={() => setInfo(null)} />
```

An exercise with no catalogue entry resolves to `null` and the sheet stays shut, which is the right behaviour for a name recorded before the catalogue existed and never re-linked.

- [ ] **Step 4: Add the batched pattern lookup**

Progression shows a row of exercise chips. One catalogue query per chip would be a
query per exercise on every render, so add a single batched read. In
`mobile/src/db/index.ts`, beside the other catalogue queries from Task 4:

```ts
/**
 * Movement pattern for every exercise that has one, keyed by recorded name.
 *
 * One query rather than one per row: progression draws a chip per exercise and
 * looking each one up separately would be a query per chip per render.
 */
export const cataloguePatternsByExerciseName = async (): Promise<
  Record<string, MovementPattern>
> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{ name: string; movement_pattern: string }>(
    `SELECT e.name, c.movement_pattern
       FROM exercises e JOIN exercise_catalogue c ON c.id = e.catalogue_id`,
  );
  return Object.fromEntries(rows.map((r) => [r.name, normalisePattern(r.movement_pattern)]));
};
```

- [ ] **Step 5: Put the glyph on the progression chips**

In `mobile/app/progression.tsx`, load the map once beside the screen's existing state:

```tsx
  const [patterns, setPatterns] = useState<Record<string, MovementPattern>>({});

  useEffect(() => {
    void cataloguePatternsByExerciseName().then(setPatterns);
  }, []);
```

The chip is a `Pressable` around a single `<Text>`. Give it a row layout and put the
glyph before the label, tinting it to match the chip's active state so it reads with
the text rather than against it:

```tsx
                <ExerciseIcon
                  pattern={patterns[name]}
                  size={14}
                  color={active ? colors.onFill : colors.textMuted}
                />
```

Add `flexDirection: 'row'`, `alignItems: 'center'` and `gap: space.xs` to the `chip`
style. Change nothing else about it — its padding and `onFill` active state are
already correct.

An exercise with no catalogue entry yields `undefined`, which `pathsFor` resolves to
the isolation glyph. That is deliberate: a chip with a glyph and a chip without would
make the row ragged.

- [ ] **Step 6: Typecheck and test**

```bash
cd mobile && npm run typecheck && npm test
```

Expected: clean, count unchanged from Task 7.

- [ ] **Step 7: Verify in a browser**

1. `npx expo start --web`, device toolbar → iPhone. Train → Start a session → Add exercise.
2. Type a seeded exercise. Assert each row now carries a glyph to the left of the name, and that a push and a squat show **different** glyphs.
3. Add one. Tap the exercise name in the block header. Assert the sheet opens with the icon, the muscle and equipment, the instructions, and the "Written by a model" caveat in the warning colour.
4. Assert the instructions actually describe that movement — read them. A plausible-looking paragraph about the wrong exercise is the failure worth catching here, and no test can see it.
5. Tap the dimmed area above the sheet. Assert it closes and nothing else happened.
6. Toggle the OS to light mode and reopen. Assert the glyph and the caveat are both legible.
7. Add an exercise recorded before the catalogue existed (one you did not seed). Tap its name. Assert nothing opens rather than anything crashing.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/components/ExerciseInfoSheet.tsx mobile/app/session.tsx
git commit -m "$(cat <<'EOF'
feat(session): an icon on every exercise, and how to do it behind a tap

The glyph is on the row where it helps you scan; the instructions are behind a
tap because they are reference material and the set rows are what you are
actually doing.

The "written by a model" caveat matches the voice the AI food estimates already
use, and it is not decoration: a wrong macro figure costs an inaccurate day, a
wrong cue under a loaded barbell costs more.

An exercise recorded before the catalogue existed resolves to nothing and the
sheet stays shut, rather than inventing an entry for it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## After the plan

**Migration v4 is the first migration this project will apply to a device holding real data.** `HANDOFF.md` records that v3 has only ever run against fresh databases and that testing it against a v2 device is outstanding. v4 is additive — one table, one nullable column, the safest shape available — but that overdue check is now more urgent, not less. Do it before this reaches a phone that matters.

Deploying needs the steps in the handoff's *Deploying* section: export web, stage into `services/gemini-proxy/web/` (`web/`, never `dist/`, which `.gcloudignore` excludes), then `gcloud run deploy`. A routine deploy must **not** pass `--set-env-vars`. `gcloud` on this machine needs `CLOUDSDK_PYTHON` pointed at `AppData\Local\Programs\Python\Python312\python.exe`, or it fails claiming Python is missing.

No new proxy route and no new secret: enrichment reuses `/api/gemini`, so the Cloud Run service needs no configuration change.
