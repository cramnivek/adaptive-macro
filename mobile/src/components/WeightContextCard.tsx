import { addDays, type ISODate } from '@adaptive-macros/engine';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { listLogEntriesBetween } from '../db';
import { formatDayMonth, formatWeight } from '../format';
import { dailySodiumObservations, sodiumCoverage, weeklyWeightSummary, weightContext, type WeightContext } from '../health/weightContext';
import { useApp } from '../state/AppStore';
import { font, space, useTheme } from '../theme';
import { Card } from './Card';
import { Button } from './Controls';

export const WeightContextCard = ({ date }: { date?: ISODate } = {}) => {
  const { colors } = useTheme();
  const { ready, selectedDate: diaryDate, weights, dayStatus, observations, settings } = useApp();
  const selectedDate = date ?? diaryDate;
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
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
      : coverage.status === 'incomplete' ? `The meal log for ${formatDayMonth(addDays(selectedDate, -1))} is unfinished. Log all meals and mark the day complete to compare its salt intake.`
        : coverage.status === 'unknown-sodium' ? 'Some foods are missing salt information, so the daily total would be incomplete.'
          : coverage.status === 'baseline' ? `We have ${coverage.baselineDays} complete days to compare. Three are needed to see what is usual for you.`
            : !weights.some((row) => row.date === selectedDate) ? 'Add a weigh-in for this day to compare it with the food log.'
              : 'These food and weight records do not show a clear link between salt and this weigh-in.';

  return (
    <Card title="Your weekly weight">
      <View style={styles.body}>
        <Text selectable style={[styles.average, { color: colors.text }]}>
          {week.current ? formatWeight(week.current.kg, settings.units) : 'No weigh-ins this week'}
        </Text>
        <Text style={[styles.text, { color: colors.textMuted }]}>
          {week.current?.readings ?? 0} weigh-ins in the last 7 days · average ending {formatDayMonth(selectedDate)}
        </Text>
        {week.changeKg !== null ? (
          <Text style={[styles.text, { color: colors.text }]}>
            {formatWeight(Math.abs(week.changeKg), settings.units) === formatWeight(0, settings.units)
              ? 'About the same as the previous week’s average.'
              : `${formatWeight(Math.abs(week.changeKg), settings.units)} ${week.changeKg < 0 ? 'lower' : 'higher'} than the previous week’s average.`}
          </Text>
        ) : (
          <Text style={[styles.note, { color: colors.textMuted }]}>Keep a few regular weigh-ins each week to see how your average changes.</Text>
        )}
        {!context && <><Text style={[styles.label, { color: colors.text }]}>Judge the week, not one weigh-in</Text>
        <Text style={[styles.text, { color: colors.text }]}>
          Weigh under similar conditions, such as after waking and using the bathroom. Use several weeks of averages to judge progress before changing your plan.
        </Text></>}
        {context && <>
          <Text style={[styles.label, { color: colors.text }]}>Saltier food may be affecting this weigh-in</Text>
          <Text style={[styles.text, { color: colors.textMuted }]}>
            Your {formatDayMonth(context.date)} weigh-in was {formatWeight(context.weightKg, settings.units)}, up from {formatWeight(context.previousWeightKg, settings.units)}. Extra salt can hold water and may be part of this rise.
          </Text>
          <Text style={[styles.text, { color: colors.text }]}>Watch your next few morning readings and your weekly average before cutting calories. One jump does not tell you how much is fat or water.</Text>
        </>}
        <Button label={expanded ? 'Hide weight details' : 'Weight & salt details'} variant="subtle" onPress={() => setExpanded((value) => !value)} />
        {expanded && <>
        <Text style={[styles.text, { color: colors.textMuted }]}>
          Meals, salt and fluid can move daily weight up or down. A higher reading does not tell you how much is fat or water.
        </Text>
        <Text style={[styles.note, { color: colors.textMuted }]}>This average includes {week.current?.readings ?? 0} readings; the preceding week includes {week.previous?.readings ?? 0}. Each needs at least three readings for a comparison. Missing days are left out.</Text>
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
        </>}
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
