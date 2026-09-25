/**
 * Schema migrations, applied in order against SQLite's `user_version`.
 *
 * Append-only: each entry is a version step that has already shipped to a real
 * device somewhere, so editing one in place would leave those devices on a
 * schema that no longer matches what the code expects. Add a new step instead.
 */
export const MIGRATIONS: string[] = [
  // v1 — initial schema
  `
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS weights (
    date       TEXT PRIMARY KEY NOT NULL,
    kg         REAL NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS foods (
    id         TEXT PRIMARY KEY NOT NULL,
    name       TEXT NOT NULL,
    brand      TEXT,
    barcode    TEXT,
    source     TEXT NOT NULL,
    kcal       REAL NOT NULL,
    protein_g  REAL NOT NULL,
    carbs_g    REAL NOT NULL,
    fat_g      REAL NOT NULL,
    fiber_g    REAL NOT NULL DEFAULT 0,
    portions   TEXT NOT NULL,
    fetched_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_foods_barcode ON foods (barcode);
  CREATE INDEX IF NOT EXISTS idx_foods_name    ON foods (name);

  CREATE TABLE IF NOT EXISTS log_entries (
    id         TEXT PRIMARY KEY NOT NULL,
    date       TEXT NOT NULL,
    food_id    TEXT NOT NULL,
    food_name  TEXT NOT NULL,
    grams      REAL NOT NULL,
    meal       TEXT NOT NULL,
    kcal       REAL NOT NULL,
    protein_g  REAL NOT NULL,
    carbs_g    REAL NOT NULL,
    fat_g      REAL NOT NULL,
    fiber_g    REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_log_date ON log_entries (date);
  `,
  // v2 — provenance for grounded lookups
  `
  ALTER TABLE foods ADD COLUMN sources TEXT;
  `,
  // v3 — lifting history
  //
  // `routines` and `routine_exercises` are created here although nothing
  // writes to them yet. This list is append-only, so adding them alongside the
  // feature that uses them would cost a v4 for no gain.
  `
  CREATE TABLE IF NOT EXISTS exercises (
    id               TEXT PRIMARY KEY NOT NULL,
    name             TEXT NOT NULL UNIQUE,
    bodyweight_based INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS routines (
    id         TEXT PRIMARY KEY NOT NULL,
    name       TEXT NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS routine_exercises (
    routine_id  TEXT NOT NULL REFERENCES routines (id) ON DELETE CASCADE,
    exercise_id TEXT NOT NULL REFERENCES exercises (id),
    position    INTEGER NOT NULL DEFAULT 0,
    target_sets INTEGER NOT NULL DEFAULT 3,
    PRIMARY KEY (routine_id, exercise_id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY NOT NULL,
    date        TEXT NOT NULL,
    routine_id  TEXT REFERENCES routines (id),
    name        TEXT NOT NULL,
    -- UNIQUE because import idempotency keys on it: re-importing the same
    -- export must change nothing, and a constraint fails loudly if the
    -- caller's own check is ever wrong, rather than duplicating history.
    started_at  TEXT NOT NULL UNIQUE,
    finished_at TEXT,
    notes       TEXT
  );

  CREATE TABLE IF NOT EXISTS sets (
    id            TEXT PRIMARY KEY NOT NULL,
    session_id    TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    exercise_id   TEXT NOT NULL REFERENCES exercises (id),
    exercise_name TEXT NOT NULL,
    set_index     INTEGER NOT NULL,
    weight_kg     REAL,
    reps          INTEGER NOT NULL,
    set_type      TEXT NOT NULL DEFAULT 'normal',
    rpe           REAL,
    created_at    TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_date    ON sessions (date);
  CREATE INDEX IF NOT EXISTS idx_sets_session     ON sets (session_id);
  CREATE INDEX IF NOT EXISTS idx_sets_exercise    ON sets (exercise_name);
  `,
];
