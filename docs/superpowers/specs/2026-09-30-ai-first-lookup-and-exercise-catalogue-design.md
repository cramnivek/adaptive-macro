# AI-first lookup, and an exercise catalogue

Design, 2026-09-30.

## Problem

**AI is an opt-in step where it should be the default.** Search for a food the
databases do not carry and you get "Nothing found. Try a shorter or more general
term, or add it yourself." — and a button, below the fold, offering to look it up.
`search.tsx` already computes `canLookUp` and already has the whole lookup path
wired. The user has to ask for something the app could simply do.

**Exercises are not fixed; they are whatever string you typed.** The entire model is

```sql
CREATE TABLE exercises (
  id               TEXT PRIMARY KEY NOT NULL,
  name             TEXT NOT NULL UNIQUE,
  bodyweight_based INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);
```

There is no muscle group, no equipment, no movement pattern, and no instructions.
`exerciseIdFor` inserts a row for any name it has not seen, so the catalogue of
exercises is an accident of typing. Exercises are standard things — a barbell back
squat is a barbell back squat — and the app treats them as free text.

**Nothing tells you how to do an exercise.** For a lift you have done for years that
does not matter. For one a routine suggests, or one imported from someone else's
programme, the app is silent.

## Goals

AI applied without being asked, wherever the app would otherwise show a dead end. A
catalogue that makes an exercise a known thing with a movement pattern and a
how-to, rather than a string. A glance-level visual cue for what a movement is.

## Non-goals

- **Blocking custom exercises.** Some movements are genuinely personal. Typing a new
  name creates a proper catalogue entry rather than being refused.
- **Renaming anything already recorded.** See *Link, never rename*.
- **A rest timer, exercise reordering, or a muscle-group filter in the picker.**
  Those are the logger's known rough edges, tracked in `HANDOFF.md`, and are not
  this design.
- **Grounded lookup for exercises.** See *Why exercises need only one call*.
- **Photographic or animated exercise media.** See *Icons*.
- **A setting to turn AI-on-empty off.** It is how search works now.

## Why exercises need only one call

`src/api/gemini.ts` looks food up in **two** calls: a grounded search against Google
Search with a 90-second timeout, then a structuring call with a `responseSchema` and
a 15-second timeout. The split exists because grounding and structured output are
mutually exclusive in the API, and only the first call carries a grounding charge.
A food's macros are published figures; an ungrounded answer is a fabrication, which
is why `UngroundedResponseError` exists and why a response with no grounding chunks
is treated as a failure rather than an answer.

**None of that applies to an exercise.** Which muscle a bench press loads, and how to
perform it, is general knowledge rather than a figure to be sourced. So exercise
enrichment is a **single structured call** — `responseSchema`, 15-second timeout, no
grounding, no grounding charge. It reuses `routeFor()` and the existing `/api/gemini`
proxy route, so it needs no new endpoint, no new secret, and no env-var change on the
Cloud Run service (a routine deploy must not pass `--set-env-vars` anyway).

## A · AI by default in food search

`mobile/app/search.tsx` gains one effect. When a search settles with **zero** results
— `!showingFrequent`, `!loading`, `results.length === 0`, query at least two
characters — it waits 1.2 seconds of no further typing and then calls the existing
`runLookup()`.

The 1.2 seconds sit on top of the existing 350 ms search debounce, so the sequence is:
stop typing → 350 ms → database search → settles empty → 1.2 s → lookup. Typing
again at any point cancels both.

A `useRef<Set<string>>` holds every query already attempted on this screen. It is
checked before firing, so:

- retyping the same term does not fire a second call
- a lookup that fails does not immediately retry in a loop
- deleting a character and retyping it is free

The manual button stays for the **thin** case — one or two results — where a real
database hit might still be the right answer and spending a call would be
presumptuous. So the button's condition narrows from `shown.length < 3` to
`shown.length > 0 && shown.length < 3`.

The empty-state copy becomes, while a lookup is running, "Nothing found — looking it
up… {n}s", reusing the `lookupElapsed` counter that already exists for exactly this
reason: the grounded call can take 90 seconds and without a visible clock that reads
as a hang.

Everything else — `LookupCandidateSheet`, the `UngroundedResponseError` message, the
`latestQuery` and `mounted` guards against out-of-order and post-unmount writes — is
unchanged and already correct.

## B · The exercise catalogue

### Schema, migration v4

`MIGRATIONS` in `mobile/src/db/schema.ts` is a `string[]` applied in order against
SQLite's `user_version`, and is append-only. v4 is one new entry:

```sql
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
```

`instructions` is nullable: an entry can exist as a classification before its how-to
has been generated, and a generation failure must not prevent the entry existing.

`primary_muscle` and `equipment` are **display-only free text** as the model returns
them — "quadriceps", "barbell" — shown on the picker row and the instructions sheet.
Nothing branches on their value, so an unexpected string is cosmetic rather than a
bug. `movement_pattern` is the opposite: it drives icon selection, so it is validated
against the eight known patterns on the way in and falls back to `isolation`.

### Link, never rename

`exercises.name` is **never written by this design**. The link is one new nullable
column. Three reasons, and the first two are not negotiable:

- **Progression history stays byte-identical.** `listSetsForExercise` keys on
  `exercise_name`, and `sets` carries its own `exercise_name` copy. Rewriting names
  would silently change what past sessions say.
- **`Bench Press` and `Bench Press (Smith Machine)` are deliberately different
  exercises** carrying different loads. Any normalisation that merges them is wrong,
  and `src/db/index.ts` says so in a comment.
- A link can be corrected later. A rewritten name cannot be recovered.

### Seeding from your own history

A one-time action under **Settings → Your data**, beside the Hevy import, where the
other one-off data operations live.

