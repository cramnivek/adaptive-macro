import { bodyweightForDates, progressionFor, recordsInSession } from '@adaptive-macros/engine';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { Button, TOUCH_TARGET } from '../../src/components/Controls';
import { LoadProblem } from '../../src/components/LoadProblem';
import { PRMedal } from '../../src/components/PRMedal';
import { Screen } from '../../src/components/Screen';
import { problemText } from '../../src/loadProblem';
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
import type { UnitSystem } from '../../src/state/settings';
import { useApp } from '../../src/state/AppStore';
import { PlateSheet } from '../../src/components/PlateSheet';
import { thud } from '../../src/platform/haptics';
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
  const { series, settings, updateSettings } = useApp();
  const workoutUnits: UnitSystem = settings.workoutUnits ?? settings.units ?? 'metric';
  const unit = weightUnit(workoutUnits);

  const [open, setOpen] = useState<ActiveSession | null>(null);
  const [recent, setRecent] = useState<{ id: string; name: string; date: string; exercises: string[] }[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [sets, setSets] = useState<Awaited<ReturnType<typeof listAllSets>>>([]);
  const [top, setTop] = useState<{ name: string; setCount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  /** Why the last load failed, shown instead of a spinner that would never clear. */
  const [problem, setProblem] = useState<string | null>(null);
  /** Bumped by Try again, to rerun the load without leaving the tab. */
  const [attempt, setAttempt] = useState(0);
  const [plateModalOpen, setPlateModalOpen] = useState(false);
  const [plateWeight, setPlateWeight] = useState<number>(workoutUnits === 'metric' ? 60 : 135);

  // Reloaded on focus rather than on mount: coming back from finishing a
  // session must not leave a stale "in progress" card on screen.
  useFocusEffect(
    useCallback(() => {
      let current = true;
      void (async () => {
        try {
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
          setProblem(null);
          setLoading(false);
        } catch (error) {
          if (current) setProblem(problemText(error));
        }
      })();
      return () => {
        current = false;
      };
    }, [attempt]),
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
        // A record by the medal's rule (estimated 1RM, against the days before),
        // not by heaviest weight, so this card and the workout's own medal never
        // disagree about whether that session set one.
        const sessionIds = last
          ? new Set(
              sets
                .filter((s) => s.set.exerciseName === exercise.name && s.date === last.date)
                .map((s) => s.set.sessionId),
            )
          : new Set<string>();
        const isRecord = [...sessionIds].some((id) =>
          recordsInSession(sets, bodyweightByDate, id).some((r) => r.exerciseName === exercise.name),
        );
        return { name: exercise.name, last, isRecord };
      }),
    [top, sets, bodyweightByDate],
  );

  const totalSets = sets.length;

  if (loading) {
    return (
      <Screen title="Train" tone="loud">
        {problem !== null ? (
          <LoadProblem tone="loud" message={problem} onRetry={() => setAttempt((n) => n + 1)} />
        ) : (
          <ActivityIndicator color={loud.loud} />
        )}
      </Screen>
    );
  }

  return (
    <Screen title="Train" tone="loud">
      {open ? (
        <Card loud variant="featured" icon="barbell-outline" title="Session in progress" subtitle={`Started ${formatDate(open.date)}`}>
          <Text style={[styles.note, { color: loud.figureFaint, marginBottom: space.md }]}>
            {open.sets.length} {open.sets.length === 1 ? 'set' : 'sets'} logged so far.
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
          icon="barbell-outline"
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
        <Card loud title="Where you are" subtitle={`${totalSets} ${totalSets === 1 ? 'set' : 'sets'} on record`}>
          <View style={styles.listStack}>
            {headline.map(({ name, last, isRecord }) => (
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
                      ? `${displayWeight(last.heaviestWorkingSetKg, workoutUnits).toFixed(1)} ${unit} · ${formatDate(last.date)}`
                      : 'nothing scoreable yet'}
                  </Text>
                </View>
                {isRecord && <PRMedal />}
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
        <Card loud title="Recent sessions">
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
            A routine is a named list of exercises in the order you do them. Tell the app your
            days and equipment and it builds them for you, or make your own.
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
          label={routines.length ? 'Manage routines' : 'Set up routines'}
          variant="subtle"
          onPress={() => router.push('/routines')}
        />
      </Card>

      {/* Gym Floor Tools */}
      <Card loud title="Gym floor tools">
        <Tappable
          onPress={() => {
            thud('light');
            setPlateWeight(workoutUnits === 'metric' ? 60 : 135);
            setPlateModalOpen(true);
          }}
          style={[styles.toolCard, { backgroundColor: loud.ground, borderColor: loud.rule }]}
          scaleTo={0.98}
          accessibilityRole="button"
          accessibilityLabel="Open Barbell Plate Calculator"
        >
          <View style={[styles.toolIconCircle, { backgroundColor: loud.loud + '22' }]}>
            <Ionicons name="barbell" size={20} color={loud.loud} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.uiStrong, color: loud.figure, fontSize: 14 }}>
              Barbell Plate Calculator
            </Text>
            <Text style={[styles.note, { color: loud.figureFaint, marginTop: 2 }]}>
              Visual rack breakdown with Olympic competition plate colors
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={loud.figureFaint} />
        </Tappable>
      </Card>

      {totalSets === 0 && (
        <Card loud title="Bringing history over">
          <Text style={[styles.note, { color: loud.figureFaint }]}>
            Already training elsewhere? Settings → Your data imports a Hevy export, so your
            progression starts full rather than empty.
          </Text>
        </Card>
      )}

      <PlateSheet
        open={plateModalOpen}
        weight={plateWeight}
        units={workoutUnits}
        bar={settings.barbell}
        customPlates={settings.customPlates?.[workoutUnits] ?? []}
        onBarChange={(bar) => void updateSettings({ barbell: bar })}
        onAddCustomPlate={async (plate) => {
          const current = settings.customPlates?.[workoutUnits] ?? [];
          if (current.includes(plate)) return;
          const updated = [...current, plate].sort((a, b) => b - a);
          await updateSettings({
            customPlates: { ...settings.customPlates, [workoutUnits]: updated },
          });
        }}
        onRemoveCustomPlate={async (plate) => {
          const current = settings.customPlates?.[workoutUnits] ?? [];
          const updated = current.filter((p) => p !== plate);
          await updateSettings({
            customPlates: { ...settings.customPlates, [workoutUnits]: updated },
          });
        }}
        onClose={() => setPlateModalOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toolIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
});
