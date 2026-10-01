# A muscle map, and a how-to worth reading

Design, 2026-10-01.

## Problem

An exercise shows one of eight abstract movement-pattern glyphs — a bent line for a
hinge, a chevron for a pull. They tell you almost nothing, and a reviewer caught two
of the first eight being exact mirrors of each other.

Hevy, the reference, shows two things instead: a drawing of the movement, and which
muscles it loads — `Primary: Lats`, `Secondary: Upper Back, Biceps, Forearms` — with
the worked areas shaded on a body. Its how-to is numbered steps, not a paragraph.

We cannot have Hevy's drawings: they are a licensed illustration library a few hundred
renders deep. But the muscles are ours to draw, once, and they cover every exercise
that will ever exist — including `N1 Style Cross Body Bicep Curl`, which in Hevy gets
a grey "NS" circle because its library has no art for it.

## Goals

A glance tells you what a movement loads. The how-to reads like instructions rather
than prose. Both work for a custom exercise nobody has drawn.

## Non-goals

- **Anatomical illustration.** See *The art is the risk*.
- **Per-exercise drawings.** The thing a muscle map buys is total coverage.
- **Replacing the movement glyphs everywhere.** They stay for the progression chips,
  where a body at 14px would be mud, and as the fallback when a region cannot be
  placed.
- **Rewriting existing catalogue entries' prose.** Entries seeded before this keep
  working; see *Backfilling what is already there*.

## The art is the risk

I hand-drew the eight movement glyphs, and a reviewer found `push` and `pull` were
exact mirrors and three others were indistinguishable at size. Anatomy is harder than
that, and a front-and-back body with fifteen separately-fillable regions is a lot of
path data to get right by hand.

So the body is **deliberately diagrammatic, not anatomical**: a blocky silhouette
where each muscle region is a simple rounded shape, in the same stroke weight as the
rest of the interface. At 20px in a picker row no anatomical detail survives anyway —
what has to read is *where on the body* the shading is, and a blocky figure does that
better than a detailed one.

If the figure does not read at 20px when seen on a device, the picker and block header
fall back to the existing movement glyph and the map stays in the how-to sheet, where
it is drawn at 96px and certainly legible. That decision is made by looking, not now.

## Regions

`movement_pattern` is already a validated field with a fallback, and this follows it.
Free text cannot drive a diagram: the model saying "posterior chain" has nowhere to
go. Fifteen regions, plus `full_body` for things like stretching and carries:

```
chest  shoulders  biceps  triceps  forearms  abs  obliques
lats  upper_back  lower_back  traps
glutes  quads  hamstrings  calves        (+ full_body)
```

Front view draws: chest, shoulders, biceps, forearms, abs, obliques, quads.
Back view draws: traps, upper_back, lats, lower_back, triceps, glutes, hamstrings,
calves. Shoulders and forearms appear on both.

A region the model returns that is not in the list falls back to `full_body`, the same
way an unknown movement pattern falls back to `isolation`. `primary_muscle` stays as
it is — free text, the model's own wording, shown as a label. The region is what
drives the drawing, so it is separate and validated.

## Schema, migration v5

`MIGRATIONS` is append-only and holds four entries. v5 adds three nullable columns:

```sql
ALTER TABLE exercise_catalogue ADD COLUMN primary_region TEXT;
ALTER TABLE exercise_catalogue ADD COLUMN secondary_regions TEXT;
ALTER TABLE exercise_catalogue ADD COLUMN instruction_steps TEXT;
```

All nullable, because every existing row has none of them and a migration that
rewrites rows is a migration that can corrupt them. `secondary_regions` and
`instruction_steps` hold JSON arrays — a list in a column, read in one place, written
in one place, and never queried by SQL.

`instructions` keeps its prose. An entry seeded before v5 still has a how-to; the
sheet renders steps when they exist and the paragraph when they do not. Nothing is
thrown away for the sake of a new format.

## Backfilling what is already there

**This is the part that would otherwise silently do nothing.**
`listUnlinkedExerciseNames` selects `WHERE e.catalogue_id IS NULL`. On a device where
the catalogue has already been built, that returns an empty list — so after v5, "Build
the exercise catalogue" would report "0 of 0" and the new fields would stay null
forever.

So seeding gets a second source of work: catalogue entries whose `primary_region` is
null. They are re-enriched by `canonical_name` and updated in place, never
re-inserted — the row's `id` is what `exercises.catalogue_id` points at, and replacing
it would unlink every exercise that uses it.

The Settings copy says which it is doing: "Filling in muscles and steps for 43
exercises" reads differently from "Cataloguing 43 exercises", and a user who already
ran this once deserves to know why it is running again.

## What the model returns

`EnrichedExercise` gains `primaryRegion`, `secondaryRegions: string[]` and
`steps: string[]`. The enrichment schema gains them as an enum, an array of that enum,
and an array of strings; the prompt asks for two to five steps, each one action.

`instructions` stays in the response. It is what a pre-v5 entry already has, it is
what gets shown when steps are missing, and dropping it would mean a failed step
generation leaves an entry with no how-to at all.

## Where the map appears

- **The how-to sheet** — front and back at 96px side by side, primary region solid in
  the accent colour, secondary at reduced opacity, a legend naming them in the model's
  own words, then the numbered steps and the existing caveat.
- **The picker row and the session block header** — one view at 20px, whichever side
  carries the primary region, primary region only.
- **Progression chips** keep the movement glyph. A body at 14px is a smudge.

## Testing

`vitest` runs `environment: 'node'`, so the component cannot be tested. The parts that
can are pure and go in `mobile/src/ai/` and `mobile/src/components/muscleMap.ts`:

- every one of the fifteen regions, plus `full_body`, resolves to at least one path
- an unknown region resolves to `full_body` rather than `undefined`
- `viewFor(region)` returns `back` for lats and `front` for chest
- parsing: an entry with regions and steps round-trips; one without them parses with
  nulls rather than throwing, which is what a pre-v5 row looks like
- a region the model invents lands in the entry as `full_body`, not as itself
- the JSON columns survive a round trip through the shapes the db layer reads and
  writes

The map's legibility is judged by eye, on a device, and nowhere else.

## Risks

**The art may not read at 20px.** Mitigated by the fallback above, and the decision is
made by looking rather than by argument.

**Backfilling costs a full re-enrichment.** Every catalogue entry is sent again: for 80
exercises that is four batches at roughly 26 seconds each. It happens once, the
Settings screen says what it is doing, and a batch that fails is retried on the next
run rather than starving the queue.

**A fifteen-value enum is more for the model to get wrong** than the eight movement
patterns. The fallback is the same shape, and the test for an invented region is the
one that proves it.

## Order of work

1. **Regions and the map data** — the vocabulary, `viewFor`, the path table, the
   fallback, with tests. Pure, no UI, no schema.
2. **Migration v5 and the db round trip** — three nullable columns, read and write.
3. **Enrichment** — the schema, the prompt, the parse, and the backfill query.
4. **Settings** — seeding picks up entries needing backfill and says so.
5. **The sheet** — front and back, the legend, the numbered steps.
6. **The small map** — picker row and block header, or the fallback if it does not
   read.

Steps 1 and 2 are independently safe. Step 6 is the one that might not survive contact
with a real screen.
