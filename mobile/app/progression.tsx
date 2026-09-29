import { bodyweightForDates, diffDays, progressionFor } from '@adaptive-macros/engine';
import type { DatedSet, ProgressionPoint } from '@adaptive-macros/engine';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
import { LineChart } from '../src/components/LineChart';
import { Screen } from '../src/components/Screen';
import { StatTile } from '../src/components/StatTile';
import { TOUCH_TARGET } from '../src/components/Controls';
import { listSetsForExercise, listTrainedExercises } from '../src/db';
import { displayWeight, formatDate, weightUnit } from '../src/format';
import { useApp } from '../src/state/AppStore';
import { radius, space, useTheme } from '../src/theme';

type TrainedExercise = { name: string; bodyweightBased: boolean; setCount: number };

const shiftDate = (origin: string, offsetDays: number): string =>
  new Date(new Date(`${origin}T00:00:00Z`).getTime() + Math.round(offsetDays) * 86_400_000)
    .toISOString()
    .slice(0, 10);

/**
 * Whether the weight on the bar is going up.
 *
 * Heaviest working set and working volume, per session, on effective load —
 * so bodyweight work is on the same footing as everything else instead of
 * reading as a flat zero line.
 *
 * The two are drawn as separate charts rather than two series on one. Volume
 * is an order of magnitude larger than load, and putting them on a shared axis
 * would either flatten the load line into the floor or need a second,
 * unlabelled scale — which is a lie about what the lines mean.
 */
