import { StyleSheet, Text, View } from 'react-native';
import type { StripDay } from '../loggingStrip';
import { font, radius, space, useTheme } from '../theme';

/**
 * Two rows of squares, one per day: food and scale.
 *
 * A filled square is a day the estimate could use. An outlined one is food
 * marked as not fully logged, which the estimate deliberately ignores. A blank
 * one is a day with nothing to go on. The count closes each row so the
 * number is there for anyone who would rather read it.
 */
export const LoggingStrip = ({ days }: { days: StripDay[] }) => {
  const { colors } = useTheme();
  const counted = days.filter((day) => day.food === 'counted').length;
  const leftOut = days.filter((day) => day.food === 'left-out').length;
  const weighed = days.filter((day) => day.weighed).length;

  const square = (filled: boolean, color: string, outlined = false) => [
    styles.square,
    {
      backgroundColor: filled ? color : outlined ? 'transparent' : colors.surfaceRaised,
      borderColor: outlined ? colors.warning : 'transparent',
    },
  ];

  return (
    <View style={styles.wrap} accessibilityLabel={`Last ${days.length} days: food counted on ${counted}, weighed on ${weighed}`}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textMuted }]}>Food</Text>
        <View style={styles.squares}>
          {days.map((day) => (
            <View
              key={day.date}
              style={square(day.food === 'counted', colors.carbs, day.food === 'left-out')}
            />
          ))}
        </View>
        <Text style={[styles.count, { color: colors.text }]}>
          {counted}/{days.length}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.textMuted }]}>Scale</Text>
        <View style={styles.squares}>
          {days.map((day) => (
            <View key={day.date} style={square(day.weighed, colors.accent)} />
          ))}
        </View>
        <Text style={[styles.count, { color: colors.text }]}>
          {weighed}/{days.length}
        </Text>
      </View>
      {leftOut > 0 && (
        <Text style={[styles.note, { color: colors.warning }]}>
          {leftOut === 1 ? '1 day' : `${leftOut} days`} left out as not fully logged
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  label: { fontFamily: font.uiStrong, fontSize: 11, width: 38 },
  // Packed together, the row reads as one strip at any width. Fourteen 14px
  // cells with 3px gaps plus the label and count come to 329px, inside the
  // 343px a 375px phone leaves after its gutters.
  squares: { flexDirection: 'row', gap: 3, flexShrink: 1 },
  // Fixed, not flexed: a flexed cell stretched into a pill on a wide screen.
  square: { width: 14, height: 14, borderRadius: radius.xs, borderWidth: 1.5 },
  count: { fontFamily: font.figure, fontSize: 12, width: 40, fontVariant: ['tabular-nums'] },
  note: { fontFamily: font.ui, fontSize: 11, marginTop: 2 },
});
