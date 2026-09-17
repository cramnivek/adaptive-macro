import type { ActivityLevel, Goal, UserProfile } from '@adaptive-macros/engine';
import { DEFAULT_MODEL_OPTIONS, DEFAULT_TARGET_OPTIONS } from '@adaptive-macros/engine';
import { USDA_DEMO_KEY } from '../api/usda';

export type UnitSystem = 'metric' | 'imperial';

export interface AppSettings {
  profile: UserProfile;
  activity: ActivityLevel;
  goal: Goal;
  /** Optional target weight in kg, used only for the goal projection. */
  goalWeightKg: number | null;
  units: UnitSystem;
  /** Macro policy, surfaced in settings because these are genuine preferences. */
  proteinGPerKg: number;
  minFatGPerKg: number;
  /** Model tuning. Sensible defaults; exposed for anyone who wants to tune. */
  kcalPerKgTissue: number;
  scaleNoiseKg: number;
  expenditureVolatilityKcal: number;
  usdaApiKey: string;
  /** False until the profile has been filled in at least once. */
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  profile: { sex: 'male', age: 30, heightCm: 178 },
  activity: 'moderate',
  goal: { direction: 'lose', rateKgPerWeek: 0.5 },
  goalWeightKg: null,
  units: 'metric',
  proteinGPerKg: DEFAULT_TARGET_OPTIONS.proteinGPerKg,
  minFatGPerKg: DEFAULT_TARGET_OPTIONS.minFatGPerKg,
  kcalPerKgTissue: DEFAULT_MODEL_OPTIONS.kcalPerKgTissue,
  scaleNoiseKg: DEFAULT_MODEL_OPTIONS.scaleNoiseKg,
  expenditureVolatilityKcal: DEFAULT_MODEL_OPTIONS.expenditureVolatilityKcal,
  usdaApiKey: USDA_DEMO_KEY,
  onboarded: false,
};

export const SETTINGS_KEY = 'app.settings';

/**
 * Merges stored settings over the defaults.
 *
 * Shallow-merging the top level would drop new fields inside `profile` and
 * `goal` when the app adds them, so those two are merged a level deeper. Any
 * key absent from storage keeps its default, which is what makes adding a
 * setting a non-breaking change for existing installs.
 */
export const withDefaults = (stored: Partial<AppSettings> | null): AppSettings => ({
  ...DEFAULT_SETTINGS,
  ...stored,
  profile: { ...DEFAULT_SETTINGS.profile, ...stored?.profile },
  goal: { ...DEFAULT_SETTINGS.goal, ...stored?.goal },
});
