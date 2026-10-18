import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { ISODate } from '@adaptive-macros/engine';
import { bulkSaveDailySteps, saveDailySteps, saveWeight } from '../db';
import { calculateDistanceKm, calculateNeatKcal } from './neat';
import { parseAppleHealthXml } from './appleHealthParser';
import type { AppleHealthImportResult, HealthProvider, HealthSyncConfig } from './types';

const CONFIG_STORAGE_KEY = '@ascend_health_sync_config_v1';

export const DEFAULT_HEALTH_CONFIG: HealthSyncConfig = {
  enabled: false,
  provider: 'manual',
  dailyStepGoal: 10000,
  lastSyncTimestamp: null,
  autoSyncOnOpen: true,
};

/**
 * Loads user health sync configuration.
 */
export const loadHealthSyncConfig = async (): Promise<HealthSyncConfig> => {
  try {
    const raw = await AsyncStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_HEALTH_CONFIG;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_HEALTH_CONFIG, ...parsed };
  } catch {
    return DEFAULT_HEALTH_CONFIG;
  }
};

/**
 * Saves user health sync configuration.
 */
export const saveHealthSyncConfig = async (
  config: Partial<HealthSyncConfig>,
): Promise<HealthSyncConfig> => {
  const current = await loadHealthSyncConfig();
  const updated: HealthSyncConfig = { ...current, ...config };
  await AsyncStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(updated));
  return updated;
};

/**
 * Checks if native health platform is available on the current device.
 */
export const getAvailableHealthProviders = (): HealthProvider[] => {
  const providers: HealthProvider[] = ['manual'];
  if (Platform.OS === 'ios') {
    providers.push('apple_health');
  } else if (Platform.OS === 'android') {
    providers.push('health_connect');
  } else {
    // Web / PWA supports manual & file import
    providers.push('apple_health');
  }
  return providers;
};

/**
 * Record a manual step count entry for a given day.
 * Automatically computes NEAT kcal burned and walking distance.
 */
export const logDailyStepCount = async ({
  date,
  steps,
  bodyWeightKg,
  source = 'manual',
}: {
  date: ISODate;
  steps: number;
  bodyWeightKg?: number;
  source?: string;
}): Promise<void> => {
  const activeKcal = calculateNeatKcal(steps, bodyWeightKg);
  const distanceKm = calculateDistanceKm(steps);

  await saveDailySteps({
    date,
    steps,
    source,
    activeKcal,
    distanceKm,
  });
};

/**
 * Imports parsed Apple Health XML data directly into SQLite:
 * - Daily steps are bulk saved into `daily_steps` with computed NEAT
 * - Body weights are saved into `weights`
 */
export const importAppleHealthXml = async (
  xmlContent: string,
  latestWeightKg?: number,
): Promise<AppleHealthImportResult> => {
  const parsed = parseAppleHealthXml(xmlContent);

  // Save weights
  for (const [date, kg] of parsed.dailyWeights.entries()) {
    await saveWeight(date, kg);
  }

  // Save steps
  const stepRecords = Array.from(parsed.dailySteps.entries()).map(([date, steps]) => {
    // If a weight was recorded on that day, use it; otherwise use latest or default
    const dayWeight = parsed.dailyWeights.get(date) ?? latestWeightKg;
    const activeKcal = calculateNeatKcal(steps, dayWeight);
    const distanceKm = calculateDistanceKm(steps);
    return {
      date,
      steps,
      source: 'apple_health',
      activeKcal,
      distanceKm,
    };
  });

  await bulkSaveDailySteps(stepRecords);

  const totalStepsImported = stepRecords.reduce((sum, r) => sum + r.steps, 0);

  // Update last sync timestamp
  await saveHealthSyncConfig({
    lastSyncTimestamp: new Date().toISOString(),
    enabled: true,
    provider: 'apple_health',
  });

  return {
    stepDaysCount: stepRecords.length,
    totalStepsImported,
    weightDaysCount: parsed.dailyWeights.size,
    startDate: parsed.earliestDate,
    endDate: parsed.latestDate,
  };
};
