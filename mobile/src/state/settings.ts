import type { ActivityLevel, Goal, UserProfile } from '@adaptive-macros/engine';
import { DEFAULT_MODEL_OPTIONS, DEFAULT_TARGET_OPTIONS } from '@adaptive-macros/engine';
import { defaultOllamaHost } from '../ai/ollama';
import { DEFAULT_FOOD_COUNTRY } from '../api/openfoodfacts';
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
  /**
   * Which Open Food Facts country view to search, or 'world'. Local brands are
   * often absent from the global view and easy to find in their own market's.
   */
  foodCountry: string;
  /**
   * Which engine estimates a described meal.
   *
   * 'gemini' is the default because it is the only one that works on a fresh
   * install: 'ollama' needs the user's own machine running a server the phone
   * can reach, and 'anthropic' needs a key. Both stay available — local is
   * free and private, and the key path keeps anyone off the shared allowance.
   */
  aiProvider: 'gemini' | 'ollama' | 'anthropic';
  ollamaHost: string;
  /** Empty until a model is chosen; the picker reads what the server has. */
  ollamaModel: string;
  /**
   * The user's own Anthropic API key, for describing meals in plain language.
   * Stored only on this device and sent only to api.anthropic.com.
   */
  anthropicApiKey: string;
  /**
   * Web-grounded lookup for restaurant and chain food, which no packaged-goods
   * database carries. Kept separate from `aiProvider` on purpose: that setting
   * chooses who estimates a described meal, and the local model there is
   * deliberate. Choosing a lookup provider must not quietly move meal
   * estimation off it.
   */
  foodLookup: {
    geminiApiKey: string;
  };
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
  foodCountry: DEFAULT_FOOD_COUNTRY,
  aiProvider: 'gemini',
  ollamaHost: defaultOllamaHost(),
  ollamaModel: '',
  anthropicApiKey: '',
  foodLookup: { geminiApiKey: '' },
  onboarded: false,
};

export const SETTINGS_KEY = 'app.settings';

/**
 * Merges stored settings over the defaults.
 *
 * Shallow-merging the top level would drop new fields inside `profile`,
 * `goal` and `foodLookup` when the app adds them, so those three are merged a
 * level deeper. Any key absent from storage keeps its default, which is what
 * makes adding a setting a non-breaking change for existing installs.
 */
export const withDefaults = (stored: Partial<AppSettings> | null): AppSettings => ({
  ...DEFAULT_SETTINGS,
  ...stored,
  profile: { ...DEFAULT_SETTINGS.profile, ...stored?.profile },
  goal: { ...DEFAULT_SETTINGS.goal, ...stored?.goal },
  foodLookup: { ...DEFAULT_SETTINGS.foodLookup, ...stored?.foodLookup },
});
