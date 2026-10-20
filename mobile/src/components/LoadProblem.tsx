import { StyleSheet, Text, View } from 'react-native';
import { font, space, useTheme } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { Button } from './Controls';

/**
 * What a screen shows when reading the local log failed, in place of the
 * spinner it would otherwise show forever.
 *
 * Every screen here loads by awaiting several queries and only then clearing
 * its spinner. When one of them threw, the spinner simply stayed, which reads
 * as the app hanging rather than as something that can be tried again. One
 * known cause is a second tab of the app holding the log open (see
 * `storageLock.ts`), which clears once that tab closes, so a retry is the
 * useful thing to offer.
 */
export const LoadProblem = ({
  message,
  onRetry,
  tone,
}: {
  message: string;
  onRetry: () => void;
  tone?: 'loud';
}) => {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.note, { color: tone === 'loud' ? loud.figureMuted : colors.textMuted }]}>
        {`Could not load this. ${message}`}
      </Text>
      <Button tone={tone} label="Try again" onPress={onRetry} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  note: { fontFamily: font.ui, fontSize: 14, lineHeight: 20 },
});
