import type {
  DailyObservation,
  DatedSet,
  ExercisePR,
  Food,
  FoodPortion,
  ISODate,
  LogEntry,
  Meal,
  Micronutrients,
  Nutrients,
  SetType,
} from '@adaptive-macros/engine';
import { addDays, estimate1RM } from '@adaptive-macros/engine';
import * as SQLite from 'expo-sqlite';
import { MIGRATIONS } from './schema';
import { rowsToRestore } from './backupRows';
import { normalisePattern, type EnrichedExercise, type MovementPattern } from '../ai/exercises';
import { normaliseRegion, type MuscleRegion } from '../components/muscleMap';
import {
  ALL_CATALOGUE_ENTRIES,
  CATALOGUE_BY_CANONICAL_NAME,
  CATALOGUE_BY_LINKED_NAME,
  PATTERNS_BY_CANONICAL_NAME,
  PATTERNS_BY_LINKED_NAME,
  SEARCH_CATALOGUE,
} from './catalogueQueries';
import { DAILY_INTAKE_FOR_ESTIMATE } from './intakeQueries';
import { LAST_MEALS_BEFORE, LOGGED_DATES_BEFORE } from './mealQueries';
import { filterEntriesForCopy, insertCopiedEntries } from './copyEntries';
import { DELETE_ROUTINE_STEPS } from './routineQueries';
import { STORAGE_LOCK_RETRY_MS, isStorageLockError } from './storageLock';
import {
  BUILTIN_CATALOGUE,
  RAW_BUILTIN_CATALOGUE,
  exerciseIdentityKey,
  findBuiltinCatalogueEntry,
} from '../builtinCatalogue';

/**
 * The open in flight, not the opened database.
 *
 * Caching the resolved handle instead leaves a window: everything between the
 * first `await` and the assignment runs with the cache still empty, so a second
 * caller arriving in that window opens the file a second time. On web that is
 * fatal rather than wasteful — expo-sqlite runs on OPFS, a sync access handle
 * is exclusive, and the second open fails with `Invalid VFS state`, which
 * surfaces at whatever unrelated call happened to be second. The app opens the
 * database from several effects at startup, so the window is regularly hit.
 *
 * Caching the promise means every caller awaits the same open.
 */
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

if (typeof BroadcastChannel !== 'undefined') {
  const opfsChannel = new BroadcastChannel('ascend-expo-sqlite-opfs');
  opfsChannel.onmessage = (event: MessageEvent) => {
    if (event.data === 'yield-opfs') {
      databasePromise = null;
    }
  };
}

/**
 * The file of whoever is using the app, or null until that is known.
 *
 * Nothing opens a database before this is set, so no call can read one
 * person's log on behalf of another — see `accountDatabase.ts`. A call made
 * before then waits rather than failing, since several effects reach for the
 * database while the session is still being read from storage.
 */
let selectedDatabase: string | null = null;
let waitingForSelection: (() => void)[] = [];

/** Points every later call at another owner's file, closing the one open. */
export const selectDatabase = async (name: string): Promise<void> => {
  if (name === selectedDatabase) return;
  const previous = databasePromise;
  databasePromise = null;
  selectedDatabase = name;
  await previous?.then((db) => db.closeAsync()).catch(() => undefined);
  const waiting = waitingForSelection;
  waitingForSelection = [];
  for (const resume of waiting) resume();
};

/**
 * Opens the database once and brings it up to the latest schema version.
 *
 * Migrations run inside a transaction keyed on PRAGMA user_version, so a
 * half-applied upgrade after a crash rolls back rather than leaving the app
 * pointing at a schema it cannot read.
 */
export const getDb = (): Promise<SQLite.SQLiteDatabase> => {
  if (selectedDatabase === null) {
    return new Promise<void>((resume) => waitingForSelection.push(resume)).then(getDb);
  }
  if (!databasePromise) {
    // Cleared on failure so a later call can retry rather than being stuck
    // with a rejected promise for the life of the session.
    const opening = openAndMigrate(selectedDatabase).catch((error) => {
      if (databasePromise === opening) databasePromise = null;
      throw error;
    });
    databasePromise = opening;
  }
  return databasePromise;
};

const migrate = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  for (let version = current; version < MIGRATIONS.length; version++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
};

/**
 * Opens and migrates, waiting out the browser's storage lock if it is held.
 *
 * Only that one error is retried — see `storageLock.ts` for why it happens and
 * why it clears on its own. Anything else throws at once, because retrying a
 * real failure only delays the message about it.
 *
 * A database that opened but then hit the lock is closed before the next try,
 * so a retry never stacks a second handle on the first. Migrations are safe to
 * repeat: each runs in its own transaction, so a failed one rolled back.
 */
