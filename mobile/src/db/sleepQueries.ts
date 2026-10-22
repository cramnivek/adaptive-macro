import type { ISODate } from '@adaptive-macros/engine';
import type { SleepSession } from '../health/sleep';
import { getDb } from './index';

export const saveSleepSessions = async (
  sessions: SleepSession[],
  database?: Awaited<ReturnType<typeof getDb>>,
  refreshed?: { start: number; end: number },
): Promise<void> => {
  if (sessions.length === 0 && !refreshed) return;
  const db = database ?? await getDb();
  await db.withTransactionAsync(async () => {
    // A successful source snapshot replaces that window, including deletions.
    // Keep older and boundary-spanning history that this read cannot establish.
    if (refreshed) await db.runAsync(
      'DELETE FROM sleep_sessions WHERE start_time >= ? AND end_time <= ?', refreshed.start, refreshed.end,
    );
    for (const row of sessions) await db.runAsync(
      `INSERT INTO sleep_sessions (id, date, source, start_time, end_time, asleep) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET date = excluded.date, source = excluded.source,
       start_time = excluded.start_time, end_time = excluded.end_time, asleep = excluded.asleep`,
      row.id, row.date, row.source, row.start, row.end, row.asleep === null ? null : JSON.stringify(row.asleep),
    );
  });
};

export const listSleepSessions = async (from: ISODate, to: ISODate): Promise<SleepSession[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; date: ISODate; source: string; start_time: number; end_time: number; asleep: string | null }>(
    'SELECT * FROM sleep_sessions WHERE date >= ? AND date <= ? ORDER BY date, start_time', from, to,
  );
  return rows.map((row) => ({
    id: row.id, date: row.date, source: row.source, start: row.start_time, end: row.end_time,
    asleep: row.asleep === null ? null : JSON.parse(row.asleep),
  }));
};
