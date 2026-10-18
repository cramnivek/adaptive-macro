import type { ISODate } from '@adaptive-macros/engine';
import { getDb } from './index';

export interface DailyStepRecord {
  date: ISODate;
  steps: number;
  source: 'manual' | 'apple_health' | 'health_connect' | string;
  activeKcal?: number | null;
  distanceKm?: number | null;
  createdAt: string;
}

export interface SaveDailyStepsInput {
  date: ISODate;
  steps: number;
  source?: string;
  activeKcal?: number | null;
  distanceKm?: number | null;
}

export const getDailySteps = async (date: ISODate): Promise<DailyStepRecord | null> => {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    date: string;
    steps: number;
    source: string;
    active_kcal: number | null;
    distance_km: number | null;
    created_at: string;
  }>('SELECT date, steps, source, active_kcal, distance_km, created_at FROM daily_steps WHERE date = ?', date);

  if (!row) return null;
  return {
    date: row.date as ISODate,
    steps: row.steps,
    source: row.source,
    activeKcal: row.active_kcal,
    distanceKm: row.distance_km,
    createdAt: row.created_at,
  };
};

export const getDailyStepsBetween = async (
  startDate: ISODate,
  endDate: ISODate,
): Promise<DailyStepRecord[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    date: string;
    steps: number;
    source: string;
    active_kcal: number | null;
    distance_km: number | null;
    created_at: string;
  }>(
    'SELECT date, steps, source, active_kcal, distance_km, created_at FROM daily_steps WHERE date >= ? AND date <= ? ORDER BY date ASC',
    startDate,
    endDate,
  );

  return rows.map((row) => ({
    date: row.date as ISODate,
    steps: row.steps,
    source: row.source,
    activeKcal: row.active_kcal,
    distanceKm: row.distance_km,
    createdAt: row.created_at,
  }));
};

export const getRecentDailySteps = async (limitDays: number = 30): Promise<DailyStepRecord[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    date: string;
    steps: number;
    source: string;
    active_kcal: number | null;
    distance_km: number | null;
    created_at: string;
  }>(
    'SELECT date, steps, source, active_kcal, distance_km, created_at FROM daily_steps ORDER BY date DESC LIMIT ?',
    limitDays,
  );

  return rows
    .reverse()
    .map((row) => ({
      date: row.date as ISODate,
      steps: row.steps,
      source: row.source,
      activeKcal: row.active_kcal,
      distanceKm: row.distance_km,
      createdAt: row.created_at,
    }));
};

export const saveDailySteps = async (input: SaveDailyStepsInput): Promise<void> => {
  const db = await getDb();
  const now = new Date().toISOString();
  const source = input.source ?? 'manual';

  await db.runAsync(
    `INSERT INTO daily_steps (date, steps, source, active_kcal, distance_km, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       steps = excluded.steps,
       source = excluded.source,
       active_kcal = excluded.active_kcal,
       distance_km = excluded.distance_km`,
    input.date,
    input.steps,
    source,
    input.activeKcal ?? null,
    input.distanceKm ?? null,
    now,
  );
};

export const bulkSaveDailySteps = async (inputs: SaveDailyStepsInput[]): Promise<void> => {
  if (inputs.length === 0) return;
  const db = await getDb();
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    for (const input of inputs) {
      await db.runAsync(
        `INSERT INTO daily_steps (date, steps, source, active_kcal, distance_km, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET
           steps = excluded.steps,
           source = excluded.source,
           active_kcal = excluded.active_kcal,
           distance_km = excluded.distance_km`,
        input.date,
        input.steps,
        input.source ?? 'manual',
        input.activeKcal ?? null,
        input.distanceKm ?? null,
        now,
      );
    }
  });
};