const openAndMigrate = async (name: string): Promise<SQLite.SQLiteDatabase> => {
  for (let attempt = 0; ; attempt += 1) {
    let db: SQLite.SQLiteDatabase | null = null;
    try {
      db = await SQLite.openDatabaseAsync(name);
      await migrate(db);
      return db;
    } catch (error) {
      const wait = STORAGE_LOCK_RETRY_MS[attempt];
      if (!isStorageLockError(error) || wait === undefined) throw error;
      await db?.closeAsync().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
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
  micronutrients: string | null;
  estimate?: string | null;
}

const rowToFood = (row: FoodRow): Food => {
  let micros: Micronutrients | undefined;
  if (row.micronutrients) {
    try {
      micros = JSON.parse(row.micronutrients);
    } catch {}
  }
  let estimate: Food['estimate'];
  if (row.estimate) {
    try {
      const parsed = JSON.parse(row.estimate);
      if (parsed && ['low', 'medium', 'high'].includes(parsed.confidence) && typeof parsed.assumption === 'string') {
        estimate = { confidence: parsed.confidence, assumption: parsed.assumption };
      }
    } catch {}
  }
  return {
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
      micros,
    },
    portions: JSON.parse(row.portions) as FoodPortion[],
    fetchedAt: row.fetched_at ?? undefined,
    sources: row.sources ? (JSON.parse(row.sources) as string[]) : undefined,
    estimate,
  };
};

/**
 * Caches a food locally. Remote lookups are cached on first use so a food you
 * eat every day costs one network round trip ever, and so the diary still
 * renders offline.
 */
export const saveFood = async (food: Food): Promise<void> => {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO foods (id, name, brand, barcode, source, kcal, protein_g, carbs_g, fat_g, fiber_g, portions, fetched_at, sources, micronutrients, estimate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, brand = excluded.brand, barcode = excluded.barcode,
       kcal = excluded.kcal, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g,
       fat_g = excluded.fat_g, fiber_g = excluded.fiber_g, portions = excluded.portions,
       fetched_at = excluded.fetched_at, sources = excluded.sources,
       micronutrients = excluded.micronutrients, estimate = excluded.estimate`,
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
    food.per100g.micros ? JSON.stringify(food.per100g.micros) : null,
    food.estimate ? JSON.stringify(food.estimate) : null,
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
  micronutrients?: string | null;
}

const rowToEntry = (row: LogRow): LogEntry => {
  let micros: Micronutrients | undefined;
  if (row.micronutrients) {
    try {
      micros = JSON.parse(row.micronutrients);
    } catch {}
  }
  return {
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
      micros,
    },
  };
};

export const addLogEntry = async (entry: LogEntry): Promise<void> => {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO log_entries (id, date, food_id, food_name, grams, meal, kcal, protein_g, carbs_g, fat_g, fiber_g, micronutrients, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    entry.nutrients.micros ? JSON.stringify(entry.nutrients.micros) : null,
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
     SET grams = ?, meal = ?, kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ?, fiber_g = ?, micronutrients = ?
     WHERE id = ?`,
    changes.grams,
    changes.meal,
    changes.nutrients.kcal,
    changes.nutrients.proteinG,
    changes.nutrients.carbsG,
    changes.nutrients.fatG,
    changes.nutrients.fiberG ?? 0,
    changes.nutrients.micros ? JSON.stringify(changes.nutrients.micros) : null,
    id,
  );
};

/** Days with entries before `before`, most recent first, for the repeat picker. */
export const listLoggedDates = async (limit = 30, before?: ISODate): Promise<ISODate[]> => {
  const db = await getDb();
  const rows = before
    ? await db.getAllAsync<{ date: string }>(LOGGED_DATES_BEFORE, before, limit)
    : await db.getAllAsync<{ date: string }>('SELECT DISTINCT date FROM log_entries ORDER BY date DESC LIMIT ?', limit);
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
/** A meal as last logged: the day, its total, and how many items it had. */
export interface RecentMeal {
  date: ISODate;
  kcal: number;
  items: number;
}

/** Each meal's most recent earlier day in the week before `date`. */
export const lastMealsBefore = async (date: ISODate): Promise<Map<Meal, RecentMeal>> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{ meal: Meal; date: ISODate; kcal: number; items: number }>(
    LAST_MEALS_BEFORE,
    date,
    addDays(date, -7),
  );
  return new Map(rows.map((row) => [row.meal, { date: row.date, kcal: row.kcal, items: row.items }]));
};

export const copyEntriesToDay = async (
  from: ISODate,
  to: ISODate,
  meals?: Meal[],
  entryIds?: string[],
): Promise<number> => {
  if (entryIds !== undefined && entryIds.length === 0) return 0;
  const db = await getDb();
  const source = await listLogEntries(from);
  const wanted = filterEntriesForCopy(source, from, meals, entryIds);
  return insertCopiedEntries(db, wanted, to);
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

/** Every entry from `from` to `to`, both included, oldest first. */
export const listLogEntriesBetween = async (from: ISODate, to: ISODate): Promise<LogEntry[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<LogRow>(
    'SELECT * FROM log_entries WHERE date BETWEEN ? AND ? ORDER BY date ASC, created_at ASC',
    from,
    to,
  );
  return rows.map(rowToEntry);
};

/**
 * Every day's totals plus every weigh-in, merged into the one shape the
 * estimator consumes.
 *
 * A day appears with `intakeKcal` only if something was logged that day, and
 * was not marked as not fully logged. That distinction is load-bearing: the
 * filter treats a missing intake as unknown, not as a zero-calorie day.
 */
export const loadObservations = async (): Promise<DailyObservation[]> => {
  const db = await getDb();

  const intake = await db.getAllAsync<{ date: string; kcal: number }>(DAILY_INTAKE_FOR_ESTIMATE);
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

/**
 * What has been said about each day's log: true for "that was everything",
 * false for "not fully logged". A day nobody has answered for is absent.
 */
export const listDayStatus = async (): Promise<Map<ISODate, boolean>> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{ date: ISODate; complete: number }>(
    'SELECT date, complete FROM day_status',
  );
  return new Map(rows.map((row) => [row.date, row.complete === 1]));
};

/** Records whether a day's log is complete; null forgets the answer. */
export const setDayStatus = async (date: ISODate, complete: boolean | null): Promise<void> => {
  const db = await getDb();
  if (complete === null) {
    await db.runAsync('DELETE FROM day_status WHERE date = ?', date);
    return;
  }
  await db.runAsync(
    `INSERT INTO day_status (date, complete, marked_at) VALUES (?, ?, ?)
     ON CONFLICT (date) DO UPDATE SET complete = excluded.complete, marked_at = excluded.marked_at`,
    date,
    complete ? 1 : 0,
    new Date().toISOString(),
  );
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

/**
 * Everything this app holds, in one file.
 *
 * Version 2 adds the lifting tables. Version 1 files predate them and restore
 * fine — their workout arrays are simply absent, which is true rather than
 * empty-by-assumption. A v1 export taken after the Hevy import would have
 * silently omitted thousands of sets, which is the failure a backup exists to
 * prevent.
 */
export interface Backup {
  version: 1 | 2;
  exportedAt: string;
  settings: { key: string; value: string }[];
  weights: WeightRow[];
  foods: FoodRow[];
  entries: LogRow[];
  exerciseCatalogue?: Record<string, unknown>[];
  exercises?: Record<string, unknown>[];
  routines?: Record<string, unknown>[];
  routineExercises?: Record<string, unknown>[];
  sessions?: Record<string, unknown>[];
  sets?: Record<string, unknown>[];
  dayStatus?: Record<string, unknown>[];
  bodyMeasurements?: Record<string, unknown>[];
  dailySteps?: Record<string, unknown>[];
  sleepSessions?: Record<string, unknown>[];
}

/**
 * Whole-database export. With no server behind this app, a JSON file the user
 * controls is the only backup that exists — it is the migration path to a new
 * phone, so it dumps every table rather than a curated subset.
 */
export const exportBackup = async (): Promise<Backup> => {
  const db = await getDb();
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: await db.getAllAsync('SELECT key, value FROM settings'),
    weights: await db.getAllAsync('SELECT * FROM weights'),
    foods: await db.getAllAsync('SELECT * FROM foods'),
    entries: await db.getAllAsync('SELECT * FROM log_entries'),
    exerciseCatalogue: await db.getAllAsync('SELECT * FROM exercise_catalogue'),
    exercises: await db.getAllAsync('SELECT * FROM exercises'),
    routines: await db.getAllAsync('SELECT * FROM routines'),
    routineExercises: await db.getAllAsync('SELECT * FROM routine_exercises'),
    sessions: await db.getAllAsync('SELECT * FROM sessions'),
    sets: await db.getAllAsync('SELECT * FROM sets'),
    dayStatus: await db.getAllAsync('SELECT * FROM day_status'),
    bodyMeasurements: await db.getAllAsync('SELECT * FROM body_measurements'),
    dailySteps: await db.getAllAsync('SELECT * FROM daily_steps'),
    sleepSessions: await db.getAllAsync('SELECT * FROM sleep_sessions'),
  };
};

/** What a backup holds, for showing before it is restored over anything. */
export const describeBackup = (backup: Backup) => ({
  version: backup.version,
  exportedAt: backup.exportedAt,
  weights: backup.weights?.length ?? 0,
  foods: backup.foods?.length ?? 0,
  entries: backup.entries?.length ?? 0,
  sessions: backup.sessions?.length ?? 0,
  sets: backup.sets?.length ?? 0,
  routines: backup.routines?.length ?? 0,
  measurements: backup.bodyMeasurements?.length ?? 0,
});

const isBackup = (value: unknown): value is Backup => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Backup>;
  return (
    (candidate.version === 1 || candidate.version === 2) &&
    Array.isArray(candidate.weights) &&
    Array.isArray(candidate.foods) &&
    Array.isArray(candidate.entries)
  );
};

/** Parses a backup file, refusing anything that is not one. */
export const parseBackup = (text: string): Backup => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('That file is not JSON, so it is not a backup from this app.');
  }
  if (!isBackup(value)) {
    throw new Error('That JSON is not a backup from this app — no version or no data arrays.');
  }
  return value;
};

const insertRows = async (
  db: SQLite.SQLiteDatabase,
  table: string,
  rows: Record<string, unknown>[] | undefined,
): Promise<void> => {
  if (!rows?.length) return;
  // Columns come from each row rather than a fixed list, so a backup written
  // by an older schema restores its own columns and lets the rest default.
  for (const row of rows) {
    const columns = Object.keys(row);
    if (columns.length === 0) continue;
    await db.runAsync(
      `INSERT OR REPLACE INTO ${table} (${columns.join(', ')})
       VALUES (${columns.map(() => '?').join(', ')})`,
      ...columns.map((column) => row[column] as SQLite.SQLiteBindValue),
    );
  }
};

/**
 * Replaces everything with the contents of a backup.
 *
 * Destructive by design — a restore that merged would silently resurrect
 * entries the user had deleted, and leave them unable to tell which of two
 * states they were in. The caller confirms first.
 *
 * One transaction: a half-restored database is worse than either state, since
 * nothing on screen would say which rows came from where.
 */
export const restoreBackup = async (backup: Backup): Promise<void> => {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    // Children first, so foreign keys are never left dangling mid-restore.
    for (const table of [
      'sets',
      'routine_exercises',
      'sessions',
      'routines',
      'exercises',
      'exercise_catalogue',
      'log_entries',
      'foods',
      'weights',
      'settings',
      'day_status',
      'body_measurements',
      'daily_steps',
      'sleep_sessions',
    ]) {
      await db.runAsync(`DELETE FROM ${table}`);
    }

    for (const [table, rows] of rowsToRestore(backup)) {
      await insertRows(db, table, rows);
    }
  });
};

// --- workouts -------------------------------------------------------------

/** A session and its sets, as the importer hands them over. */
export interface WorkoutSessionInput {
  title: string;
  startedAt: string;
  finishedAt: string | null;
  date: ISODate;
  exercises: {
    name: string;
    bodyweightBased: boolean;
    sets: {
      setIndex: number;
      weightKg: number | null;
      reps: number;
      setType: SetType;
      rpe: number | null;
    }[];
  }[];
}

/**
 * Every session start already on record.
 *
 * Import idempotency keys on this: a session whose start timestamp exists is
 * skipped, so re-importing an export changes nothing and importing a newer one
 * lands only what is new.
 */
export const knownSessionStarts = async (): Promise<Set<string>> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{ started_at: string }>('SELECT started_at FROM sessions');
  return new Set(rows.map((row) => row.started_at));
};

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Local wall-clock `YYYY-MM-DDTHH:MM:SS`, matching what the importer writes.
 *
 * Hevy's export carries no timezone, so imported sessions are stored as local
 * wall-clock. Writing UTC here would put two conventions in one column, and
 * `started_at` is ordered and compared lexicographically — sessions logged in
 * the app would interleave with imported ones off by the UTC offset, so
 * `lastWorkingSet` could prefill from the older of two sessions.
 *
 * Seconds are kept because `started_at` is UNIQUE and the importer's values
 * have minute resolution.
 */
const localStamp = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  );
};

/**
 * Writes sessions and their sets.
 *
 * One transaction for the lot: a half-written import is worse than none, since
 * the caller cannot tell which half landed and the start-time check would then
 * skip the sessions that did.
 *
 * `bodyweight_based` is written from the caller's value — the import preview
 * lets the user correct the inference before this is reached — but an exercise
 * already on record keeps its stored flag rather than being overwritten by a
 * fresh guess from a later import.
 */
