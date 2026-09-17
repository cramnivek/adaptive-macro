import type {
  DailyObservation,
  Food,
  FoodPortion,
  ISODate,
  LogEntry,
  Meal,
  Nutrients,
} from '@adaptive-macros/engine';
import * as SQLite from 'expo-sqlite';
import { MIGRATIONS } from './schema';

let database: SQLite.SQLiteDatabase | null = null;

/**
 * Opens the database once and brings it up to the latest schema version.
 *
 * Migrations run inside a transaction keyed on PRAGMA user_version, so a
 * half-applied upgrade after a crash rolls back rather than leaving the app
 * pointing at a schema it cannot read.
 */
export const getDb = async (): Promise<SQLite.SQLiteDatabase> => {
  if (database) return database;

  const db = await SQLite.openDatabaseAsync('adaptive-macros.db');
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  for (let version = current; version < MIGRATIONS.length; version++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }

  database = db;
  return db;
};

// --- settings -------------------------------------------------------------

export const readSetting = async <T,>(key: string): Promise<T | null> => {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    // A value that will not parse is corrupt, not empty. Returning null makes
    // the caller fall back to its default rather than crashing on launch.
    return null;
  }
};

export const writeSetting = async (key: string, value: unknown): Promise<void> => {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value),
  );
};

// --- weights --------------------------------------------------------------

export interface WeightRow {
  date: ISODate;
  kg: number;
}

export const saveWeight = async (date: ISODate, kg: number): Promise<void> => {
  const db = await getDb();
  // One reading per calendar day: a second weigh-in replaces the first rather
  // than double-counting, which would corrupt the filter's day sequence.
  await db.runAsync(
    'INSERT INTO weights (date, kg, created_at) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET kg = excluded.kg',
    date,
    kg,
    new Date().toISOString(),
  );
};

export const deleteWeight = async (date: ISODate): Promise<void> => {
  const db = await getDb();
  await db.runAsync('DELETE FROM weights WHERE date = ?', date);
};

export const listWeights = async (): Promise<WeightRow[]> => {
  const db = await getDb();
  return db.getAllAsync<WeightRow>('SELECT date, kg FROM weights ORDER BY date ASC');
};

// --- foods ----------------------------------------------------------------

interface FoodRow {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  source: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  portions: string;
  fetched_at: string | null;
  sources: string | null;
}

const rowToFood = (row: FoodRow): Food => ({
  id: row.id,
  name: row.name,
  brand: row.brand ?? undefined,
  barcode: row.barcode ?? undefined,
  source: row.source as Food['source'],
  per100g: {
    kcal: row.kcal,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    fiberG: row.fiber_g,
  },
  portions: JSON.parse(row.portions) as FoodPortion[],
  fetchedAt: row.fetched_at ?? undefined,
  sources: row.sources ? (JSON.parse(row.sources) as string[]) : undefined,
});

/**
 * Caches a food locally. Remote lookups are cached on first use so a food you
 * eat every day costs one network round trip ever, and so the diary still
 * renders offline.
 */
