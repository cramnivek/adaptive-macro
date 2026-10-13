import { Text } from 'react-native';
import { Screen } from '../src/components/Screen';
import { useTheme } from '../src/theme';

/** A placeholder so typed routes accept /profile; a later task replaces it. */
export default function ProfileScreen() {
  const { colors } = useTheme();
  return (
    <Screen title="Profile">
      <Text style={{ color: colors.textMuted }}>Coming soon.</Text>
    </Screen>
  );
}