export const insertWorkoutSessions = async (
  sessions: WorkoutSessionInput[],
): Promise<{ sessions: number; sets: number }> => {
  const db = await getDb();
  const now = new Date().toISOString();
  let setCount = 0;

  await db.withTransactionAsync(async () => {
    for (const session of sessions) {
      const sessionId = newId();
      await db.runAsync(
        `INSERT INTO sessions (id, date, routine_id, name, started_at, finished_at, notes)
         VALUES (?, ?, NULL, ?, ?, ?, NULL)`,
        sessionId,
        session.date,
        session.title,
        session.startedAt,
        session.finishedAt,
      );

      for (const exercise of session.exercises) {
        // The flag is updated, not just inserted. DO NOTHING made the import
        // preview's bodyweight toggle a silent no-op for any exercise already
        // on record, which is exactly the case a re-import exists to correct.
        await db.runAsync(
          `INSERT INTO exercises (id, name, bodyweight_based, created_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (name) DO UPDATE SET bodyweight_based = excluded.bodyweight_based`,
          newId(),
          exercise.name,
          exercise.bodyweightBased ? 1 : 0,
          now,
        );

        const row = await db.getFirstAsync<{ id: string }>(
          'SELECT id FROM exercises WHERE name = ?',
          exercise.name,
        );
        if (!row) throw new Error(`Import: exercise ${exercise.name} vanished mid-transaction`);

        for (const set of exercise.sets) {
          await db.runAsync(
            `INSERT INTO sets (id, session_id, exercise_id, exercise_name, set_index, weight_kg, reps, set_type, rpe, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            newId(),
            sessionId,
            row.id,
            exercise.name,
            set.setIndex,
            set.weightKg,
            set.reps,
            set.setType,
            set.rpe,
            now,
          );
          setCount += 1;
        }
      }
    }
  });

  return { sessions: sessions.length, sets: setCount };
};

/**
 * Every recorded set of one exercise, paired with its session date.
 *
 * Shaped for `progressionFor`, which takes dated sets and a bodyweight lookup.
 * Matching is by exact name: `Bench Press (Barbell)` and
 * `Bench Press (Smith Machine)` are different exercises carrying different
 * loads, and merging them is the corruption this design warns against.
 */
export const listSetsForExercise = async (name: string): Promise<DatedSet[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    session_id: string;
    date: ISODate;
    exercise_name: string;
    set_index: number;
    weight_kg: number | null;
    reps: number;
    set_type: string;
    rpe: number | null;
    bodyweight_based: number;
  }>(
    `SELECT s.id, s.session_id, w.date, s.exercise_name, s.set_index, s.weight_kg,
            s.reps, s.set_type, s.rpe, e.bodyweight_based
       FROM sets s
       JOIN sessions  w ON w.id = s.session_id
       JOIN exercises e ON e.id = s.exercise_id
      WHERE s.exercise_name = ?
      ORDER BY w.date, s.set_index`,
    name,
  );

  return rows.map((row) => ({
    date: row.date,
    set: {
      id: row.id,
      sessionId: row.session_id,
      exerciseName: row.exercise_name,
      setIndex: row.set_index,
      weightKg: row.weight_kg,
      reps: row.reps,
      setType: row.set_type as SetType,
      rpe: row.rpe,
      bodyweightBased: row.bodyweight_based === 1,
    },
  }));
};

/** Exercises that have at least one recorded set, most-trained first. */
export const listTrainedExercises = async (): Promise<
  { name: string; bodyweightBased: boolean; setCount: number }[]
> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    name: string;
    bodyweight_based: number;
    set_count: number;
  }>(
    `SELECT e.name, e.bodyweight_based, COUNT(s.id) AS set_count
       FROM exercises e
       JOIN sets s ON s.exercise_id = e.id
      GROUP BY e.id
      ORDER BY set_count DESC, e.name`,
  );

  return rows.map((row) => ({
    name: row.name,
    bodyweightBased: row.bodyweight_based === 1,
    setCount: row.set_count,
  }));
};

/** Corrects an inference the import got wrong. */
export const setExerciseBodyweightBased = async (
  name: string,
  bodyweightBased: boolean,
): Promise<void> => {
  const db = await getDb();
  await db.runAsync(
    'UPDATE exercises SET bodyweight_based = ? WHERE name = ?',
    bodyweightBased ? 1 : 0,
    name,
  );
};

// --- the exercise catalogue ------------------------------------------------

export interface CatalogueEntry {
  id: string;
  canonicalName: string;
  /**
   * The `exercises.name` linked to this entry, if one is.
   *
   * The catalogue holds the model's canonical name; history is keyed on the
   * name the export or the user actually used. They are routinely different —
   * `Deadlift (Barbell)` comes back as `Barbell Deadlift` — so anything that
   * writes a set has to use this and not `canonicalName`, or it forks the
   * exercise in two and leaves the older half's forty sessions unreachable.
   */
  recordedName: string | null;
  movementPattern: MovementPattern;
  primaryMuscle: string;
  equipment: string;
  bodyweightBased: boolean;
  instructions: string | null;
  /**
   * The validated region that drives the diagram, null on an entry catalogued
   * before v5 and not yet backfilled. `primaryMuscle` above stays the label.
   */
  primaryRegion: MuscleRegion | null;
  secondaryRegions: MuscleRegion[];
  /** Empty when the entry predates v5; `instructions` is the fallback. */
  steps: string[];
}

interface CatalogueRow {
  id: string;
  canonical_name: string;
  recorded_name: string | null;
  movement_pattern: string;
  primary_muscle: string;
  equipment: string;
  bodyweight_based: number;
  instructions: string | null;
  primary_region: string | null;
  secondary_regions: string | null;
  instruction_steps: string | null;
}

/**
 * A JSON array column, which is empty whenever it is anything else.
 *
 * Null for a pre-v5 row, and a row written by a future version could hold
 * something this one does not expect. Neither is a reason to throw while
 * drawing a list of exercises.
 */
const parseList = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
};

const toCatalogueEntry = (row: CatalogueRow): CatalogueEntry => ({
  id: row.id,
  canonicalName: row.canonical_name,
  recordedName: row.recorded_name,
  movementPattern: normalisePattern(row.movement_pattern),
  primaryMuscle: row.primary_muscle,
  equipment: row.equipment,
  bodyweightBased: row.bodyweight_based === 1,
  instructions: row.instructions,
  // Null stays null: "not backfilled yet" is a different thing from
  // `full_body`, and the sheet needs to tell them apart to decide whether to
  // draw a body at all.
  primaryRegion: row.primary_region === null ? null : normaliseRegion(row.primary_region),
  secondaryRegions: parseList(row.secondary_regions).map(normaliseRegion),
  steps: parseList(row.instruction_steps),
});

/**
 * Creates the entry, or fills in what an existing one is missing.
 *
 * The update is the backfill path, and it is an UPDATE rather than a delete and
 * re-insert because `exercises.catalogue_id` points at this row's id: replacing
 * it would unlink every exercise using it. Only the v5 columns are written, and
 * only when the row has none — re-running this must not churn the classification
 * a user has already seen, and must not overwrite a region with a later call's
 * different guess.
 */
export const upsertCatalogueEntry = async (entry: EnrichedExercise): Promise<string> => {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: string; primary_region: string | null }>(
    'SELECT id, primary_region FROM exercise_catalogue WHERE canonical_name = ? COLLATE NOCASE',
    entry.canonicalName,
  );
  if (existing) {
    if (existing.primary_region === null) {
      await db.runAsync(
        `UPDATE exercise_catalogue
            SET primary_region = ?, secondary_regions = ?, instruction_steps = ?
          WHERE id = ?`,
        entry.primaryRegion,
        JSON.stringify(entry.secondaryRegions),
        JSON.stringify(entry.steps),
        existing.id,
      );
    }
    return existing.id;
  }

  const id = newId();
  await db.runAsync(
    `INSERT INTO exercise_catalogue
       (id, canonical_name, movement_pattern, primary_muscle, equipment, bodyweight_based,
        instructions, primary_region, secondary_regions, instruction_steps, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    entry.canonicalName,
    entry.movementPattern,
    entry.primaryMuscle,
    entry.equipment,
    entry.bodyweightBased ? 1 : 0,
    entry.instructions,
    entry.primaryRegion,
    JSON.stringify(entry.secondaryRegions),
    JSON.stringify(entry.steps),
    localStamp(),
  );
  return id;
};

export interface CatalogueBackfillTarget {
  id: string;
  canonicalName: string;
}

/**
 * Catalogue entries that predate v5, with their ids, most-trained first.
 *
 * Seeding's other query selects exercises with no `catalogue_id`, which on a
 * device whose catalogue is already built returns nothing at all — so without
 * this, "Build the exercise catalogue" would report "0 of 0" and the muscles
 * and steps would stay null forever.
 *
 * The id travels with the name because the row cannot be found again by name
 * afterwards — see `backfillCatalogueRegions`.
 *
 * A row that got a region but no steps is deliberately not re-queued. An empty
 * `steps` is a permitted answer, the prose how-to is still shown, and asking
 * again on every run would re-bill a call for an entry that already works.
 */
export const listCatalogueNamesNeedingRegions = async (): Promise<CatalogueBackfillTarget[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; canonical_name: string }>(
    `SELECT c.id, c.canonical_name
       FROM exercise_catalogue c
       LEFT JOIN exercises e ON e.catalogue_id = c.id
       LEFT JOIN sets s ON s.exercise_id = e.id
      WHERE c.primary_region IS NULL
      GROUP BY c.id
      ORDER BY COUNT(s.id) DESC, c.canonical_name`,
  );
  return rows.map((r) => ({ id: r.id, canonicalName: r.canonical_name }));
};

/**
 * Fills in the v5 columns on one known row.
 *
 * By id, and only by id. Resolving the row by `entry.canonicalName` — the
 * model's answer — looks equivalent and is not: ask about `Pull Up` and it may
 * reply `Pull-Up`. The name lookup then misses, a second catalogue row is
 * inserted holding the regions, the real row stays null and is asked about
 * again on every future run, and the orphan appears in the picker where tapping
 * it logs sets under a name the history has never used.
 *
 * Returns whether it wrote, so the screen reports work done rather than work
 * queued.
 */
export const backfillCatalogueRegions = async (
  id: string,
  entry: EnrichedExercise,
): Promise<boolean> => {
  const db = await getDb();
  const result = await db.runAsync(
    `UPDATE exercise_catalogue
        SET primary_region = ?, secondary_regions = ?, instruction_steps = ?
      WHERE id = ? AND primary_region IS NULL`,
    entry.primaryRegion,
    JSON.stringify(entry.secondaryRegions),
    JSON.stringify(entry.steps),
    id,
  );
  return result.changes > 0;
};

/**
 * Links an exercise to its catalogue entry.
 *
 * Only ever writes `catalogue_id`. `exercises.name` is not touched here or
 * anywhere else: `sets` carries its own `exercise_name` copy and
 * `listSetsForExercise` keys on it, so a rename rewrites history silently.
 */
export const linkExerciseToCatalogue = async (
  exerciseName: string,
  catalogueId: string,
): Promise<void> => {
  const db = await getDb();
  await db.runAsync(
    'UPDATE exercises SET catalogue_id = ? WHERE name = ?',
    catalogueId,
    exerciseName,
  );
};

/** Exercise names with no catalogue entry yet — the seeding queue. */
export const listUnlinkedExerciseNames = async (): Promise<string[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT e.name
       FROM exercises e LEFT JOIN sets s ON s.exercise_id = e.id
      WHERE e.catalogue_id IS NULL
      GROUP BY e.id ORDER BY COUNT(s.id) DESC, e.name`,
  );
  return rows.map((r) => r.name);
};

/**
 * Catalogue entries matching a term, each carrying the name history is under.
 *
 * The linked name is the point. A picker that offers `Barbell Bench Press` and
 * logs that string writes a second `exercises` row beside the `Bench Press
 * (Barbell)` that every previous set belongs to — PREVIOUS goes blank, the
 * progression list shows the lift twice, and the new row is unlinked so the next
 * seeding run pays for it again.
 *
 * Most-trained-first, because more than one row can legitimately link to one
 * entry: `exerciseIdFor` links on write, and a device that ran the build with
 * the bug above already has both halves of a forked lift pointing here. The
 * whole purpose of carrying this name is to land sets where the history is, so
 * of the candidates the right one is the one with the sets — alphabetical order
 * would have picked `Barbell Bench Press` and its single set over the forty
 * sessions under `Bench Press (Barbell)`.
 */
export const searchCatalogue = async (term: string, limit = 30): Promise<CatalogueEntry[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<CatalogueRow>(SEARCH_CATALOGUE, `%${term}%`, limit);
  const out: CatalogueEntry[] = [];
  const seenIdentity = new Set<string>();
  const seenCanonical = new Set<string>();

  for (const row of rows) {
    const entry = enrichWithBuiltinFallback(
      toCatalogueEntry(row),
      row.recorded_name ?? row.canonical_name,
    );
    const idKey = exerciseIdentityKey(
      entry.recordedName ?? entry.canonicalName,
      entry.canonicalName,
    );
    const canonLower = entry.canonicalName.toLowerCase();
    if (seenIdentity.has(idKey) || seenCanonical.has(canonLower)) continue;
    seenIdentity.add(idKey);
    seenCanonical.add(canonLower);
    out.push(entry);
  }

  const q = term.trim().toLowerCase();
  for (const builtin of BUILTIN_CATALOGUE) {
    if (out.length >= limit) break;
    const canonLower = builtin.canonicalName.toLowerCase();
    if (seenIdentity.has(builtin.id) || seenCanonical.has(canonLower)) continue;
    if (
      !q ||
      canonLower.includes(q) ||
      builtin.primaryMuscle.toLowerCase().includes(q) ||
      builtin.equipment.toLowerCase().includes(q)
    ) {
      out.push(builtin);
      seenIdentity.add(builtin.id);
      seenCanonical.add(canonLower);
    }
  }
  return out;
};

/**
 * Loads all catalogue entries with their most-logged recorded names for in-memory indexing,
 * deduplicating any SQLite rows that collide with each other or with BUILTIN_CATALOGUE.
 */
export const loadAllCatalogueEntries = async (): Promise<CatalogueEntry[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<CatalogueRow>(ALL_CATALOGUE_ENTRIES);
  const out: CatalogueEntry[] = [];
  const seenIdentity = new Set<string>();
  const seenCanonical = new Set<string>();

  for (const row of rows) {
    const entry = enrichWithBuiltinFallback(
      toCatalogueEntry(row),
      row.recorded_name ?? row.canonical_name,
    );
    const idKey = exerciseIdentityKey(
      entry.recordedName ?? entry.canonicalName,
      entry.canonicalName,
    );
    const canonLower = entry.canonicalName.toLowerCase();
    if (seenIdentity.has(idKey) || seenCanonical.has(canonLower)) continue;
    seenIdentity.add(idKey);
    seenCanonical.add(canonLower);
    out.push(entry);
  }

  for (const builtin of BUILTIN_CATALOGUE) {
    const canonLower = builtin.canonicalName.toLowerCase();
    if (!seenIdentity.has(builtin.id) && !seenCanonical.has(canonLower)) {
      out.push(builtin);
      seenIdentity.add(builtin.id);
      seenCanonical.add(canonLower);
    }
  }
  return out;
};

const enrichWithBuiltinFallback = (entry: CatalogueEntry, queryName: string): CatalogueEntry => {
  if (entry.primaryRegion !== null && entry.steps.length > 0) return entry;
  const builtin =
    findBuiltinCatalogueEntry(queryName) ?? findBuiltinCatalogueEntry(entry.canonicalName);
  if (!builtin) return entry;
  return {
    ...entry,
    primaryRegion: entry.primaryRegion ?? builtin.primaryRegion,
    secondaryRegions:
      entry.secondaryRegions.length > 0 ? entry.secondaryRegions : builtin.secondaryRegions,
    steps: entry.steps.length > 0 ? entry.steps : builtin.steps,
    instructions: entry.instructions ?? builtin.instructions,
  };
};

/**
 * The catalogue entry behind an exercise name.
 *
 * Two lookups, and the second one is the point. The link between a recorded
 * name and a catalogue entry lives on the `exercises` row, and that row is
 * only written when a set is — so for an exercise you have added to a session
 * but not yet lifted, the join finds nothing and the how-to was unavailable.
 * Which is exactly backwards: the instructions matter most *before* your first
 * set of a movement, not after it.
 *
 * So the link is tried first, because a recorded name can differ from the
 * canonical one ("Pull Up" against "Pull-Up") and only the link knows that.
 * Failing that, the name is matched against the catalogue directly, which is
 * what it will be for anything just picked out of the picker, and finally falls
 * back to the built-in exercise encyclopedia so core lifts always have details.
 */
const VARIATION_MODIFIERS = [
  'incline',
  'decline',
  'close-grip',
  'close grip',
  'cgbp',
  'dumbbell',
  'db',
  'barbell',
  'bb',
  'machine',
  'cable',
  'smith',
  'deficit',
  'spoto',
  'floor',
  'front',
  'hack',
  'zercher',
  'romanian',
  'rdl',
  'sumo',
  'trap bar',
  'trap',
  'hex',
  'sissy',
  'split',
  'bulgarian',
  'goblet',
  'overhead',
  'seated',
  'standing',
  'lying',
  'preacher',
  'spider',
  'hammer',
  'reverse',
];

const hasVariationMismatch = (recorded: string, canonical: string): boolean => {
  const r = recorded.toLowerCase();
  const c = canonical.toLowerCase();
  for (const mod of VARIATION_MODIFIERS) {
    if (r.includes(mod) && !c.includes(mod)) return true;
    if (!r.includes(mod) && c.includes(mod)) return true;
  }
  return false;
};

export const catalogueEntryForExercise = async (
  exerciseName: string,
): Promise<CatalogueEntry | null> => {
  const db = await getDb();
  const linked = await db.getFirstAsync<CatalogueRow>(
    CATALOGUE_BY_LINKED_NAME,
    exerciseName,
  );
  if (linked) {
    if (hasVariationMismatch(exerciseName, linked.canonical_name)) {
      const correct = findBuiltinCatalogueEntry(exerciseName);
      if (correct) {
        const existingCat = await db.getFirstAsync<{ id: string }>(
          'SELECT id FROM exercise_catalogue WHERE canonical_name = ?',
          correct.canonicalName,
        );
        if (existingCat) {
          await db.runAsync(
            'UPDATE exercises SET catalogue_id = ? WHERE name = ?',
            existingCat.id,
            exerciseName,
          );
        }
        return correct;
      }
    } else {
      return enrichWithBuiltinFallback(toCatalogueEntry(linked), exerciseName);
    }
  }

  const byName = await db.getFirstAsync<CatalogueRow>(
    CATALOGUE_BY_CANONICAL_NAME,
    exerciseName,
  );
  if (byName) return enrichWithBuiltinFallback(toCatalogueEntry(byName), exerciseName);

  return findBuiltinCatalogueEntry(exerciseName);
};

/**
 * Movement pattern for every exercise that has one, keyed by recorded name.
 *
 * One query rather than one per row: progression draws a chip per exercise and
 * looking each one up separately would be a query per chip per render.
 */
export const cataloguePatternsByExerciseName = async (): Promise<
  Record<string, MovementPattern>
> => {
  const db = await getDb();

  // Canonical names first, so anything in the catalogue has a glyph whether or
  // not it has ever been lifted — the block header was a blank red tab until
  // the first set of a new exercise was written. Recorded names are layered
  // over the top, because where the two differ the recorded one is what the
  // header is actually keyed by.
  const [catalogue, linked] = await Promise.all([
    db.getAllAsync<{ name: string; movement_pattern: string }>(
      PATTERNS_BY_CANONICAL_NAME,
    ),
    db.getAllAsync<{ name: string; movement_pattern: string }>(
      PATTERNS_BY_LINKED_NAME,
    ),
  ]);

  const builtinPairs: [string, MovementPattern][] = [];
  for (const spec of RAW_BUILTIN_CATALOGUE) {
    builtinPairs.push([spec.canonicalName, spec.movementPattern]);
    if (spec.aliases) {
      for (const alias of spec.aliases) {
        builtinPairs.push([alias, spec.movementPattern]);
      }
    }
  }

  return Object.fromEntries([
    ...builtinPairs,
    ...[...catalogue, ...linked].map(
      (row): [string, MovementPattern] => [row.name, normalisePattern(row.movement_pattern)],
    ),
  ]);
};

// --- logging a session ----------------------------------------------------

export interface ActiveSession {
  id: string;
  date: ISODate;
  name: string;
  /**
   * The routine it was started from, so a session reopened after the app was
   * closed can bring back the exercises not yet started, not only the ones
   * with a set logged.
   */
  routineId: string | null;
  startedAt: string;
  sets: LoggedSet[];
}

export interface LoggedSet {
  id: string;
  exerciseName: string;
  bodyweightBased: boolean;
  setIndex: number;
  weightKg: number | null;
  reps: number;
  setType: SetType;
  rpe: number | null;
  isCardio?: boolean;
  cardioMode?: 'treadmill' | 'outside' | null;
  speedKph?: number | null;
  inclinePct?: number | null;
  durationSeconds?: number | null;
  distanceKm?: number | null;
  supersetGroup?: string | null;
}

/**
 * The session started and not yet finished, if there is one.
 *
 * A session is resumable rather than auto-closed: leaving the gym without
 * tapping Finish is normal, and discarding the sets or stamping an invented
 * end time would both destroy work that really happened.
 */
export const activeSession = async (): Promise<ActiveSession | null> => {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    id: string;
    date: ISODate;
    name: string;
    routine_id: string | null;
    started_at: string;
  }>(
    `SELECT id, date, name, routine_id, started_at FROM sessions
      WHERE finished_at IS NULL ORDER BY started_at DESC LIMIT 1`,
  );
  if (!row) return null;

  return {
    id: row.id,
    date: row.date,
    name: row.name,
    routineId: row.routine_id,
    startedAt: row.started_at,
    sets: await sessionSets(row.id),
  };
};

export const sessionSets = async (sessionId: string): Promise<LoggedSet[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    exercise_name: string;
    bodyweight_based: number;
    set_index: number;
    weight_kg: number | null;
    reps: number;
    set_type: string;
    rpe: number | null;
    is_cardio: number | null;
    cardio_mode: string | null;
    speed_kph: number | null;
    incline_pct: number | null;
    duration_seconds: number | null;
    distance_km: number | null;
    superset_group: string | null;
  }>(
    `SELECT s.id, s.exercise_name, e.bodyweight_based, s.set_index, s.weight_kg,
            s.reps, s.set_type, s.rpe, s.is_cardio, s.cardio_mode, s.speed_kph,
            s.incline_pct, s.duration_seconds, s.distance_km, s.superset_group
       FROM sets s JOIN exercises e ON e.id = s.exercise_id
      WHERE s.session_id = ?
      ORDER BY s.created_at, s.set_index`,
    sessionId,
  );

  return rows.map((row) => ({
    id: row.id,
    exerciseName: row.exercise_name,
    bodyweightBased: row.bodyweight_based === 1,
    setIndex: row.set_index,
    weightKg: row.weight_kg,
    reps: row.reps,
    setType: row.set_type as SetType,
    rpe: row.rpe,
    isCardio: row.is_cardio === 1,
    cardioMode: (row.cardio_mode as 'treadmill' | 'outside') ?? null,
    speedKph: row.speed_kph,
    inclinePct: row.incline_pct,
    durationSeconds: row.duration_seconds,
    distanceKm: row.distance_km,
    supersetGroup: row.superset_group ?? null,
  }));
};

export const startSession = async (
  name: string,
  date: ISODate,
  routineId: string | null = null,
): Promise<ActiveSession> => {
  const db = await getDb();
  const id = newId();
  const startedAt = localStamp();

  await db.runAsync(
    `INSERT INTO sessions (id, date, routine_id, name, started_at, finished_at, notes)
     VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
    id,
    date,
    routineId,
    name,
    startedAt,
  );

  return { id, date, name, routineId, startedAt, sets: [] };
};

/**
 * Creates the exercise if this is the first time it has been used.
 *
 * Links it to the catalogue in the same statement. Enrichment runs while the
 * name is still only typed into the picker, so `linkExerciseToCatalogue`'s
 * UPDATE on `exercises.name` matches nothing — the row does not exist until
 * here, and it used to arrive with a NULL `catalogue_id`. Tapping the block
 * header then found no entry and the how-to sheet silently did not open, which
 * left the instructions working only for exercises a Settings seeding run had
 * linked: everything except the new movement the feature exists for. The
 * subquery is NULL when the catalogue knows nothing by that name, which is the
 * old behaviour and what the seeding queue then picks up.
 */
const exerciseIdFor = async (
  db: SQLite.SQLiteDatabase,
  name: string,
  bodyweightBased: boolean,
  isCardio = false,
  cardioMode: 'treadmill' | 'outside' | null = null,
): Promise<string> => {
  await db.runAsync(
    `INSERT INTO exercises (id, name, bodyweight_based, is_cardio, cardio_mode, catalogue_id, created_at)
     VALUES (?, ?, ?, ?, ?,
             (SELECT id FROM exercise_catalogue WHERE canonical_name = ? COLLATE NOCASE),
             ?)
     ON CONFLICT (name) DO UPDATE SET
       is_cardio = CASE WHEN excluded.is_cardio = 1 THEN 1 ELSE exercises.is_cardio END,
       cardio_mode = COALESCE(excluded.cardio_mode, exercises.cardio_mode)`,
    newId(),
    name,
    bodyweightBased ? 1 : 0,
    isCardio ? 1 : 0,
    cardioMode ?? null,
    name,
    new Date().toISOString(),
  );
  const row = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM exercises WHERE name = ?',
    name,
  );
  if (!row) throw new Error(`Could not create exercise ${name}`);
  return row.id;
};

export const addSetToSession = async (
  sessionId: string,
  set: {
    exerciseName: string;
    bodyweightBased: boolean;
    setIndex: number;
    weightKg: number | null;
    reps: number;
    setType: SetType;
    rpe: number | null;
    isCardio?: boolean;
    cardioMode?: 'treadmill' | 'outside' | null;
    speedKph?: number | null;
    inclinePct?: number | null;
    durationSeconds?: number | null;
    distanceKm?: number | null;
    supersetGroup?: string | null;
  },
): Promise<void> => {
  const db = await getDb();
  const exerciseId = await exerciseIdFor(
    db,
    set.exerciseName,
    set.bodyweightBased,
    set.isCardio ?? false,
    set.cardioMode ?? null,
  );

  await db.runAsync(
    `INSERT INTO sets (id, session_id, exercise_id, exercise_name, set_index, weight_kg, reps, set_type, rpe,
                       is_cardio, cardio_mode, speed_kph, incline_pct, duration_seconds, distance_km, superset_group, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId(),
    sessionId,
    exerciseId,
    set.exerciseName,
    set.setIndex,
    set.weightKg,
    set.reps,
    set.setType,
    set.rpe,
    set.isCardio ? 1 : 0,
    set.cardioMode ?? null,
    set.speedKph ?? null,
    set.inclinePct ?? null,
    set.durationSeconds ?? null,
    set.distanceKm ?? null,
    set.supersetGroup ?? null,
    new Date().toISOString(),
  );
};

export const deleteSet = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.runAsync('DELETE FROM sets WHERE id = ?', id);
};

export const finishSession = async (sessionId: string): Promise<void> => {
  const db = await getDb();
  await db.runAsync('UPDATE sessions SET finished_at = ? WHERE id = ?', localStamp(), sessionId);
};

/** Removes a session and its sets. Used when one is abandoned with nothing in it. */
export const discardSession = async (sessionId: string): Promise<void> => {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM sets WHERE session_id = ?', sessionId);
    await db.runAsync('DELETE FROM sessions WHERE id = ?', sessionId);
  });
};

/**
 * What this exercise was last done with, for prefilling.
 *
 * The question at the rack is always what happened last time, and answering it
 * without making someone leave the screen is what makes progressive overload
 * work in practice rather than in principle.
 *
 * Warmups are skipped: prefilling an empty bar helps nobody.
 */
export const lastWorkingSet = async (
  exerciseName: string,
): Promise<{ weightKg: number | null; reps: number; date: ISODate } | null> => {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    weight_kg: number | null;
    reps: number;
    date: ISODate;
  }>(
    `SELECT s.weight_kg, s.reps, w.date
       FROM sets s JOIN sessions w ON w.id = s.session_id
      WHERE s.exercise_name = ? AND s.set_type != 'warmup'
      ORDER BY w.started_at DESC, s.set_index DESC
      LIMIT 1`,
    exerciseName,
  );

  return row ? { weightKg: row.weight_kg, reps: row.reps, date: row.date } : null;
};

/** Every exercise name on record, for the picker. Most-used first. */
export const listExerciseNames = async (): Promise<
  { name: string; bodyweightBased: boolean; isCardio: boolean; cardioMode?: 'treadmill' | 'outside' | null }[]
> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    name: string;
    bodyweight_based: number;
    is_cardio: number | null;
    cardio_mode: string | null;
  }>(
    `SELECT e.name, e.bodyweight_based, e.is_cardio, e.cardio_mode
       FROM exercises e LEFT JOIN sets s ON s.exercise_id = e.id
      GROUP BY e.id ORDER BY COUNT(s.id) DESC, e.name`,
  );
  return rows.map((r) => ({
    name: r.name,
    bodyweightBased: r.bodyweight_based === 1,
    isCardio: r.is_cardio === 1,
    cardioMode: (r.cardio_mode as 'treadmill' | 'outside') ?? null,
  }));
};

// --- routines -------------------------------------------------------------

export interface RoutineExerciseItem {
  name: string;
  bodyweightBased: boolean;
  targetSets: number;
  /** As the programme wrote it — "8", "8-10", "AMRAP" — or null when none was given. */
  targetReps: string | null;
  position: number;
  isCardio?: boolean;
  cardioMode?: 'treadmill' | 'outside' | null;
  targetTime?: string | null;
  targetDistance?: number | null;
  targetSpeed?: number | null;
  targetIncline?: number | null;
  supersetGroup?: string | null;
}

export interface Routine {
  id: string;
  name: string;
  position: number;
  exercises: RoutineExerciseItem[];
}

export const listRoutines = async (): Promise<Routine[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; name: string; position: number }>(
    'SELECT id, name, position FROM routines ORDER BY position, name',
  );

  const routines: Routine[] = [];
  for (const row of rows) {
    const exercises = await db.getAllAsync<{
      name: string;
      bodyweight_based: number;
      target_sets: number;
      target_reps: string | null;
      position: number;
      is_cardio: number | null;
      cardio_mode: string | null;
      target_time: string | null;
      target_distance: number | null;
      target_speed: number | null;
      target_incline: number | null;
      superset_group: string | null;
    }>(
      `SELECT e.name, e.bodyweight_based, re.target_sets, re.target_reps, re.position,
              re.is_cardio, re.cardio_mode, re.target_time, re.target_distance, re.target_speed, re.target_incline,
              re.superset_group
         FROM routine_exercises re JOIN exercises e ON e.id = re.exercise_id
        WHERE re.routine_id = ? ORDER BY re.position`,
      row.id,
    );
    routines.push({
      id: row.id,
      name: row.name,
      position: row.position,
      exercises: exercises.map((e) => ({
        name: e.name,
        bodyweightBased: e.bodyweight_based === 1,
        targetSets: e.target_sets,
        targetReps: e.target_reps,
        position: e.position,
        isCardio: e.is_cardio === 1,
        cardioMode: (e.cardio_mode as 'treadmill' | 'outside') ?? null,
        targetTime: e.target_time,
        targetDistance: e.target_distance,
        targetSpeed: e.target_speed,
        targetIncline: e.target_incline,
        supersetGroup: e.superset_group ?? null,
      })),
    });
  }
  return routines;
};

export const createRoutine = async (
  name: string,
  exercises: {
    name: string;
    bodyweightBased: boolean;
    targetSets: number;
    targetReps?: string | null;
    isCardio?: boolean;
    cardioMode?: 'treadmill' | 'outside' | null;
    targetTime?: string | null;
    targetDistance?: number | null;
    targetSpeed?: number | null;
    targetIncline?: number | null;
    supersetGroup?: string | null;
  }[],
): Promise<string> => {
  const db = await getDb();
  const id = newId();
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    const last = await db.getFirstAsync<{ next: number }>(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM routines',
    );
    await db.runAsync(
      'INSERT INTO routines (id, name, position, created_at) VALUES (?, ?, ?, ?)',
      id,
      name,
      last?.next ?? 0,
      now,
    );

    for (const [index, exercise] of exercises.entries()) {
      const exerciseId = await exerciseIdFor(
        db,
        exercise.name,
        exercise.bodyweightBased,
        exercise.isCardio ?? false,
        exercise.cardioMode ?? null,
      );
      await db.runAsync(
        `INSERT INTO routine_exercises (routine_id, exercise_id, position, target_sets, target_reps,
                                        is_cardio, cardio_mode, target_time, target_distance, target_speed, target_incline, superset_group)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (routine_id, exercise_id) DO UPDATE
           SET position = excluded.position, target_sets = excluded.target_sets,
               target_reps = excluded.target_reps, is_cardio = excluded.is_cardio,
               cardio_mode = excluded.cardio_mode, target_time = excluded.target_time,
               target_distance = excluded.target_distance, target_speed = excluded.target_speed,
               target_incline = excluded.target_incline, superset_group = excluded.superset_group`,
        id,
        exerciseId,
        index,
        exercise.targetSets,
        exercise.targetReps ?? null,
        exercise.isCardio ? 1 : 0,
        exercise.cardioMode ?? null,
        exercise.targetTime ?? null,
        exercise.targetDistance ?? null,
        exercise.targetSpeed ?? null,
        exercise.targetIncline ?? null,
        exercise.supersetGroup ?? null,
      );
    }
  });

  return id;
};

export const renameRoutine = async (id: string, name: string): Promise<void> => {
  const db = await getDb();
  await db.runAsync('UPDATE routines SET name = ? WHERE id = ?', name, id);
};

/** Rewrites a routine's exercise list wholesale, which is how the editor saves. */
export const setRoutineExercises = async (
  id: string,
  exercises: {
    name: string;
    bodyweightBased: boolean;
    targetSets: number;
    targetReps?: string | null;
    isCardio?: boolean;
    cardioMode?: 'treadmill' | 'outside' | null;
    targetTime?: string | null;
    targetDistance?: number | null;
    targetSpeed?: number | null;
    targetIncline?: number | null;
    supersetGroup?: string | null;
  }[],
): Promise<void> => {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM routine_exercises WHERE routine_id = ?', id);
    for (const [index, exercise] of exercises.entries()) {
      const exerciseId = await exerciseIdFor(
        db,
        exercise.name,
        exercise.bodyweightBased,
        exercise.isCardio ?? false,
        exercise.cardioMode ?? null,
      );
      await db.runAsync(
        `INSERT INTO routine_exercises (routine_id, exercise_id, position, target_sets, target_reps,
                                        is_cardio, cardio_mode, target_time, target_distance, target_speed, target_incline, superset_group)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        exerciseId,
        index,
        exercise.targetSets,
        exercise.targetReps ?? null,
        exercise.isCardio ? 1 : 0,
        exercise.cardioMode ?? null,
        exercise.targetTime ?? null,
        exercise.targetDistance ?? null,
        exercise.targetSpeed ?? null,
        exercise.targetIncline ?? null,
        exercise.supersetGroup ?? null,
      );
    }
  });
};

