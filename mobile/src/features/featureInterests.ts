export type FeatureInterest =
  | 'strength'
  | 'nutrition'
  | 'ai_coach'
  | 'form_kinematics'
  | 'story_stickers'
  | 'body_comp';

export const ALL_FEATURE_INTERESTS: FeatureInterest[] = [
  'strength',
  'nutrition',
  'ai_coach',
  'form_kinematics',
  'story_stickers',
  'body_comp',
];

export interface FeatureDefinition {
  id: FeatureInterest;
  name: string;
  emoji: string;
  icon: any;
  badge: string;
  tagline: string;
  description: string;
  accentColor: string;
  category: 'training' | 'nutrition' | 'ai' | 'analytics' | 'social';
}

export const FEATURES: Record<FeatureInterest, FeatureDefinition> = {
  strength: {
    id: 'strength',
    name: 'Strength & Progressive Overload',
    emoji: '🏋️‍♂️',
    icon: 'barbell-outline',
    badge: 'PR TRACKER · 1RM · REST TIMER',
    tagline: 'Log sets, track 1RMs & crush PRs',
    description: 'Active workout tracker, plate calculator, rest chimes & automatic progressive overload targets.',
    accentColor: '#FF6B4A',
    category: 'training',
  },
  nutrition: {
    id: 'nutrition',
    name: 'Precision Macros & Micronutrients',
    emoji: '🥗',
    icon: 'restaurant-outline',
    badge: '25+ CLINICAL MICRONUTRIENTS',
    tagline: 'Full DRI panel & quality scoring',
    description: 'Track 25+ vitamins, minerals, fiber & electrolytes with an evidence-based Diet Quality Score.',
    accentColor: '#10B981',
    category: 'nutrition',
  },
  ai_coach: {
    id: 'ai_coach',
    name: 'AI Sports Nutrition Coach',
    emoji: '🤖',
    icon: 'sparkles-outline',
    badge: 'MPS ADVISOR & WHOLE FOOD SWAPS',
    tagline: 'Smart meal reviews & macro upgrades',
    description: 'Evidence-based meal feedback, protein distribution analysis & tailored food upgrades powered by Gemini.',
    accentColor: '#8B5CF6',
    category: 'ai',
  },
  form_kinematics: {
    id: 'form_kinematics',
    name: 'Biomechanical Form & Kinematics',
    emoji: '🎥',
    icon: 'body-outline',
    badge: '60 FPS SKELETAL CUES',
    tagline: 'Interactive 3D angles & research cues',
    description: 'Biomechanical keyframes, joint angle readouts, bar paths, and hypertrophy stretch cues.',
    accentColor: '#3B82F6',
    category: 'training',
  },
  story_stickers: {
    id: 'story_stickers',
    name: 'Aesthetic Story Stickers',
    emoji: '✨',
    icon: 'share-social-outline',
    badge: 'TRANSPARENT INSTA / TIKTOK FLEXES',
    tagline: 'Transparent Instagram & TikTok flexes',
    description: 'Export gorgeous, transparent workout & nutrition stickers with Frosted Glass and HUD aesthetics.',
    accentColor: '#F59E0B',
    category: 'social',
  },
  body_comp: {
    id: 'body_comp',
    name: 'Body Composition & Scale Weight',
    emoji: '⚖️',
    icon: 'scale-outline',
    badge: 'KALMAN-FILTERED METABOLIC ENGINE',
    tagline: 'Kalman-filtered scale trends & body fat',
    description: 'Filter out water weight fluctuations to reveal true tissue changes and metabolic expenditure.',
    accentColor: '#EC4899',
    category: 'analytics',
  },
};

export const FEATURE_LIST: FeatureDefinition[] = [
  FEATURES.strength,
  FEATURES.nutrition,
  FEATURES.ai_coach,
  FEATURES.form_kinematics,
  FEATURES.story_stickers,
  FEATURES.body_comp,
];

export interface FeaturePreset {
  id: string;
  name: string;
  emoji: string;
  features: FeatureInterest[];
}

export const FEATURE_PRESETS: FeaturePreset[] = [
  {
    id: 'all',
    name: 'All In',
    emoji: '🚀',
    features: ['strength', 'nutrition', 'ai_coach', 'form_kinematics', 'story_stickers', 'body_comp'],
  },
  {
    id: 'lifter',
    name: 'Iron Beast',
    emoji: '🏋️‍♂️',
    features: ['strength', 'form_kinematics', 'story_stickers'],
  },
  {
    id: 'nutrition',
    name: 'Macro & Health',
    emoji: '🥗',
    features: ['nutrition', 'ai_coach', 'body_comp'],
  },
  {
    id: 'minimalist',
    name: 'Minimal Core',
    emoji: '⚡',
    features: ['strength', 'nutrition'],
  },
];

export function getFeatureReaction(selectedCount: number, selected: FeatureInterest[]): string {
  if (selectedCount === 0) {
    return 'Pick at least one superpower! ⚡';
  }
  if (selectedCount === 6) {
    return 'Complete Beast Mode · Every superpower unlocked! 🚀🔥';
  }
  if (selectedCount >= 4) {
    return 'Powerhouse Arsenal · Built for high performance! ⚡';
  }
  if (selected.includes('strength') && selected.includes('story_stickers') && !selected.includes('nutrition')) {
    return 'Iron Addict & Aesthetic Flexer · Chase the pump! 🏋️‍♂️📸';
  }
  if (selected.includes('nutrition') && selected.includes('ai_coach') && !selected.includes('strength')) {
    return 'Nutrition Scientist · Every micronutrient dialed in! 🔬🥗';
  }
  if (selected.includes('strength') && selected.includes('nutrition')) {
    return 'The Complete Hybrid Athlete · Train heavy, fuel right! 🥇💪';
  }
  return 'Laser-Focused · Clean, lean, and tuned for you! 🎯';
}
