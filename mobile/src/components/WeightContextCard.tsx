import { addDays } from '@adaptive-macros/engine';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { listLogEntriesBetween } from '../db';
import { formatDayMonth, formatWeight } from '../format';
import { dailySodiumObservations, weightContext, type WeightContext } from '../health/weightContext';
import { useApp } from '../state/AppStore';
import { font, space, useTheme } from '../theme';
import { Card } from './Card';

export const WeightContextCard = () => {
  const { colors } = useTheme();
  const { ready, selectedDate, weights, dayStatus, observations, settings } = useApp();
  const [loaded, setLoaded] = useState<{
    date: string;
    weights: typeof weights;
    dayStatus: typeof dayStatus;
    observations: typeof observations;
    context: WeightContext | null;
  } | null>(null);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    void listLogEntriesBetween(addDays(selectedDate, -7), addDays(selectedDate, -1))
      .then((entries) => {
        if (alive) setLoaded({
          date: selectedDate, weights, dayStatus, observations,
          context: weightContext(selectedDate, weights, dailySodiumObservations(entries, dayStatus)),
        });
      })
      // Unavailable evidence must not leave a previous day's explanation on screen.
      .catch(() => { if (alive) setLoaded(null); });
    return () => { alive = false; };
  }, [ready, selectedDate, weights, dayStatus, observations]);

  if (!ready || !loaded || loaded.date !== selectedDate || loaded.weights !== weights ||
      loaded.dayStatus !== dayStatus || loaded.observations !== observations || !loaded.context) return null;
  const context = loaded.context;

  return (
    <Card title="Weight context">
      <View style={styles.body}>
        <Text selectable style={[styles.text, { color: colors.text }]}>
          {formatDayMonth(context.date)}: {formatWeight(context.weightKg, settings.units)}, up from{' '}
          {formatWeight(context.previousWeightKg, settings.units)} on {formatDayMonth(context.previousDate)}.
          {' '}{formatDayMonth(context.sodiumDate)} had {Math.round(context.sodiumMg).toLocaleString()} mg logged sodium;
          {' '}your recent complete-day median was {Math.round(context.baselineSodiumMg).toLocaleString()} mg
          {' '}across {context.baselineDates.length} complete days.
        </Text>
        <Text style={[styles.text, { color: colors.textMuted }]}>
          Higher sodium may contribute to water retention. These observations cannot identify the cause
          of the weight change or measure fat versus water.
        </Text>
        <Text style={[styles.note, { color: colors.textMuted }]}>
          Based on complete food logs with sodium values. Those values may include estimates.
        </Text>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  body: { gap: space.sm },
  text: { fontFamily: font.ui, fontSize: 13, lineHeight: 19 },
  note: { fontFamily: font.ui, fontSize: 11, lineHeight: 16 },
});
