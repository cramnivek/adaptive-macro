import type { ISODate } from '@adaptive-macros/engine';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { planHealthConnectImport, stepsByDay, weightsByDay, type HealthConnectSyncResult } from './healthConnectRules';
import { calculateDistanceKm, calculateNeatKcal } from './neat';

export type { HealthConnectSyncResult } from './healthConnectRules';

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

/** Names for the apps people are likely to sync from; anything else shows its package. */
const APP_NAMES: Record<string, string> = {
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.google.android.apps.fitness': 'Fit',
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.heytap.health': 'HeyTap Health',
  'com.oplus.health': 'OPPO Health',
  'com.fitbit.FitbitMobile': 'Fitbit',
};

/** The last sync, kept so the Account screen can say when and what without syncing again. */
export interface LastHealthConnectSync {
  at: string;
  result: HealthConnectSyncResult;
}

const LAST_SYNC_KEY = 'ascend_health_connect_last_sync';

export const lastHealthConnectSync = async (): Promise<LastHealthConnectSync | null> => {
  try {
    const raw = await AsyncStorage.getItem(LAST_SYNC_KEY);
    return raw ? (JSON.parse(raw) as LastHealthConnectSync) : null;
  } catch {
    return null;
  }
};

/**
 * Screens that show synced data and stay mounted, like Today, listen here:
 * a tab is not re-read when another screen syncs, so it went on showing the
 * count from before until the date changed.
 */
const syncListeners = new Set<(sync: LastHealthConnectSync) => void>();

export const onHealthConnectSynced = (listener: (sync: LastHealthConnectSync) => void): (() => void) => {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
};

/**
 * How often the app syncs by itself while open. Garmin hands data to Health
 * Connect on its own schedule, so syncing more often than this mostly finds
 * nothing new.
 */
const AUTO_SYNC_EVERY_MS = 15 * 60 * 1000;

/** Syncs when connected and the last sync is older than the interval; null when it did not. */
export const syncHealthConnectIfDue = async (): Promise<HealthConnectSyncResult | null> => {
  const last = await lastHealthConnectSync();
  if (last && Date.now() - new Date(last.at).getTime() < AUTO_SYNC_EVERY_MS) return null;
  if ((await healthConnectState()) !== 'connected') return null;
  return syncHealthConnect();
};

let inFlight: Promise<HealthConnectSyncResult> | null = null;

/**
 * One sync at a time: the app coming to the front and a tap on Sync can
 * arrive together, and two imports racing would each see the other's days as
 * not yet logged.
 */
export const syncHealthConnect = (now = new Date()): Promise<HealthConnectSyncResult> => {
  inFlight ??= runSync(now).finally(() => {
    inFlight = null;
  });
  return inFlight;
};

const runSync = async (now: Date): Promise<HealthConnectSyncResult> => {
  await initialize();
  const from = new Date(now.getFullYear() - HISTORY_YEARS, now.getMonth(), now.getDate());
  const range = { operator: 'between', startTime: from.toISOString(), endTime: now.toISOString() } as const;

  const stepGroups = await aggregateGroupByPeriod({
    recordType: 'Steps',
    timeRangeFilter: range,
    timeRangeSlicer: { period: 'DAYS', length: 1 },
  });
  const steps = stepsByDay(stepGroups.map((g) => ({ startTime: g.startTime, steps: g.result.COUNT_TOTAL ?? 0 })));
  const origins = new Set<string>(stepGroups.flatMap((g) => g.result.dataOrigins ?? []));

  const readings: { time: string; kg: number }[] = [];
  let pageToken: string | undefined;
  do {
    const page = await readRecords('Weight', { timeRangeFilter: range, pageSize: 1000, pageToken });
    for (const record of page.records) {
      readings.push({ time: record.time, kg: record.weight.inKilograms });
      if (record.metadata?.dataOrigin) origins.add(record.metadata.dataOrigin);
    }
    pageToken = page.pageToken || undefined;
  } while (pageToken);
  const weights = weightsByDay(readings, localDay);

  const fromDay = localDay(from.toISOString()) as ISODate;
  const toDay = localDay(now.toISOString()) as ISODate;
  const [loggedWeights, loggedSteps] = await Promise.all([listWeights(), getDailyStepsBetween(fromDay, toDay)]);
  const plan = planHealthConnectImport({
    loggedWeightDates: new Set(loggedWeights.map((w) => w.date)),
    loggedSteps: new Map(loggedSteps.map((s) => [s.date, { source: s.source, steps: s.steps }])),
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

  const days = [...steps.map((d) => d.date), ...weights.map((d) => d.date)].sort();
  const result: HealthConnectSyncResult = {
    stepDays: plan.steps.length,
    weighIns: plan.weights.length,
    weighInsKept: weights.length - plan.weights.length,
    found: {
      stepDays: steps.length,
      weighIns: weights.length,
      sources: [...origins].map((pkg) => APP_NAMES[pkg] ?? pkg),
      firstDay: days[0] ?? null,
    },
  };

  const sync: LastHealthConnectSync = { at: new Date().toISOString(), result };
  await AsyncStorage.setItem(LAST_SYNC_KEY, JSON.stringify(sync)).catch(() => undefined);
  for (const listener of syncListeners) listener(sync);
  return result;
};
