import { Text } from 'react-native';
import { Screen } from '../src/components/Screen';
import { useTheme } from '../src/theme';

/** A placeholder so typed routes accept /people; a later task replaces it. */
export default function PeopleScreen() {
  const { colors } = useTheme();
  return (
    <Screen title="Find people">
      <Text style={{ color: colors.textMuted }}>Coming soon.</Text>
    </Screen>
  );
}
