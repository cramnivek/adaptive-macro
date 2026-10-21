import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { rowsToRestore } from '../backupRows';
import type { Backup } from '../index';
import { MIGRATIONS } from '../schema';

/*
  Loaded through `createRequire` for the reason given in catalogueQueries.test.ts:
  Vite resolves a static `node:sqlite` import as a package.
*/
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): { get(...params: unknown[]): unknown; run(...params: unknown[]): unknown };
  };
};

/** Restores as `restoreBackup` does, into a database built from the app's own migrations. */
const restore = (backup: Backup) => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const step of MIGRATIONS) db.exec(step);
  for (const [table, rows] of rowsToRestore(backup)) {
    for (const row of rows ?? []) {
      const columns = Object.keys(row);
      db.prepare(
        `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      ).run(...columns.map((column) => row[column]));
    }
  }
  return db;
};

const backup = (weights: Record<string, unknown>[]): Backup =>
  ({
    version: 2,
    exportedAt: '2026-10-21T05:22:04.287Z',
    settings: [],
    weights,
    foods: [],
    entries: [],
  }) as unknown as Backup;

describe('rowsToRestore', () => {
  it('restores weigh-ins from a backup that carries only date and kg', () => {
    const db = restore(backup([{ date: '2026-10-01', kg: 76 }]));
    expect(db.prepare('SELECT kg, created_at FROM weights').get()).toEqual({
      kg: 76,
      created_at: '2026-10-21T05:22:04.287Z',
    });
  });

  it('keeps the creation time a newer backup does carry', () => {
    const db = restore(backup([{ date: '2026-10-01', kg: 76, created_at: '2026-10-01T07:00:00.000Z' }]));
    expect(db.prepare('SELECT created_at FROM weights').get()).toEqual({
      created_at: '2026-10-01T07:00:00.000Z',
    });
  });
});
