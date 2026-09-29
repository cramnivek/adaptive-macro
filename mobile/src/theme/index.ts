import { useColorScheme } from 'react-native';
import { dark, light, type Palette } from './palette';

export * from './palette';

export const useTheme = (): { colors: Palette; isDark: boolean } => {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  return { colors: isDark ? dark : light, isDark };
};
