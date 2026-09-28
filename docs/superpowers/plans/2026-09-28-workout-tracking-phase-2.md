# Workout Tracking — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-09-23-workout-tracking-design.md`
**Phase 1:** `docs/superpowers/plans/2026-09-24-workout-tracking-phase-1.md` — history is imported and progression is computable over it.

**Goal of this phase:** make the imported history worth having. Seeing whether the weight on the bar is going up, logging today's session against what happened last time, and one chart that puts training volume next to the filter's own expenditure estimate.

## Global Constraints

Phase 1's constraints still hold, and two of them decide most of what follows:

- **No workout energy reaches the diary, the target, or the trend.** The cross-reference chart states a MET-derived estimate and *nothing consumes it*. `expenditure.ts` already absorbs training through the intake-versus-weight gap; adding workout calories on top counts the same energy twice, raises the target and stalls the deficit. That is the defect this design exists to avoid, and Task 4 is the one place where the temptation is real.
- **`packages/engine/src/workouts.ts` stays pure.** Bodyweight and durations arrive as parameters.
- **No estimated 1RM, anywhere.** Epley and Brzycki disagree by 5–10% and neither is a measurement. Showing one is the same error as an ungrounded food estimate, which this app already refuses.
- Screens reuse `Card`, `Button`, `Field`, `Stepper`, `Segmented`, `Screen` and `LineChart`. `LineChart` already supports multiple series, a filled band and scatter overlays, which is every primitive this phase needs.
- Only pure modules are tested — `mobile/vitest.config.ts` draws that line because expo-sqlite has no node driver. Logic that deserves a test goes in the engine or in a db-free module, as `importWorkouts.ts` does.
- Commit after every task. Do not push until the phase is green.

---

### Task 1: Progression screen

The payoff of the import, and the reason to do it before routines or the logger: fifteen months of history is already in the database and currently invisible.

**Files:**
- Create: `mobile/app/progression.tsx`
- Modify: `mobile/app/_layout.tsx` (register the modal)
- Modify: `mobile/app/(tabs)/settings.tsx` or `trends.tsx` (entry point)

**Interfaces:**
- Consumes: `listTrainedExercises`, `listSetsForExercise` from `src/db`; `progressionFor` from the engine; `series` from `useApp()`.

- [ ] **Step 1: Build the bodyweight lookup**

`progressionFor` takes `ReadonlyMap<ISODate, number>`. Build it from `useApp().series`, mapping `date → trendWeightKg`. This is the one wiring step that makes pull-ups mean anything, and it is a `useMemo` over a list the app already computes.

- [ ] **Step 2: Exercise picker**

`listTrainedExercises()` returns names most-trained first, which is the right default order — `Pull Up` at 206 sets is more likely wanted than `Negative Pull Up` at 1.

- [ ] **Step 3: The chart**

Two series on one `LineChart`: heaviest working set and working volume. Volume is an order of magnitude larger than load, so they cannot share a y-axis honestly — render two charts stacked rather than one with a hidden second scale. A second axis that isn't labelled is a lie about what the lines mean.

Mark records with a `scatter` overlay, using `isRecord` from `progressionFor`.

- [ ] **Step 4: Say when a number rests on bodyweight**

For a bodyweight-based exercise the load is the weight trend plus any added plate, so the line moves when the user's weight moves and not only when they got stronger. State that under the chart. Without it the chart silently attributes a cut to a loss of strength.

- [ ] **Step 5: Handle the empty and unusable cases**

No sets at all, and an exercise whose sets are all unscoreable, are different states and read differently: "nothing logged yet" versus "logged, but no weight was recorded". `progressionFor` already returns no points for the second; the screen must not render both as the same blank.

- [ ] **Step 6: Verify in the running app, commit**

---

### Task 2: Routines

**Files:**
- Create: `mobile/src/db/routines.ts` (or extend `src/db/index.ts`)
- Create: `mobile/app/routines.tsx`, `mobile/app/routine-edit.tsx`