export const saveFood = async (food: Food): Promise<void> => {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO foods (id, name, brand, barcode, source, kcal, protein_g, carbs_g, fat_g, fiber_g, portions, fetched_at, sources)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, brand = excluded.brand, barcode = excluded.barcode,
       kcal = excluded.kcal, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g,
       fat_g = excluded.fat_g, fiber_g = excluded.fiber_g, portions = excluded.portions,
       fetched_at = excluded.fetched_at, sources = excluded.sources`,
    food.id,
    food.name,
    food.brand ?? null,
    food.barcode ?? null,
    food.source,
    food.per100g.kcal,
    food.per100g.proteinG,
    food.per100g.carbsG,
    food.per100g.fatG,
    food.per100g.fiberG ?? 0,
    JSON.stringify(food.portions),
    food.fetchedAt ?? new Date().toISOString(),
    food.sources?.length ? JSON.stringify(food.sources) : null,
  );
};

export const getFoodById = async (id: string): Promise<Food | null> => {
  const db = await getDb();
  const row = await db.getFirstAsync<FoodRow>('SELECT * FROM foods WHERE id = ?', id);
  return row ? rowToFood(row) : null;
};

export const deleteFood = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.runAsync('DELETE FROM foods WHERE id = ?', id);
};

export const findFoodByBarcode = async (barcode: string): Promise<Food | null> => {
  const db = await getDb();
  const row = await db.getFirstAsync<FoodRow>('SELECT * FROM foods WHERE barcode = ?', barcode);
  return row ? rowToFood(row) : null;
};

export const searchLocalFoods = async (query: string, limit = 25): Promise<Food[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<FoodRow>(
    'SELECT * FROM foods WHERE name LIKE ? OR brand LIKE ? ORDER BY name LIMIT ?',
    `%${query}%`,
    `%${query}%`,
    limit,
  );
  return rows.map(rowToFood);
};

/**
 * Foods logged most often in the last 30 days.
 *
 * Recency alone would surface whatever was logged last; frequency alone would
 * pin foods from an old diet at the top forever. Counting occurrences inside a
 * recent window gets what people actually reach for now.
 */
export const listFrequentFoods = async (limit = 20): Promise<Food[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<FoodRow>(
    `SELECT f.* FROM foods f
     JOIN log_entries l ON l.food_id = f.id
     WHERE l.date >= date('now', '-30 days')
     GROUP BY f.id
     ORDER BY COUNT(l.id) DESC, MAX(l.created_at) DESC
     LIMIT ?`,
    limit,
  );
  return rows.map(rowToFood);
};

// --- diary ----------------------------------------------------------------

interface LogRow {
  id: string;
  date: string;
  food_id: string;
  food_name: string;
  grams: number;
  meal: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

const rowToEntry = (row: LogRow): LogEntry => ({
  id: row.id,
  date: row.date,
  foodId: row.food_id,
  foodName: row.food_name,
  grams: row.grams,
  meal: row.meal as Meal,
  nutrients: {
    kcal: row.kcal,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    fiberG: row.fiber_g,
  },
});

export const addLogEntry = async (entry: LogEntry): Promise<void> => {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO log_entries (id, date, food_id, food_name, grams, meal, kcal, protein_g, carbs_g, fat_g, fiber_g, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    entry.id,
    entry.date,
    entry.foodId,
    entry.foodName,
    entry.grams,
    entry.meal,
    entry.nutrients.kcal,
    entry.nutrients.proteinG,
    entry.nutrients.carbsG,
    entry.nutrients.fatG,
    entry.nutrients.fiberG ?? 0,
    new Date().toISOString(),
  );
};

/**
 * Changes an existing entry's portion or meal.
 *
 * Nutrients are passed in already rescaled rather than recomputed here: the
 * caller knows whether it still has the food's per-100 g basis (and can scale
 * exactly) or only the stored totals (and must scale proportionally). Deciding
 * that in the database layer would mean guessing.
 */
export const updateLogEntry = async (
  id: string,
  changes: { grams: number; meal: Meal; nutrients: Nutrients },
): Promise<void> => {
  const db = await getDb();
  await db.runAsync(
    `UPDATE log_entries
     SET grams = ?, meal = ?, kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ?, fiber_g = ?
     WHERE id = ?`,
    changes.grams,
    changes.meal,
    changes.nutrients.kcal,
    changes.nutrients.proteinG,
    changes.nutrients.carbsG,
    changes.nutrients.fatG,
    changes.nutrients.fiberG ?? 0,
    id,
  );
};

/** Days that have at least one entry, most recent first, for the repeat picker. */
export const listLoggedDates = async (limit = 30, excluding?: ISODate): Promise<ISODate[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{ date: string }>(
    `SELECT DISTINCT date FROM log_entries
     WHERE date != ?
     ORDER BY date DESC LIMIT ?`,
    excluding ?? '',
    limit,
  );
  return rows.map((row) => row.date);
};

/**
 * Copies entries from one day onto another.
 *
 * New ids are generated rather than reusing the originals, so the copy is an
 * independent entry — editing or deleting it must not touch the day it came
 * from. Meals can be filtered so "repeat yesterday's breakfast" does not drag
 * dinner along with it.
 */
export const copyEntriesToDay = async (
  from: ISODate,
  to: ISODate,
  meals?: Meal[],
): Promise<number> => {
  const db = await getDb();
  const source = await listLogEntries(from);
  const wanted = meals?.length ? source.filter((entry) => meals.includes(entry.meal)) : source;

  await db.withTransactionAsync(async () => {
    for (const entry of wanted) {
      await db.runAsync(
        `INSERT INTO log_entries (id, date, food_id, food_name, grams, meal, kcal, protein_g, carbs_g, fat_g, fiber_g, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        to,
        entry.foodId,
        entry.foodName,
        entry.grams,
        entry.meal,
        entry.nutrients.kcal,
        entry.nutrients.proteinG,
        entry.nutrients.carbsG,
        entry.nutrients.fatG,
        entry.nutrients.fiberG ?? 0,
        new Date().toISOString(),
      );
    }
  });

  return wanted.length;
};

