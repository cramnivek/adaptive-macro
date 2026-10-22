import { addDays, type ISODate } from '@adaptive-macros/engine';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { listLogEntriesBetween } from '../db';
import { formatDayMonth, formatWeight } from '../format';
import { dailySodiumObservations, sodiumCoverage, weeklyWeightSummary, weightContext, type WeightContext } from '../health/weightContext';
import { useApp } from '../state/AppStore';
import { font, space, useTheme } from '../theme';
import { Card } from './Card';

export const WeightContextCard = ({ date }: { date?: ISODate } = {}) => {
  const { colors } = useTheme();
  const { ready, selectedDate: diaryDate, weights, dayStatus, observations, settings } = useApp();
  const selectedDate = date ?? diaryDate;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState<{
    date: string;
    weights: typeof weights;
    dayStatus: typeof dayStatus;
    observations: typeof observations;
    context: WeightContext | null;
    coverage: ReturnType<typeof sodiumCoverage>;
  } | null>(null);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setFailed(false);
    void listLogEntriesBetween(addDays(selectedDate, -7), addDays(selectedDate, -1))
      .then((entries) => {
        const sodium = dailySodiumObservations(entries, dayStatus);
        if (alive) setLoaded({
          date: selectedDate, weights, dayStatus, observations,
          context: weightContext(selectedDate, weights, sodium),
          coverage: sodiumCoverage(selectedDate, sodium),
        });
      })
      // Unavailable evidence must not leave a previous day's explanation on screen.
      .catch(() => { if (alive) { setLoaded(null); setFailed(true); } });
    return () => { alive = false; };
  }, [ready, selectedDate, weights, dayStatus, observations]);

  if (!ready) return null;
  const current = loaded?.date === selectedDate && loaded.weights === weights && loaded.dayStatus === dayStatus && loaded.observations === observations;
  const context = current ? loaded.context : null;
  const week = weeklyWeightSummary(selectedDate, weights);
  const coverage = current ? loaded.coverage : null;
  const sodiumMessage = failed ? 'Sodium records could not be loaded. Reopen this screen to try again.'
    : !coverage ? 'Loading sodium context…'
      : coverage.status === 'incomplete' ? `Finish logging ${formatDayMonth(addDays(selectedDate, -1))} and mark that day complete for a sodium comparison.`
        : coverage.status === 'unknown-sodium' ? 'Some foods in the previous day have no sodium value. Missing values cannot be counted as zero.'
          : coverage.status === 'baseline' ? `Building your sodium baseline: ${coverage.baselineDays} of 3 complete comparison days have sodium data.`
            : !weights.some((row) => row.date === selectedDate) ? 'Add a weigh-in for this day to compare it with the food log.'
              : 'No paired high-sodium and weight-rise signal in the available readings.';

  return (
    <Card title="Weight over the week">
      <View style={styles.body}>
        <Text selectable style={[styles.average, { color: colors.text }]}>
          {week.current ? formatWeight(week.current.kg, settings.units) : 'No weigh-ins this week'}
        </Text>
        <Text style={[styles.text, { color: colors.textMuted }]}>
          Seven-day average · {week.current?.readings ?? 0}/7 days recorded, ending {formatDayMonth(selectedDate)}
        </Text>
        {week.changeKg !== null ? (
          <Text style={[styles.text, { color: colors.text }]}>
            {formatWeight(Math.abs(week.changeKg), settings.units) === formatWeight(0, settings.units)
              ? 'About the same as the previous seven-day average'
              : `${formatWeight(Math.abs(week.changeKg), settings.units)} ${week.changeKg < 0 ? 'lower' : 'higher'} than the previous seven-day average`}
            {' '}({week.previous!.readings}/7 days recorded).
          </Text>
        ) : (
          <Text style={[styles.note, { color: colors.textMuted }]}>A week-to-week comparison needs at least three weigh-ins in each week. Missing days are left out.</Text>
        )}
        <Text style={[styles.text, { color: colors.textMuted }]}>
          Daily weight can go up or down with fluid and food. Focus on your weekly average and longer-term trend, rather than a single morning.
        </Text>
        <Text style={[styles.label, { color: colors.text }]}>Sodium context</Text>
        <Text style={[styles.text, { color: colors.textMuted }]}>
          Higher sodium may contribute to temporary water retention. Your food log cannot establish the cause of a weight change.
        </Text>
        {context ? <>
        <Text selectable style={[styles.text, { color: colors.text }]}>
          {formatDayMonth(context.date)}: {formatWeight(context.weightKg, settings.units)}, up from{' '}
          {formatWeight(context.previousWeightKg, settings.units)} on {formatDayMonth(context.previousDate)}.
          {' '}{formatDayMonth(context.sodiumDate)} had {Math.round(context.sodiumMg).toLocaleString()} mg logged sodium;
          {' '}your recent complete-day median was {Math.round(context.baselineSodiumMg).toLocaleString()} mg
          {' '}across {context.baselineDates.length} complete days.
        </Text>
        <Text style={[styles.text, { color: colors.textMuted }]}>
          These observations cannot measure fat versus water.
        </Text>
        <Text style={[styles.note, { color: colors.textMuted }]}>
          Based on complete food logs with sodium values. Those values may include estimates.
        </Text>
        </> : <Text style={[styles.text, { color: colors.textMuted }]}>{sodiumMessage}</Text>}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  body: { gap: space.sm },
  average: { fontFamily: font.figure, fontSize: 25 },
  label: { fontFamily: font.uiStrong, fontSize: 13, marginTop: space.sm },
  text: { fontFamily: font.ui, fontSize: 13, lineHeight: 19 },
  note: { fontFamily: font.ui, fontSize: 11, lineHeight: 16 },
});
