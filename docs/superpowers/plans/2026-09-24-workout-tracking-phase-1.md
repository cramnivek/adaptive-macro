# Workout Tracking — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-09-23-workout-tracking-design.md`

**Goal of this phase:** fifteen months of Hevy history inside this app, stored correctly, with progression computable over it — including the pull-ups, which need this app's own bodyweight trend to mean anything.

**Deliberately out of this phase:** routines, the session logger, the progression screen and the cross-reference chart. They are planned after the import lands, because real imported data is what should shape them. Phase 1 ends with history in the database and a tested engine over it, reachable from a Settings entry point and nowhere else yet.

**Tech Stack:** TypeScript 6, vitest 2, expo-sqlite, Expo SDK 57.

## Global Constraints

- **`packages/engine/src/workouts.ts` stays pure.** Types and functions over them: no I/O, no clock, no database, no `Date.now()`. Bodyweight arrives as a parameter, never fetched. That is what makes the whole module testable without a device, and it is the existing split in this package.
- **No workout energy reaches the diary, the target, or the trend.** The spec's Problem section is the reason this feature exists in the shape it does: `expenditure.ts` already absorbs training through the intake-versus-weight gap, and adding workout calories on top counts the same energy twice. Nothing in Phase 1 may write a kcal figure anywhere the target can see it.
- **Names are imported verbatim and matched exactly.** No normalization, no stripping parentheses, no merging spelling variants. `Bench Press (Barbell)` and `Bench Press (Smith Machine)` are different exercises carrying different loads.
- **`MIGRATIONS` is append-only.** v1 and v2 have shipped to a real device; editing either in place strands it. Add v3.
- **`weight_kg` is the canonical basis.** Hevy's pounds convert once, at import, via the existing `lbToKg` in `packages/engine/src/units.ts`. Do not write a second conversion.
- **Null weight means "not recorded", never zero.** Scoring a missed entry as 0 kg drags a real progression line down.
- Run a workspace's tests with `npm run test --workspace @adaptive-macros/<name>`. Root `npm test` and `npm run typecheck` cover all three.
- Commit after every task. Do not push until the whole phase is green.

## Prerequisite: the fixture

**Task 3 cannot start without a real Hevy export.** The spec is explicit that knowing the column names is not the same as knowing how a real file behaves, and it is right: the quoted-comma timestamp is the kind of thing only a real file teaches.

The repository is **public**, so the full export is not checked in — that would publish fifteen months of training history, and bodyweight is derivable from the pull-up rows. Instead the export is trimmed to a fixture of roughly 50 rows that preserves every shape the parser must handle:

- a quoted timestamp containing a comma — `"15 Jul 2026, 09:52"`
- bodyweight rows with an empty `weight_lbs` (Pull Up, Chest Dip, Hanging Leg Raise)
- the `Chest Dip` → `Chest Dip (Weighted)` transition, both sides
- `set_type` values `normal`, `warmup` and `failure`
- a row with no reps (`Stretching`, logged by duration)
- at least one non-bodyweight row with a missing weight (the Bench Press or Deadlift slips)
- two sessions on the same day, and one session spanning a month boundary
- rows carrying `rpe`, and rows without it

Trimming is mechanical, so it is a task step rather than a judgement call, but **the source file must be supplied before Task 3 begins**. Tasks 1 and 2 do not depend on it and can proceed first.

---

### Task 1: Engine — types and effective load

**Files:**
- Create: `packages/engine/src/workouts.ts`
- Create: `packages/engine/test/workouts.test.ts`
- Modify: `packages/engine/src/index.ts` (add the export line)

**Interfaces:**
- Consumes: `ISODate` from `./types.ts`.
- Produces: `WorkoutSet`, `WorkoutSession`, `Exercise` types; `effectiveLoadKg(set, bodyweightKg): number | null`; `isWorkingSet(set): boolean`.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/test/workouts.test.ts`. Cover, at minimum:

- a normal set returns its own `weightKg`
- a bodyweight set returns the supplied bodyweight when `weightKg` is null
- a bodyweight set returns bodyweight **plus** added load when `weightKg` is a number — this is the `Chest Dip (Weighted)` continuity case, and it is the single most load-bearing line in the module
- a non-bodyweight set with a null weight returns **null**, not 0 — the Bench Press slip
- a bodyweight set returns null when no bodyweight is available for that date, rather than falling back to the bare added load
- `isWorkingSet` is false for `warmup` and true for `normal`, `dropset` and `failure`

State the reasoning in the test names: a reader should be able to tell from the failure which rule broke.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test --workspace @adaptive-macros/engine -- workouts`
Expected: FAIL — cannot resolve `../src/workouts.ts`.

- [ ] **Step 3: Write the implementation**

`set_type` is a union of Hevy's four literal values — `'normal' | 'warmup' | 'dropset' | 'failure'` — kept verbatim rather than flattened, so the distinction survives without re-importing.

