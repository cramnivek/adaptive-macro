import { diffDays, todayISO } from '@adaptive-macros/engine';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { Button, Field } from '../../src/components/Controls';
import { LineChart } from '../../src/components/LineChart';
import { Screen } from '../../src/components/Screen';
import { StatTile } from '../../src/components/StatTile';
import { formatDate, formatRate, formatWeight, parseWeight, weightUnit } from '../../src/format';
import { useApp } from '../../src/state/AppStore';
import { space, useTheme } from '../../src/theme';

export default function WeightScreen() {
  const { colors } = useTheme();
  const { settings, weights, recordWeight, removeWeight, series, latest, trend } = useApp();
  const [input, setInput] = useState('');

  const units = settings.units;

  const save = async () => {
    const kg = parseWeight(input, units);
    if (kg === null) {
      Alert.alert('Enter a weight', `Type a number in ${weightUnit(units)}.`);
      return;
    }
    await recordWeight(todayISO(), kg);
    setInput('');
  };

  // Charts are plotted against days-since-first-entry rather than timestamps so
  // gaps in weighing show as real gaps instead of being collapsed to evenly
  // spaced points.
  const chart = useMemo(() => {
    if (series.length === 0) return null;
    const origin = series[0].date;
    return {
      trend: series.map((point) => ({ x: diffDays(origin, point.date), y: point.trendWeightKg })),
      scatter: weights
        .filter((row) => diffDays(origin, row.date) >= 0)
        .map((row) => ({ x: diffDays(origin, row.date), y: row.kg })),
      origin,
    };
  }, [series, weights]);

  const recent = useMemo(() => [...weights].reverse().slice(0, 14), [weights]);

  const confirmDelete = (date: string) => {
    Alert.alert('Remove weigh-in', `Delete the reading from ${formatDate(date)}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void removeWeight(date) },
    ]);
  };

  return (
    <Screen title="Weight" subtitle="Daily readings, smoothed into a trend">
      <Card title="Log today's weight">
        <Field
          label={`Weight (${weightUnit(units)})`}
          value={input}
          onChangeText={setInput}
          keyboardType="decimal-pad"
          placeholder={latest ? latest.trendWeightKg.toFixed(1) : '0.0'}
          hint="Weigh at the same time each day — first thing, after the bathroom, before eating."
        />
        <Button label="Save weigh-in" onPress={() => void save()} />
      </Card>

      <View style={styles.tiles}>
        <StatTile
          label="Trend"
          value={latest ? formatWeight(latest.trendWeightKg, units) : '—'}
          hint={latest ? `±${(latest.trendWeightSdKg * 2).toFixed(1)} kg` : 'No data yet'}
        />
        <StatTile
          label="14-day rate"
          value={trend ? formatRate(trend.rateKgPerWeek, units) : '—'}
          tone={trend && trend.rateKgPerWeek < 0 ? 'positive' : 'default'}
          hint={trend ? `over ${trend.windowDays} days` : 'Needs two weigh-ins'}
        />
      </View>

      <Card title="Trend vs readings" subtitle="Dots are raw weigh-ins; the line is the filtered trend">
        <LineChart
          series={chart ? [{ points: chart.trend, color: colors.accent, strokeWidth: 2.5 }] : []}
          scatter={chart ? { points: chart.scatter, color: colors.textMuted } : undefined}
          formatY={(value) => `${(units === 'metric' ? value : value * 2.20462).toFixed(1)}`}
          formatX={(value) => (chart ? formatDate(shiftDate(chart.origin, value)) : '')}
          emptyMessage="Log a few weigh-ins to see your trend"
          height={200}
        />
      </Card>

      <Card title="Recent weigh-ins" subtitle={recent.length ? 'Hold an entry to remove it' : undefined}>
        {recent.length === 0 && (
          <Text style={{ color: colors.textFaint, fontSize: 13 }}>Nothing logged yet.</Text>
        )}
        {recent.map((row) => (
          <Pressable
            key={row.date}
            onLongPress={() => confirmDelete(row.date)}
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>{formatDate(row.date)}</Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>{formatWeight(row.kg, units)}</Text>
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}

/** Day offset back to a calendar date, for axis labels. */
const shiftDate = (origin: string, offsetDays: number): string =>
  new Date(new Date(`${origin}T00:00:00Z`).getTime() + Math.round(offsetDays) * 86_400_000)
    .toISOString()
    .slice(0, 10);

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: space.md, marginBottom: space.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.sm },
  rowValue: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
