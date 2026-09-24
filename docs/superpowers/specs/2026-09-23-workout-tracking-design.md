# Workout tracking

Design, 2026-09-23.

## Problem

Lifting history lives in Hevy and nutrition lives here, so neither view knows
about the other. The stated motivation was to "account energy expenditure based
on the workouts as well" — that motivation is wrong, and correcting it is what
shapes this design.

`packages/engine/src/expenditure.ts` infers expenditure from the gap between
logged intake and observed weight change. Training is already inside that
number: train harder, weight falls more slowly than intake predicts, and the
filter raises its expenditure estimate to keep explaining the data. The module
comment says so directly — "a new training block — none of it needs to be
modelled by name."

Adding workout calories to that estimate counts the same energy twice, raises
the target, and stalls the deficit. This is the defect that makes exercise
calories in mainstream trackers untrustworthy, and this app will not reproduce
it.

What survives the correction is the reason people log lifts in the first place:
knowing whether the weight on the bar is going up.

## Goals

Migrate lifting history off Hevy and track progressive overload in this app,
with routines and a session logger good enough that going back to Hevy is not
tempting.

Separately, show training volume alongside the filter's own expenditure
estimate, so the model can be checked against something outside itself.

## Non-goals

- **Workout calories in the diary, the target, or trends.** See Problem. The
  cross-reference view states an estimate and nothing consumes it.
- **Estimated 1RM.** Epley and Brzycki disagree by 5–10% and neither is a
  measurement. Showing one as a number is the same error as an ungrounded food
  estimate, which this app already refuses.
- **Rest timers, RPE, supersets, plate calculators.** None serve progressive
  overload. Each is a reason Hevy exists.
- **Ongoing sync with Hevy.** This is a migration. Import is re-runnable so a
  failed attempt can be retried, not so the two apps can stay in step.
- **A shipped exercise catalog.** Exercises come from imported history and from
  typing a name. Hevy ships 5,000; this app needs the ~25 you actually do.

## Data model

Pure logic in `packages/engine/src/workouts.ts` — types plus functions over
them, no I/O, no clock. Persistence and UI in `mobile`, matching the existing
split.

Migration v3, appended to `MIGRATIONS` in `mobile/src/db/schema.ts`, following
v1's conventions (TEXT ids, ISO date strings, `created_at`):

```
exercises          id, name, normalized_name, created_at
routines           id, name, position, created_at
routine_exercises  routine_id, exercise_id, position, target_sets
sessions           id, date, routine_id (nullable), name, started_at,
                   finished_at (nullable), notes
sets               id, session_id, exercise_id, exercise_name, set_index,
                   weight_kg, reps, set_type, created_at
```

Three choices worth stating:

**`exercise_name` is denormalized onto `sets`**, exactly as `food_name` sits on
`log_entries`. Renaming or merging an exercise later must not rewrite what
history says happened.

**`weight_kg` is the canonical basis**, as `per100g` is for food. The export's
unit is converted once at import; display converts per the existing `units`
setting. One basis, conversions at the edges.

**`normalized_name` exists for import dedup.** A real export produces "Bench
Press", "Barbell Bench Press" and "Bench Press (Barbell)" as distinct strings.
A progression chart split three ways is worse than no chart.

`set_type` stores Hevy's own value verbatim — `normal`, `warmup`, `dropset` or
`failure` — rather than being flattened to a two-state field. It is
load-bearing rather than decorative: warmup sets in a progression series
flatten the line and hide the trend.

Only `warmup` is excluded from progression. A dropset and a set taken to
failure are both working sets and belong in the numbers. Keeping the source
value means the distinction stays available later without re-importing.

## Import

One-time in intent, re-runnable in practice, because the first attempt will be
wrong in some way.

**Format.** Hevy's export is documented and stable: 14 columns, one row per
set — `title`, `start_time`, `end_time`, `description`, `exercise_title`,
`superset_id`, `exercise_notes`, `set_index`, `set_type`, `weight_lbs`,
`reps`, `distance_miles`, `duration_seconds`, `rpe`. A workout with five
exercises of four sets each is twenty rows sharing a title and timestamps.

The parser targets those headers and fails loudly, printing the header row it
received, when they do not match. If Hevy changes the format, that error says
so immediately instead of importing zeros. It is not a generic column detector;
the headers are known, and detecting them at runtime would be speculative
generality.