It reads the distinct names already in `exercises` — the column is `UNIQUE`, so they
are distinct for free — and sends them for enrichment **in batches of twenty names
per call**, not one call each. A Hevy history with 40–80 distinct lifts therefore
costs two to four calls rather than eighty.

**Assumption, stated because it cannot be checked from outside the device:** the
number of distinct exercise names is in the tens, not the thousands. The known data
is 246 sessions and 3,057 sets. Batching makes the cost linear in distinct names
regardless, so a surprise here is slow rather than broken; the screen reports
progress as "batch 2 of 4" and can be run again to fill in what failed.

Each returned entry creates an `exercise_catalogue` row and sets `catalogue_id` on
the matching `exercises` row. A name the model declines to classify is left
unlinked and reported, not guessed at.

### The picker

`mobile/app/session.tsx`'s exercise picker searches the catalogue first, showing
`canonical_name` with its icon and primary muscle. When the search returns **zero**
catalogue matches, it applies the same rule as food search: wait for typing to
settle, then enrich that one name automatically, create the entry, and offer it.
The `Set<string>` guard applies identically.

Typing a genuinely new movement is therefore not blocked — it becomes a first-class
catalogue entry with a pattern, a muscle and a how-to, which is what "fixed rather
than manually input" means in practice.

## C · Instructions and icons

### Instructions

Returned by the **same** enrichment call as the classification, so they cost nothing
beyond what B already spends. Stored in `exercise_catalogue.instructions`, so they
are generated once per exercise ever and then work offline.

They carry the same caveat the AI food estimates already carry — the app has an
established voice for this, on `search.tsx`'s rows: "Estimated by a model, not looked
up. Check it before trusting it." The exercise wording is "Written by a model. Check
it against a source you trust before loading a bar."

That caveat is not decoration. A wrong macro figure costs you an inaccurate day; a
wrong cue under a loaded barbell costs more.

### Icons

Eight inline stroke SVGs in a new `mobile/src/components/ExerciseIcon.tsx`, keyed off
`movement_pattern`:

`push` · `pull` · `squat` · `hinge` · `lunge` · `carry` · `core` · `isolation`

Inline SVG rather than bundled art: no asset bytes in a PWA that already fetches
300 KB of fonts, no licensing question, no style mismatch against the Instrument
direction, and they inherit `currentColor` so they theme for free. "Depicts the
exercise slightly" is the brief, and a movement pattern is the right level of
abstraction for that — one glyph honestly covers every row variant, where a
literal per-exercise drawing would need a hundred and still miss the next one.

`movement_pattern` is stored as free text by the schema but validated on the way in;
anything unrecognised falls back to `isolation`, which is the honest default for a
movement the model could not place.

Icons appear in the picker rows, the session block headers, and progression. Tapping
an exercise name opens a sheet — following `EditEntrySheet`'s established shape —
with the icon, the primary muscle and equipment, the instructions, and the caveat.

## Testing

`mobile/vitest.config.ts` runs `environment: 'node'` and anything importing
`react-native` fails to *run*. So the logic goes on the testable side, in
`mobile/src/ai/exercises.ts` — `src/ai` is already covered — holding prompt
construction and response parsing, with no React Native import.

- Response parsing: a well-formed batch response maps to entries; a malformed one
  throws rather than writing partial data.
- An unrecognised `movement_pattern` falls back to `isolation`.
- Batch splitting: 41 names produce 3 batches of 20, 20 and 1.
- A response returning fewer entries than it was sent names the missing ones rather
  than silently dropping them.
- The pattern→icon map is pure data and gets its own test: every one of the eight
  patterns resolves, and an unknown string returns the fallback rather than
  `undefined`.

No database tests and no component rendering tests; neither can run under node, and
loosening the config is the trap `HANDOFF.md` documents. The UI is verified in a
browser, which on this project has now caught five bugs a green suite missed.

## Risks

**Cost is now implicit.** The point of this design is that the app spends a Gemini
call without being asked. The guards are: zero results only, one attempt per distinct
query per screen, and a settle delay so nothing fires mid-word. Seeding is bounded by
batching. There is no ongoing background cost — an exercise is enriched once, ever.

**A wrong instruction is worse than a missing one.** Mitigated by the caveat, and by
the fact that instructions sit behind a tap rather than in front of the set rows.

**Migration v4 will be the first migration applied to a device holding real data.**
`HANDOFF.md` already records that v3 has only ever been applied to fresh databases
and that testing v3 against a v2 device is outstanding. v4 makes that check more
urgent, not less. It is additive — one new table, one nullable column — which is the
safest shape a migration can have, but it must still be run against a device with
history before it is trusted.

**Seeding touches every exercise row in one pass.** It runs in a transaction per
batch, so a failure mid-run leaves earlier batches linked and later ones untouched,
and re-running it skips what is already linked.

## Order of work

C depends on B: instructions and icons need the catalogue that B creates, and the
enrichment call that returns both is defined in B. A depends on nothing.

1. **A — auto-lookup on empty food search.** One file, no schema, ships alone.
2. **B1 — migration v4 and the catalogue table.** Schema only, no behaviour.
3. **B2 — `src/ai/exercises.ts`,** the enrichment call and its tests. Pure, testable,
   no UI.
4. **B3 — seeding from history,** under Settings → Your data.
5. **B4 — the picker reads the catalogue,** with auto-enrichment on zero matches.
6. **C1 — `ExerciseIcon`** and the pattern map, with its test.
7. **C2 — the instructions sheet,** and icons in the picker, session and progression.

Steps 1 and 2 are independently safe to merge. Steps 3 through 5 should land
together: a catalogue that nothing reads is dead weight, and a picker that reads an
unseeded catalogue is worse than the current free-text field.
