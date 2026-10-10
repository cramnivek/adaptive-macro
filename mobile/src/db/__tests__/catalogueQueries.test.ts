import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CATALOGUE_BY_CANONICAL_NAME,
  CATALOGUE_BY_LINKED_NAME,
  PATTERNS_BY_CANONICAL_NAME,
  PATTERNS_BY_LINKED_NAME,
  REGIONS_BY_LINKED_NAME,
  SEARCH_CATALOGUE,
} from '../catalogueQueries';
import { MIGRATIONS } from '../schema';

/**
 * The data layer, against a real SQLite.
 *
 * `node:sqlite` ships with Node, so this costs no dependency, and the schema
 * is built by running the app's own `MIGRATIONS` in order — the same strings
 * a phone runs. Nothing here is mocked: a query passing here is the query the
 * app executes, against the schema the app has.
 *
 * This exists because every SQL bug this project shipped reached a real device
 * first. The data layer had no coverage, and `environment: 'node'` cannot load
 * expo-sqlite, so the queries were untestable where they sat.
 */
/*
  Loaded through `createRequire` rather than imported.

  Vite's list of Node builtins predates `node:sqlite`, so a static import is
  resolved as a package and fails looking for a file called "sqlite".
  Marking it external in the Vitest config does not help, because the
  resolution happens before that applies.
*/
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): { get(...params: unknown[]): unknown; all(...params: unknown[]): unknown[]; run(...params: unknown[]): unknown };
  };
};

let db: InstanceType<typeof DatabaseSync>;

const migrate = () => {
  const fresh = new DatabaseSync(':memory:');
  fresh.exec('PRAGMA foreign_keys = ON');
  for (const step of MIGRATIONS) fresh.exec(step);
  return fresh;
};

/** A catalogue entry. Regions are optional, as they are on an older row. */
const catalogue = (
  id: string,
  canonicalName: string,
  extra: { pattern?: string; primaryRegion?: string | null } = {},
) => {
  db.prepare(
    `INSERT INTO exercise_catalogue
       (id, canonical_name, movement_pattern, primary_muscle, equipment,
        bodyweight_based, instructions, created_at, primary_region, secondary_regions)
     VALUES (?, ?, ?, 'Quadriceps', 'Barbell', 0, 'Stand up.', '2026-01-01', ?, ?)`,
  ).run(
    id,
    canonicalName,
    extra.pattern ?? 'squat',
    extra.primaryRegion === undefined ? 'quads' : extra.primaryRegion,
    '["glutes"]',
  );
};

/** An exercise the user has actually logged under some name. */
const exercise = (id: string, name: string, catalogueId: string | null) => {
  db.prepare(
    'INSERT INTO exercises (id, name, bodyweight_based, created_at, catalogue_id) VALUES (?, ?, 0, ?, ?)',
  ).run(id, name, '2026-01-01', catalogueId);
};

const session = (id: string) => {
  db.prepare(
    "INSERT INTO sessions (id, date, name, started_at, finished_at) VALUES (?, '2026-01-01', 'W', ?, ?)",
  ).run(id, '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z');
};

const loggedSet = (id: string, sessionId: string, exerciseId: string, name: string) => {
  db.prepare(
    `INSERT INTO sets (id, session_id, exercise_id, exercise_name, set_index, weight_kg, reps,
                       set_type, rpe, created_at)
     VALUES (?, ?, ?, ?, 0, 100, 5, 'normal', NULL, ?)`,
  ).run(id, sessionId, exerciseId, name, '2026-01-01T10:05:00Z');
};

beforeEach(() => {
  db = migrate();
});

describe('the migrations themselves', () => {
  it('build a schema that every catalogue query can run against', () => {
    // A query referencing a column a migration forgot throws here rather than
    // on someone's phone.
    for (const sql of [
      CATALOGUE_BY_LINKED_NAME,
      CATALOGUE_BY_CANONICAL_NAME,
      PATTERNS_BY_CANONICAL_NAME,
      PATTERNS_BY_LINKED_NAME,
      REGIONS_BY_LINKED_NAME,
      SEARCH_CATALOGUE,
    ]) {
      expect(() => db.prepare(sql)).not.toThrow();
    }
  });

  it('create every table the app reads from', () => {
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
        name: string;
      }[]
    ).map((row) => row.name);

    for (const table of [
      'settings',
      'weights',
      'foods',
      'log_entries',
      'exercises',
      'routines',
      'sessions',
      'sets',
      'exercise_catalogue',
    ]) {
      expect(tables).toContain(table);
    }
  });

  it('apply in order, so a later step can alter an earlier table', () => {
    // v4 adds exercises.catalogue_id and v5 adds the region columns. Running
    // them out of order throws, which is the whole reason the list is
    // append-only.
    const columns = (
      db.prepare('PRAGMA table_info(exercise_catalogue)').all() as { name: string }[]
    ).map((row) => row.name);
    expect(columns).toContain('primary_region');
    expect(columns).toContain('instruction_steps');
  });
});