A real export is still checked in as a fixture. Knowing the column names is not
the same as knowing how a real file behaves, and the fixture is what makes the
parser testable at all.

**One quoting hazard, stated because it corrupts silently.** Timestamps are
written as `"15 Jul 2026, 09:52"` — a comma *inside* the quotes. A parser that
splits on commas breaks on every row, and breaks in a way that still produces
plausible-looking fields. Quoted fields must be handled properly rather than
split.

Rows group into sessions by `start_time`, then into exercises by
`exercise_title` within a session.

**Preview before commit.** Nothing is written until the user accepts, matching
the meal estimate and `LookupCandidateSheet`. The preview states what was found
(sessions, date range, exercises, sets) and which exercise names it intends to
merge. Name merging is the most likely thing to be wrong, so it is the thing
shown.

**Idempotency** keys on session `started_at`. A session whose start timestamp
already exists is skipped. Re-importing the same file changes nothing;
importing a newer export lands only the new sessions.

**Units are unambiguous**, which removes a guess the earlier draft had to make.
Hevy always writes `weight_lbs` regardless of the display unit set in the app,
so every value is pounds and converts once to the canonical `weight_kg`. The
preview still shows a sample converted weight, because a conversion off by a
factor is obvious to a person and invisible to a test.

**Unmodelled columns are skipped, not approximated.** `rpe`, `distance_miles`,
`duration_seconds`, `superset_id`, `description` and `exercise_notes` are
ignored — supersets and RPE are explicit non-goals — and the preview reports
how many columns were dropped so the omission is visible rather than assumed.

## Routines and logging

**Routines** are named, ordered exercise lists with a target set count each,
with full create/edit/reorder/delete.

A routine can also be built from a past session. After importing dozens of
sessions, assembling "Push A" by hand from a picker is tedious when the answer
is already in the history.

**The logger** starts from a routine or from blank, presents the exercises in
order, and records sets as weight × reps × type. Each set prefills with the
last values logged for that exercise — the question at the rack is always what
happened last time, and this is the feature that makes progressive overload
work in practice rather than in principle.

Exercises can be added or dropped mid-session; a session is not bound to its
routine once started. Finishing stamps `finished_at`. A session started and
never finished stays resumable rather than being discarded or auto-closed.

**Progression**, per exercise over time: heaviest working set, and total
working volume. Warmups excluded from both. A marker where a heaviest working
set beats everything before it.

## Cross-reference

One weekly chart on a shared time axis: working volume in kg lifted, the
filter's expenditure estimate, and the weight trend. Estimated session energy
is drawn as a labelled band, not a line, because that is what it is.

The estimate is MET-derived — bodyweight × duration × an activity constant —
which for resistance training lands in roughly a ±40% band. Bodyweight comes
from the trend on that date, which the engine already produces. Duration comes
from `started_at` → `finished_at`, which Hevy's export supplies directly as
`start_time` and `end_time` — so imported history carries real durations rather
than the blanks the earlier draft expected.

**A session missing either input still gets no estimate**, shown blank rather
than defaulted, as `estimateCostUsd` returns null for an unpriced model rather
than pricing it from the wrong list. That now applies mainly to sessions logged
in the app and never finished, not to imported ones.

Nothing consumes this number. It exists so the model can be checked from
outside: if the filter's expenditure rises through heavy blocks and falls
through deloads, the model is tracking something real. If it does not move at
all, that is evidence about the model or about the food logging feeding it.
That check is worth more than the calorie figure.

## Errors and empty states

The import fails loudly with the offending header or row, never a silent zero.
Every new screen gets a real empty state, since all of them will be seen before
the first import lands.

## Testing

Engine functions get vitest unit tests: set volume, session volume per
exercise, heaviest working set, progression series, PR detection, the MET
estimate, and the null-when-duration-missing case.

The parser gets fixture tests against the real export, plus a deliberately
malformed variant asserting the loud failure.

Two tests carry the most weight:

- **Import twice, get the same session count.** Idempotency is the property
  that makes a failed import safe to retry.
- **Normalization merges the variants it should, and does not merge "Incline
  Bench" into "Bench".** An over-eager merge silently corrupts a progression
  chart, and silent corruption is the failure mode this app is built against.

## Open input required

A real Hevy CSV export, to serve as the parser fixture. In Hevy: **Profile tab
→ settings gear → Export & Import Data → Export Data → Export Workouts.**

It is the one part of this that cannot be produced from the repository.
