import { addDays, diffDays, projectedDate, todayISO } from '@adaptive-macros/engine';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { LineChart } from '../../src/components/LineChart';
import { MethodSheet } from '../../src/components/MethodSheet';
import { Screen } from '../../src/components/Screen';
import { StatTile } from '../../src/components/StatTile';
import { Tappable } from '../../src/components/Tappable';
import { TrainingCrossReference } from '../../src/components/TrainingCrossReference';
import { dailyKcalBetween } from '../../src/db';
import {
  axisDecimals,
  displayWeight,
  formatDateLong,
  formatDayMonth,
  formatRate,
  formatWeight,
  weightUnit,
} from '../../src/format';
import { useApp } from '../../src/state/AppStore';
import { font, radius, space, useTheme } from '../../src/theme';

/** How far back every chart on this screen looks. */
const WINDOW_DAYS = 90;

/**
 * What the data says, in charts.
 *
 * This screen used to be mostly prose: a sentence under every heading, a
 * paragraph about clamping, and a hundred and fifty words explaining the
 * method — with exactly one chart among it. Opening it to check a number meant
 * reading. The explanation has not been thrown away; it is a tap behind the
 * heading, where reference material belongs, and the room it freed has gone to
 * the two charts that were missing.
 */
export default function TrendsScreen() {
  const { colors } = useTheme();
  const { settings, series, latest, trend, program, confidence } = useApp();
  const [intake, setIntake] = useState<{ date: string; kcal: number }[]>([]);
  const [method, setMethod] = useState(false);
  const unit = weightUnit(settings.units);

  const today = todayISO();
  const from = addDays(today, -(WINDOW_DAYS - 1));

  useFocusEffect(
    useCallback(() => {
      let current = true;
      void dailyKcalBetween(from, today).then((rows) => {
        if (current) setIntake(rows);
      });
      return () => {
        current = false;
      };
    }, [from, today]),
  );

  /**
   * Ninety days: far enough back to see a real shift in expenditure, recent
   * enough that the early wide-uncertainty warm-up does not flatten the scale
   * for everything after it.
   */
  const window = useMemo(() => series.slice(-WINDOW_DAYS), [series]);
  const origin = window[0]?.date ?? null;

  const energy = useMemo(() => {
    if (origin === null || window.length < 2) return null;
    return {
      expenditure: window.map((point) => ({
        x: diffDays(origin, point.date),
        y: point.expenditureKcal,
      })),
      band: window.map((point) => ({
        x: diffDays(origin, point.date),
        lo: point.expenditureKcal - point.expenditureSdKcal,
        hi: point.expenditureKcal + point.expenditureSdKcal,
      })),
      // Scattered rather than joined: intake is a daily fact with gaps, and a
      // line across a missing day would invent a value for it.
      intake: intake
        .filter((row) => row.date >= origin)
        .map((row) => ({ x: diffDays(origin, row.date), y: row.kcal })),
    };
  }, [window, origin, intake]);

  const weight = useMemo(() => {
    if (origin === null || window.length < 2) return null;
    return window.map((point) => ({
      x: diffDays(origin, point.date),
      y: displayWeight(point.trendWeightKg, settings.units),
    }));
  }, [window, origin, settings.units]);

  /** Includes the goal line, since the axis has to span that too. */
  const weightDecimals = useMemo(() => {
    if (weight === null) return 1;
    const values = weight.map((point) => point.y);
    if (settings.goalWeightKg !== null) {
      values.push(displayWeight(settings.goalWeightKg, settings.units));
    }
    return axisDecimals(Math.max(...values) - Math.min(...values));
  }, [weight, settings.goalWeightKg, settings.units]);

  const projection = useMemo(() => {
    if (!latest || !trend || settings.goalWeightKg === null) return null;
    return projectedDate(today, latest.trendWeightKg, settings.goalWeightKg, trend.rateKgPerWeek);
  }, [latest, trend, settings.goalWeightKg, today]);

  const dayLabel = (x: number) =>
    origin === null ? '' : formatDayMonth(addDays(origin, x));

  return (
    <Screen title="Trends">
      <View style={styles.tiles}>
        <StatTile
          label="Expenditure"
          value={latest ? String(Math.round(latest.expenditureKcal)) : '—'}
          unit="kcal/day"
          // The confidence sentence used to be its own card with its own tile
          // repeating this same number. It is the hint on the figure it
          // qualifies, which is where someone reading the figure is looking.
          hint={latest ? `± ${Math.round(latest.expenditureSdKcal)} · ${confidence}` : 'No estimate yet'}
        />
        <StatTile
          label="Target"
          value={String(program.calories.kcal)}
          unit="kcal/day"
          hint={
            program.calories.adjustmentKcal === 0
              ? 'maintenance'
              : `${program.calories.adjustmentKcal > 0 ? '+' : ''}${program.calories.adjustmentKcal} kcal`
          }
        />
      </View>

      <Card title="Energy">
        <View style={styles.legend}>
          <Key color={colors.positive} label="burning" />
          <Key color={colors.carbs} label="eaten" dotted />
          <Key color={colors.accent} label="target" dashed />
        </View>
        <LineChart
          series={energy ? [{ points: energy.expenditure, color: colors.positive, strokeWidth: 2.5 }] : []}
          band={energy ? { points: energy.band, color: colors.positive } : undefined}
          scatter={energy ? [{ points: energy.intake, color: colors.carbs, radius: 2.5, opacity: 0.8 }] : undefined}
          referenceY={{ value: program.calories.kcal, color: colors.accent }}
          formatX={dayLabel}
          emptyMessage="Log weight and food for a couple of weeks"
          height={190}
        />
        {/*
          The one chart that answers "why is my weight doing this". The gap
          between the dots and the line is the deficit, drawn rather than
          described.
        */}
      </Card>

      <Card title="Trend weight">
        <LineChart
          series={weight ? [{ points: weight, color: colors.accent, strokeWidth: 2.5 }] : []}
          includeY={settings.goalWeightKg === null ? [] : [displayWeight(settings.goalWeightKg, settings.units)]}
          referenceY={
            settings.goalWeightKg === null
              ? undefined
              : { value: displayWeight(settings.goalWeightKg, settings.units), color: colors.protein }
          }
          formatY={(value) => value.toFixed(weightDecimals)}
          formatX={dayLabel}
          emptyMessage="Weigh in for a couple of weeks"
          height={170}
        />
      </Card>

      <Card title="Progress">
        <View style={styles.tiles}>
          <StatTile
            label="Trend weight"
            value={latest ? formatWeight(latest.trendWeightKg, settings.units) : '—'}
          />
          <StatTile
            label="Actual rate"
            value={trend ? formatRate(trend.rateKgPerWeek, settings.units) : '—'}
            hint="last 14 days"
          />
        </View>
        {settings.goalWeightKg !== null && (
          <Text style={[styles.body, { color: colors.textMuted, marginTop: space.md }]}>
            {projection
              ? `At this rate you reach ${formatWeight(settings.goalWeightKg, settings.units)} around ${formatDateLong(projection)}.`
              : `Your trend is not moving toward ${formatWeight(settings.goalWeightKg, settings.units)}, so there is no date to project.`}
          </Text>
        )}
      </Card>

      {program.calories.clamps.length > 0 && (
        <Card title="Rate adjusted">
          {/* Trimmed to the part that changes what you do. The reasoning behind
              each cap was three sentences nobody needed twice. */}
          <Text style={[styles.body, { color: colors.textMuted }]}>
            {program.calories.clamps.includes('deficitCapped') && 'Deficit capped at 25%. '}
            {program.calories.clamps.includes('surplusCapped') && 'Surplus capped at 20%. '}
            {program.calories.clamps.includes('calorieFloor') && 'Hit the calorie floor. '}
            At {program.calories.kcal} kcal expect{' '}
            {formatRate(program.calories.achievableRateKgPerWeek, settings.units)}.
          </Text>
        </Card>
      )}

      <TrainingCrossReference series={series} />

      <Tappable onPress={() => setMethod(true)} scaleTo={0.98}>
        <View style={[styles.method, { borderColor: colors.border }]}>
          <Text style={[styles.methodLabel, { color: colors.textMuted }]}>
            Where this number comes from
          </Text>
          <Text style={{ color: colors.textFaint, fontFamily: font.ui }}>›</Text>
        </View>
      </Tappable>

      <MethodSheet open={method} onClose={() => setMethod(false)} />
      <Text style={[styles.unitNote, { color: colors.textFaint }]}>Weights in {unit}.</Text>
    </Screen>
  );
}

const Key = ({ color, label, dashed = false, dotted = false }: {
  color: string;
  label: string;
  dashed?: boolean;
  dotted?: boolean;
}) => (
  <View style={styles.key}>
    <View
      style={[
        dotted ? styles.keyDot : styles.keyLine,
        { backgroundColor: color, opacity: dashed ? 0.6 : 1 },
      ]}
    />
    <Text style={[styles.keyLabel, { color }]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: space.md, marginBottom: space.md },
  body: { fontFamily: font.ui, fontSize: 13, lineHeight: 19 },
  // A legend of three words, in place of the sentence that used to describe
  // the same three things above the chart.
  legend: { flexDirection: 'row', gap: space.md, marginBottom: space.sm },
  key: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  keyLine: { width: 14, height: 2, borderRadius: 1 },
  keyDot: { width: 6, height: 6, borderRadius: 3 },
  keyLabel: { fontFamily: font.uiStrong, fontSize: 11 },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  methodLabel: { fontFamily: font.uiStrong, fontSize: 13 },
  unitNote: { fontFamily: font.ui, fontSize: 11, textAlign: 'center', marginTop: space.md },
});
