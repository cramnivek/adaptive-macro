import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
import { Button, TOUCH_TARGET } from '../src/components/Controls';
import { EditSetSheet } from '../src/components/EditSetSheet';
import { FinishSheet } from '../src/components/FinishSheet';
import { Screen } from '../src/components/Screen';
import { Tappable } from '../src/components/Tappable';
import { SaveRoutineSheet } from '../src/components/SaveRoutineSheet';
import { deleteSet, discardSession, listRoutines, pastSession, sessionSets, updateSetValues } from '../src/db';
import type { LoggedSet } from '../src/db';
import { confirm } from '../src/dialog';
import { formatDateLong } from '../src/format';
import { detectCardio } from '../src/cardio';
import { groupByExercise, setLine } from '../src/pastWorkout';
import { shareSummary } from '../src/shareCard';
import { createPost } from '../src/social/api';
import { persistCustomCard } from '../src/social/customCard';
import { postPayload } from '../src/social/postPayload';
import type { FinishedWorkout } from '../src/social/postPayload';
import { useSocial } from '../src/social/session';
import { useApp } from '../src/state/AppStore';
import { font, radius, space } from '../src/theme';
import { session as loud } from '../src/theme/sessionTheme';

type Past = NonNullable<Awaited<ReturnType<typeof pastSession>>>;
interface Loaded {
  past: Past | null;
  sets: LoggedSet[];
}

/**
 * Whether a reload found the workout it already had: same session, same sets in the same order,
 * with the same figures. The figures are compared because a set can be corrected in place, keeping
 * its id, and a reload that called that unchanged would leave the old numbers on screen.
 */
const sameWorkout = (a: Loaded, b: Loaded): boolean =>
  a.past?.id === b.past?.id &&
  a.past?.name === b.past?.name &&
  a.past?.finishedAt === b.past?.finishedAt &&
  a.sets.length === b.sets.length &&
  a.sets.every((set, index) => {
    const other = b.sets[index];
    return (
      set.id === other?.id &&
      set.weightKg === other.weightKg &&
      set.reps === other.reps &&
      set.setType === other.setType &&
      set.rpe === other.rpe
    );
  });

/**
 * A finished workout, looked at again.
 *
 * The Train tab lists recent sessions, and this is where one opens: its sets as
 * they were logged, the card to share later, a post if it was not posted at the
 * time, and a way to delete one logged by mistake. It reads the same stored
 * session the logger wrote, so nothing here can disagree with the log.
 */