export const deleteRoutine = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const step of DELETE_ROUTINE_STEPS) await db.runAsync(step, id);
  });
};

/** Moves a routine one place up or down, which is the only ordering anyone needs. */
export const moveRoutine = async (id: string, direction: -1 | 1): Promise<void> => {
  const db = await getDb();
  const all = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM routines ORDER BY position, name',
  );
  const index = all.findIndex((r) => r.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= all.length) return;

  const reordered = [...all];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  await db.withTransactionAsync(async () => {
    for (const [position, row] of reordered.entries()) {
      await db.runAsync('UPDATE routines SET position = ? WHERE id = ?', position, row.id);
    }
  });
};

/**
 * The exercises of a past session, in the order they were done.
 *
 * After importing 246 sessions, assembling a routine by hand from a picker is
 * tedious when the answer is already in the history.
 */
export const recentSessions = async (
  limit = 20,
): Promise<{ id: string; name: string; date: ISODate; exercises: string[] }[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; name: string; date: ISODate }>(
    `SELECT id, name, date FROM sessions
      WHERE finished_at IS NOT NULL ORDER BY started_at DESC LIMIT ?`,
    limit,
  );

  const out = [];
  for (const row of rows) {
    const exercises = await db.getAllAsync<{ exercise_name: string }>(
      `SELECT exercise_name FROM sets WHERE session_id = ?
        GROUP BY exercise_name ORDER BY MIN(rowid)`,
      row.id,
    );
    out.push({ ...row, exercises: exercises.map((e) => e.exercise_name) });
  }
  return out;
};

