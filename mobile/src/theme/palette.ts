export type FeatureTone = 'sleep' | 'food' | 'activity' | 'salt';

/** One action red across the app; slightly deeper than the artwork mark for white-label contrast. */
export const brand = { red: '#D92D22', onRed: '#FFFFFF', mark: '#E8352A' } as const;

export interface Palette {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  /** Foreground for text and icons on a filled control — accent or danger. */
  onFill: string;
  protein: string;
  carbs: string;
  fat: string;
  positive: string;
  warning: string;
  danger: string;
  /** Brand actions and selection are separate from nutrient and error colors. */
  brand: { fill: string; onFill: string; text: string; surface: string };
  /** Recognition and atmosphere, independent of whether a reading is good or bad. */
  features: Record<FeatureTone, { accent: string; surface: string; note: string }>;
}

export const dark: Palette = {
  background: '#0E0E0F',
  surface: '#171718',
  surfaceRaised: '#1F1F21',
  border: '#2A2A2D',
  text: '#F4F4F2',
  textMuted: '#A0A09C',
  textFaint: '#8C8C91',
  accent: '#E9E9E6',
  onFill: '#0E0E0F',
  protein: '#6E9FB5',
  carbs: '#C8A45C',
  fat: '#B57A56',
  positive: '#6FB58A',
  warning: '#C8A45C',
  danger: '#E06C60',
  brand: { fill: brand.red, onFill: brand.onRed, text: '#F28278', surface: '#28191A' },
  features: {
    sleep: { accent: '#D3C9F4', surface: '#1B1A20', note: '#262130' },
    food: { accent: '#BAD5BD', surface: '#1C211E', note: '#252F28' },
    activity: { accent: '#BFD4E3', surface: '#1A2025', note: '#242E35' },
    salt: { accent: '#EFC9A8', surface: '#211D19', note: '#2C251F' },
  },
};

export const light: Palette = {
  background: '#FAFAF8',
  surface: '#FFFFFF',
  surfaceRaised: '#F1F1ED',
  border: '#E2E2DC',
  text: '#151516',
  textMuted: '#5E5E5A',
  textFaint: '#6E6E68',
  accent: '#151516',
  onFill: '#FAFAF8',
  protein: '#3C6E88',
  carbs: '#8E6E26',
  fat: '#8A4E32',
  positive: '#2E7D5B',
  warning: '#8E6E26',
  danger: '#C0392B',
  brand: { fill: brand.red, onFill: brand.onRed, text: '#B72D25', surface: '#FCECE9' },
  features: {
    sleep: { accent: '#665088', surface: '#F3F0FA', note: '#E9E2F3' },
    food: { accent: '#3C6244', surface: '#EEF4EE', note: '#E1ECE0' },
    activity: { accent: '#3F647D', surface: '#EDF3F7', note: '#E0EAF1' },
    salt: { accent: '#795334', surface: '#FAF1E7', note: '#F3E6D6' },
  },
};

/** Shared spacing scale, so padding stays consistent without magic numbers. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/**
 * Shared corner radius scale for soft, touch-friendly interfaces.
 * Preserves sharp cuts (`none`) for Achievement mode and exported share cards.
 */
export const radius = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  pill: 999,
} as const;

/**
 * The lean.
 *
 * Started life in the workout logger and is now the whole app's: primary
 * actions carry it everywhere, the loud screens build their panels from it.
 * A shape token, so nothing hard-codes the angle and a pair of slabs set to
 * meet actually meet.
 *
 * It goes on background layers only. Skewing content as well would be closer
 * to the reference and would also make a column of weights unreadable.
 */
export const SKEW = '-8deg';

/**
 * Family names, so no screen spells out a font.
 *
 * Figures get a mono face because most of this app is columns of numbers, and
 * proportional digits make a weight history jump about as it scrolls.
 */
export const font = {
  ui: 'SpaceGrotesk_400Regular',
  uiStrong: 'SpaceGrotesk_600SemiBold',
  figure: 'IBMPlexMono_500Medium',
  /** Heaviest weight, for type that is meant to be the loudest thing on screen. */
  display: 'SpaceGrotesk_700Bold',
} as const;
