import type {
  DailyObservation,
  DatedSet,
  Food,
  FoodPortion,
  ISODate,
  LogEntry,
  Meal,
  Nutrients,
  SetType,
} from '@adaptive-macros/engine';
import * as SQLite from 'expo-sqlite';
import { MIGRATIONS } from './schema';
import { normalisePattern, type EnrichedExercise, type MovementPattern } from '../ai/exercises';

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

/**
 * Opens the database once and brings it up to the latest schema version.
 *
 * Migrations run inside a transaction keyed on PRAGMA user_version, so a
 * half-applied upgrade after a crash rolls back rather than leaving the app
 * pointing at a schema it cannot read.
 */
export const getDb = (): Promise<SQLite.SQLiteDatabase> => {
  if (!databasePromise) {
    // Cleared on failure so a later call can retry rather than being stuck
    // with a rejected promise for the life of the session.
    databasePromise = openAndMigrate().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
};

const openAndMigrate = async (): Promise<SQLite.SQLiteDatabase> => {
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
    weights: await db.getAllAsync('SELECT date, kg FROM weights'),
    foods: await db.getAllAsync('SELECT * FROM foods'),
    entries: await db.getAllAsync('SELECT * FROM log_entries'),
    exerciseCatalogue: await db.getAllAsync('SELECT * FROM exercise_catalogue'),
    exercises: await db.getAllAsync('SELECT * FROM exercises'),
    routines: await db.getAllAsync('SELECT * FROM routines'),
    routineExercises: await db.getAllAsync('SELECT * FROM routine_exercises'),
    sessions: await db.getAllAsync('SELECT * FROM sessions'),
    sets: await db.getAllAsync('SELECT * FROM sets'),
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
    ]) {
      await db.runAsync(`DELETE FROM ${table}`);
    }

    await insertRows(db, 'settings', backup.settings as Record<string, unknown>[]);
    await insertRows(db, 'weights', backup.weights as unknown as Record<string, unknown>[]);
    await insertRows(db, 'foods', backup.foods as unknown as Record<string, unknown>[]);
    await insertRows(db, 'log_entries', backup.entries as unknown as Record<string, unknown>[]);
    await insertRows(db, 'exercise_catalogue', backup.exerciseCatalogue);
    await insertRows(db, 'exercises', backup.exercises);
    await insertRows(db, 'routines', backup.routines);
    await insertRows(db, 'routine_exercises', backup.routineExercises);
    await insertRows(db, 'sessions', backup.sessions);
    await insertRows(db, 'sets', backup.sets);
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
  movementPattern: MovementPattern;
  primaryMuscle: string;
  equipment: string;
  bodyweightBased: boolean;
  instructions: string | null;
}

interface CatalogueRow {
  id: string;
  canonical_name: string;
  movement_pattern: string;
  primary_muscle: string;
  equipment: string;
  bodyweight_based: number;
  instructions: string | null;
}

const toCatalogueEntry = (row: CatalogueRow): CatalogueEntry => ({
  id: row.id,
  canonicalName: row.canonical_name,
  movementPattern: normalisePattern(row.movement_pattern),
  primaryMuscle: row.primary_muscle,
  equipment: row.equipment,
  bodyweightBased: row.bodyweight_based === 1,
  instructions: row.instructions,
});

/** Creates the entry, or returns the id of the one already holding that name. */
export const upsertCatalogueEntry = async (entry: EnrichedExercise): Promise<string> => {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM exercise_catalogue WHERE canonical_name = ?',
    entry.canonicalName,
  );
  if (existing) return existing.id;

  const id = newId();
  await db.runAsync(
    `INSERT INTO exercise_catalogue
       (id, canonical_name, movement_pattern, primary_muscle, equipment, bodyweight_based, instructions, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    entry.canonicalName,
    entry.movementPattern,
    entry.primaryMuscle,
    entry.equipment,
    entry.bodyweightBased ? 1 : 0,
    entry.instructions,
    localStamp(),
  );
  return id;
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

export const searchCatalogue = async (term: string, limit = 30): Promise<CatalogueEntry[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<CatalogueRow>(
    `SELECT id, canonical_name, movement_pattern, primary_muscle, equipment,
            bodyweight_based, instructions
       FROM exercise_catalogue
      WHERE canonical_name LIKE ?
      ORDER BY canonical_name
      LIMIT ?`,
    `%${term}%`,
    limit,
  );
  return rows.map(toCatalogueEntry);
};

export const catalogueEntryForExercise = async (
  exerciseName: string,
): Promise<CatalogueEntry | null> => {
  const db = await getDb();
  const row = await db.getFirstAsync<CatalogueRow>(
    `SELECT c.id, c.canonical_name, c.movement_pattern, c.primary_muscle, c.equipment,
            c.bodyweight_based, c.instructions
       FROM exercises e JOIN exercise_catalogue c ON c.id = e.catalogue_id
      WHERE e.name = ?`,
    exerciseName,
  );
  return row ? toCatalogueEntry(row) : null;
};

// --- logging a session ----------------------------------------------------

export interface ActiveSession {
  id: string;
  date: ISODate;
  name: string;
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
    started_at: string;
  }>(
    `SELECT id, date, name, started_at FROM sessions
      WHERE finished_at IS NULL ORDER BY started_at DESC LIMIT 1`,
  );
  if (!row) return null;

  return {
    id: row.id,
    date: row.date,
    name: row.name,
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
  }>(
    `SELECT s.id, s.exercise_name, e.bodyweight_based, s.set_index, s.weight_kg,
            s.reps, s.set_type, s.rpe
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
  }));
};

