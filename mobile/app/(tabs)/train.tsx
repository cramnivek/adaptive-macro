import { bodyweightForDates, progressionFor } from '@adaptive-macros/engine';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { Button, TOUCH_TARGET } from '../../src/components/Controls';
import { Screen } from '../../src/components/Screen';
import {
  activeSession,
  listAllSets,
  listRoutines,
  listTrainedExercises,
  recentSessions,
} from '../../src/db';
import type { ActiveSession, Routine } from '../../src/db';
import { displayWeight, formatDate, weightUnit } from '../../src/format';
import { useApp } from '../../src/state/AppStore';
import { font, radius, space } from '../../src/theme';
import { session as loud } from '../../src/theme/sessionTheme';

/**
 * The training home.
 *
 * Logging a session is a daily action and belongs one tap from the tab bar.
 * It lived under Settings first, next to the Hevy import, which put the thing
 * done every session three taps behind the thing done once.
 *
 * The import stays in Settings, where a one-time migration belongs.
 */
export default function TrainScreen() {
  const router = useRouter();
  const { series, settings } = useApp();
  const unit = weightUnit(settings.units);

  const [open, setOpen] = useState<ActiveSession | null>(null);
  const [recent, setRecent] = useState<{ id: string; name: string; date: string; exercises: string[] }[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [sets, setSets] = useState<Awaited<ReturnType<typeof listAllSets>>>([]);
  const [top, setTop] = useState<{ name: string; setCount: number }[]>([]);
  const [loading, setLoading] = useState(true);

  // Reloaded on focus rather than on mount: coming back from finishing a
  // session must not leave a stale "in progress" card on screen.
  useFocusEffect(
    useCallback(() => {
      let current = true;
      void (async () => {
        const [session, sessions, loadedRoutines, allSets, trained] = await Promise.all([
          activeSession(),
          recentSessions(8),
          listRoutines(),
          listAllSets(),
          listTrainedExercises(),
        ]);
        if (!current) return;
        setOpen(session);
        setRecent(sessions);
        setRoutines(loadedRoutines);
        setSets(allSets);
        setTop(trained.slice(0, 3));
        setLoading(false);
      })();
      return () => {
        current = false;
      };
    }, []),
  );

  const bodyweightByDate = useMemo(
    () => bodyweightForDates(series, sets.map((s) => s.date), { extend: true }),
    [series, sets],
  );

  // Headline numbers for the three most-trained lifts: what the last session
  // did, and whether it was a record.
  const headline = useMemo(
    () =>
      top.map((exercise) => {
        const points = progressionFor(
          sets.filter((s) => s.set.exerciseName === exercise.name),
          bodyweightByDate,
        );
        const last = points[points.length - 1];
        return { name: exercise.name, last };
      }),
    [top, sets, bodyweightByDate],
  );

  const totalSets = sets.length;

  if (loading) {
    return (
      <Screen title="Train" tone="loud">
        <ActivityIndicator color={loud.loud} />
      </Screen>
    );
  }

  return (
    <Screen title="Train" tone="loud">
      <Button
        tone="loud"
        label="See what you have done"
        onPress={() => router.push('/overview')}
      />

      {open ? (
        <Card loud title="Session in progress" subtitle={`Started ${formatDate(open.date)}`}>
          <Text style={[styles.note, { color: loud.figureFaint }]}>
            {open.sets.length} sets logged so far.
          </Text>
          <Button tone="loud" label="Carry on" onPress={() => router.push('/session')} />
        </Card>
      ) : (
        <Card loud title="Log a workout">
          {/* Each of these starts logging straight away. Routing to a screen
              that asks the same question again is the same tap twice. */}
          <Button
            tone="loud"
            label="Start a session"
            onPress={() => router.push('/session?start=blank')}
          />
          {routines.map((routine) => (
            <Button
              tone="loud"
              key={routine.id}
              label={`Start ${routine.name}`}
              variant="subtle"
              onPress={() => router.push(`/session?routine=${routine.id}`)}
            />
          ))}
        </Card>
      )}

      {headline.length > 0 && (
        <Card loud title="Where you are" subtitle={`${totalSets} sets on record`}>
          {headline.map(({ name, last }) => (
            <Pressable
              key={name}
              onPress={() => router.push('/progression')}
              style={[styles.row, { borderColor: loud.rule }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.uiStrong, color: loud.figure }} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={[styles.note, { color: loud.figureFaint }]}>
                  {last
                    ? `${displayWeight(last.heaviestWorkingSetKg, settings.units).toFixed(1)} ${unit} · ${formatDate(last.date)}`
                    : 'nothing scoreable yet'}
                </Text>
              </View>
              {last?.isRecord && (
                <Text style={{ fontFamily: font.ui, color: loud.loud, fontSize: 12 }}>best yet</Text>
              )}
            </Pressable>
          ))}
          <Button
            tone="loud"
            label="See progression"
            variant="subtle"
            onPress={() => router.push('/progression')}
          />
        </Card>
      )}

      {recent.length > 0 && (
        <Card loud title="Recent sessions">
          {recent.slice(0, 5).map((session) => (
            <View key={session.id} style={[styles.row, { borderColor: loud.rule }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.uiStrong, color: loud.figure }}>{session.name}</Text>
                <Text style={[styles.note, { color: loud.figureFaint }]} numberOfLines={1}>
                  {formatDate(session.date)} · {session.exercises.join(', ')}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}

      <Card loud title="Routines">
        {routines.length === 0 ? (
          <Text style={[styles.note, { color: loud.figureFaint }]}>
            A routine is a named list of exercises in the order you do them. You can build one
            from a session you have already done.
          </Text>
        ) : (
          <View style={styles.chips}>
            {routines.map((routine) => (
              <View
                key={routine.id}
                style={[styles.chip, { backgroundColor: loud.panel, borderColor: loud.rule }]}
              >
                <Text style={{ fontFamily: font.ui, color: loud.figure, fontSize: 13 }}>{routine.name}</Text>
              </View>
            ))}
          </View>
        )}
        <Button
          tone="loud"
          label={routines.length ? 'Manage routines' : 'Create a routine'}
          variant="subtle"
          onPress={() => router.push('/routines')}
        />
      </Card>

      {totalSets === 0 && (
        <Card loud title="Bringing history over">
          <Text style={[styles.note, { color: loud.figureFaint }]}>
            Already training elsewhere? Settings → Your data imports a Hevy export, so your
            progression starts full rather than empty.
          </Text>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGET,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.xs,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.sm },
  chip: {
    minHeight: TOUCH_TARGET - 16,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
