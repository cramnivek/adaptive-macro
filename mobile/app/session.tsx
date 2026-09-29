import { todayISO } from '@adaptive-macros/engine';
import type { SetType } from '@adaptive-macros/engine';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
import { Button, Field, Segmented, TOUCH_TARGET } from '../src/components/Controls';
import { Screen } from '../src/components/Screen';
import {
  activeSession,
  addSetToSession,
  deleteSet,
  discardSession,
  finishSession,
  lastWorkingSet,
  listExerciseNames,
  listRoutines,
  startSession,
} from '../src/db';
import type { ActiveSession, LoggedSet, Routine } from '../src/db';
import { confirm, notify } from '../src/dialog';
import { displayWeight, formatDate, parseWeight, weightUnit } from '../src/format';
import { useApp } from '../src/state/AppStore';
import { radius, space, useTheme } from '../src/theme';

const SET_TYPES: { value: SetType; label: string }[] = [
  { value: 'normal', label: 'Working' },
  { value: 'warmup', label: 'Warmup' },
  { value: 'failure', label: 'Failure' },
];

/**
 * Logging a session at the rack.
 *
 * Starts blank and collects sets. A session is not bound to any plan: exercises
 * are added as they are done, and dropped by simply not adding to them.
 *
 * Finishing stamps the end time. Leaving without finishing keeps the session
 * open and resumable, because walking out of the gym without tapping a button
 * is normal and neither discarding the sets nor inventing an end time is a
 * reasonable thing to do to someone's training log.
 */
