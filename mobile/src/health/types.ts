import type { ISODate } from '@adaptive-macros/engine';

export type HealthProvider = 'manual' | 'apple_health' | 'health_connect';

export interface HealthSyncConfig {
  enabled: boolean;
  provider: HealthProvider;
  dailyStepGoal: number;
  lastSyncTimestamp: string | null;
  autoSyncOnOpen: boolean;
}

export interface DailyStepData {
  date: ISODate;
  steps: number;
  source: HealthProvider | string;
  activeKcal?: number | null;
  distanceKm?: number | null;
}

export interface AppleHealthImportResult {
  stepDaysCount: number;
  totalStepsImported: number;
  weightDaysCount: number;
  startDate: ISODate | null;
  endDate: ISODate | null;
}
