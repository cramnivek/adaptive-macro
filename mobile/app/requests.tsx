import { Text } from 'react-native';
import { Screen } from '../src/components/Screen';
import { useTheme } from '../src/theme';

/** A placeholder so typed routes accept /requests; a later task replaces it. */
export default function RequestsScreen() {
  const { colors } = useTheme();
  return (
    <Screen title="Follow requests">
      <Text style={{ color: colors.textMuted }}>Coming soon.</Text>
    </Screen>
  );
}