/**
 * One finished session, for looking at it again. Null for an id that is not in
 * the log and for one still being logged: an unfinished session belongs to the
 * logger, not to this view, and its sets are not yet a record.
 */
export const pastSession = async (
  id: string,
): Promise<{ id: string; name: string; date: ISODate; startedAt: string; finishedAt: string } | null> => {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    id: string;
    name: string;
    date: ISODate;
    started_at: string;
    finished_at: string;
  }>(
    'SELECT id, name, date, started_at, finished_at FROM sessions WHERE id = ? AND finished_at IS NOT NULL',
    id,
  );
  return row
    ? { id: row.id, name: row.name, date: row.date, startedAt: row.started_at, finishedAt: row.finished_at }
    : null;
};

/**
 * The finished sessions whose date falls in a range, both ends included, for
 * the calendar. Only the identity of each is returned: the calendar marks days
 * and opens a workout, and loading every set of a month to do that would be
 * slow for no gain.
 */
export const sessionsBetween = async (
  from: ISODate,
  to: ISODate,
): Promise<{ id: string; name: string; date: ISODate }[]> => {
  const db = await getDb();
  return db.getAllAsync<{ id: string; name: string; date: ISODate }>(
    `SELECT id, name, date FROM sessions
      WHERE finished_at IS NOT NULL AND date BETWEEN ? AND ? ORDER BY started_at`,
    from,
    to,
  );
};

