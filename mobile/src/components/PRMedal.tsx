import { StyleSheet, Text, View } from 'react-native';
import { font } from '../theme';
import { session as loud } from '../theme/sessionTheme';

/**
 * The mark on a set, or a lift, that was an all-time record.
 *
 * Drawn rather than an emoji, so it is the same gold disc on every phone, and
 * in the logger's warn gold, the colour the in-workout PR badge already uses,
 * so the mark after the workout is visibly the one from during it. `label`
 * adds a word beside the disc where there is room for one.
 */
export const PRMedal = ({ label }: { label?: string }) => (
  <View
    style={styles.wrap}
    accessible
    accessibilityLabel={label ? `Personal record, ${label}` : 'Personal record'}
  >
    <View style={styles.disc}>
      <Text style={styles.discText}>PR</Text>
    </View>
    {label ? <Text style={styles.label}>{label}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  disc: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: loud.warn,
    borderWidth: 2,
    borderColor: 'rgba(255, 236, 170, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discText: { fontFamily: font.display, fontSize: 8, letterSpacing: 0.4, color: '#2A1E00' },
  label: { fontFamily: font.display, fontSize: 10, letterSpacing: 0.8, color: loud.warn },
});
