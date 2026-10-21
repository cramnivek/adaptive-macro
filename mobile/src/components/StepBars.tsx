import type { ISODate } from '@adaptive-macros/engine';
import { StyleSheet, Text, View } from 'react-native';
import { stepBuckets, type StepSpan } from '../stepBuckets';
import { font, radius, space, useTheme } from '../theme';
import { TOUCH_TARGET } from './Controls';
import { Tappable } from './Tappable';

const BAR_HEIGHT = 96;

interface StepBarsProps {
  today: ISODate;
  /** Step counts by date. A day missing from it was not logged, which is not zero. */
  byDate: ReadonlyMap<ISODate, number>;
  goal: number;
  /** The period Trends is showing: a bar a day for a week or a month, a bar a month for a year. */
  span?: StepSpan;
  onPressDay: (date: ISODate) => void;
}

/**
 * Steps over the period Trends is showing, today or this month on the right.
 *
 * A day with no count is drawn as an empty outline rather than a zero bar,
 * because the card used to average only the logged days and label the result
 * "daily steps": two days of 5,000 read as a week of 5,000. Each day's bar
 * opens that day, so a wrong count can be corrected or cleared where it is
 * seen; a year's bars are monthly averages and open nothing.
 */
export const StepBars = ({ today, byDate, goal, span = 'week', onPressDay }: StepBarsProps) => {
  const { colors } = useTheme();
  const buckets = stepBuckets(today, byDate, span);
  const top = Math.max(goal, ...buckets.map((b) => b.steps ?? 0));
  // Thirty figures over thirty thin bars are unreadable; the bars say it.
  const showValues = buckets.length <= 12;
  const thin = buckets.length > 12;

  return (
    <View style={[styles.row, thin && styles.thinRow]}>
      {buckets.map((bucket) => {
        const { steps, date } = bucket;
        const name = date ?? bucket.label;
        return (
          <Tappable
            key={bucket.key}
            onPress={() => {
              if (date) onPressDay(date);
            }}
            disabled={!date}
            scaleTo={0.94}
            style={styles.col}
            accessibilityRole={date ? 'button' : 'text'}
            accessibilityLabel={
              steps === undefined
                ? `${name}: no steps logged${date ? '. Tap to log' : ''}`
                : `${name}: ${steps} steps${date ? '. Tap to edit' : ' a day on average'}`
            }
          >
            {showValues && (
              <Text style={[styles.value, { color: steps === undefined ? colors.textFaint : colors.textMuted }]}>
                {steps === undefined ? '—' : steps >= 1000 ? `${(steps / 1000).toFixed(1)}k` : String(steps)}
              </Text>
            )}
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
            {/* A month's labels are one a week, wider than their bar, so they
                are allowed to run over the unlabelled bars beside them. */}
            <Text
              numberOfLines={1}
              style={[styles.day, thin && styles.thinDay, { color: date === today ? colors.text : colors.textMuted }]}
            >
              {bucket.label}
            </Text>
          </Tappable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  thinRow: { gap: 2 },
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
  thinDay: { width: 36, textAlign: 'center' },
});