/**
 * When each finished session started and ended, from a date on, for the
 * week-by-week chart.
 *
 * Only the times are returned. The sets for the same weeks come from
 * `listAllSets`, which the overview has already loaded, so the chart does not
 * ask the database for them a second time.
 */
export const finishedSessionTimes = async (
  from: ISODate,
): Promise<{ id: string; date: ISODate; startedAt: string; finishedAt: string }[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    date: ISODate;
    started_at: string;
    finished_at: string;
  }>(
    'SELECT id, date, started_at, finished_at FROM sessions WHERE finished_at IS NOT NULL AND date >= ?',
    from,
  );
  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }));
};

// --- cross-reference ------------------------------------------------------

/** Every recorded set with its session date, for whole-history aggregates. */
export const listAllSets = async (): Promise<DatedSet[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    session_id: string;
    date: ISODate;
    exercise_name: string;
    set_index: number;
    weight_kg: number | null;
    reps: number;
    set_type: string;
    rpe: number | null;
    bodyweight_based: number;
  }>(
    `SELECT s.id, s.session_id, w.date, s.exercise_name, s.set_index, s.weight_kg,
            s.reps, s.set_type, s.rpe, e.bodyweight_based
       FROM sets s
       JOIN sessions  w ON w.id = s.session_id
       JOIN exercises e ON e.id = s.exercise_id
      ORDER BY w.date`,
  );

  return rows.map((row) => ({
    date: row.date,
    set: {
      id: row.id,
      sessionId: row.session_id,
      exerciseName: row.exercise_name,
      setIndex: row.set_index,
      weightKg: row.weight_kg,
      reps: row.reps,
      setType: row.set_type as SetType,
      rpe: row.rpe,
      bodyweightBased: row.bodyweight_based === 1,
    },
  }));
};