`effectiveLoadKg` takes bodyweight as `number | null` and returns `number | null`:

```
bodyweightBased  →  bodyweightKg === null ? null : bodyweightKg + (weightKg ?? 0)
otherwise        →  weightKg          // already null when not recorded
```

Comment the null-versus-zero rule where it is implemented, not just in the test. The next reader's instinct will be to default it.

- [ ] **Step 4: Run the tests to verify they pass**

- [ ] **Step 5: Export and commit**

Add `export * from './workouts.ts';` to `packages/engine/src/index.ts`, run `npm run typecheck`, then commit.

---

### Task 2: Engine — progression

**Files:**
- Modify: `packages/engine/src/workouts.ts`
- Modify: `packages/engine/test/workouts.test.ts`

**Interfaces:**
- Produces: `progressionFor(sets, bodyweightByDate): ProgressionPoint[]`, one point per session date for a single exercise, carrying `date`, `heaviestWorkingSetKg`, `workingVolumeKg` and `isRecord`.

- [ ] **Step 1: Write the failing test**

Cover:

- warmups are excluded from both the heaviest set and the volume
- a `failure` set and a `dropset` are **included** in both — they are working sets
- sets with no usable weight or reps are excluded and do not appear as zero
- volume is `effectiveLoad × reps`, summed across working sets in the session
- `isRecord` marks a session whose heaviest working set beats **everything before it**, and is false when it merely ties
- a pull-up series computes off bodyweight and moves as bodyweight moves, rather than sitting flat at zero
- an exercise with no usable sets in a session produces no point for that date, rather than a zero point

- [ ] **Step 2: Run it to verify it fails**

- [ ] **Step 3: Write the implementation**

`bodyweightByDate` is a `Map<ISODate, number>` or a lookup function — the caller builds it from `DailyEstimate[]`, which already carries `trendWeightKg` per date. The engine must not import `expenditure.ts` to fetch it.

A date with no bodyweight entry yields null effective load for bodyweight exercises, and those sets drop out, per Task 1.

- [ ] **Step 4: Run the tests to verify they pass**

- [ ] **Step 5: Commit**

---

### Task 3: The Hevy parser

**Blocked on the fixture.** See Prerequisite.

**Files:**
- Create: `mobile/src/import/hevy.ts`
- Create: `mobile/src/import/__tests__/hevy.test.ts`
- Create: `mobile/src/import/__tests__/fixtures/hevy-sample.csv`

**Interfaces:**
- Produces: `parseHevyCsv(text: string): HevyParseResult` — sessions, exercises, and a `skipped` breakdown. Pure: a string in, a structure out. No file picking, no database.

- [ ] **Step 1: Trim the fixture**

From the supplied export, cut to roughly 50 rows preserving every shape listed in the Prerequisite. Keep the header row exactly as Hevy writes it. Verify each listed shape is present before moving on — a fixture missing the quoted-comma timestamp tests nothing that matters.

- [ ] **Step 2: Write the failing test**

Cover:

- the header row is validated and a mismatch **throws with the received header in the message**, rather than importing zeros
- `"15 Jul 2026, 09:52"` parses — the comma is inside the quotes, and a naive split corrupts every row while still producing plausible-looking fields. Assert the parsed date, not just that it didn't throw.
- rows group into sessions by `start_time`, and into exercises by `exercise_title` within a session
- `weight_lbs` converts to kg once, via `lbToKg`
- an empty `weight_lbs` becomes null, not 0
- an exercise whose every set lacks a weight is inferred `bodyweightBased`
- `Chest Dip (Weighted)` is **not** inferred bodyweight-based, because it always carries a number — the spec says plainly this one needs manual correction, and the test pins that the inference does not pretend otherwise
- rows with no reps are skipped and counted
- `set_type` values survive verbatim, including `failure`
- `rpe` is carried through when present and null when absent
- the result reports counts: sessions, exercises, sets, and each skip reason separately

- [ ] **Step 3: Write the implementation**

Handle quoted fields properly — this is the one hazard the spec calls out as corrupting silently. Do not split on commas.

Target the 14 documented headers exactly. Do not write a generic column detector; the headers are known, and detecting them at runtime is speculative generality that would also swallow the format change this validation exists to catch.

Skip `distance_miles`, `duration_seconds`, `superset_id`, `description` and `exercise_notes`, and count them as dropped so the omission is visible.

- [ ] **Step 4: Run the tests to verify they pass**

- [ ] **Step 5: Commit**

---

### Task 4: Migration v3

**Files:**
- Modify: `mobile/src/db/schema.ts`
- Modify: `mobile/src/db/index.ts`

**Interfaces:**
- Produces: the five tables from the spec's Data model, plus read/write functions for sessions and sets.

- [ ] **Step 1: Append v3 to `MIGRATIONS`**

Follow v1's conventions exactly: TEXT ids, ISO date strings, `created_at`, `CREATE TABLE IF NOT EXISTS`. Tables per the spec:

