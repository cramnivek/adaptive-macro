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
];