/**
 * How long each finished session took.
 *
 * `minutes` is null when the session was never finished — there is no end time
 * to measure against, and inventing one would put a fabricated number into an
 * energy estimate. Imported sessions always carry both timestamps.
 */
export const listSessionSpans = async (): Promise<{ date: ISODate; minutes: number | null }[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    date: ISODate;
    started_at: string;
    finished_at: string | null;
  }>('SELECT date, started_at, finished_at FROM sessions ORDER BY started_at');

  return rows.map((row) => {
    if (!row.finished_at) return { date: row.date, minutes: null };
    const ms = Date.parse(row.finished_at) - Date.parse(row.started_at);
    return {
      date: row.date,
      minutes: Number.isFinite(ms) && ms > 0 ? ms / 60000 : null,
    };
  });
};

/**
 * The sets of the most recent session that included this exercise.
 *
 * This is the "previous" column at the rack: set 1 against set 1, not a single
 * best or last value. Matching by index is what makes it answerable at a
 * glance — you are trying to beat the same set, not the session.
 */
export const lastSessionSets = async (exerciseName: string): Promise<LoggedSet[]> => {
  const db = await getDb();
  const session = await db.getFirstAsync<{ session_id: string }>(
    `SELECT s.session_id
       FROM sets s JOIN sessions w ON w.id = s.session_id
      WHERE s.exercise_name = ? AND w.finished_at IS NOT NULL
      ORDER BY w.started_at DESC LIMIT 1`,
    exerciseName,
  );
  if (!session) return [];

  const rows = await db.getAllAsync<{
    id: string;
    exercise_name: string;
    bodyweight_based: number;
    set_index: number;
    weight_kg: number | null;
    reps: number;
    set_type: string;
    rpe: number | null;
    is_cardio: number | null;
    cardio_mode: string | null;
    speed_kph: number | null;
    incline_pct: number | null;
    duration_seconds: number | null;
    distance_km: number | null;
  }>(
    `SELECT s.id, s.exercise_name, e.bodyweight_based, s.set_index, s.weight_kg,
            s.reps, s.set_type, s.rpe, s.is_cardio, s.cardio_mode, s.speed_kph,
            s.incline_pct, s.duration_seconds, s.distance_km
       FROM sets s JOIN exercises e ON e.id = s.exercise_id
      WHERE s.session_id = ? AND s.exercise_name = ?
      ORDER BY s.set_index`,
    session.session_id,
    exerciseName,
  );

  return rows.map((row) => ({
    id: row.id,
    exerciseName: row.exercise_name,
    bodyweightBased: row.bodyweight_based === 1,
    setIndex: row.set_index,
    weightKg: row.weight_kg,
    reps: row.reps,
    setType: row.set_type as SetType,
    rpe: row.rpe,
    isCardio: row.is_cardio === 1,
    cardioMode: (row.cardio_mode as 'treadmill' | 'outside') ?? null,
    speedKph: row.speed_kph,
    inclinePct: row.incline_pct,
    durationSeconds: row.duration_seconds,
    distanceKm: row.distance_km,
  }));
};

/**
 * The highest estimated 1RM logged for this exercise across all finished sessions.
 */
export const exerciseBestPR = async (
  exerciseName: string,
  bodyweightBased = false,
  series: readonly { date: ISODate; trendWeightKg: number }[] = [],
  fallbackBodyweightKg?: number | null,
): Promise<ExercisePR | null> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    weight_kg: number | null;
    reps: number;
    date: ISODate;
  }>(
    `SELECT s.weight_kg, s.reps, w.date
       FROM sets s JOIN sessions w ON w.id = s.session_id
      WHERE s.exercise_name = ?
        AND s.set_type != 'warmup'
        AND s.reps > 0
        AND w.finished_at IS NOT NULL`,
    exerciseName,
  );
  if (rows.length === 0) return null;

  const lookupBw = (date: ISODate): number | null => {
    if (!series || series.length === 0) return fallbackBodyweightKg ?? null;
    const exact = series.find((s) => s.date === date);
    if (exact) return exact.trendWeightKg;
    if (date < series[0].date) return series[0].trendWeightKg;
    if (date > series[series.length - 1].date) return series[series.length - 1].trendWeightKg;
    return fallbackBodyweightKg ?? series[series.length - 1].trendWeightKg;
  };

  let best: ExercisePR | null = null;
  for (const row of rows) {
    let load: number | null = null;
    if (bodyweightBased) {
      const bw = lookupBw(row.date);
      if (bw === null) continue;
      load = bw + (row.weight_kg ?? 0);
    } else {
      if (row.weight_kg === null || row.weight_kg <= 0) continue;
      load = row.weight_kg;
    }
    if (load === null || load <= 0) continue;

    const e1rm = estimate1RM(load, row.reps);
    if (!best || e1rm > best.e1rm) {
      best = {
        e1rm,
        weight: load,
        reps: row.reps,
        date: row.date,
      };
    }
  }
  return best;
};

/** Corrects a set already written, for editing a row after ticking it. */
export const updateSetValues = async (
  id: string,
  weightKg: number | null,
  reps: number,
  cardio?: {
    speedKph?: number | null;
    inclinePct?: number | null;
    durationSeconds?: number | null;
    distanceKm?: number | null;
    cardioMode?: 'treadmill' | 'outside' | null;
  },
): Promise<void> => {
  const db = await getDb();
  if (cardio) {
    const fields: string[] = ['weight_kg = ?', 'reps = ?'];
    const values: (string | number | null)[] = [weightKg, reps];

    if (cardio.speedKph !== undefined) {
      fields.push('speed_kph = ?');
      values.push(cardio.speedKph);
    }
    if (cardio.inclinePct !== undefined) {
      fields.push('incline_pct = ?');
      values.push(cardio.inclinePct);
    }
    if (cardio.durationSeconds !== undefined) {
      fields.push('duration_seconds = ?');
      values.push(cardio.durationSeconds);
    }
    if (cardio.distanceKm !== undefined) {
      fields.push('distance_km = ?');
      values.push(cardio.distanceKm);
    }
    if (cardio.cardioMode !== undefined) {
      fields.push('cardio_mode = ?');
      values.push(cardio.cardioMode);
    }
    values.push(id);
    await db.runAsync(`UPDATE sets SET ${fields.join(', ')} WHERE id = ?`, ...values);
  } else {
    await db.runAsync(
      'UPDATE sets SET weight_kg = ?, reps = ? WHERE id = ?',
      weightKg,
      reps,
      id,
    );
  }
};

/**
 * Records how hard a set felt. Null clears it.
 *
 * Separate from `updateSetValues` rather than another parameter on it: that
 * one fires on every blur of a weight or rep field, and folding RPE into it
 * would mean every stray focus rewrote a rating the lifter had already given.
 */
