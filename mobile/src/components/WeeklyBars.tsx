import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { displayWeight, formatDayMonth, weightUnit } from '../format';
import { formatDuration } from '../social/postPayload';
import type { UnitSystem } from '../state/settings';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import type { WeekTotal } from '../weeklyTraining';
import { TOUCH_TARGET } from './Controls';
import { Tappable } from './Tappable';

type Metric = 'time' | 'volume' | 'sets';

const METRICS: { key: Metric; label: string; noun: string }[] = [
  { key: 'time', label: 'TIME', noun: 'Time' },
  { key: 'volume', label: 'VOLUME', noun: 'Volume' },
  { key: 'sets', label: 'SETS', noun: 'Sets' },
];

const CHART_HEIGHT = 120;
// A week with anything in it must show, however small beside the biggest week.
const MIN_BAR = 2;

const valueOf = (week: WeekTotal, metric: Metric): number =>
  metric === 'time' ? week.minutes : metric === 'volume' ? week.volumeKg : week.sets;

interface WeeklyBarsProps {
  weeks: WeekTotal[];
  units: UnitSystem;
}

/**
 * Twelve weeks of training as plain bars, one metric at a time.
 *
 * Time, volume and sets answer different questions — a deload week is short
 * and light but a high-rep week is long and not heavy — so the reader picks,
 * rather than the chart choosing one and hiding the others. The bars are
 * Views, not a chart library: there is one series, no axes to scale and
 * nothing to hover, and a dependency for that would outweigh the chart.
 */
export const WeeklyBars = ({ weeks, units }: WeeklyBarsProps) => {
  const [metric, setMetric] = useState<Metric>('volume');

  const values = weeks.map((week) => valueOf(week, metric));
  const largest = Math.max(0, ...values);
  const current = values[values.length - 1] ?? 0;
  // Over every week shown, quiet ones included: an average that skips the weeks
  // you missed would flatter the trend it is meant to be measured against.
  const average = values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

  const format = (value: number): string => {
    if (metric === 'time') return formatDuration(Math.round(value));
    if (metric === 'volume') {
      return `${Math.round(displayWeight(value, units)).toLocaleString()} ${weightUnit(units)}`;
    }
    const sets = Math.round(value);
    return `${sets} ${sets === 1 ? 'set' : 'sets'}`;
  };

  const noun = METRICS.find((option) => option.key === metric)?.noun ?? 'Volume';
  const summary = `This week ${format(current)} · average ${format(average)}`;
  const first = weeks[0];
  const middle = weeks[Math.floor(weeks.length / 2)];
  const last = weeks[weeks.length - 1];

  return (
    <View>
      <View style={styles.switcher}>
        {METRICS.map((option) => {
          const active = option.key === metric;
          return (
            <Tappable
              key={option.key}
              onPress={() => setMetric(option.key)}
              scaleTo={0.97}
              style={[styles.switchItem, active && styles.switchItemActive]}
              accessibilityLabel={`Show ${option.noun.toLowerCase()} per week`}
              accessibilityRole="button"
              accessibilityState={{ selected: option.key === metric }}
            >
              <Text
                style={[styles.switchLabel, { color: active ? loud.onLoud : loud.figureMuted }]}
              >
                {option.label}
              </Text>
            </Tappable>
          );
        })}
      </View>

      <Text style={styles.summary}>{summary}</Text>

      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${noun} per week for ${weeks.length} weeks, this week ${format(current)}, average ${format(average)}`}
        style={styles.chart}
      >
        {weeks.map((week, index) => {
          const value = values[index] ?? 0;
          const isCurrent = index === weeks.length - 1;
          const height = value <= 0 || largest <= 0 ? 0 : Math.max(MIN_BAR, (value / largest) * CHART_HEIGHT);
          return (
            <View key={week.weekStart} style={styles.slot}>
              <View
                style={[
                  styles.bar,
                  { height },
                  isCurrent ? styles.barCurrent : styles.barPast,
                ]}
              />
            </View>
          );
        })}
      </View>

      {first !== undefined && middle !== undefined && last !== undefined && (
        <View style={styles.axis}>
          <Text style={[styles.axisLabel, styles.axisStart]}>{formatDayMonth(first.weekStart)}</Text>
          <Text style={[styles.axisLabel, styles.axisMiddle]}>{formatDayMonth(middle.weekStart)}</Text>
          <Text style={[styles.axisLabel, styles.axisEnd]}>{formatDayMonth(last.weekStart)}</Text>
        </View>
      )}
    </View>
  );
};

// The switcher's styles match the overview's period switcher on purpose; they
// live in that screen's StyleSheet, which is not exported.
const styles = StyleSheet.create({
  switcher: {
    flexDirection: 'row',
    backgroundColor: loud.panel,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    padding: 3,
    marginBottom: space.md,
  },
  switchItem: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: space.xs,
  },
  switchItemActive: {
    backgroundColor: loud.loud,
  },
  switchLabel: { fontFamily: font.display, fontSize: 11, letterSpacing: 1.4 },

  summary: { fontFamily: font.ui, fontSize: 13, color: loud.figureMuted, marginBottom: space.md },

  // The baseline is what lets a week with nothing in it read as a gap, not as
  // a missing bar.
  chart: {
    height: CHART_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: loud.rule,
  },
  slot: { flex: 1, justifyContent: 'flex-end' },
  bar: { width: '100%', borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  barCurrent: { backgroundColor: loud.loud },
  // The panel colour is a hair off the ground, so past weeks — usually the whole
  // chart — all but disappeared; the faint figure colour reads as a bar and still
  // leaves the current week the loudest thing on it.
  barPast: { backgroundColor: loud.figureFaint },

  axis: { flexDirection: 'row', marginTop: space.xs },
  axisLabel: { flex: 1, fontFamily: font.ui, fontSize: 11, color: loud.figureFaint },
  axisStart: { textAlign: 'left' },
  axisMiddle: { textAlign: 'center' },
  axisEnd: { textAlign: 'right' },
});
