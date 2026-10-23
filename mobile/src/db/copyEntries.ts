import type { ISODate, LogEntry, Meal } from '@adaptive-macros/engine';

export interface CopyEntryDatabase {
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  runAsync(sql: string, ...params: (string | number | null)[]): Promise<unknown>;
}

/** Applies the optional meal and source-entry filters without changing the source rows. */
export const filterEntriesForCopy = (
  entries: LogEntry[],
  from: ISODate,
  meals?: Meal[],
  entryIds?: string[],
): LogEntry[] => {
  if (entryIds !== undefined && entryIds.length === 0) return [];
  return entries.filter(
    (entry) =>
      entry.date === from &&
      (!meals?.length || meals.includes(entry.meal)) &&
      (entryIds === undefined || entryIds.includes(entry.id)),
  );
};

/** Inserts independent copies inside one transaction and returns their count. */
export const insertCopiedEntries = async (
  db: CopyEntryDatabase,
  entries: LogEntry[],
  to: string,
): Promise<number> => {
  await db.withTransactionAsync(async () => {
    for (const entry of entries) {
      await db.runAsync(
        `INSERT INTO log_entries (id, date, food_id, food_name, grams, meal, kcal, protein_g, carbs_g, fat_g, fiber_g, micronutrients, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        entry.nutrients.micros ? JSON.stringify(entry.nutrients.micros) : null,
        new Date().toISOString(),
      );
    }
  });

  return entries.length;
};
