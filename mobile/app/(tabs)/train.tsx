import { bodyweightForDates, progressionFor } from '@adaptive-macros/engine';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { Button, TOUCH_TARGET } from '../../src/components/Controls';
import { Screen } from '../../src/components/Screen';
import { Tappable } from '../../src/components/Tappable';
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
import { getEventCopy } from '../../src/copy/personality';

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
      {open ? (
        <Card loud variant="featured" title="Session in progress" subtitle={`Started ${formatDate(open.date)}`}>
          <Text style={[styles.note, { color: loud.figureFaint, marginBottom: space.md }]}>
            {open.sets.length} sets logged so far.
          </Text>
          <Button
            tone="loud"
            label={getEventCopy('workout.resume_btn', { personality: settings.personality, seed: open.id })}
            onPress={() => router.push('/session')}
          />
        </Card>
      ) : (
        <Card
          loud
          variant="featured"
          title={getEventCopy('workout.start_title', {
            personality: settings.personality,
            seed: routines.length,
          })}
        >
          {/* Each of these starts logging straight away. Routing to a screen
              that asks the same question again is the same tap twice. */}
          <Button
            tone="loud"
            label="Start empty workout"
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
        <Card loud variant="featured" title="Where you are" subtitle={`${totalSets} ${totalSets === 1 ? 'set' : 'sets'} on record`}>
          <View style={styles.listStack}>
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
                  <View style={styles.prBadge}>
                    <Text style={styles.prBadgeText}>NEW PR</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
          <Button
            tone="loud"
            label="See progression"
            variant="subtle"
            onPress={() => router.push('/progression')}
          />
        </Card>
      )}

      {recent.length > 0 && (
        <Card loud variant="featured" title="Recent sessions">
          <View style={styles.listStack}>
            {recent.slice(0, 5).map((session) => (
              <Tappable
                key={session.id}
                onPress={() => router.push(`/workout?id=${session.id}`)}
                scaleTo={0.99}
                style={[styles.row, { borderColor: loud.rule }]}
                accessibilityRole="button"
                accessibilityLabel={`Open ${session.name}, ${formatDate(session.date)}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: font.uiStrong, color: loud.figure }}>{session.name}</Text>
                  <Text style={[styles.note, { color: loud.figureFaint }]} numberOfLines={1}>
                    {formatDate(session.date)} · {session.exercises.join(', ')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={loud.figureFaint} />
              </Tappable>
            ))}
          </View>
          <Button
            tone="loud"
            label="All workouts"
            variant="subtle"
            onPress={() => router.push('/calendar')}
          />
        </Card>
      )}

      <Card loud variant="featured" title="Routines">
        {routines.length === 0 ? (
          <Text style={[styles.note, { color: loud.figureFaint, marginBottom: space.md }]}>
            A routine is a named list of exercises in the order you do them. You can build one
            from a session you have already done.
          </Text>
        ) : (
          <View style={styles.routineList}>
            {routines.map((routine) => (
              <Tappable
                key={routine.id}
                onPress={() => router.push(`/session?routine=${routine.id}`)}
                scaleTo={0.98}
                style={[styles.routineRow, { backgroundColor: loud.ground, borderColor: loud.rule }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: font.uiStrong, color: loud.figure, fontSize: 14 }}>
                    {routine.name}
                  </Text>
                  <Text style={[styles.note, { color: loud.figureFaint, marginTop: 2 }]}>
                    {routine.exercises.length} exercise{routine.exercises.length === 1 ? '' : 's'}
                  </Text>
                </View>
                <View style={[styles.routinePlayBtn, { backgroundColor: loud.loud }]}>
                  <Ionicons name="play" size={13} color={loud.onLoud} />
                </View>
              </Tappable>
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
  note: { fontFamily: font.ui, fontSize: 12, lineHeight: 17 },
  listStack: { gap: space.xs, marginBottom: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGET,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    backgroundColor: loud.ground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  prBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(232, 53, 42, 0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(232, 53, 42, 0.4)',
  },
  prBadgeText: {
    fontFamily: font.uiStrong,
    color: loud.loud,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  routineList: { gap: space.xs, marginBottom: space.md },
  routineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  routinePlayBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
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
