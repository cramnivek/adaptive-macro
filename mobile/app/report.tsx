import { Text } from 'react-native';
import { Screen } from '../src/components/Screen';
import { useTheme } from '../src/theme';

/** A placeholder so typed routes accept /report; a later task replaces it. */
export default function ReportScreen() {
  const { colors } = useTheme();
  return (
    <Screen title="Report">
      <Text style={{ color: colors.textMuted }}>Coming soon.</Text>
    </Screen>
  );
}
