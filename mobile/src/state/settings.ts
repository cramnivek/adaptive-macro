import { ALL_BLOCKS } from '../shareCardPlacement';
import type { CardBlocks } from '../shareCardPlacement';
import { DEFAULT_TEMPLATE, TEMPLATES } from '../shareCardTemplate';
import type { TemplateId } from '../shareCardTemplate';
import type { ActivityLevel, Goal, ISODate, UserProfile } from '@adaptive-macros/engine';
import { DEFAULT_MODEL_OPTIONS, DEFAULT_TARGET_OPTIONS } from '@adaptive-macros/engine';
import { defaultOllamaHost } from '../ai/ollama';
import { DEFAULT_FOOD_COUNTRY } from '../api/openfoodfacts';
import { USDA_DEMO_KEY } from '../api/usda';
import type { BarChoice } from '../plates';
import { EQUIPMENT_ITEMS } from '../ai/routineBuild';
import type { EquipmentItem, TrainingLevel } from '../ai/routineBuild';
import type { ChimeChoice } from '../platform/chimeSound';

export type UnitSystem = 'metric' | 'imperial';
export type WeightUnitSetting = 'switchable' | 'kg' | 'lbs';
export type SpeedUnitSetting = 'switchable' | 'kph' | 'mph';
export type SpeedUnit = 'kph' | 'mph';
export type AppPersonality = 'classic' | 'ascend' | 'gymrat';

import { ALL_FEATURE_INTERESTS } from '../features/featureInterests';
import type { FeatureInterest } from '../features/featureInterests';
import type { UserMission, DashboardSpotlight } from '../features/missionFocus';
export { ALL_FEATURE_INTERESTS };
export type { FeatureInterest, UserMission, DashboardSpotlight };

