import type { LogEntry } from '@adaptive-macros/engine';
import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it } from 'vitest';
import { filterEntriesForCopy, insertCopiedEntries } from '../copyEntries';
import { MIGRATIONS } from '../schema';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): {
      all(...params: unknown[]): unknown[];
      get(...params: unknown[]): unknown;
      run(...params: unknown[]): unknown;
    };
  };
};

let db: InstanceType<typeof DatabaseSync>;

const entry = (id: string, date: string, meal: LogEntry['meal']): LogEntry => ({
  id,
  date,
  foodId: `food-${id}`,
  foodName: `Food ${id}`,
  grams: 125,
  meal,
  nutrients: {
    kcal: 250,
    proteinG: 12,
    carbsG: 20,
    fatG: 8,
    fiberG: 3,
    micros: { sodiumMg: 420, calciumMg: 35 },
  },
});

const stored = (date: string) =>
  db.prepare('SELECT * FROM log_entries WHERE date = ? ORDER BY id').all(date) as {
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
    micronutrients: string | null;
  }[];

const seed = (item: LogEntry) =>
  db.prepare(
    `INSERT INTO log_entries
       (id, date, food_id, food_name, grams, meal, kcal, protein_g, carbs_g, fat_g, fiber_g, micronutrients, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-10-22T08:00:00Z')`,
  ).run(
    item.id,
    item.date,
    item.foodId,
    item.foodName,
    item.grams,
    item.meal,
    item.nutrients.kcal,
    item.nutrients.proteinG,
    item.nutrients.carbsG,
    item.nutrients.fatG,
    item.nutrients.fiberG ?? 0,
    item.nutrients.micros ? JSON.stringify(item.nutrients.micros) : null,
  );

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const step of MIGRATIONS) db.exec(step);
});

describe('copying selected log entries', () => {
  it('copies only the selected source IDs into the destination with independent IDs and micros', async () => {
    const source = [
      entry('keep', '2026-10-22', 'breakfast'),
      entry('skip', '2026-10-22', 'lunch'),
      entry('other-day', '2026-10-21', 'breakfast'),
    ];
    const original = structuredClone(source);
    source.forEach(seed);
    const originalRows = structuredClone(stored('2026-10-22'));
    const selected = filterEntriesForCopy(source, '2026-10-22', undefined, ['keep']);
    const writer = {
      withTransactionAsync: async (task: () => Promise<void>) => {
        db.exec('BEGIN');
        try {
          await task();
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
      runAsync: async (sql: string, ...params: (string | number | null)[]) =>
        db.prepare(sql).run(...params),
    };

    expect(await insertCopiedEntries(writer, selected, '2026-10-23')).toBe(1);

    expect(source).toEqual(original);
    expect(stored('2026-10-22')).toEqual(originalRows);
    expect(stored('2026-10-23')).toMatchObject([
      {
        date: '2026-10-23',
        food_id: 'food-keep',
        food_name: 'Food keep',
        grams: 125,
        meal: 'breakfast',
        kcal: 250,
        protein_g: 12,
        carbs_g: 20,
        fat_g: 8,
        fiber_g: 3,
        micronutrients: JSON.stringify({ sodiumMg: 420, calciumMg: 35 }),
      },
    ]);
    expect(stored('2026-10-23')[0].id).not.toBe('keep');
    expect(stored('2026-10-23').map((row) => row.food_id)).toEqual(['food-keep']);
  });

  it('copies nothing for an explicitly empty ID selection', async () => {
    const source = [entry('one', '2026-10-22', 'breakfast')];
    source.forEach(seed);
    const writer = {
      withTransactionAsync: async (task: () => Promise<void>) => {
        db.exec('BEGIN');
        try {
          await task();
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
      runAsync: async (sql: string, ...params: (string | number | null)[]) =>
        db.prepare(sql).run(...params),
    };

    expect(await insertCopiedEntries(writer, filterEntriesForCopy(source, '2026-10-22', undefined, []), '2026-10-23')).toBe(0);
    expect(stored('2026-10-23')).toEqual([]);
    expect(stored('2026-10-22')).toHaveLength(1);
  });

  it('keeps the existing whole-day and meal filtering behavior when IDs are omitted', () => {
    const source = [
      entry('one', '2026-10-22', 'breakfast'),
      entry('two', '2026-10-22', 'lunch'),
      entry('other-day', '2026-10-21', 'breakfast'),
    ];
    expect(filterEntriesForCopy(source, '2026-10-22').map(({ id }) => id)).toEqual(['one', 'two']);
    expect(filterEntriesForCopy(source, '2026-10-22', ['lunch']).map(({ id }) => id)).toEqual(['two']);
  });

  it('rolls back every insert if an entry in the selected set fails', async () => {
    let inserts = 0;
    const writer = {
      withTransactionAsync: async (task: () => Promise<void>) => {
        db.exec('BEGIN');
        try {
          await task();
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
      runAsync: async (sql: string, ...params: (string | number | null)[]) => {
        inserts += 1;
        if (inserts === 2) throw new Error('simulated insert failure');
        return db.prepare(sql).run(...params);
      },
    };

    await expect(
      insertCopiedEntries(writer, [entry('one', '2026-10-22', 'breakfast'), entry('two', '2026-10-22', 'lunch')], '2026-10-23'),
    ).rejects.toThrow('simulated insert failure');
    expect(stored('2026-10-23')).toEqual([]);
  });
});
