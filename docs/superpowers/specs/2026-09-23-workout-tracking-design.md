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
- **Rest timers, supersets, plate calculators.** None serve progressive
  overload. Each is a reason Hevy exists. The sample export's `superset_id` is
  empty on every one of its 3,073 rows, so supersets cost nothing to omit.
- **RPE as a progression input.** It is imported and displayed — see Data model
  — but nothing computes from it. An earlier draft listed RPE as a non-goal
  outright; the sample export showed it in use on 46% of sets, which made
  discarding it a data loss rather than a simplification.
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
exercises          id, name, bodyweight_based, created_at
routines           id, name, position, created_at
routine_exercises  routine_id, exercise_id, position, target_sets
sessions           id, date, routine_id (nullable), name, started_at,
                   finished_at (nullable), notes
sets               id, session_id, exercise_id, exercise_name, set_index,
                   weight_kg (nullable), reps, set_type, rpe (nullable),
                   created_at
```

Four choices worth stating:

**`exercise_name` is denormalized onto `sets`**, exactly as `food_name` sits on
`log_entries`. Renaming an exercise later must not rewrite what history says
happened.

**`weight_kg` is the canonical basis**, as `per100g` is for food. Hevy's
`weight_lbs` is converted once at import; display converts per the existing
`units` setting. One basis, conversions at the edges.

**`weight_kg` is nullable, and null means "not recorded" rather than zero.**
14% of the sample export (453 of 3,073 rows) has no weight, and almost all of
it is real bodyweight work — Pull Up, Hanging Leg Raise, Chest Dip. A handful
are data-entry slips on barbell lifts. The two cases are distinguished by
`bodyweight_based` below, not by guessing from the number.

**There is no `normalized_name`, and no name normalization at all.** An earlier
draft proposed stripping parentheses to merge spelling variants. The sample
export falsifies that: it contains zero duplicate spellings — Hevy's names are
already canonical — and the parentheses are *semantically load-bearing*:

```
Bench Press (Barbell)          Bench Press (Smith Machine)
Squat (Barbell)                Squat (Smith Machine)
Bicep Curl (Cable)             Bicep Curl (Dumbbell)
Incline Bench Press (Barbell) / (Smith Machine) / (Dumbbell)
```

Those are different exercises carrying different loads. Merging them is exactly
the "Incline Bench into Bench" corruption this spec's own testing section warns
against — and the proposed rule was the thing that would have caused it. Names
are imported verbatim and matched exactly.

`set_type` stores Hevy's own value verbatim — `normal`, `warmup`, `dropset` or
`failure` — rather than being flattened to a two-state field. It is
load-bearing rather than decorative: warmup sets in a progression series
flatten the line and hide the trend.

Only `warmup` is excluded from progression. A dropset and a set taken to
failure are both working sets and belong in the numbers. Keeping the source
value means the distinction stays available later without re-importing. The
sample export carries `normal` (2,948), `warmup` (118) and `failure` (7) and no
dropsets — the fourth value is handled because Hevy emits it, not because it
appears here.

**`rpe` is imported and displayed.** An earlier draft listed it as a non-goal.
The sample export carries RPE on 46% of sets (1,428 rows, values 6 to 10) over
fifteen months, so discarding the column would throw away data deliberately
collected. It does not participate in progression; it is recorded and shown.

## Bodyweight load

Pull-ups are 453 sets of this history and a weight-based progression metric
renders them as a flat zero line. They are not zero load — they are the user's
own mass, which **this app already knows** from the Kalman trend on that date.
Hevy cannot do this, because it does not track weight.

So effective load for a set is:

```
bodyweight_based  →  trendWeightKg(date) + (weight_kg ?? 0)
otherwise         →  weight_kg
```

The engine function takes bodyweight as a parameter rather than reaching for
it, keeping `workouts.ts` pure and testable; the caller supplies it from the
existing expenditure series.

Two consequences worth stating:

**`Chest Dip` → `Chest Dip (Weighted)` becomes continuous.** The user made that
transition mid-history. Treating a weighted dip as bodyweight plus added load
puts both on one line instead of breaking the series in two.

**A non-bodyweight exercise with a null weight is excluded from progression**,
not treated as zero. Three Bench Press and two Deadlift rows in the sample have
no weight; those are slips, and scoring them as 0 kg would drag a real
progression line down. The import preview reports how many sets were excluded
for this reason, so the omission is visible rather than silent.

**`bodyweight_based` is inferred at import and editable afterwards.** An
exercise whose sets carry no weight at all is flagged bodyweight-based; the
flag is shown in the import preview and can be corrected per exercise. The
inference cannot catch `Chest Dip (Weighted)`, which always carries a number,
so that one is a manual correction — stated plainly rather than guessed at,
because guessing is what would silently halve a load figure.

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
(sessions, date range, exercises, sets), which exercises it has inferred as
bodyweight-based, and how many sets it will exclude for having no usable weight
or reps. Those three are the judgements most likely to be wrong, so they are
the ones shown — and the bodyweight flags are editable there, before anything
is written.

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
working volume, both computed on **effective load** so bodyweight work counts.
Warmups excluded from both, as are sets with no usable weight or reps. A marker
where a heaviest working set beats everything before it.

Sixteen rows in the sample carry no reps — `Stretching` logged by duration,
one `Walking Lunge` logged by distance. Those columns are non-goals, so such
rows are skipped and counted in the preview rather than being coerced into a
rep-based model they do not fit.

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

**Implausibly long sessions get no estimate either.** The sample's durations
run 7 to 309 minutes against a median of 85, and the long tail is forgotten
"finish workout" taps rather than five-hour training. A MET estimate on a
309-minute session would invent roughly 2,000 kcal and put it on a chart beside
a measured expenditure line, which is the precise failure this whole feature
was redesigned to avoid. Sessions beyond a stated ceiling are shown as a gap
and flagged, not estimated and not silently clamped.

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
exercise, heaviest working set, progression series, PR detection, effective
load for both branches, the MET estimate, the null-when-duration-missing case
and the implausible-duration ceiling.

The parser gets fixture tests, plus a deliberately malformed variant asserting
the loud failure.

**The fixture is trimmed and anonymised, not the raw export.** The repository is
public and the real file is fifteen months of one person's training history,
dates and schedule. A few dozen rows chosen to cover the edge cases test better
than 3,073 rows anyway: they are readable, fast, and each one is present for a
stated reason.

The fixture must contain, at minimum: a quoted timestamp with its internal
comma, a bodyweight set with an empty `weight_lbs`, a weighted set, a `warmup`,
a `failure`, a set with an RPE and one without, a row with no reps, and two
exercises whose names differ only inside the parentheses.

Three tests carry the most weight:

- **Import twice, get the same session count.** Idempotency is the property
  that makes a failed import safe to retry.
- **`Bench Press (Barbell)` and `Bench Press (Smith Machine)` stay separate.**
  An earlier draft of this spec proposed a normalization rule that would have
  merged them. Silent corruption of a progression chart is the failure mode
  this app is built against, and this test pins the decision not to do it.
- **A bodyweight set's effective load tracks the weight trend.** The same
  pull-up set must score differently at 82 kg than at 75 kg, and a
  non-bodyweight set with a null weight must be excluded rather than scored as
  zero.

## Open input required

**Satisfied.** A real Hevy export was supplied and analysed: 3,073 sets, 246
sessions, 74 exercises, 8 Sep 2024 to 29 Dec 2025, zero malformed rows, every
timestamp parsing under the `D Mon YYYY, HH:MM` assumption.

It falsified five things in the draft above — the normalization rule, the
assumption that weight is always present, the RPE non-goal, the expectation
that imported sessions would lack durations, and the absence of any guard on
implausible ones. Each is corrected in place.

The raw file stays out of the repository, which is public. Only the trimmed
fixture described under Testing is committed.
