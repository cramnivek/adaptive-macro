import { useColorScheme } from 'react-native';

export interface Palette {
  background: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  protein: string;
  carbs: string;
  fat: string;
  positive: string;
  warning: string;
  danger: string;
}

const dark: Palette = {
  background: '#0B1220',
  surface: '#141C2B',
  surfaceRaised: '#1C2637',
  border: '#27334A',
  text: '#F2F5FA',
  textMuted: '#9AA7BD',
  textFaint: '#5D6A80',
  accent: '#5B9DFF',
  protein: '#7BC2FF',
  carbs: '#F2C14E',
  fat: '#F2825B',
  positive: '#4FD18B',
  warning: '#F2C14E',
  danger: '#FF6B6B',
};

const light: Palette = {
  background: '#F6F8FC',
  surface: '#FFFFFF',
  surfaceRaised: '#EEF2F8',
  border: '#DCE3ED',
  text: '#101828',
  textMuted: '#5A6779',
  textFaint: '#98A2B3',
  accent: '#2563EB',
  protein: '#2E7FD6',
  carbs: '#C98A0B',
  fat: '#D1603D',
  positive: '#1F9D63',
  warning: '#C98A0B',
  danger: '#D93F3F',
};

export const useTheme = (): { colors: Palette; isDark: boolean } => {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  return { colors: isDark ? dark : light, isDark };
};

/** Shared spacing scale, so padding stays consistent without magic numbers. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
