import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

export type UserMission = 'hybrid' | 'hypertrophy' | 'fat_loss' | 'nutrition';
export type DashboardSpotlight = 'balanced' | 'workouts' | 'nutrition';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * What someone says they are here for.
 *
 * Today this changes labels only — every feature is on whichever is picked,
 * and the goal that actually moves the targets is the lose / maintain / gain
 * choice on the baseline step. So the copy describes the goal in the words a
 * lifter would use and promises nothing the app does not do for everyone.
 *
 * One glyph, drawn in the text colour, rather than an emoji in a bubble tinted
 * with a colour of its own. Four stock accent colours on one screen made the
 * picker look like a template and broke the rule that colour means data.
 */
export interface MissionDefinition {
  id: UserMission;
  name: string;
  icon: IconName;
  tagline: string;
  description: string;
}

export const MISSIONS: Record<UserMission, MissionDefinition> = {
  hybrid: {
    id: 'hybrid',
    name: 'All-round',
    icon: 'layers-outline',
    tagline: 'Lifting and eating, given equal weight.',
    description: 'Your training and your daily targets share the home screen.',
  },
  hypertrophy: {
    id: 'hypertrophy',
    name: 'Building muscle',
    icon: 'barbell-outline',
    tagline: 'Getting stronger, set by set.',
    description: 'For when the logbook matters most: what you lifted last time, rest between sets, and new bests.',
  },
  fat_loss: {
    id: 'fat_loss',
    name: 'Losing fat',
    icon: 'trending-down-outline',
    tagline: 'A steady deficit, without losing strength.',
    description: 'The weight trend smooths out water and salt, so one bad weigh-in does not read as a bad week.',
  },
  nutrition: {
    id: 'nutrition',
    name: 'Eating well',
    icon: 'leaf-outline',
    tagline: 'What is in your food, not only the calories.',
    description: 'Fibre, vitamins and minerals from what you log, next to your macros.',
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
  description: string;
}

/**
 * What the home screen leads with.
 *
 * `balanced` and `nutrition` currently lay Today out the same way — targets
 * first, training shortcut under them — and the descriptions say so rather
 * than inventing a difference.
 */
export const SPOTLIGHT_OPTIONS: SpotlightDefinition[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Your targets first, with the training shortcut under them.',
  },
  {
    id: 'workouts',
    label: 'Training first',
    description: 'The training shortcut sits above your targets.',
  },
  {
    id: 'nutrition',
    label: 'Food first',
    description: 'Your targets, then straight into your meals; steps and training come after them.',
  },
];

/** One plain line confirming the choice, shown above the picker in Settings. */
export function getMissionPraise(mission: UserMission): string {
  switch (mission) {
    case 'hypertrophy':
      return 'Building muscle. Every set shows what you lifted last time.';
    case 'fat_loss':
      return 'Losing fat. Watch the trend line, not the daily number.';
    case 'nutrition':
      return 'Eating well. Log meals and the nutrients add up on Today.';
    case 'hybrid':
    default:
      return 'All-round. Training and food get equal room.';
  }
}