```
exercises          id, name, bodyweight_based, created_at
routines           id, name, position, created_at
routine_exercises  routine_id, exercise_id, position, target_sets
sessions           id, date, routine_id (nullable), name, started_at,
                   finished_at (nullable), notes
sets               id, session_id, exercise_id, exercise_name, set_index,
                   weight_kg (nullable), reps, set_type, rpe (nullable),
                   created_at
```

`routines` and `routine_exercises` are created now although Phase 1 writes nothing to them: the migration is append-only, so creating them later costs a v4 for no gain.

Index `sessions (started_at)` — idempotency keys on it and will be checked once per session on every import. Index `sets (session_id)` and `sets (exercise_name)`, which is how progression reads.

`exercise_name` is denormalized onto `sets` deliberately, exactly as `food_name` sits on `log_entries`: renaming an exercise must not rewrite what history says happened.

- [ ] **Step 2: Write the persistence functions**

In `mobile/src/db/index.ts`, following the existing style there. At minimum: insert a session with its sets in one transaction, check whether a `started_at` already exists, and read sets for an exercise across sessions.

- [ ] **Step 3: Verify the migration applies**

These paths have no node driver — the existing vitest config covers only the pure modules under `src/api`, `src/ai` and `src/web`, and `mobile/vitest.config.ts` says so. Verification is therefore in the running app: launch it, confirm it starts against an existing v2 database without error, and confirm `user_version` reads 3.

Do not add expo-sqlite to the test config to get around this. That boundary is deliberate and predates this work.

- [ ] **Step 4: Commit**

---

### Task 5: Import preview and commit

**Files:**
- Create: `mobile/src/import/importWorkouts.ts`
- Create: `mobile/src/import/__tests__/importWorkouts.test.ts`
- Create: `mobile/app/import-workouts.tsx`
- Modify: `mobile/app/_layout.tsx` (register the modal screen)
- Modify: `mobile/app/(tabs)/settings.tsx` (entry point)

**Interfaces:**
- Produces: `buildImportPlan(parsed, existingStartTimes): ImportPlan` — pure, decides what would be written; and a commit function that applies a plan inside one transaction.

- [ ] **Step 1: Write the failing test for the plan**

The plan is where idempotency lives, and it is pure, so it is tested properly even though the UI is not. Cover:

- a session whose `started_at` already exists is skipped
- re-running the same parse against the resulting state writes nothing
- a newer export lands only its new sessions
- the plan reports, separately: sessions to add, sessions skipped as duplicates, sets to write, sets excluded for no usable weight, sets excluded for no reps, and which exercises are inferred bodyweight-based

- [ ] **Step 2: Write the implementation**

Nothing is written until the user accepts — this matches the meal estimate and `LookupCandidateSheet`, which is the established pattern for anything inferred.

- [ ] **Step 3: Build the preview screen**

Follow the shape of the existing modal screens registered in `_layout.tsx`, and use `Card`, `Button` and `Field` from `src/components` rather than new primitives.

The preview states what was found — sessions, date range, exercises, sets — and then the three judgements most likely to be wrong:

1. which exercises it inferred as bodyweight-based, **editable here**, before anything is written
2. how many sets it will exclude, and for which of the two reasons
3. a sample converted weight, because a conversion off by a factor is obvious to a person and invisible to a test

Add the entry point to the Settings screen near the existing export control.

- [ ] **Step 4: Verify against the real export in the running app**

Import the **full** export, not the fixture. Confirm the session count matches what the spec measured (the sample had 3,073 set rows), that the date range spans the expected fifteen months, that pull-ups are flagged bodyweight-based, and that `Chest Dip (Weighted)` is not.

Then import the same file again and confirm it writes nothing.

- [ ] **Step 5: Commit**

---

## Self-review

**Spec coverage for Phase 1.** Data model → Task 4. Bodyweight load → Tasks 1–2. Import format, quoting hazard, preview, idempotency, units → Tasks 3 and 5. Progression maths → Task 2. Routines, logger, progression screen and cross-reference → deliberately deferred to Phase 2, not forgotten.

**Where this plan departs from the spec.** The spec says a real export is checked in as a fixture. The repository is public, so a trimmed fixture is checked in instead and the full export is used only for the manual verification in Task 5 Step 4. The spec's intent — that the parser is tested against a file that really came out of Hevy — is preserved; publishing the user's training history was not part of that intent.

**Known risk.** `bodyweight_based` inference is a guess by construction, and the spec says so. The mitigations are that it is shown and editable in the preview before anything is written, and that Task 3 pins the one case the inference provably cannot catch. If the flag is wrong and gets committed anyway, a pull-up series silently reads as a flat zero line — which is the failure this whole design exists to prevent, so it is worth the preview being explicit rather than tidy.

**Not yet decided.** Whether progression points are computed on read or cached. Phase 1 computes on read: fifteen months is a few thousand rows, and caching before there is a screen to be slow would be optimising a guess.
