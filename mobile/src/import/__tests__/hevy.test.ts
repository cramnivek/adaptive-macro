import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HEVY_COLUMNS, parseHevyCsv } from '../hevy';

const fixture = readFileSync(join(__dirname, 'fixtures/hevy-sample.csv'), 'utf8');
const parsed = parseHevyCsv(fixture);

const session = (startedAt: string) =>
  parsed.sessions.find((s) => s.startedAt === startedAt);

const exercise = (name: string) => parsed.exercises.find((e) => e.name === name);

const setsFor = (name: string) =>
  parsed.sessions.flatMap((s) =>
    s.exercises.filter((e) => e.name === name).flatMap((e) => e.sets),
  );

describe('header validation', () => {
  // If Hevy changes the format, that must say so immediately rather than
  // importing zeros into fifteen months of history.
  it('throws when a column is missing, naming what it received', () => {
    const bad = 'title,start_time\n"a","1 Jan 2025, 10:00"';

    expect(() => parseHevyCsv(bad)).toThrow(/start_time/);
    expect(() => parseHevyCsv(bad)).toThrow(/expected/i);
  });

  it('throws when the columns are right but reordered, rather than silently mismapping', () => {
    const reordered = [...HEVY_COLUMNS].reverse().join(',') + '\n';

    expect(() => parseHevyCsv(reordered)).toThrow();
  });

  it('accepts the real export header', () => {
    expect(parsed.sessions.length).toBeGreaterThan(0);
  });
});

describe('the quoting hazard', () => {
  // `"29 Dec 2025, 15:37"` has a comma INSIDE the quotes. Splitting on commas
  // breaks every row while still producing plausible-looking fields, so this
  // asserts the parsed value rather than merely that nothing threw.
  it('parses a timestamp whose quoted value contains a comma', () => {
    const s = session('2025-12-23T15:01');

    expect(s).toBeDefined();
    expect(s?.date).toBe('2025-12-23');
    expect(s?.finishedAt).toBe('2025-12-23T16:20');
  });

  it('does not leak quotes into any parsed name', () => {
    for (const e of parsed.exercises) {
      expect(e.name).not.toMatch(/"/);
    }
  });
});

describe('grouping', () => {
  it('groups rows into sessions by start_time', () => {
    expect(parsed.sessions).toHaveLength(8);
    expect(new Set(parsed.sessions.map((s) => s.startedAt)).size).toBe(8);
  });

  it('groups rows into exercises within a session, preserving set order', () => {
    const s = session('2025-12-23T15:01');
    const first = s?.exercises[0];

    expect(first?.name).toBe('Bench Press (Barbell)');
    expect(first?.sets.map((x) => x.setIndex)).toEqual([0, 1, 2]);
  });

  it('carries the session title', () => {
    expect(session('2025-12-23T15:01')?.title).toBe('Phase 2 push#1');
  });

  it('orders sessions chronologically', () => {
    const dates = parsed.sessions.map((s) => s.startedAt);

    expect([...dates].sort()).toEqual(dates);
  });
});

describe('units', () => {
  // Hevy always writes weight_lbs regardless of its display setting, so every
  // value is pounds and converts once to the canonical kg.
  it('converts pounds to kilograms', () => {
    const s = session('2025-12-23T15:01');
    const kg = s?.exercises[0].sets[0].weightKg;

    // 115 lb, the first set of the 23 Dec session
    expect(kg).toBeCloseTo(52.16, 2);
  });

  it('records a missing weight as null rather than zero', () => {
    const dips = setsFor('Chest Dip');

    expect(dips.length).toBeGreaterThan(0);
    expect(dips.every((s) => s.weightKg === null)).toBe(true);
  });
});

describe('bodyweight inference', () => {
  it('flags an exercise whose every set carries no weight', () => {
    expect(exercise('Chest Dip')?.bodyweightBased).toBe(true);
    expect(exercise('Wide Pull Up')?.bodyweightBased).toBe(true);
    expect(exercise('Push Up - Close Grip')?.bodyweightBased).toBe(true);
  });

  // The inference provably cannot catch this one: a weighted dip always
  // carries a number. The spec says so plainly, and this pins that the parser
  // does not pretend otherwise — it is a manual correction in the preview.
  it('does not flag Chest Dip (Weighted), which always carries a number', () => {
    expect(exercise('Chest Dip (Weighted)')?.bodyweightBased).toBe(false);
  });

  it('does not flag a loaded lift that has a few missing weights', () => {
    expect(exercise('Bench Press (Barbell)')?.bodyweightBased).toBe(false);
  });

  // All six Stretching sets lack a weight, which trips the inference, and all
  // six also lack reps, so every one is dropped. Offering it as a bodyweight
  // exercise asks the user to rule on something that contributes nothing.
  it('does not offer an exercise whose every set was dropped', () => {
    expect(exercise('Stretching')).toBeUndefined();
  });
});

describe('rows that cannot be modelled', () => {
  it('drops rows with no reps and counts them', () => {
    expect(parsed.skipped.noReps).toBe(4);
    expect(setsFor('Stretching')).toHaveLength(0);
    expect(setsFor('Walking Lunge (Dumbbell)')).toHaveLength(0);
  });

  // Distance and duration are explicit non-goals, so these rows are skipped
  // rather than coerced into a rep-based model they do not fit.
  it('reports the unmodelled columns it ignored', () => {
    expect(parsed.droppedColumns).toEqual(
      expect.arrayContaining([
        'superset_id',
        'description',
        'exercise_notes',
        'distance_miles',
        'duration_seconds',
      ]),
    );
  });
});

describe('fields carried through', () => {
  it('keeps set_type verbatim, including failure', () => {
    const types = new Set(
      parsed.sessions.flatMap((s) => s.exercises.flatMap((e) => e.sets.map((x) => x.setType))),
    );

    expect(types).toContain('normal');
    expect(types).toContain('warmup');
    expect(types).toContain('failure');
  });

  it('carries rpe when present and null when absent', () => {
    const all = parsed.sessions.flatMap((s) => s.exercises.flatMap((e) => e.sets));

    expect(all.some((s) => typeof s.rpe === 'number')).toBe(true);
    expect(all.some((s) => s.rpe === null)).toBe(true);
  });
});

describe('counts for the preview', () => {
  it('reports sessions, exercises, sets and the date range', () => {
    expect(parsed.counts.sessions).toBe(8);
    expect(parsed.counts.sets).toBe(41); // 45 rows less the 4 with no reps
    expect(parsed.counts.exercises).toBe(13); // 15 distinct, less Stretching and Walking Lunge
    expect(parsed.counts.firstDate).toBe('2024-09-08');
    expect(parsed.counts.lastDate).toBe('2025-12-23');
  });

  // Surfaced so the omission is visible rather than silent: these are the
  // Bench Press and Deadlift slips.
  it('counts sets kept but unusable for progression, without dropping them', () => {
    expect(parsed.skipped.noWeightOnLoadedLift).toBe(5);

    const bench = setsFor('Bench Press (Barbell)');
    expect(bench.some((s) => s.weightKg === null)).toBe(true);
  });
});