export interface AppSettings {
  profile: UserProfile;
  activity: ActivityLevel;
  goal: Goal;
  /** App personality voice preference ('classic' | 'ascend' | 'gymrat'). Defaults to 'ascend'. */
  personality: AppPersonality;
  /** Primary athletic mission ('hybrid' | 'hypertrophy' | 'fat_loss' | 'nutrition'). Defaults to 'hybrid'. */
  userMission: UserMission;
  /** Which domain leads the Today home screen ('balanced' | 'workouts' | 'nutrition'). Defaults to 'balanced'. */
  dashboardSpotlight: DashboardSpotlight;
  /** Whether the user has completed or dismissed the mission focus prompt. */
  missionOnboardingDismissed: boolean;
  /** Features the user is interested in seeing. */
  featureInterests: FeatureInterest[];
  /** Whether the user has completed or dismissed the feature interest onboarding prompt. */
  featureOnboardingDismissed: boolean;
  /** Optional target weight in kg, used only for the goal projection. */
  goalWeightKg: number | null;
  /** Primary body weight & general unit system: 'metric' (kg, cm) or 'imperial' (lbs, in). */
  units: UnitSystem;
  /** Primary workout weight unit (barbells, plates, dumbbells): 'metric' (kg) or 'imperial' (lbs). Independent of scale body weight. */
  workoutUnits: UnitSystem;
  /** Controls weight unit display and session switcher visibility ('switchable' | 'kg' | 'lbs'). */
  weightUnitSetting: WeightUnitSetting;
  /** Controls speed unit display and session switcher visibility ('switchable' | 'kph' | 'mph'). */
  speedUnitSetting: SpeedUnitSetting;
  /** The current active speed unit when switchable ('kph' | 'mph'). Defaults to 'kph'. */
  activeSpeedUnit: SpeedUnit;
  /**
   * The old fixed protein figure, 1.8 g/kg for everyone. Read only to keep a
   * value someone deliberately changed; protein is otherwise recommended from
   * goal, activity, sex and body fat (engine/protein.ts).
   */
  proteinGPerKg: number;
  /** A protein figure chosen by hand, in g per kg of body weight; null follows the recommendation. */
  proteinOverrideGPerKg: number | null;
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
  /**
   * How long the rest timer runs after a set is ticked.
   *
   * Stored rather than held for the session: adjusting it mid-workout is
   * almost always a correction to the default, and asking for that same
   * correction every workout is how a timer becomes something people turn off.
   */
  restSeconds: number;
  /** False until the profile has been filled in at least once. */
  onboarded: boolean;
  /**
   * The onboarding version last completed (see onboardingSteps.ts). Someone
   * onboarded before a version added steps is shown just those, once.
   */
  onboardingVersion: number;
  /**
   * True once someone chose to use the app without an account. The sign-in
   * screen then stops being a gate and becomes something the social screens
   * offer; signing out clears nothing here, so it stays a choice made once.
   */
  accountSkipped: boolean;
  /** The Monday of the last week whose check-in was dismissed, so each is shown once. */
  checkInSeenWeek: ISODate | null;
  /** The bar the plate calculator assumes: 20 kg / 45 lb, or the 15 kg / 35 lb one. */
  barbell: BarChoice;
  /** Custom plate sizes available in the gym, per unit system. */
  customPlates: Record<UnitSystem, number[]>;
  /** What routine building may use, and who it is for. Remembered so the next build starts there. */
  routineEquipment: EquipmentItem[];
  trainingLevel: TrainingLevel;
  /** Whether the rest timer chimes when it runs out. Off for anyone training in headphones. */
  restSound: boolean;
  /** The sound played when the rest timer finishes. Defaults to 'chime'. */
  restChimeChoice: ChimeChoice;
  /** Short sounds for moments, such as a new PR. Separate from the rest chime. */
  effectSounds: boolean;
  /**
   * The weekday a week ends on, for check-ins and the weekly target note: 0 for
   * Sunday through 6 for Saturday. Someone who weighs in and reviews on a
   * Friday wants Saturday-to-Friday weeks, not to wait until Monday.
   */
  checkInWeekEndsOn: number;
  /**
   * Whether the finish sheet leads with POST. Set by what someone did last
   * time — posted, or left without posting — so a regular poster gets one tap
   * and someone who never posts is not nagged.
   */
  postWorkouts: boolean;
  /**
   * Which parts of the share card are on when it is laid over a photo. Someone
   * who wants only the figure wants only the figure every time, so the sheet
   * starts where they left it rather than back at everything.
   */
  cardBlocks: CardBlocks;
  /** Which shape the card takes over a photo: the panel, a bar, a corner stamp, bare type. */
  cardTemplate: TemplateId;
  /**
   * Whether the card cuts the person out of the photograph so the type passes
   * behind them. Off by default: the first use fetches about nine megabytes of
   * runtime, which is not something to spend on someone who never asked for it.
   */
  cardDepth: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  profile: { sex: 'male', age: 30, heightCm: 178 },
  activity: 'moderate',
  goal: { direction: 'lose', rateKgPerWeek: 0.5 },
  goalWeightKg: null,
  units: 'metric',
  workoutUnits: 'metric',
  weightUnitSetting: 'switchable',
  speedUnitSetting: 'switchable',
  activeSpeedUnit: 'kph',
  proteinGPerKg: DEFAULT_TARGET_OPTIONS.proteinGPerKg,
  proteinOverrideGPerKg: null,
  minFatGPerKg: DEFAULT_TARGET_OPTIONS.minFatGPerKg,
  kcalPerKgTissue: DEFAULT_MODEL_OPTIONS.kcalPerKgTissue,
  scaleNoiseKg: DEFAULT_MODEL_OPTIONS.scaleNoiseKg,
  expenditureVolatilityKcal: DEFAULT_MODEL_OPTIONS.expenditureVolatilityKcal,
  restSeconds: 120,
  usdaApiKey: USDA_DEMO_KEY,
  foodCountry: DEFAULT_FOOD_COUNTRY,
  aiProvider: 'gemini',
  ollamaHost: defaultOllamaHost(),
  ollamaModel: '',
  anthropicApiKey: '',
  foodLookup: { geminiApiKey: '' },
  onboarded: false,
  onboardingVersion: 0,
  accountSkipped: false,
  checkInSeenWeek: null,
  barbell: 'standard',
  customPlates: {
    metric: [],
    imperial: [],
  },
  routineEquipment: [...EQUIPMENT_ITEMS],
  trainingLevel: 'intermediate',
  restSound: true,
  restChimeChoice: 'chime',
  effectSounds: true,
  checkInWeekEndsOn: 0,
  postWorkouts: false,
  personality: 'ascend',
  userMission: 'hybrid',
  dashboardSpotlight: 'balanced',
  missionOnboardingDismissed: false,
  featureInterests: [...ALL_FEATURE_INTERESTS],
  featureOnboardingDismissed: false,
  cardBlocks: ALL_BLOCKS,
  cardTemplate: DEFAULT_TEMPLATE,
  cardDepth: false,
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
  personality: stored?.personality ?? DEFAULT_SETTINGS.personality,
  units: stored?.units ?? DEFAULT_SETTINGS.units,
  workoutUnits: stored?.workoutUnits ?? stored?.units ?? DEFAULT_SETTINGS.workoutUnits,
  userMission: stored?.userMission ?? DEFAULT_SETTINGS.userMission,
  dashboardSpotlight: stored?.dashboardSpotlight ?? DEFAULT_SETTINGS.dashboardSpotlight,
  missionOnboardingDismissed:
    stored?.missionOnboardingDismissed ?? DEFAULT_SETTINGS.missionOnboardingDismissed,
  featureInterests:
    Array.isArray(stored?.featureInterests) && stored!.featureInterests.length > 0
      ? stored!.featureInterests
      : DEFAULT_SETTINGS.featureInterests,
  featureOnboardingDismissed:
    stored?.featureOnboardingDismissed ?? DEFAULT_SETTINGS.featureOnboardingDismissed,
  profile: { ...DEFAULT_SETTINGS.profile, ...stored?.profile },
  goal: { ...DEFAULT_SETTINGS.goal, ...stored?.goal },
  foodLookup: { ...DEFAULT_SETTINGS.foodLookup, ...stored?.foodLookup },
  customPlates: {
    metric: stored?.customPlates?.metric ?? DEFAULT_SETTINGS.customPlates.metric,
    imperial: stored?.customPlates?.imperial ?? DEFAULT_SETTINGS.customPlates.imperial,
  },
  // A template id this build does not know — one a later build added, then
  // rolled back, or a hand-edited backup — crashed the finish sheet, which
  // looks the template up and reads its layout. The default is always there.
  cardTemplate:
    stored?.cardTemplate && Object.hasOwn(TEMPLATES, stored.cardTemplate)
      ? stored.cardTemplate
      : DEFAULT_SETTINGS.cardTemplate,
});