export const setSetRpe = async (id: string, rpe: number | null): Promise<void> => {
  const db = await getDb();
  await db.runAsync('UPDATE sets SET rpe = ? WHERE id = ?', rpe, id);
};

/**
 * Updates the superset group for all sets of an exercise in an active session.
 */
export const updateExerciseSupersetGroup = async (
  sessionId: string,
  exerciseName: string,
  supersetGroup: string | null,
): Promise<void> => {
  const db = await getDb();
  await db.runAsync(
    'UPDATE sets SET superset_group = ? WHERE session_id = ? AND exercise_name = ?',
    supersetGroup,
    sessionId,
    exerciseName,
  );
};

/**
 * Updates the exercise name and exercise ID for a list of set IDs in an active session,
 * creating the exercise entry in catalogue/exercises table if necessary.
 */
export const updateSetsExercise = async (
  setIds: string[],
  exerciseName: string,
  bodyweightBased: boolean,
  isCardio = false,
  cardioMode: 'treadmill' | 'outside' | null = null,
): Promise<void> => {
  if (setIds.length === 0) return;
  const db = await getDb();
  const exerciseId = await exerciseIdFor(db, exerciseName, bodyweightBased, isCardio, cardioMode);
  const placeholders = setIds.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE sets SET exercise_id = ?, exercise_name = ?, is_cardio = ?, cardio_mode = ? WHERE id IN (${placeholders})`,
    exerciseId,
    exerciseName,
    isCardio ? 1 : 0,
    cardioMode ?? null,
    ...setIds,
  );
};

/**
 * Muscle regions for every exercise that has them, keyed by recorded name.
 *
 * One query rather than one per exercise: the overview lights a body map from
 * a whole month of training, and a lookup per exercise would be a query per
 * row of that month. Mirrors `cataloguePatternsByExerciseName`, which does the
 * same for the glyphs.
 */
export const catalogueRegionsByExerciseName = async (): Promise<
  Record<string, { primary: MuscleRegion; secondary: MuscleRegion[] }>
> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    name: string;
    primary_region: string | null;
    secondary_regions: string | null;
  }>(
    `SELECT e.name, c.primary_region, c.secondary_regions
       FROM exercises e JOIN exercise_catalogue c ON c.id = e.catalogue_id
      WHERE c.primary_region IS NOT NULL`,
  );

  const byName: Record<string, { primary: MuscleRegion; secondary: MuscleRegion[] }> = {};
  for (const spec of RAW_BUILTIN_CATALOGUE) {
    if (!spec.primaryRegion) continue;
    const regionValue = {
      primary: spec.primaryRegion,
      secondary: spec.secondaryRegions,
    };
    byName[spec.canonicalName] = regionValue;
    if (spec.aliases) {
      for (const alias of spec.aliases) {
        byName[alias] = regionValue;
      }
    }
  }
  for (const row of rows) {
    if (row.primary_region === null) continue;
    byName[row.name] = {
      primary: normaliseRegion(row.primary_region),
      secondary: parseList(row.secondary_regions).map(normaliseRegion),
    };
  }
  return byName;
};

/**
 * Calories logged per day across a span, for charting intake against the
 * expenditure estimate.
 *
 * One query rather than `dailyTotals` ninety times. Days with nothing logged
 * are absent rather than zero: a zero would draw a line to the floor and read
 * as a day of fasting, when it was a day nobody opened the app.
 */
export const dailyKcalBetween = async (
  from: ISODate,
  to: ISODate,
): Promise<{ date: ISODate; kcal: number }[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{ date: ISODate; kcal: number | null }>(
    `SELECT date, SUM(kcal) AS kcal
       FROM log_entries
      WHERE date BETWEEN ? AND ?
      GROUP BY date
      ORDER BY date`,
    from,
    to,
  );
  return rows
    .filter((row) => row.kcal !== null && row.kcal > 0)
    .map((row) => ({ date: row.date, kcal: row.kcal ?? 0 }));
};

export interface DailyIntakeNutrients {
  date: ISODate;
  kcal: number;
  proteinG: number;
}

/**
 * Aggregates both daily calorie and protein totals between two dates.
 * Days with zero intake are omitted to represent unlogged days.
 */
export const dailyIntakeBetween = async (
  from: ISODate,
  to: ISODate,
): Promise<DailyIntakeNutrients[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{ date: ISODate; kcal: number | null; protein_g: number | null }>(
    `SELECT date, SUM(kcal) AS kcal, SUM(protein_g) AS protein_g
       FROM log_entries
      WHERE date BETWEEN ? AND ?
      GROUP BY date
      ORDER BY date`,
    from,
    to,
  );
  return rows
    .filter((row) => row.kcal !== null && row.kcal > 0)
    .map((row) => ({
      date: row.date,
      kcal: row.kcal ?? 0,
      proteinG: Math.round((row.protein_g ?? 0) * 10) / 10,
    }));
};

/** How a body-fat figure was arrived at; see migration v14. */
export type BodyFatSource = 'entered' | 'tape' | 'photo';

export interface BodyMeasurementInput {
  date: ISODate;
  waistCm?: number | null;
  chestCm?: number | null;
  armsCm?: number | null;
  thighsCm?: number | null;
  calvesCm?: number | null;
  hipsCm?: number | null;
  neckCm?: number | null;
  shouldersCm?: number | null;
  bodyFatPct?: number | null;
  bodyFatSource?: BodyFatSource | null;
  notes?: string | null;
}

export interface BodyMeasurementRecord extends BodyMeasurementInput {
  id: string;
  createdAt: string;
}

export const logBodyMeasurement = async (input: BodyMeasurementInput): Promise<BodyMeasurementRecord> => {
  const db = await getDb();
  const id = `bm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO body_measurements (id, date, waist_cm, chest_cm, arms_cm, thighs_cm, calves_cm, hips_cm, neck_cm, shoulders_cm, body_fat_pct, body_fat_source, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.date,
    input.waistCm ?? null,
    input.chestCm ?? null,
    input.armsCm ?? null,
    input.thighsCm ?? null,
    input.calvesCm ?? null,
    input.hipsCm ?? null,
    input.neckCm ?? null,
    input.shouldersCm ?? null,
    input.bodyFatPct ?? null,
    // A source means nothing without a figure, so it is stored only beside one.
    input.bodyFatPct != null ? (input.bodyFatSource ?? 'entered') : null,
    input.notes ?? null,
    now,
  );
  return { id, ...input, createdAt: now };
};

/**
 * Rewrites an existing measurement in place, keeping its id and when it was
 * first logged. Editing used to go through `logBodyMeasurement`, which left
 * the old row behind and added a second one for the same day.
 */
export const updateBodyMeasurement = async (id: string, input: BodyMeasurementInput): Promise<void> => {
  const db = await getDb();
  await db.runAsync(
    `UPDATE body_measurements
        SET date = ?, waist_cm = ?, chest_cm = ?, arms_cm = ?, thighs_cm = ?, calves_cm = ?, hips_cm = ?,
            neck_cm = ?, shoulders_cm = ?, body_fat_pct = ?, body_fat_source = ?, notes = ?
      WHERE id = ?`,
    input.date,
    input.waistCm ?? null,
    input.chestCm ?? null,
    input.armsCm ?? null,
    input.thighsCm ?? null,
    input.calvesCm ?? null,
    input.hipsCm ?? null,
    input.neckCm ?? null,
    input.shouldersCm ?? null,
    input.bodyFatPct ?? null,
    // As on insert: a source is stored only beside a figure.
    input.bodyFatPct != null ? (input.bodyFatSource ?? 'entered') : null,
    input.notes ?? null,
    id,
  );
};

export const getLatestBodyMeasurements = async (limit = 50): Promise<BodyMeasurementRecord[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    date: ISODate;
    waist_cm: number | null;
    chest_cm: number | null;
    arms_cm: number | null;
    thighs_cm: number | null;
    calves_cm: number | null;
    hips_cm: number | null;
    neck_cm: number | null;
    shoulders_cm: number | null;
    body_fat_pct: number | null;
    body_fat_source: string | null;
    notes: string | null;
    created_at: string;
  }>(
    `SELECT id, date, waist_cm, chest_cm, arms_cm, thighs_cm, calves_cm, hips_cm, neck_cm, shoulders_cm, body_fat_pct, body_fat_source, notes, created_at
       FROM body_measurements
      ORDER BY date DESC, created_at DESC
      LIMIT ?`,
    limit,
  );
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    waistCm: r.waist_cm,
    chestCm: r.chest_cm,
    armsCm: r.arms_cm,
    thighsCm: r.thighs_cm,
    calvesCm: r.calves_cm,
    hipsCm: r.hips_cm,
    neckCm: r.neck_cm,
    shouldersCm: r.shoulders_cm,
    bodyFatPct: r.body_fat_pct,
    bodyFatSource:
      r.body_fat_pct == null
        ? null
        : r.body_fat_source === 'tape' || r.body_fat_source === 'photo'
          ? r.body_fat_source
          : 'entered',
    notes: r.notes,
    createdAt: r.created_at,
  }));
};

export const deleteBodyMeasurement = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.runAsync('DELETE FROM body_measurements WHERE id = ?', id);
};

export {
  getDailySteps,
  getDailyStepsBetween,
  getRecentDailySteps,
  saveDailySteps,
  deleteDailySteps,
  bulkSaveDailySteps,
  type DailyStepRecord,
  type SaveDailyStepsInput,
} from './stepQueries';

