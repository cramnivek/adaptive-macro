import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportBackup, getDb, restoreBackup, selectDatabase } from '../index';
import { clearAllData } from '../seed';
import { normalizeSleep } from '../../health/sleep';
import { saveSleepSessions, listSleepSessions } from '../sleepQueries';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => {
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
} }));
let selection = 0;
beforeEach(async () => { await selectDatabase(`sleep-test-${selection++}.db`); });
afterEach(async () => { await selectDatabase(`closed-sleep-${selection++}.db`); });
const night = normalizeSleep([{ startTime: '2026-10-20T22:00:00+08:00', endTime: '2026-10-21T06:00:00+08:00', metadata: { id: 'night', dataOrigin: 'Garmin' } }]);

describe('account-local sleep persistence', () => {
  it('upserts repeat imports and source corrections without accumulating nights', async () => {
    await saveSleepSessions(night);
    await saveSleepSessions([{ ...night[0], end: night[0].end + 60000 }]);
    expect(await listSleepSessions('2026-10-21' as any, '2026-10-21' as any)).toEqual([{ ...night[0], end: night[0].end + 60000 }]);
  });

  it('round-trips sleep through backup rows and accepts older backups', async () => {
    await saveSleepSessions(night);
    const backup = await exportBackup();
    await selectDatabase(`restored-sleep-${selection++}.db`);
    await restoreBackup(backup);
    expect(await listSleepSessions('2026-10-21' as any, '2026-10-21' as any)).toEqual(night);
    await restoreBackup({ ...backup, sleepSessions: undefined });
    expect(await listSleepSessions('2026-10-21' as any, '2026-10-21' as any)).toEqual([]);
  });

  it('keeps another account separate when the selected database is cleared', async () => {
    await saveSleepSessions(night);
    const aliceBackup = await exportBackup();
    await selectDatabase(`bob-sleep-${selection++}.db`);
    await saveSleepSessions(night);
    await clearAllData();
    expect(await listSleepSessions('2026-10-21' as any, '2026-10-21' as any)).toEqual([]);
    expect(aliceBackup.sleepSessions).toHaveLength(1);
    await selectDatabase(`alice-restored-${selection++}.db`);
    await restoreBackup(aliceBackup);
    expect(await listSleepSessions('2026-10-21' as any, '2026-10-21' as any)).toEqual(night);
  });

  it('refuses a closed account handle instead of redirecting its completed import', async () => {
    const bound = await getDb();
    await selectDatabase(`next-account-${selection++}.db`);
    await expect(saveSleepSessions(night, bound)).rejects.toThrow();
    expect(await listSleepSessions('2026-10-21', '2026-10-21')).toEqual([]);
  });
});