describe('finding the entry behind a name', () => {
  it('follows the link a logged set created, even when the names differ', () => {
    catalogue('c1', 'Pull-Up');
    exercise('e1', 'Pull Up', 'c1');

    const row = db.prepare(CATALOGUE_BY_LINKED_NAME).get('Pull Up') as Record<string, unknown>;
    expect(row.canonical_name).toBe('Pull-Up');
    expect(row.recorded_name).toBe('Pull Up');
  });

  it('finds nothing through the link before a set has been logged', () => {
    // The regression. `exercises` rows are written when a set is, so until
    // then there is no link to follow — and the how-to was unavailable.
    catalogue('c1', 'Overhead Press');
    expect(db.prepare(CATALOGUE_BY_LINKED_NAME).get('Overhead Press')).toBeUndefined();
  });

  it('finds it by canonical name instead, which is what the fallback is for', () => {
    catalogue('c1', 'Overhead Press');

    const row = db.prepare(CATALOGUE_BY_CANONICAL_NAME).get('Overhead Press') as Record<
      string,
      unknown
    >;
    expect(row.canonical_name).toBe('Overhead Press');
    expect(row.recorded_name).toBeNull();
  });

  it('does not match a recorded name through the fallback', () => {
    // The fallback is canonical-only on purpose. A recorded name that differs
    // has a link, and the link is the authority on it.
    catalogue('c1', 'Pull-Up');
    exercise('e1', 'Pull Up', 'c1');
    expect(db.prepare(CATALOGUE_BY_CANONICAL_NAME).get('Pull Up')).toBeUndefined();
  });

  it('ignores an exercise that was never linked to the catalogue', () => {
    exercise('e1', 'Jefferson Curl', null);
    expect(db.prepare(CATALOGUE_BY_LINKED_NAME).get('Jefferson Curl')).toBeUndefined();
  });
});

describe('the glyph map', () => {
  it('covers the catalogue whether or not anything has been lifted', () => {
    catalogue('c1', 'Overhead Press', { pattern: 'push' });

    const rows = db.prepare(PATTERNS_BY_CANONICAL_NAME).all() as { name: string }[];
    expect(rows.map((r) => r.name)).toEqual(['Overhead Press']);
  });

  it('gives the recorded name too, so a renamed lift still has its glyph', () => {
    catalogue('c1', 'Pull-Up', { pattern: 'pull' });
    exercise('e1', 'Pull Up', 'c1');

    const linked = db.prepare(PATTERNS_BY_LINKED_NAME).all() as { name: string }[];
    expect(linked.map((r) => r.name)).toEqual(['Pull Up']);
  });
});

describe('searching the catalogue', () => {
  it('reports the name this user files the exercise under, not the canonical one', () => {
    catalogue('c1', 'Pull-Up');
    exercise('e1', 'Pull Up', 'c1');
    session('s1');
    loggedSet('set1', 's1', 'e1', 'Pull Up');

    const row = db.prepare(SEARCH_CATALOGUE).get('%Pull%', 30) as Record<string, unknown>;
    expect(row.canonical_name).toBe('Pull-Up');
    // Adding it under "Pull-Up" would fork 206 sets of history in two.
    expect(row.recorded_name).toBe('Pull Up');
  });

  it('prefers the name with the most sets when history is filed under two', () => {
    catalogue('c1', 'Pull-Up');
    exercise('e1', 'Pull Up', 'c1');
    exercise('e2', 'Pullup', 'c1');
    session('s1');
    loggedSet('a', 's1', 'e2', 'Pullup');
    loggedSet('b', 's1', 'e1', 'Pull Up');
    loggedSet('c', 's1', 'e1', 'Pull Up');

    const row = db.prepare(SEARCH_CATALOGUE).get('%Pull%', 30) as Record<string, unknown>;
    expect(row.recorded_name).toBe('Pull Up');
  });

  it('returns a null recorded name for an entry nobody has lifted', () => {
    catalogue('c1', 'Zercher Squat');
    const row = db.prepare(SEARCH_CATALOGUE).get('%Zercher%', 30) as Record<string, unknown>;
    expect(row.recorded_name).toBeNull();
  });

  it('honours its limit', () => {
    for (let i = 0; i < 5; i += 1) catalogue(`c${i}`, `Squat ${i}`);
    expect((db.prepare(SEARCH_CATALOGUE).all('%Squat%', 2) as unknown[]).length).toBe(2);
  });
});

describe('the muscle map source', () => {
  it('skips entries catalogued before regions existed', () => {
    catalogue('c1', 'Old Entry', { primaryRegion: null });
    exercise('e1', 'Old Entry', 'c1');

    expect((db.prepare(REGIONS_BY_LINKED_NAME).all() as unknown[]).length).toBe(0);
  });

  it('returns the regions for an entry that has them', () => {
    catalogue('c1', 'Back Squat', { primaryRegion: 'quads' });
    exercise('e1', 'Back Squat', 'c1');

    const row = db.prepare(REGIONS_BY_LINKED_NAME).get() as Record<string, unknown>;
    expect(row.primary_region).toBe('quads');
    expect(row.secondary_regions).toBe('["glutes"]');
  });
});