export const startSession = async (name: string, date: ISODate): Promise<ActiveSession> => {
  const db = await getDb();
  const id = newId();
  const startedAt = localStamp();

  await db.runAsync(
    `INSERT INTO sessions (id, date, routine_id, name, started_at, finished_at, notes)
     VALUES (?, ?, NULL, ?, ?, NULL, NULL)`,
    id,
    date,
    name,
    startedAt,
  );

  return { id, date, name, startedAt, sets: [] };
};

/** Creates the exercise if this is the first time it has been used. */
const exerciseIdFor = async (
  db: SQLite.SQLiteDatabase,
  name: string,
  bodyweightBased: boolean,
): Promise<string> => {
  await db.runAsync(
    `INSERT INTO exercises (id, name, bodyweight_based, created_at)
     VALUES (?, ?, ?, ?) ON CONFLICT (name) DO NOTHING`,
    newId(),
    name,
    bodyweightBased ? 1 : 0,
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
  },
): Promise<void> => {
  const db = await getDb();
  const exerciseId = await exerciseIdFor(db, set.exerciseName, set.bodyweightBased);

  await db.runAsync(
    `INSERT INTO sets (id, session_id, exercise_id, exercise_name, set_index, weight_kg, reps, set_type, rpe, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId(),
    sessionId,
    exerciseId,
    set.exerciseName,
    set.setIndex,
    set.weightKg,
    set.reps,
    set.setType,
    set.rpe,
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
  { name: string; bodyweightBased: boolean }[]
> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{ name: string; bodyweight_based: number }>(
    `SELECT e.name, e.bodyweight_based
       FROM exercises e LEFT JOIN sets s ON s.exercise_id = e.id
      GROUP BY e.id ORDER BY COUNT(s.id) DESC, e.name`,
  );
  return rows.map((r) => ({ name: r.name, bodyweightBased: r.bodyweight_based === 1 }));
};

// --- routines -------------------------------------------------------------

export interface Routine {
  id: string;
  name: string;
  position: number;
  exercises: { name: string; bodyweightBased: boolean; targetSets: number; position: number }[];
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
      position: number;
    }>(
      `SELECT e.name, e.bodyweight_based, re.target_sets, re.position
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
        position: e.position,
      })),
    });
  }
  return routines;
};

export const createRoutine = async (
  name: string,
  exercises: { name: string; bodyweightBased: boolean; targetSets: number }[],
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
      const exerciseId = await exerciseIdFor(db, exercise.name, exercise.bodyweightBased);
      await db.runAsync(
        `INSERT INTO routine_exercises (routine_id, exercise_id, position, target_sets)
         VALUES (?, ?, ?, ?) ON CONFLICT (routine_id, exercise_id) DO UPDATE
           SET position = excluded.position, target_sets = excluded.target_sets`,
        id,
        exerciseId,
        index,
        exercise.targetSets,
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
  exercises: { name: string; bodyweightBased: boolean; targetSets: number }[],
): Promise<void> => {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM routine_exercises WHERE routine_id = ?', id);
    for (const [index, exercise] of exercises.entries()) {
      const exerciseId = await exerciseIdFor(db, exercise.name, exercise.bodyweightBased);
      await db.runAsync(
        `INSERT INTO routine_exercises (routine_id, exercise_id, position, target_sets)
         VALUES (?, ?, ?, ?)`,
        id,
        exerciseId,
        index,
        exercise.targetSets,
      );
    }
  });
};

export const deleteRoutine = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM routine_exercises WHERE routine_id = ?', id);
    await db.runAsync('DELETE FROM routines WHERE id = ?', id);
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
  }>(
    `SELECT s.id, s.exercise_name, e.bodyweight_based, s.set_index, s.weight_kg,
            s.reps, s.set_type, s.rpe
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
  }));
};

/** Corrects a set already written, for editing a row after ticking it. */
export const updateSetValues = async (
  id: string,
  weightKg: number | null,
  reps: number,
): Promise<void> => {
  const db = await getDb();
  await db.runAsync(
    'UPDATE sets SET weight_kg = ?, reps = ? WHERE id = ?',
    weightKg,
    reps,
    id,
  );
};
