import type { ISODate } from '@adaptive-macros/engine';
import { Platform } from 'react-native';
import {
  aggregateGroupByPeriod,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';
import { bulkSaveDailySteps, listWeights, saveWeight } from '../db';
import { getDailyStepsBetween } from '../db/stepQueries';
import { planHealthConnectImport, stepsByDay, weightsByDay } from './healthConnectRules';
import { calculateDistanceKm, calculateNeatKcal } from './neat';

/**
 * Steps and scale weigh-ins from Android's Health Connect, read only.
 *
 * Garmin Connect and most other fitness apps on Android copy their data into
 * Health Connect, so this one connection reaches all of them. Nothing is ever
 * written back, and what is read stays in the log on this device, like
 * everything else typed in. What the import keeps and skips is decided in
 * healthConnectRules.ts.
 */

const PERMISSIONS = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'Weight' },
  // Without it Health Connect hands over only the 30 days before access was
  // granted, and the expenditure estimate wants months of weigh-ins.
  { accessType: 'read', recordType: 'ReadHealthDataHistory' },
] as const;

/** How far back a sync looks. Health Connect holds only what apps wrote to it. */
const HISTORY_YEARS = 5;

export type HealthConnectState = 'unsupported' | 'needs-update' | 'not-connected' | 'connected';

const localDay = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const healthConnectState = async (): Promise<HealthConnectState> => {
  if (Platform.OS !== 'android') return 'unsupported';
  try {
    const status = await getSdkStatus();
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'needs-update';
    if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) return 'unsupported';
    await initialize();
    const granted = await getGrantedPermissions();
    const has = (type: string) => granted.some((p) => p.recordType === type && p.accessType === 'read');
    return has('Steps') || has('Weight') ? 'connected' : 'not-connected';
  } catch {
    return 'unsupported';
  }
};

/** Shows Health Connect's own permission screen. True when anything was granted. */
export const connectHealthConnect = async (): Promise<boolean> => {
  await initialize();
  const granted = await requestPermission([...PERMISSIONS]);
  return granted.some((p) => p.recordType === 'Steps' || p.recordType === 'Weight');
};

export interface HealthConnectSyncResult {
  stepDays: number;
  weighIns: number;
  /** Weigh-ins found but left alone, because the day already had one. */
  weighInsKept: number;
}

export const syncHealthConnect = async (now = new Date()): Promise<HealthConnectSyncResult> => {
  await initialize();
  const from = new Date(now.getFullYear() - HISTORY_YEARS, now.getMonth(), now.getDate());
  const range = { operator: 'between', startTime: from.toISOString(), endTime: now.toISOString() } as const;

  const stepGroups = await aggregateGroupByPeriod({
    recordType: 'Steps',
    timeRangeFilter: range,
    timeRangeSlicer: { period: 'DAYS', length: 1 },
  });
  const steps = stepsByDay(stepGroups.map((g) => ({ startTime: g.startTime, steps: g.result.COUNT_TOTAL ?? 0 })));

  const readings: { time: string; kg: number }[] = [];
  let pageToken: string | undefined;
  do {
    const page = await readRecords('Weight', { timeRangeFilter: range, pageSize: 1000, pageToken });
    for (const record of page.records) readings.push({ time: record.time, kg: record.weight.inKilograms });
    pageToken = page.pageToken || undefined;
  } while (pageToken);
  const weights = weightsByDay(readings, localDay);

  const fromDay = localDay(from.toISOString()) as ISODate;
  const toDay = localDay(now.toISOString()) as ISODate;
  const [loggedWeights, loggedSteps] = await Promise.all([listWeights(), getDailyStepsBetween(fromDay, toDay)]);
  const plan = planHealthConnectImport({
    loggedWeightDates: new Set(loggedWeights.map((w) => w.date)),
    loggedStepSources: new Map(loggedSteps.map((s) => [s.date, s.source])),
    weights,
    steps,
  });

  for (const day of plan.weights) await saveWeight(day.date, day.kg);
  // Distance and walking energy worked out as for steps typed in by hand, at
  // the latest body weight, so a synced day reads the same as a typed one.
  const latestKg = [...loggedWeights, ...plan.weights].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.kg;
  await bulkSaveDailySteps(
    plan.steps.map((day) => ({
      date: day.date,
      steps: day.steps,
      source: 'health_connect',
      activeKcal: calculateNeatKcal(day.steps, latestKg),
      distanceKm: calculateDistanceKm(day.steps),
    })),
  );

  return { stepDays: plan.steps.length, weighIns: plan.weights.length, weighInsKept: weights.length - plan.weights.length };
};