**Interfaces:**
- Produces: create, rename, reorder, delete; add/remove exercises with a target set count; build a routine from a past session.

- [ ] **Step 1: Persistence**

The tables exist from migration v3 and nothing has written to them yet. `routine_exercises` carries `position` and `target_sets`.

- [ ] **Step 2: List and edit screens**

Full create/edit/reorder/delete, per the spec. Reordering is the one that matters at the rack: the order is the order you do them in.

- [ ] **Step 3: Build a routine from a past session**

After importing 246 sessions, assembling "Push A" by hand from a picker is tedious when the answer is already in the history. Offer recent sessions, take their exercises in order, and let the user name the result.

- [ ] **Step 4: Verify in the running app, commit**

---

### Task 3: The session logger

**Files:**
- Create: `mobile/app/session.tsx`
- Modify: `src/db` (create a session, append sets, finish, resume)

**Interfaces:**
- Produces: start from a routine or blank; record sets as weight × reps × type; finish.

- [ ] **Step 1: Last-values prefill**

Each set prefills with the last values logged for that exercise. The question at the rack is always what happened last time, and this is the feature that makes progressive overload work in practice rather than in principle. It reads from the same `listSetsForExercise` the progression screen uses.

- [ ] **Step 2: Sessions are not bound to their routine**

Exercises can be added or dropped mid-session. A routine is a starting point, not a contract.

- [ ] **Step 3: Resumable, not auto-closed**

Finishing stamps `finished_at`. A session started and never finished stays resumable — it is not discarded and not closed on the user's behalf, because both silently destroy work that was really done.

- [ ] **Step 4: Verify in the running app, commit**

---

### Task 4: Cross-reference

**Files:**
- Create: `packages/engine/src/workouts.ts` additions — `sessionEnergyKcal`, `weeklyVolume`
- Modify: `packages/engine/test/workouts.test.ts`
- Create: a section on `mobile/app/(tabs)/trends.tsx`

- [ ] **Step 1: Write the failing test for the estimate**

`sessionEnergyKcal(bodyweightKg, durationMinutes, met)` — a MET-derived figure. For resistance training this lands in roughly a ±40% band, so the function returns the band, not a point.

**It returns null when either input is missing**, rather than defaulting. This is the same rule as `estimateCostUsd` returning null for an unpriced model rather than pricing it from the wrong list. Imported sessions carry real durations from `start_time`/`end_time`, so this applies mainly to app-logged sessions never finished.

- [ ] **Step 2: Weekly working volume**

Summed per ISO week over effective load, reusing `isWorkingSet` and `effectiveLoadKg` rather than reimplementing the exclusion rules.

- [ ] **Step 3: One chart on a shared time axis**

Working volume, the filter's expenditure estimate, and the weight trend. The session energy estimate is drawn as a **labelled band**, not a line, because that is what it is — `LineChart` already takes a `band`.

- [ ] **Step 4: Confirm nothing consumes the estimate**

Grep for the new function's name and check every call site is display-only. Nothing may reach `targets.ts`, the diary or `expenditure.ts`. This step is the whole reason the spec exists in its corrected form, so it is a step rather than an assumption.

- [ ] **Step 5: Verify in the running app, commit**

---

## Self-review

**Spec coverage after this phase.** Routines → Task 2. Logger, prefill, mid-session edits, resumability → Task 3. Progression → Task 1. Cross-reference → Task 4. That closes the spec, with one exception carried over deliberately: "make the backup obvious" was listed in Phase 1's self-review as a UI change better specified once the site has been used, and it is still not specified here.

**Ordering.** Progression comes first because the data already exists and cannot be seen. The logger comes after routines because it starts from one, though it can also start blank. Cross-reference comes last because it is the only part that depends on nothing else and is the easiest to get wrong in a way that matters.

**Known risk.** Task 4 is where a plausible-looking mistake does real damage: wiring the session estimate into the target would be a small diff, would look like a feature, and would reintroduce exactly the double-count this design was corrected to avoid. Step 4 exists to catch it.
