import { diffDays, rateVerdict, todayISO } from '@adaptive-macros/engine';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { Button, Stepper, TOUCH_TARGET } from '../../src/components/Controls';
import { LineChart } from '../../src/components/LineChart';
import { Screen } from '../../src/components/Screen';
import { StatTile } from '../../src/components/StatTile';
import { confirm, notify } from '../../src/dialog';
import {
  displayWeight,
  formatDate,
  formatRate,
  formatWeight,
  parseWeight,
  weightUnit,
} from '../../src/format';
import { thud } from '../../src/platform/haptics';
import type { UnitSystem } from '../../src/state/settings';
import { useApp } from '../../src/state/AppStore';
import { font, radius, space, useTheme } from '../../src/theme';

export default function WeightScreen() {
  const { colors } = useTheme();
  const { settings, updateSettings, weights, recordWeight, removeWeight, series, latest, trend } = useApp();
  const [input, setInput] = useState('');
  const [seededFrom, setSeededFrom] = useState<string | null>(null);
  // Whether the box holds a number the person chose (typed, stepped or just
  // saved). Once it does, the suggestion below never replaces it.
  const [chosen, setChosen] = useState(false);
  const enter = (text: string) => {
    setChosen(true);
    setInput(text);
  };

  const units = settings.units;

  const toggleUnits = (nextUnits: UnitSystem) => {
    if (nextUnits === units) return;
    thud('light');
    if (input.trim()) {
      const val = Number.parseFloat(input.replace(',', '.'));
      if (Number.isFinite(val) && val > 0) {
        const converted = nextUnits === 'imperial' ? val * 2.20462 : val / 2.20462;
        setInput(converted.toFixed(1));
      }
    }
    void updateSettings({ units: nextUnits });
  };

  // Start from the current trend rather than an empty box. Tomorrow's weight is
  // almost always within a kilo of today's, so the common case becomes a couple
  // of taps instead of typing four characters on a keypad. Re-seeded whenever
  // the trend moves, so it never offers a stale figure — but only until the
  // person touches the box. It used to re-seed over whatever they had typed:
  // the trend arrives a moment after the tab opens, and saving moves it, so a
  // typed 79.4 turned into the trend's 80.1 under their thumb or straight after
  // saving.
  // Today's own reading comes first once there is one: offering the trend
  // beside "Today's reading is 75.4 kg" meant one tap of Update replaced the
  // real 75.4 with the trend's 75.2.
  const today = weights.find((row) => row.date === todayISO());
  const suggestion = today?.kg ?? latest?.trendWeightKg ?? weights[weights.length - 1]?.kg ?? null;
  if (!chosen && suggestion !== null && seededFrom !== String(suggestion)) {
    setSeededFrom(String(suggestion));
    setInput(displayWeight(suggestion, units).toFixed(1));
  }

  const save = async () => {
    const kg = parseWeight(input, units);
    if (kg === null) {
      notify('Enter a weight', `Type a number in ${weightUnit(units)}.`);
      return;
    }
    await recordWeight(todayISO(), kg);
    // The box keeps the reading just saved, which is what the person expects
    // to see there, not the trend it moved.
    setInput(displayWeight(kg, units).toFixed(1));
    setChosen(true);
  };

  // Charts are plotted against days-since-first-entry rather than timestamps so
  // gaps in weighing show as real gaps instead of being collapsed to evenly
  // spaced points.
  // Readings the filter judged too far from the prediction to take at face
  // value. They are still plotted and still listed — just marked, so the user
  // can see which number the estimate is discounting and why the trend did not
  // follow it.
  const outlierDates = useMemo(
    () => new Set(series.filter((point) => point.weightOutlier).map((point) => point.date)),
    [series],
  );

  const chart = useMemo(() => {
    if (series.length === 0) return null;
    const origin = series[0].date;
    const visible = weights.filter((row) => diffDays(origin, row.date) >= 0);
    return {
      trend: series.map((point) => ({ x: diffDays(origin, point.date), y: point.trendWeightKg })),
      // Where the trend likely lies (two standard deviations either side): tight
      // after steady weighing, wider across gaps and in the first days, which a
      // line alone draws with the same confidence everywhere.
      band: series.map((point) => ({
        x: diffDays(origin, point.date),
        lo: point.trendWeightKg - 2 * point.trendWeightSdKg,
        hi: point.trendWeightKg + 2 * point.trendWeightSdKg,
      })),
      ordinary: visible
        .filter((row) => !outlierDates.has(row.date))
        .map((row) => ({ x: diffDays(origin, row.date), y: row.kg })),
      flagged: visible
        .filter((row) => outlierDates.has(row.date))
        .map((row) => ({ x: diffDays(origin, row.date), y: row.kg })),
      origin,
    };
  }, [series, weights, outlierDates]);

  const verdict = useMemo(() => rateVerdict(weights), [weights]);

  const recent = useMemo(() => [...weights].reverse().slice(0, 14), [weights]);

  const confirmDelete = async (date: string) => {
    const ok = await confirm({
      title: 'Remove weigh-in',
      message: `Delete the reading from ${formatDate(date)}?`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (ok) await removeWeight(date);
  };

  return (
    <Screen
      title="Weight"
      subtitle="Daily readings, smoothed into a trend"
      action={
        <View style={styles.unitToggleWrap}>
          <Pressable
            onPress={() => toggleUnits('metric')}
            style={[
              styles.unitPill,
              units === 'metric'
                ? { backgroundColor: colors.accent, borderColor: colors.accent }
                : { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Switch to kilograms"
          >
            <Text
              style={[
                styles.unitPillText,
                { color: units === 'metric' ? colors.onFill : colors.textMuted },
              ]}
            >
              KG
            </Text>
          </Pressable>
          <Pressable
            onPress={() => toggleUnits('imperial')}
            style={[
              styles.unitPill,
              units === 'imperial'
                ? { backgroundColor: colors.accent, borderColor: colors.accent }
                : { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Switch to pounds"
          >
            <Text
              style={[
                styles.unitPillText,
                { color: units === 'imperial' ? colors.onFill : colors.textMuted },
              ]}
            >
              LB
            </Text>
          </Pressable>
        </View>
      }
    >
      <Card title="Log today's weight">
        <Stepper
          label={`Weight (${weightUnit(units)})`}
          value={input}
          onChangeText={enter}
          suffix={weightUnit(units)}
          step={0.1}
          hint={
            today
              ? `Today's reading is ${formatWeight(today.kg, units)}. Saving again replaces it.`
              : 'Weigh at the same time each day — first thing, after the bathroom, before eating.'
          }
        />
        <Button label={today ? 'Update today’s weigh-in' : 'Save weigh-in'} onPress={() => void save()} />
      </Card>

      <View style={styles.tiles}>
        <StatTile
          label="Trend"
          value={latest ? formatWeight(latest.trendWeightKg, units) : '—'}
          // Two standard deviations, which is what "likely" means here; the
          // bare "±1.0 kg" did not say what it was a range of.
          hint={latest ? `likely within ±${(latest.trendWeightSdKg * 2).toFixed(1)} kg` : 'No data yet'}
        />
        <StatTile
          label="14-day rate"
          value={trend ? formatRate(trend.rateKgPerWeek, units) : '—'}
          // Coloured only once the change is beyond the noise; before that the
          // number is an early guess and should not look like a result.
          tone={verdict === 'losing' ? 'positive' : 'default'}
          hint={trend && verdict ? RATE_HINT[verdict](trend.windowDays) : 'Needs two weigh-ins'}
        />
      </View>

      <Card
        title="Trend vs readings"
        subtitle={
          outlierDates.size > 0
            ? 'Dots are your weigh-ins. The line is the trend, and the shading is where it likely lies. Amber dots were too far off to take at face value.'
            : 'Dots are your weigh-ins. The line is the trend, and the shading is where it likely lies.'
        }
      >
        {weights.length === 1 ? (
          // One reading draws a lone dot on an axis from today to today, which
          // looks broken rather than early.
          <Text style={[styles.early, { color: colors.textMuted }]}>
            One weigh-in so far. The trend line starts with the second, and the range under Trend
            narrows as more mornings come in.
          </Text>
        ) : (
        <LineChart
          series={chart ? [{ points: chart.trend, color: colors.accent, strokeWidth: 2.5 }] : []}
          band={chart ? { points: chart.band, color: colors.accent } : undefined}
          scatter={
            chart
              ? [
                  { points: chart.ordinary, color: colors.textMuted },
                  { points: chart.flagged, color: colors.warning, radius: 3.5, opacity: 0.9 },
                ]
              : undefined
          }
          formatY={(value) => `${(units === 'metric' ? value : value * 2.20462).toFixed(1)}`}
          formatX={(value) => (chart ? formatDate(shiftDate(chart.origin, value)) : '')}
          emptyMessage="Log a few weigh-ins to see your trend"
          height={200}
        />
        )}
      </Card>

      <Card title="Recent weigh-ins" subtitle={recent.length ? 'Hold an entry to remove it' : undefined}>
        {recent.length === 0 && (
          <Text style={{ fontFamily: font.ui, color: colors.textFaint, fontSize: 13 }}>Nothing logged yet.</Text>
        )}
        {recent.map((row) => (
          <Pressable
            key={row.date}
            onLongPress={() => void confirmDelete(row.date)}
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={{ fontFamily: font.figure, fontVariant: ['tabular-nums'], color: colors.textMuted, fontSize: 14 }}>
              {formatDate(row.date)}
              {outlierDates.has(row.date) && (
                <Text style={{ fontFamily: font.ui, color: colors.warning }}> · discounted</Text>
              )}
            </Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>{formatWeight(row.kg, units)}</Text>
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}

/** What the rate tile says under its number, by whether the change is real yet. */
const RATE_HINT: Record<NonNullable<ReturnType<typeof rateVerdict>>, (days: number) => string> = {
  losing: (days) => `A real loss over ${days} days`,
  gaining: (days) => `A real gain over ${days} days`,
  steady: (days) => `Holding steady over ${days} days`,
  unclear: () => 'Too early to tell from day-to-day swings',
};

/** Day offset back to a calendar date, for axis labels. */
const shiftDate = (origin: string, offsetDays: number): string =>
  new Date(new Date(`${origin}T00:00:00Z`).getTime() + Math.round(offsetDays) * 86_400_000)
    .toISOString()
    .slice(0, 10);

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: space.md, marginBottom: space.md },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // Each row is long-pressable to delete, so it has to be a real target.
    minHeight: TOUCH_TARGET,
    paddingVertical: space.sm,
  },
  early: { fontFamily: font.ui, fontSize: 13, lineHeight: 19, paddingVertical: space.md },
  rowValue: { fontFamily: font.figure, fontSize: 14, fontVariant: ['tabular-nums'] },
  unitToggleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    padding: 2,
    borderRadius: radius.md,
  },
  unitPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitPillText: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 0.5,
  },
});