export default function ProgressionScreen() {
  const { colors } = useTheme();
  const { series, settings } = useApp();

  const [exercises, setExercises] = useState<TrainedExercise[] | null>(null);
  const [chosen, setChosen] = useState<TrainedExercise | null>(null);
  const [sets, setSets] = useState<DatedSet[] | null>(null);

  useEffect(() => {
    void listTrainedExercises().then((loaded) => {
      setExercises(loaded);
      // Most-trained first, so the default is the one most likely wanted.
      setChosen((current) => current ?? loaded[0] ?? null);
    });
  }, []);

  useEffect(() => {
    if (!chosen) return;
    setSets(null);

    // A slower query for an exercise already switched away from must not land
    // and be drawn under the newer one's title and tiles.
    let current = true;
    void listSetsForExercise(chosen.name).then((loaded) => {
      if (current) setSets(loaded);
    });
    return () => {
      current = false;
    };
  }, [chosen]);

  // The wiring that makes a pull-up mean anything: the filter's own trend
  // weight for each date, which is the load the user actually moved.
  //
  // Extended past the measured range, because an imported history starts long
  // before the first weigh-in and every bodyweight set from that period would
  // otherwise score as nothing. What that assumed is shown below the chart.
  const bodyweightByDate = useMemo(
    () => bodyweightForDates(series, (sets ?? []).map((s) => s.date), { extend: true }),
    [series, sets],
  );

  const points: ProgressionPoint[] | null = useMemo(
    () => (sets ? progressionFor(sets, bodyweightByDate) : null),
    [sets, bodyweightByDate],
  );

  const chart = useMemo(() => {
    if (!points?.length) return null;
    const origin = points[0].date;
    return {
      origin,
      load: points.map((p) => ({ x: diffDays(origin, p.date), y: p.heaviestWorkingSetKg })),
      volume: points.map((p) => ({ x: diffDays(origin, p.date), y: p.workingVolumeKg })),
      records: points
        .filter((p) => p.isRecord)
        .map((p) => ({ x: diffDays(origin, p.date), y: p.heaviestWorkingSetKg })),
    };
  }, [points]);

  const unit = weightUnit(settings.units);
  const best = points?.length ? points[points.length - 1] : null;
  const heaviestEver = points?.reduce((max, p) => Math.max(max, p.heaviestWorkingSetKg), 0) ?? 0;

  return (
    <Screen title="Progression">
      {exercises === null && <ActivityIndicator color={colors.accent} />}

      {exercises?.length === 0 && (
        <Card title="Nothing logged yet">
          <Text style={[styles.note, { color: colors.textFaint }]}>
            Import your history from Hevy in Settings, or log a session, and this will show
            whether the weight on the bar is going up.
          </Text>
        </Card>
      )}

      {exercises && exercises.length > 0 && (
        <Card title="Exercise">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {exercises.map((exercise) => {
              const active = exercise.name === chosen?.name;
              return (
                <Pressable
                  key={exercise.name}
                  onPress={() => setChosen(exercise)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.accent : colors.surfaceRaised,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={{ color: active ? colors.onFill : colors.text, fontSize: 13 }}>
                    {exercise.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Card>
      )}

      {chosen && sets === null && <ActivityIndicator color={colors.accent} />}

      {/*
        Two different silences, told apart. "No sets" means nothing was ever
        logged; "sets but no points" means they were logged without a usable
        weight, which is a different problem with a different fix.
      */}
      {chosen && sets?.length === 0 && (
        <Card title={chosen.name}>
          <Text style={[styles.note, { color: colors.textFaint }]}>No sets recorded.</Text>
        </Card>
      )}

      {chosen && sets && sets.length > 0 && points?.length === 0 && (
        <Card title={chosen.name}>
          <Text style={[styles.note, { color: colors.textFaint }]}>
            {sets.length} sets are recorded, but none can be scored — they have no weight
            recorded, and this exercise is not marked as bodyweight. Re-run the Hevy import
            and correct the flag in its preview, or log a set with a weight.
          </Text>
        </Card>
      )}

      {chart && best && (
        <>
          <View style={styles.tiles}>
            <StatTile
              label="Heaviest set"
              value={displayWeight(heaviestEver, settings.units).toFixed(1)}
              unit={unit}
              hint="best working set"
            />
            <StatTile
              label="Last session"
              value={displayWeight(best.heaviestWorkingSetKg, settings.units).toFixed(1)}
              unit={unit}
              hint={formatDate(best.date)}
            />
          </View>

          <Card title="Heaviest working set">
            <LineChart
              series={[{ points: chart.load, color: colors.accent, strokeWidth: 2.5 }]}
              scatter={[{ points: chart.records, color: colors.positive, radius: 3.5 }]}
              formatY={(value) => displayWeight(value, settings.units).toFixed(0)}
              formatX={(value) => formatDate(shiftDate(chart.origin, value))}
            />
            <Text style={[styles.note, { color: colors.textFaint }]}>
              Marked points beat everything before them. Warmups are excluded; dropsets and
              sets to failure count.
            </Text>
            {chosen?.bodyweightBased && (
              <Text style={[styles.note, { color: colors.textFaint }]}>
                This is a bodyweight exercise, so the load is your weight trend on each date
                plus anything added. The line moves when your weight moves, not only when
                you get stronger.
              </Text>
            )}
            {chosen?.bodyweightBased && bodyweightByDate.extendedCount > 0 && (
              <Text style={[styles.note, { color: colors.warning }]}>
                {bodyweightByDate.extendedCount} of these sessions fall outside the range your
                weight was tracked over, so they assume your nearest recorded weight. Those
                points show real reps against an assumed load — log weights covering that
                period to replace the assumption with a measurement.
              </Text>
            )}
          </Card>

          <Card title="Working volume">
            <LineChart
              series={[{ points: chart.volume, color: colors.textMuted, strokeWidth: 2 }]}
              formatY={(value) => `${Math.round(displayWeight(value, settings.units) / 1000)}k`}
              formatX={(value) => formatDate(shiftDate(chart.origin, value))}
            />
            <Text style={[styles.note, { color: colors.textFaint }]}>
              Load × reps across working sets, in {unit}. Shown separately because volume is
              far larger than the weight on the bar — on one axis the load line would flatten
              into the floor.
            </Text>
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, lineHeight: 17, marginTop: 6 },
  tiles: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  chip: {
    minHeight: TOUCH_TARGET - 12,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    marginRight: space.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
