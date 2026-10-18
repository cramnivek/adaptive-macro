export type UserMission = 'hybrid' | 'hypertrophy' | 'fat_loss' | 'nutrition';
export type DashboardSpotlight = 'balanced' | 'workouts' | 'nutrition';

export interface MissionDefinition {
  id: UserMission;
  name: string;
  emoji: string;
  badge: string;
  tagline: string;
  description: string;
  accentColor: string;
}

export const MISSIONS: Record<UserMission, MissionDefinition> = {
  hybrid: {
    id: 'hybrid',
    name: 'The Complete Hybrid Athlete',
    emoji: '⚡',
    badge: 'PEAK ATHLETIC PERFORMANCE',
    tagline: 'Heavy compound lifts & precision fueling',
    description: 'The definitive Ascend setup: crush PRs with progressive overload while optimizing clinical micronutrients, macro timing & recovery.',
    accentColor: '#3B82F6',
  },
  hypertrophy: {
    id: 'hypertrophy',
    name: 'Muscle Growth & Hypertrophy',
    emoji: '🏋️‍♂️',
    badge: 'PROGRESSIVE OVERLOAD & FORM',
    tagline: 'Maximize mechanical tension, 1RMs & volume',
    description: 'Prioritizes active workout routines, rest timer pacing, 1RM calculators, and 3D biomechanical hypertrophy cues.',
    accentColor: '#FF6B4A',
  },
  fat_loss: {
    id: 'fat_loss',
    name: 'Lean Cut & Fat Loss',
    emoji: '🔪',
    badge: 'METABOLIC EXPENDITURE ENGINE',
    tagline: 'Kalman-filtered trends, deficit precision & satiety',
    description: 'Filters out water weight fluctuations, paces your calorie deficit, and preserves hard-earned lean muscle tissue.',
    accentColor: '#EC4899',
  },
  nutrition: {
    id: 'nutrition',
    name: 'Precision Nutrition & Longevity',
    emoji: '🥗',
    badge: '25+ CLINICAL MICRONUTRIENTS',
    tagline: 'Full clinical DRI panel, fiber & AI meal swaps',
    description: 'Master your micronutrient density, elevate your Diet Quality Score, and get intelligent Gemini whole-food upgrades.',
    accentColor: '#10B981',
  },
};

export const MISSION_LIST: MissionDefinition[] = [
  MISSIONS.hybrid,
  MISSIONS.hypertrophy,
  MISSIONS.fat_loss,
  MISSIONS.nutrition,
];

export interface SpotlightDefinition {
  id: DashboardSpotlight;
  label: string;
  emoji: string;
  description: string;
}

export const SPOTLIGHT_OPTIONS: SpotlightDefinition[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    emoji: '⚡',
    description: 'Balanced athletic overview of training and nutrition',
  },
  {
    id: 'workouts',
    label: 'Workouts First',
    emoji: '🏋️‍♂️',
    description: 'Prioritizes routine launcher & lifting session at top',
  },
  {
    id: 'nutrition',
    label: 'Nutrition First',
    emoji: '🥗',
    description: 'Prioritizes macros, calorie target & clinical DRI scores',
  },
];

export function getMissionPraise(mission: UserMission): string {
  switch (mission) {
    case 'hypertrophy':
      return 'Iron Focus Activated · Time to chase those PRs! 🏋️‍♂️💥';
    case 'fat_loss':
      return 'Deficit Precision Locked · Protecting your hard-earned muscle! 🔪🔥';
    case 'nutrition':
      return 'Nutrition Mastery · Every micronutrient and electrolyte dialed in! 🔬🥗';
    case 'hybrid':
    default:
      return 'Complete Hybrid Athlete · Maximum performance, zero compromise! ⚡🥇';
  }
}
