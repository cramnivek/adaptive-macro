import { diffDays, projectedDate, todayISO } from '@adaptive-macros/engine';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { LineChart } from '../../src/components/LineChart';
import { Screen } from '../../src/components/Screen';
import { StatTile } from '../../src/components/StatTile';
import { formatDateLong, formatRate, formatWeight } from '../../src/format';
import { useApp } from '../../src/state/AppStore';
import { space, useTheme } from '../../src/theme';

const CONFIDENCE_COPY = {
  insufficient: 'Not enough data yet — still leaning on the formula estimate.',
  low: 'Rough. Keep logging; it tightens quickly.',
  moderate: 'Usable. Good enough to set targets from.',
  high: 'Solid. This is measured from your own data.',
} as const;

const CONFIDENCE_TONE = {
  insufficient: 'danger',
  low: 'warning',
  moderate: 'default',
  high: 'positive',
} as const;

export default function TrendsScreen() {
  const { colors } = useTheme();
  const { settings, series, latest, trend, program, confidence } = useApp();

  // The chart shows the last 90 days: far enough back to see a real shift in
  // expenditure, recent enough that the early wide-uncertainty warm-up does not
  // flatten the scale for everything after it.
  const chart = useMemo(() => {
    if (series.length < 2) return null;
    const window = series.slice(-90);
    const origin = window[0].date;
    return {
      origin,
      line: window.map((point) => ({
        x: diffDays(origin, point.date),
        y: point.expenditureKcal,
      })),
      band: window.map((point) => ({
        x: diffDays(origin, point.date),
        lo: point.expenditureKcal - point.expenditureSdKcal,
        hi: point.expenditureKcal + point.expenditureSdKcal,
      })),
    };
  }, [series]);

  const projection = useMemo(() => {
    if (!latest || !trend || settings.goalWeightKg === null) return null;
    return projectedDate(todayISO(), latest.trendWeightKg, settings.goalWeightKg, trend.rateKgPerWeek);
  }, [latest, trend, settings.goalWeightKg]);

  return (
    <Screen title="Trends" subtitle="What your data says your body is actually burning">
      <View style={styles.tiles}>
        <StatTile
          label="Expenditure"
          value={latest ? String(Math.round(latest.expenditureKcal)) : '—'}
          unit="kcal/day"
          hint={latest ? `±${Math.round(latest.expenditureSdKcal)} kcal` : 'No estimate yet'}
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

      <Card title="Estimate confidence" subtitle={CONFIDENCE_COPY[confidence]}>
        <StatTile
          label="Uncertainty"
          value={latest ? `±${Math.round(latest.expenditureSdKcal)}` : '—'}
          unit="kcal"
          tone={CONFIDENCE_TONE[confidence]}
        />
      </Card>

      <Card
        title="Expenditure over time"
        subtitle="Shaded band is the estimate's uncertainty; dashed line is your current target"
      >
        <LineChart
          series={chart ? [{ points: chart.line, color: colors.positive, strokeWidth: 2.5 }] : []}
          band={chart ? { points: chart.band, color: colors.positive } : undefined}
          referenceY={{ value: program.calories.kcal, color: colors.accent, label: 'target' }}
          formatY={(value) => String(Math.round(value))}
          emptyMessage="Log weight and food for a couple of weeks"
          height={200}
        />
      </Card>

      {program.calories.clamps.length > 0 && (
        <Card title="Your goal rate was adjusted">
          <Text style={[styles.body, { color: colors.textMuted }]}>
            {program.calories.clamps.includes('deficitCapped') &&
              'The requested rate needed a deficit larger than 25% of your expenditure, which is hard to hold and costs lean mass. '}
            {program.calories.clamps.includes('surplusCapped') &&
              'The requested rate needed a surplus larger than 20% of your expenditure, most of which would be fat. '}
            {program.calories.clamps.includes('calorieFloor') &&
              'The target hit the minimum calorie floor. '}
            At {program.calories.kcal} kcal you should actually see{' '}
            {formatRate(program.calories.achievableRateKgPerWeek, settings.units)}.
          </Text>
        </Card>
      )}

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
              ? `At your current rate you reach ${formatWeight(settings.goalWeightKg, settings.units)} around ${formatDateLong(projection)}.`
              : `Your trend is not currently moving toward ${formatWeight(settings.goalWeightKg, settings.units)}, so there is no date to project.`}
          </Text>
        )}
      </Card>

      <Card title="How this number is worked out">
        <Text style={[styles.body, { color: colors.textMuted }]}>
          There is only one equation linking expenditure to anything you can measure:{'\n\n'}
          weight change = (intake − expenditure) ÷ 7700 kcal per kg{'\n\n'}
          Expenditure is the unknown. A Kalman filter tracks it alongside your true trend weight, moving it to
          whatever value keeps explaining what your scale actually did. Day-to-day water and gut-content swings
          are treated as measurement noise, so only changes that persist move the trend.{'\n\n'}
          It adapts on its own — metabolic adaptation, activity drifting down in a deficit, a new training
          block all show up without being modelled by name.{'\n\n'}
          The catch: it believes your food log. Consistent under-reporting looks exactly like a lower
          expenditure, and the estimate will follow it down.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: space.md, marginBottom: space.md },
  body: { fontSize: 13, lineHeight: 19 },
});
