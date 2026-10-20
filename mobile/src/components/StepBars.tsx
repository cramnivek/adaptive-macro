import { addDays, type ISODate } from '@adaptive-macros/engine';
import { StyleSheet, Text, View } from 'react-native';
import { font, radius, space, useTheme } from '../theme';
import { TOUCH_TARGET } from './Controls';
import { Tappable } from './Tappable';

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BAR_HEIGHT = 96;

interface StepBarsProps {
  today: ISODate;
  /** Step counts by date. A day missing from it was not logged, which is not zero. */
  byDate: ReadonlyMap<ISODate, number>;
  goal: number;
  onPressDay: (date: ISODate) => void;
}

/**
 * The last seven days of steps, one bar each, today on the right.
 *
 * A day with no count is drawn as an empty outline rather than a zero bar,
 * because the card used to average only the logged days and label the result
 * "daily steps": two days of 5,000 read as a week of 5,000. Each bar opens that
 * day, so a wrong count can be corrected or cleared where it is seen.
 */
export const StepBars = ({ today, byDate, goal, onPressDay }: StepBarsProps) => {
  const { colors } = useTheme();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const top = Math.max(goal, ...days.map((d) => byDate.get(d) ?? 0));

  return (
    <View style={styles.row}>
      {days.map((date) => {
        const steps = byDate.get(date);
        const weekday = WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()];
        return (
          <Tappable
            key={date}
            onPress={() => onPressDay(date)}
            scaleTo={0.94}
            style={styles.col}
            accessibilityRole="button"
            accessibilityLabel={
              steps === undefined ? `${weekday}: no steps logged. Tap to log` : `${weekday}: ${steps} steps. Tap to edit`
            }
          >
            <Text style={[styles.value, { color: steps === undefined ? colors.textFaint : colors.textMuted }]}>
              {steps === undefined ? '—' : steps >= 1000 ? `${(steps / 1000).toFixed(1)}k` : String(steps)}
            </Text>
            <View style={styles.track}>
              {steps === undefined ? (
                <View style={[styles.empty, { borderColor: colors.border }]} />
              ) : (
                <View
                  style={[
                    styles.bar,
                    {
                      height: Math.max(4, (steps / top) * BAR_HEIGHT),
                      backgroundColor: steps >= goal ? colors.positive : colors.accent,
                    },
                  ]}
                />
              )}
            </View>
            <Text style={[styles.day, { color: date === today ? colors.text : colors.textMuted }]}>
              {date === today ? 'Today' : weekday}
            </Text>
          </Tappable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  col: { flex: 1, alignItems: 'center', gap: 4, minHeight: TOUCH_TARGET },
  value: { fontFamily: font.figure, fontSize: 10, fontVariant: ['tabular-nums'] },
  track: { height: BAR_HEIGHT, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '70%', borderRadius: radius.sm },
  empty: {
    width: '70%',
    height: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  day: { fontFamily: font.ui, fontSize: 10, marginTop: space.xs / 2 },
});
