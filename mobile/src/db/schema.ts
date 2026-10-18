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
  // v5 — muscles to draw, and a how-to in steps
  //
  // All three nullable, because every existing row has none of them and a
  // migration that rewrites rows is a migration that can corrupt them. The two
  // plural columns hold JSON arrays: a list read in one place, written in one
  // place, and never queried by SQL.
  //
  // `instructions` keeps its prose. An entry catalogued before this still has a
  // how-to, and the sheet shows steps when they exist and the paragraph when
  // they do not, so nothing is discarded for the sake of a new format.
  //
  // `primary_muscle` also stays as it is: free text in the model's own wording,
  // shown as a label. `primary_region` is the validated one, because free text
  // cannot drive a diagram — "posterior chain" has nowhere to go on a body.
  `
  ALTER TABLE exercise_catalogue ADD COLUMN primary_region TEXT;
  ALTER TABLE exercise_catalogue ADD COLUMN secondary_regions TEXT;
  ALTER TABLE exercise_catalogue ADD COLUMN instruction_steps TEXT;
  `,
  // v6 — a rep target per routine exercise
  //
  // Free text, because programmes write it as "8", "8-10", "AMRAP" or "30s",
  // and no one number covers those. Nullable: every routine built before this
  // has none, and a routine built by hand still need not give one.
  `
  ALTER TABLE routine_exercises ADD COLUMN target_reps TEXT;
  `,
  // v7 — whether a day's food log is the whole day
  //
  // The estimator reads a logged day as everything eaten. A day with dinner
  // forgotten therefore reads as a big deficit the scale never showed, and the
  // only way to explain that is a lower expenditure — so the target drops.
  // `complete = 0` takes the day's intake out of the estimate; `complete = 1`
  // records that a light day really was light, so the app stops asking. No
  // row means nobody has said, which is every day before this.
  `
  CREATE TABLE IF NOT EXISTS day_status (
    date      TEXT PRIMARY KEY NOT NULL,
    complete  INTEGER NOT NULL,
    marked_at TEXT NOT NULL
  );
  `,
  // v8 — cardiovascular activities in routines and sessions
  //
  // Adds support for tracking cardio alongside lifting exercises.
  // Cardio mode: 'treadmill' or 'outside'.
  // Treadmill variables: speed_kph, incline_pct, duration_seconds.
  // Outside variables: distance_km, duration_seconds.
  `
  ALTER TABLE exercises ADD COLUMN is_cardio INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE exercises ADD COLUMN cardio_mode TEXT;

  ALTER TABLE routine_exercises ADD COLUMN is_cardio INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE routine_exercises ADD COLUMN cardio_mode TEXT;
  ALTER TABLE routine_exercises ADD COLUMN target_time TEXT;
  ALTER TABLE routine_exercises ADD COLUMN target_distance REAL;
  ALTER TABLE routine_exercises ADD COLUMN target_speed REAL;
  ALTER TABLE routine_exercises ADD COLUMN target_incline REAL;

  ALTER TABLE sets ADD COLUMN is_cardio INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE sets ADD COLUMN cardio_mode TEXT;
  ALTER TABLE sets ADD COLUMN speed_kph REAL;
  ALTER TABLE sets ADD COLUMN incline_pct REAL;
  ALTER TABLE sets ADD COLUMN duration_seconds INTEGER;
  ALTER TABLE sets ADD COLUMN distance_km REAL;
  `,
  // v9 — supersets and giant sets in routines and sessions
  //
  // superset_group links two or more exercises performed back-to-back:
  // e.g. 'A', 'B'. Null means an independent exercise block.
  `
  ALTER TABLE routine_exercises ADD COLUMN superset_group TEXT;
  ALTER TABLE sets ADD COLUMN superset_group TEXT;
  `,
  // v10 — index exercises.catalogue_id and sets.exercise_id for instant search
  //
  // The catalogue search subquery joins exercises e to sets s on catalogue_id and
  // exercise_id. Indexing both columns turns the search from an unindexed table
  // scan into an instant index seek.
  `
  CREATE INDEX IF NOT EXISTS idx_exercises_catalogue ON exercises (catalogue_id);
  CREATE INDEX IF NOT EXISTS idx_sets_exercise_id    ON sets (exercise_id);
  `,
  // v11 — body circumferences and body fat percentage tracking
  //
  // Records waist, chest, arms, thighs, calves, hips, neck, shoulders (cm)
  // and body fat percentage for tracking physique changes alongside scale weight.
  `
  CREATE TABLE IF NOT EXISTS body_measurements (
    id            TEXT PRIMARY KEY NOT NULL,
    date          TEXT NOT NULL,
    waist_cm      REAL,
    chest_cm      REAL,
    arms_cm       REAL,
    thighs_cm     REAL,
    calves_cm     REAL,
    hips_cm       REAL,
    neck_cm       REAL,
    shoulders_cm  REAL,
    body_fat_pct  REAL,
    notes         TEXT,
    created_at    TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_body_measurements_date ON body_measurements (date);
  `,
  // v12 — full clinical micronutrients panel
  //
  // Stores clinical micronutrients as JSON in foods and log_entries
  // (covering all essential vitamins, trace minerals, electrolytes, and lipid fractions).
  // Nullable: existing rows contain no micronutrients; parsing safely falls back.
  `
  ALTER TABLE foods ADD COLUMN micronutrients TEXT;
  ALTER TABLE log_entries ADD COLUMN micronutrients TEXT;
  `,
];
