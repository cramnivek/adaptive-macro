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
};

/** Shared spacing scale, so padding stays consistent without magic numbers. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 4, md: 6, lg: 8, pill: 999 } as const;

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
} as const;