export const deleteLogEntry = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.runAsync('DELETE FROM log_entries WHERE id = ?', id);
};

export const listLogEntries = async (date: ISODate): Promise<LogEntry[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<LogRow>(
    'SELECT * FROM log_entries WHERE date = ? ORDER BY created_at ASC',
    date,
  );
  return rows.map(rowToEntry);
};

/**
 * Every day's totals plus every weigh-in, merged into the one shape the
 * estimator consumes.
 *
 * A day appears with `intakeKcal` only if something was logged that day. That
 * distinction is load-bearing: the filter treats a missing intake as unknown,
 * not as a zero-calorie day.
 */
export const loadObservations = async (): Promise<DailyObservation[]> => {
  const db = await getDb();

  const intake = await db.getAllAsync<{ date: string; kcal: number }>(
    'SELECT date, SUM(kcal) AS kcal FROM log_entries GROUP BY date',
  );
  const weights = await listWeights();

  const byDate = new Map<ISODate, DailyObservation>();
  for (const row of weights) byDate.set(row.date, { date: row.date, weightKg: row.kg });
  for (const row of intake) {
    const existing = byDate.get(row.date);
    if (existing) existing.intakeKcal = row.kcal;
    else byDate.set(row.date, { date: row.date, intakeKcal: row.kcal });
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
};

export const dailyTotals = async (date: ISODate): Promise<Nutrients> => {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    kcal: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    fiber_g: number | null;
  }>(
    `SELECT SUM(kcal) AS kcal, SUM(protein_g) AS protein_g, SUM(carbs_g) AS carbs_g,
            SUM(fat_g) AS fat_g, SUM(fiber_g) AS fiber_g
     FROM log_entries WHERE date = ?`,
    date,
  );
  return {
    kcal: row?.kcal ?? 0,
    proteinG: row?.protein_g ?? 0,
    carbsG: row?.carbs_g ?? 0,
    fatG: row?.fat_g ?? 0,
    fiberG: row?.fiber_g ?? 0,
  };
};

// --- backup ---------------------------------------------------------------

export interface Backup {
  version: 1;
  exportedAt: string;
  settings: { key: string; value: string }[];
  weights: WeightRow[];
  foods: FoodRow[];
  entries: LogRow[];
}

/**
 * Whole-database export. With no server behind this app, a JSON file the user
 * controls is the only backup that exists — it is the migration path to a new
 * phone, so it dumps every table rather than a curated subset.
 */
export const exportBackup = async (): Promise<Backup> => {
  const db = await getDb();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: await db.getAllAsync('SELECT key, value FROM settings'),
    weights: await db.getAllAsync('SELECT date, kg FROM weights'),
    foods: await db.getAllAsync('SELECT * FROM foods'),
    entries: await db.getAllAsync('SELECT * FROM log_entries'),
  };
};