export default function SessionScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { settings } = useApp();
  const unit = weightUnit(settings.units);

  const [session, setSession] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [known, setKnown] = useState<{ name: string; bodyweightBased: boolean }[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  // The routine this session started from, kept only as a running order to
  // work through. A session is never bound to it: exercises are added or
  // dropped freely, and the plan is a suggestion the whole time.
  const [plan, setPlan] = useState<string[]>([]);

  const [exercise, setExercise] = useState('');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [setType, setSetType] = useState<SetType>('normal');
  const [lastHint, setLastHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      setSession(await activeSession());
      setKnown(await listExerciseNames());
      setRoutines(await listRoutines());
      setLoading(false);
    })();
  }, []);

  // The question at the rack is what happened last time, so answer it as soon
  // as the exercise is known rather than making anyone go and look.
  //
  // The fields are replaced, not merely filled when empty. Filling only empties
  // left the previous exercise's numbers in place when switching, so the next
  // "Add set" silently logged a lateral raise at the bench press weight.
  // Consecutive sets of the *same* exercise deliberately keep what is typed,
  // since straight sets repeat, so this runs on a change of exercise only.
  useEffect(() => {
    const name = exercise.trim();
    if (!name) {
      setLastHint(null);
      setWeight('');
      setReps('');
      return;
    }

    let current = true;
    void lastWorkingSet(name).then((last) => {
      // A slower lookup for an exercise since typed over must not overwrite
      // the newer one's values.
      if (!current) return;

      if (!last) {
        setLastHint(null);
        setWeight('');
        setReps('');
        return;
      }
      const shown =
        last.weightKg === null
          ? `${last.reps} reps`
          : `${displayWeight(last.weightKg, settings.units).toFixed(1)} ${unit} × ${last.reps}`;
      setLastHint(`Last time: ${shown} on ${formatDate(last.date)}`);
      setWeight(
        last.weightKg === null
          ? ''
          : String(displayWeight(last.weightKg, settings.units).toFixed(1)),
      );
      setReps(String(last.reps));
    });

    return () => {
      current = false;
    };
  }, [exercise, settings.units, unit]);

  const byExercise = useMemo(() => {
    const groups: { name: string; sets: LoggedSet[] }[] = [];
    for (const set of session?.sets ?? []) {
      const found = groups.find((g) => g.name === set.exerciseName);
      if (found) found.sets.push(set);
      else groups.push({ name: set.exerciseName, sets: [set] });
    }
    return groups;
  }, [session]);

  const begin = async (routine?: Routine) => {
    setBusy(true);
    try {
      setSession(await startSession(routine?.name ?? 'Workout', todayISO()));
      setPlan(routine?.exercises.map((e) => e.name) ?? []);
      if (routine?.exercises.length) setExercise(routine.exercises[0].name);
    } catch (error) {
      notify('Could not start the session', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addSet = async () => {
    if (!session) return;
    const name = exercise.trim();
    const repCount = Number(reps);

    if (!name) return notify('Which exercise?', 'Enter an exercise name first.');
    if (!Number.isFinite(repCount) || repCount <= 0) {
      return notify('How many reps?', 'Reps must be a number above zero.');
    }

    // Blank weight is recorded as "not recorded", never as zero: a pull-up and
    // a bench press with a forgotten number are different, and scoring the
    // second as 0 kg would drag a real progression line down.
    const kg = weight.trim() ? parseWeight(weight, settings.units) : null;
    if (weight.trim() && kg === null) {
      return notify('That weight did not parse', `Enter a number in ${unit}, or leave it blank.`);
    }

    const bodyweightBased =
      known.find((e) => e.name === name)?.bodyweightBased ?? kg === null;

    setBusy(true);
    try {
      // One past the highest index in use, not the count: deleting a middle set
      // makes the count collide with an index that already exists, and
      // lastWorkingSet's `set_index DESC` tiebreak then picks arbitrarily.
      const used = session.sets.filter((s) => s.exerciseName === name);
      const index = used.reduce((max, s) => Math.max(max, s.setIndex + 1), 0);
      await addSetToSession(session.id, {
        exerciseName: name,
        bodyweightBased,
        setIndex: index,
        weightKg: kg,
        reps: repCount,
        setType,
        rpe: null,
      });
      setSession(await activeSession());
      setKnown(await listExerciseNames());
    } catch (error) {
      notify('Could not save that set', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeSet = async (id: string) => {
    setBusy(true);
    try {
      await deleteSet(id);
      setSession(await activeSession());
    } catch (error) {
      notify('Could not remove that set', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!session) return;

    if (session.sets.length === 0) {
      const sure = await confirm({
        title: 'Nothing logged',
        message: 'This session has no sets. Discard it?',
        confirmLabel: 'Discard',
        destructive: true,
      });
      if (!sure) return;
      await discardSession(session.id);
      router.back();
      return;
    }

    setBusy(true);
    try {
      await finishSession(session.id);
      notify('Session finished', `${session.sets.length} sets logged.`);
      router.back();
    } catch (error) {
      notify('Could not finish the session', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Screen title="Workout">
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen title="Workout">
        <Card title="Start a session">
          <Text style={[styles.note, { color: colors.textFaint }]}>
            Add exercises as you do them. Each set prefills with what you lifted last time,
            so you can see what to beat without leaving this screen.
          </Text>
          <Button label={busy ? 'Starting…' : 'Start blank'} onPress={() => void begin()} disabled={busy} />
        </Card>

        {routines.length > 0 && (
          <Card title="Start from a routine">
            {routines.map((routine) => (
              <Pressable
                key={routine.id}
                onPress={() => void begin(routine)}
                style={[styles.setRow, { borderColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text }}>{routine.name}</Text>
                  <Text style={[styles.note, { color: colors.textFaint }]} numberOfLines={1}>
                    {routine.exercises.map((e) => e.name).join(' · ')}
                  </Text>
                </View>
              </Pressable>
            ))}
          </Card>
        )}
      </Screen>
    );
  }

  return (
    <Screen title="Workout">
      {plan.length > 0 && (
        <Card title="Running order">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {plan.map((name) => {
              const done = (session.sets ?? []).some((set) => set.exerciseName === name);
              return (
                <Pressable
                  key={name}
                  onPress={() => setExercise(name)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: done ? colors.surfaceRaised : colors.surface,
                      borderColor: done ? colors.positive : colors.border,
                    },
                  ]}
                >
                  <Text style={{ color: colors.text, fontSize: 13 }}>{name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={[styles.note, { color: colors.textFaint }]}>
            From the routine. Add or skip whatever you like — the session is not bound to it.
          </Text>
        </Card>
      )}

      <Card title="Add a set">
        <Field
          label="Exercise"
          value={exercise}
          onChangeText={setExercise}
          placeholder="Bench Press (Barbell)"
          hint={lastHint ?? 'Names match exactly, so reuse one below to keep the history joined up.'}
        />

        {known.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
            {known.slice(0, 20).map((item) => (
              <Pressable
                key={item.name}
                onPress={() => setExercise(item.name)}
                style={[
                  styles.chip,
                  { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
                ]}
              >
                <Text style={{ color: colors.text, fontSize: 13 }}>{item.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={styles.row}>
          <View style={styles.half}>
            <Field
              label={`Weight (${unit})`}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              placeholder="blank for bodyweight"
            />
          </View>
          <View style={styles.half}>
            <Field label="Reps" value={reps} onChangeText={setReps} keyboardType="number-pad" />
          </View>
        </View>

        <Segmented<SetType>
          label="Type"
          options={SET_TYPES}
          value={setType}
          onChange={setSetType}
        />

        <Button label={busy ? 'Saving…' : 'Add set'} onPress={addSet} disabled={busy} />
      </Card>

      {byExercise.map((group) => (
        <Card key={group.name} title={group.name}>
          {group.sets.map((set, index) => (
            <Pressable
              key={set.id}
              onLongPress={() => void removeSet(set.id)}
              style={[styles.setRow, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.textFaint, width: 28 }}>{index + 1}</Text>
              <Text style={{ color: colors.text, flex: 1 }}>
                {set.weightKg === null
                  ? 'bodyweight'
                  : `${displayWeight(set.weightKg, settings.units).toFixed(1)} ${unit}`}
                {' × '}
                {set.reps}
              </Text>
              {set.setType !== 'normal' && (
                <Text style={{ color: colors.warning, fontSize: 12 }}>{set.setType}</Text>
              )}
            </Pressable>
          ))}
          <Text style={[styles.note, { color: colors.textFaint }]}>
            Long-press a set to remove it.
          </Text>
        </Card>
      ))}

      <Button
        label={session.sets.length ? `Finish (${session.sets.length} sets)` : 'Finish'}
        onPress={finish}
        disabled={busy}
      />
      <Text style={[styles.note, { color: colors.textFaint }]}>
        Started {formatDate(session.date)}. Leaving without finishing keeps this session open —
        it will still be here when you come back.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, lineHeight: 17, marginTop: 6 },
  row: { flexDirection: 'row', gap: space.sm },
  half: { flex: 1 },
  chips: { marginBottom: space.sm },
  chip: {
    minHeight: TOUCH_TARGET - 14,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    marginRight: space.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: TOUCH_TARGET,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