export default function WorkoutScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { settings } = useApp();
  const social = useSocial();

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  /** The share and post sheet is open. */
  const [sharing, setSharing] = useState(false);
  /** Sign-in is open over the sheet. */
  const [signingIn, setSigningIn] = useState(false);
  /** The set being corrected, or null when its sheet is closed. */
  const [editing, setEditing] = useState<LoggedSet | null>(null);
  // Back from sign-in (or profile setup), the sheet comes back with its caption.
  useFocusEffect(useCallback(() => setSigningIn(false), []));
  /** The save-as-routine sheet is open, and whether this workout has been saved as one. */
  const [savingRoutine, setSavingRoutine] = useState(false);
  const [routineSaved, setRoutineSaved] = useState(false);
  const [routineNames, setRoutineNames] = useState<string[]>([]);
  useFocusEffect(
    useCallback(() => {
      void listRoutines().then((all) => setRoutineNames(all.map((r) => r.name)));
    }, []),
  );

  const load = useCallback(async (): Promise<Loaded> => {
    const past = id ? await pastSession(id) : null;
    const sets = past ? await sessionSets(past.id) : [];
    return { past, sets };
  }, [id]);

  // The same workout comes back as the same objects. Returning from sign-in reloads on
  // focus, and a fresh summary would make the finish sheet clear the caption typed so far.
  const keep = (next: Loaded) =>
    setLoaded((before) => (before !== null && sameWorkout(before, next) ? before : next));

  useFocusEffect(
    useCallback(() => {
      let current = true;
      void load().then((next) => {
        if (current) keep(next);
      });
      return () => {
        current = false;
      };
    }, [load]),
  );

  const past = loaded?.past ?? null;
  const sets = loaded?.sets ?? [];

  const workout: FinishedWorkout | null = useMemo(
    () =>
      past === null
        ? null
        : {
            sessionId: past.id,
            title: past.name,
            date: past.date,
            startedAt: past.startedAt,
            finishedAt: new Date(past.finishedAt),
            sets,
            milestone: null,
          },
    [past, sets],
  );

  const summary = useMemo(
    () =>
      workout === null
        ? null
        : shareSummary({
            title: workout.title,
            date: workout.date,
            startedAt: workout.startedAt,
            finishedAt: workout.finishedAt,
            sets: workout.sets,
            units: settings.units,
            milestone: null,
          }),
    [workout, settings.units],
  );

  const groups = useMemo(() => groupByExercise(sets), [sets]);

  if (loaded === null) {
    return (
      <Screen tone="loud">
        <ActivityIndicator color={loud.loud} />
      </Screen>
    );
  }

  if (past === null || workout === null || summary === null) {
    return (
      <Screen tone="loud">
        <Text style={styles.note}>Workout not found.</Text>
      </Screen>
    );
  }

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete this workout?',
      message:
        'Its sets are removed from your log and your history. A post of it, if you made one, stays until you delete it from Your posts.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await discardSession(past.id);
    router.back();
  };

  return (
    <Screen tone="loud">
      <Card loud title={summary.title} subtitle={formatDateLong(past.date)}>
        <View style={styles.stats}>
          <Stat label="TIME" value={summary.duration} />
          {summary.sets > 0 ? (
            <Stat label="WORKING SETS" value={String(summary.sets)} />
          ) : summary.steps && summary.steps > 0 ? (
            <Stat label="STEPS" value={`~${summary.steps.toLocaleString()}`} />
          ) : null}
          {summary.volume !== null ? (
            <Stat label="VOLUME" value={summary.volume} />
          ) : summary.cardioDistanceKm && summary.cardioDistanceKm > 0 ? (
            <Stat label="DISTANCE" value={`${summary.cardioDistanceKm.toFixed(1)} km`} />
          ) : summary.sets > 0 && summary.steps && summary.steps > 0 ? (
            <Stat label="STEPS" value={`~${summary.steps.toLocaleString()}`} />
          ) : null}
        </View>
      </Card>

      {groups.map((group) => {
        const isCardio = group.sets.some((s) => s.isCardio) || detectCardio(group.name);
        return (
          <Card loud key={group.name} title={group.name}>
            {group.sets.map((set, index) => (
              <Tappable
                key={set.id}
                onPress={() => setEditing(set)}
                scaleTo={0.99}
                accessibilityRole="button"
                accessibilityLabel={
                  isCardio
                    ? `${group.name}, ${setLine(set, settings.units)}`
                    : `Edit set ${
                        set.setType === 'warmup'
                          ? 'warm-up'
                          : group.sets.slice(0, index + 1).filter((earlier) => earlier.setType !== 'warmup').length
                      }, ${setLine(set, settings.units)}`
                }
                style={[styles.row, { borderColor: loud.rule }]}
              >
                <Text style={[styles.number, set.setType === 'warmup' && { color: loud.warn }]}>
                  {/* Working sets are counted without the warm-ups before them, as the logger counts them. */}
                  {isCardio
                    ? '—'
                    : set.setType === 'warmup'
                    ? 'W'
                    : group.sets.slice(0, index + 1).filter((earlier) => earlier.setType !== 'warmup').length}
                </Text>
                <Text style={styles.line}>{setLine(set, settings.units)}</Text>
              </Tappable>
            ))}
          </Card>
        );
      })}

      {/* A post is a snapshot on the server; correcting a set here does not reach it. */}
      <Text style={styles.hint}>
        Tap any set to edit. Shared posts keep their original numbers.
      </Text>

      <Button tone="loud" label="Share workout card" onPress={() => setSharing(true)} />
      <Button
        tone="loud"
        variant="subtle"
        label={routineSaved ? 'Routine saved' : 'Save as routine'}
        disabled={routineSaved}
        onPress={() => setSavingRoutine(true)}
      />
      <Button tone="loud" variant="danger" label="Delete workout" onPress={() => void remove()} />

      <EditSetSheet
        set={editing}
        units={settings.units}
        isLastSet={sets.length === 1}
        onCancel={() => setEditing(null)}
        onSave={async (weightKg, reps) => {
          if (editing === null) return;
          await updateSetValues(editing.id, weightKg, reps);
          keep(await load());
          setEditing(null);
        }}
        onDelete={async () => {
          if (editing === null) return;
          // A finished workout with no sets would still list and still offer to be shared, so
          // taking out its only set takes the workout with it.
          if (sets.length === 1) {
            await discardSession(past.id);
            setEditing(null);
            router.back();
            return;
          }
          await deleteSet(editing.id);
          keep(await load());
          setEditing(null);
        }}
      />

      <FinishSheet
        summary={sharing ? summary : null}
        hidden={signingIn}
        account={
          !social.configured
            ? 'unavailable'
            : !social.session
              ? 'signed-out'
              : social.profile === null
                ? 'needs-profile'
                : 'ready'
        }
        postFirst={settings.postWorkouts}
        // Posting twice is safe: the server holds one post per author and session, so the second
        // is answered as already posted. The finish-time setting is left alone, because it records
        // what was chosen then, not what was done to an old workout.
        onPost={async (caption, customCard) => {
          await createPost(postPayload(workout, caption));
          if (customCard) {
            void persistCustomCard(workout.sessionId, customCard);
          }
        }}
        onNeedAccount={() => {
          setSigningIn(true);
          router.push(social.session ? '/profile-setup' : '/sign-in');
        }}
        onDone={() => setSharing(false)}
      />

      <SaveRoutineSheet
        visible={savingRoutine}
        initialName={past.name === 'Workout' ? '' : past.name}
        sets={sets}
        existingNames={routineNames}
        onCancel={() => setSavingRoutine(false)}
        onSaved={() => {
          setSavingRoutine(false);
          setRoutineSaved(true);
        }}
      />
    </Screen>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.stat}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 13, lineHeight: 18, color: loud.figureFaint },

  hint: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, color: loud.figureFaint },

  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stat: {
    flex: 1,
    minWidth: 92,
    backgroundColor: loud.panel,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  statLabel: { fontFamily: font.display, fontSize: 9, letterSpacing: 1.3, color: loud.figureFaint },
  statValue: {
    fontFamily: font.figure,
    fontSize: 20,
    letterSpacing: -0.5,
    color: loud.figure,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: TOUCH_TARGET - 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  number: {
    width: 24,
    fontFamily: font.display,
    fontSize: 13,
    color: loud.figureFaint,
    textAlign: 'center',
  },
  line: { flex: 1, fontFamily: font.uiStrong, fontSize: 15, color: loud.figure },
});
