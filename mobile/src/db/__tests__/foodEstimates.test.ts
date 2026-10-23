import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Food } from '@adaptive-macros/engine';
import { exportBackup, getFoodById, restoreBackup, saveFood, selectDatabase } from '../index';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: async () => {
    const db = new DatabaseSync(':memory:');
    return {
      execAsync: async (sql: string) => db.exec(sql),
      runAsync: async (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params),
      getFirstAsync: async (sql: string, ...params: unknown[]) => db.prepare(sql).get(...params) ?? null,
      getAllAsync: async (sql: string, ...params: unknown[]) => db.prepare(sql).all(...params),
      closeAsync: async () => db.close(),
      withTransactionAsync: async (work: () => Promise<void>) => {
        db.exec('BEGIN');
        try { await work(); db.exec('COMMIT'); }
        catch (error) { db.exec('ROLLBACK'); throw error; }
      },
    };
  },
}));

let selection = 0;
beforeEach(async () => { await selectDatabase(`food-test-${selection++}.db`); });
afterEach(async () => { await selectDatabase(`closed-${selection++}.db`); });

const food = (): Food => ({
  id: 'ai:chicken-rice', name: 'Chicken rice', source: 'ai',
  per100g: { kcal: 160, proteinG: 12, carbsG: 18, fatG: 4 },
  portions: [{ label: '100 g', grams: 100 }],
  estimate: { confidence: 'medium', assumption: 'One tablespoon of cooking oil.' },
});

describe('saved meal estimate evidence', () => {
  it('retains confidence and assumptions when the cached food is opened again', async () => {
    await saveFood(food());
    expect((await getFoodById('ai:chicken-rice'))?.estimate).toEqual({
      confidence: 'medium', assumption: 'One tablespoon of cooking oil.',
    });
  });

  it('updates evidence alongside a corrected cached estimate', async () => {
    await saveFood(food());
    await saveFood({ ...food(), estimate: { confidence: 'low', assumption: 'Oil amount unknown.' } });
    expect((await getFoodById('ai:chicken-rice'))?.estimate).toEqual({
      confidence: 'low', assumption: 'Oil amount unknown.',
    });
  });

  it('round-trips evidence through an actual database backup and restore', async () => {
    await saveFood(food());
    const backup = await exportBackup();
    await selectDatabase(`restored-${selection++}.db`);
    await restoreBackup(backup);
    expect((await getFoodById('ai:chicken-rice'))?.estimate).toEqual({
      confidence: 'medium', assumption: 'One tablespoon of cooking oil.',
    });
  });

  it('keeps old backup foods usable without inventing evidence for them', async () => {
    await saveFood(food());
    const backup = await exportBackup();
    const { estimate: ignoredEstimate, ...oldRow } = backup.foods[0] as typeof backup.foods[0] & { estimate?: string };
    await restoreBackup({ ...backup, foods: [oldRow] });
    const restored = await getFoodById('ai:chicken-rice');
    expect(restored?.name).toBe('Chicken rice');
    expect(restored?.estimate).toBeUndefined();
  });

  it.each(['not JSON', '{"confidence":"certain","assumption":42}'])(
    'keeps a restored food readable when optional estimate metadata is invalid: %s', async (estimate) => {
      await saveFood(food());
      const backup = await exportBackup();
      await restoreBackup({ ...backup, foods: [{ ...backup.foods[0], estimate }] });
      const restored = await getFoodById('ai:chicken-rice');
      expect(restored?.per100g.kcal).toBe(160);
      expect(restored?.estimate).toBeUndefined();
    },
  );

});
