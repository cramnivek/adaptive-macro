import { useFocusEffect, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card } from '../src/components/Card';
import { Button, Field, TOUCH_TARGET } from '../src/components/Controls';
import { ExercisePicker } from '../src/components/ExercisePicker';
import { ReorderSheet } from '../src/components/ReorderSheet';
import { Tappable } from '../src/components/Tappable';
import { Screen } from '../src/components/Screen';
import { LoadProblem } from '../src/components/LoadProblem';
import { problemText } from '../src/loadProblem';
import {
  cataloguePatternsByExerciseName,
  createRoutine,
  deleteRoutine,
  listExerciseNames,
  listRoutines,
  loadAllCatalogueEntries,
  moveRoutine,
  recentSessions,
  setRoutineExercises,
} from '../src/db';
import type { Routine } from '../src/db';
import type { MovementPattern } from '../src/ai/exercises';
import { estimateMinutes } from '../src/ai/routineBuild';
import { warmCatalogueCache } from '../src/exerciseSearch';
import { confirm, notify } from '../src/dialog';
import { useApp } from '../src/state/AppStore';
import { formatDate } from '../src/format';
import { font, radius, space } from '../src/theme';
import { session as loud } from '../src/theme/sessionTheme';

type Draft = {
  name: string;
  bodyweightBased: boolean;
  targetSets: number;
  targetReps?: string | null;
  isCardio?: boolean;
  cardioMode?: 'treadmill' | 'outside' | null;
  targetTime?: string | null;
  targetDistance?: number | null;
  targetSpeed?: number | null;
  targetIncline?: number | null;
};

// The pill around it already shows focus; the browser's own box drew a
// second, square one inside it.
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {};

/** More than anyone programmes for one exercise; the stepper stops here. */
const MAX_SETS = 10;

/**
 * Routines: named, ordered exercise lists with a target set count each.
 *
 * A routine can also be built from a past session. After importing hundreds of
 * sessions, assembling "Push A" from a picker is tedious when the answer is
 * already in the history.
 */
export default function RoutinesScreen() {
  const router = useRouter();

  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [known, setKnown] = useState<{
    name: string;
    bodyweightBased: boolean;
    isCardio: boolean;
    cardioMode?: 'treadmill' | 'outside' | null;
  }[]>([]);
  const [past, setPast] = useState<{ id: string; name: string; date: string; exercises: string[] }[]>([]);

  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draft, setDraft] = useState<Draft[]>([]);
  // The same picker as a session: search the log and the catalogue, and look
  // up a name neither knows. A plain text box here saved whatever was typed,
  // misspellings included, as a new exercise with no how-to.
  const [picking, setPicking] = useState(false);
  const [pickerMode, setPickerMode] = useState<'exercise' | 'cardio'>('exercise');
  const [patterns, setPatterns] = useState<Record<string, MovementPattern>>({});
  const { settings } = useApp();
  const [busy, setBusy] = useState(false);
  /** The exercise the reorder sheet opened holding; null while it is shut. */
  const [reorderPick, setReorderPick] = useState<number | null>(null);
  const [reorderingList, setReorderingList] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save existing routines on every edit
  useEffect(() => {
    if (!editing || editing === 'new' || !draftName.trim() || draft.length === 0) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await setRoutineExercises(editing, draft);
        const existing = routines?.find((r) => r.id === editing);
        if (existing && existing.name !== draftName.trim()) {
          const { renameRoutine } = await import('../src/db');
          await renameRoutine(editing, draftName.trim());
        }
      } catch (err) {
        console.warn('Failed to auto-save routine:', err);
      }
    }, 400);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [editing, draftName, draft, routines]);

  /** Why the routines could not be read; shown in place of a spinner that would never clear. */
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setRoutines(await listRoutines());
      setProblem(null);
    } catch (error) {
      setProblem(problemText(error));
      return;
    }
    setKnown(await listExerciseNames());
    setPast(await recentSessions(15));
    setPatterns(await cataloguePatternsByExerciseName());
    void warmCatalogueCache(loadAllCatalogueEntries);
  };

  // On focus, so routines saved by the programme import show on return.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, []),
  );

  const startNew = (name: string, exercises: Draft[]) => {
    setEditing('new');
    setDraftName(name);
    setDraft(exercises);
  };

  const edit = (routine: Routine) => {
    setEditing(routine.id);
    setDraftName(routine.name);
    setDraft(
      routine.exercises.map((e) => ({
        name: e.name,
        bodyweightBased: e.bodyweightBased,
        targetSets: e.targetSets,
        targetReps: e.targetReps,
        isCardio: e.isCardio,
        cardioMode: e.cardioMode,
        targetTime: e.targetTime,
        targetDistance: e.targetDistance,
        targetSpeed: e.targetSpeed,
        targetIncline: e.targetIncline,
      })),
    );
  };

  const addToDraft = (
    name: string,
    catalogueBodyweight?: boolean,
    cardio?: { isCardio: boolean; mode: 'treadmill' | 'outside' },
  ) => {
    const trimmed = name.trim();
    setPicking(false);
    if (!trimmed) return;
    if (draft.some((d) => d.name === trimmed)) {
      return notify('Already in this routine', `${trimmed} is already listed.`);
    }
    const isCardio = cardio?.isCardio ?? known.find((k) => k.name === trimmed)?.isCardio ?? false;
    const cardioMode = cardio?.mode ?? known.find((k) => k.name === trimmed)?.cardioMode ?? 'treadmill';

    setDraft((current) => [
      ...current,
      {
        name: trimmed,
        // A flag on record beats the catalogue's guess, as in a session.
        bodyweightBased: known.find((k) => k.name === trimmed)?.bodyweightBased ?? catalogueBodyweight ?? false,
        targetSets: isCardio ? 1 : 3,
        isCardio,
        cardioMode,
        targetTime: isCardio ? '30m' : null,
      },
    ]);
  };

  // The database moves a routine one place at a time, so a jump of several is
  // that many single moves, which keeps the ones in between in their order.
  const placeRoutine = async (id: string, from: number, to: number) => {
    const direction = to > from ? 1 : -1;
    for (let i = from; i !== to; i += direction) await moveRoutine(id, direction);
    await refresh();
  };

  const save = async () => {
    if (!draftName.trim()) return notify('Name it', 'Give the routine a name first.');
    if (draft.length === 0) return notify('No exercises', 'Add at least one exercise or cardio activity.');

    setBusy(true);
    try {
      if (editing === 'new') await createRoutine(draftName.trim(), draft);
      else if (editing) {
        await setRoutineExercises(editing, draft);
        const existing = routines?.find((r) => r.id === editing);
        if (existing && existing.name !== draftName.trim()) {
          const { renameRoutine } = await import('../src/db');
          await renameRoutine(editing, draftName.trim());
        }
      }
      setEditing(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  // The editor is a mode of this screen, not a screen of its own, so the
  // header's back arrow used to leave Routines altogether: a routine not yet
  // created was gone, and so was an edit still inside the save delay. Back now
  // closes the editor, saving an existing routine first and asking before a
  // new one with anything in it is thrown away.
  usePreventRemove(editing !== null, () => {
    void (async () => {
      if (editing === 'new') {
        const started = draftName.trim() !== '' || draft.length > 0;
        if (
          started &&
          !(await confirm({
            title: 'Discard this routine?',
            message: 'It has not been created yet.',
            confirmLabel: 'Discard',
            destructive: true,
          }))
        )
          return;
        setEditing(null);
      } else if (draftName.trim() && draft.length > 0) {
        await save();
      } else {
        // Nothing the save would accept; the routine keeps what it last saved.
        setEditing(null);
      }
    })();
  });

  const remove = async (routine: Routine) => {
    const sure = await confirm({
      title: `Delete ${routine.name}?`,
      message: 'Sessions already logged from it are not affected.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!sure) return;
    await deleteRoutine(routine.id);
    await refresh();
  };

  if (routines === null) {
    return (
      <Screen title="Routines" tone="loud">
        {problem !== null ? (
          <LoadProblem tone="loud" message={problem} onRetry={() => void refresh()} />
        ) : (
          <ActivityIndicator color={loud.loud} />
        )}
      </Screen>
    );
  }

  if (editing) {
    const update = (index: number, patch: Partial<Draft>) =>
      setDraft((c) => c.map((d, i) => (i === index ? { ...d, ...patch } : d)));

    return (
      <Screen tone="loud" title={editing === 'new' ? 'New routine' : 'Edit routine'}>
        <Card loud title="Name">
          <Field label="Routine name" value={draftName} onChangeText={setDraftName} placeholder="Push A" />
        </Card>

        <Card loud title="Exercises" subtitle={draft.length > 0 ? planSummary(draft) : undefined}>
          {draft.length === 0 && (
            <Text style={[styles.note, { color: loud.figureFaint }]}>
              Add them in the order you do them.
            </Text>
          )}
          {draft.map((item, index) => (
            <View key={item.name} style={[styles.exercise, { borderColor: loud.rule }]}>
              <View style={styles.exerciseHead}>
                {/* The same sheet a workout reorders with: pick one up, tap where it
                    goes. Arrows on every row took five taps to move last to first. */}
                {draft.length > 1 && (
                  <Pressable
                    onPress={() => setReorderPick(index)}
                    style={styles.iconBtn}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${item.name}`}
                  >
                    <Ionicons name="reorder-three" size={22} color={loud.figureMuted} />
                  </Pressable>
                )}
                <Text style={[styles.exerciseName, { color: loud.figure }]} numberOfLines={2}>
                  {item.name}
                </Text>
                <Pressable
                  onPress={() => setDraft((c) => c.filter((_, i) => i !== index))}
                  style={styles.iconBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.name}`}
                >
                  <Ionicons name="close" size={20} color={loud.figureFaint} />
                </Pressable>
              </View>

              {item.isCardio ? (
                <View style={styles.targets}>
                  {(['treadmill', 'outside'] as const).map((mode) => {
                    const on = (item.cardioMode ?? 'treadmill') === mode;
                    return (
                      <Pressable
                        key={mode}
                        onPress={() => update(index, { cardioMode: mode })}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        style={[
                          styles.option,
                          { backgroundColor: on ? loud.figure : loud.panel, borderColor: on ? loud.figure : loud.rule },
                        ]}
                      >
                        <Text style={{ fontFamily: font.uiStrong, fontSize: 13, color: on ? loud.ground : loud.figure }}>
                          {mode === 'outside' ? 'Outside' : 'Machine'}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Text style={[styles.targetText, { color: loud.figureMuted }]}>{item.targetTime ?? '30m'}</Text>
                </View>
              ) : (
                <View style={styles.targets}>
                  {/* A stepper rather than a button that cycled 1 to 6 and wrapped:
                      going from 4 to 3 took five taps, and past 6 was impossible. */}
                  <View style={[styles.stepper, { borderColor: loud.rule, backgroundColor: loud.panel }]}>
                    <Pressable
                      onPress={() => update(index, { targetSets: Math.max(1, item.targetSets - 1) })}
                      style={styles.stepBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`One set fewer of ${item.name}`}
                    >
                      <Text style={[styles.stepGlyph, { color: loud.figure }]}>−</Text>
                    </Pressable>
                    <Text style={[styles.targetText, { color: loud.figure }]}>
                      {item.targetSets} {item.targetSets === 1 ? 'set' : 'sets'}
                    </Text>
                    <Pressable
                      onPress={() => update(index, { targetSets: Math.min(MAX_SETS, item.targetSets + 1) })}
                      style={styles.stepBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`One set more of ${item.name}`}
                    >
                      <Text style={[styles.stepGlyph, { color: loud.figure }]}>+</Text>
                    </Pressable>
                  </View>
                  {/* Reps were stored and used to prefill a session, but only an
                      imported programme could set them; here they can be typed. */}
                  <View style={[styles.repsBox, { borderColor: loud.rule, backgroundColor: loud.panel }]}>
                    <TextInput
                      value={item.targetReps ?? ''}
                      onChangeText={(text) => update(index, { targetReps: text.trim() === '' ? null : text })}
                      onBlur={() => update(index, { targetReps: item.targetReps?.trim() || null })}
                      placeholder="8-12"
                      placeholderTextColor={loud.figureFaint}
                      keyboardType="numbers-and-punctuation"
                      accessibilityLabel={`Target reps for ${item.name}`}
                      style={[styles.repsInput, webNoOutline, { color: loud.figure }]}
                    />
                    <Text style={[styles.note, { color: loud.figureFaint, marginTop: 0 }]}>reps</Text>
                  </View>
                  {item.bodyweightBased && (
                    <Text style={[styles.note, { color: loud.figureFaint, marginTop: 0 }]}>bodyweight</Text>
                  )}
                </View>
              )}
            </View>
          ))}

          {picking ? (
            <ExercisePicker
              known={known}
              patterns={patterns}
              geminiApiKey={settings.foodLookup.geminiApiKey}
              initialMode={pickerMode}
              onPick={addToDraft}
              onCancel={() => setPicking(false)}
            />
          ) : (
            // Both quiet and equal: red on this screen belongs to the one
            // button that finishes it, and a red "+ Cardio" outshouted it.
            <View style={styles.addButtonsRow}>
              {(['exercise', 'cardio'] as const).map((mode) => (
                <Tappable
                  key={mode}
                  onPress={() => {
                    setPickerMode(mode);
                    setPicking(true);
                  }}
                  scaleTo={0.97}
                  style={{ flex: 1 }}
                >
                  <View style={[styles.addSlab, { backgroundColor: loud.panel, borderColor: loud.rule }]}>
                    <Text style={{ fontFamily: font.display, fontSize: 12, letterSpacing: 1.2, color: loud.figure }}>
                      {mode === 'exercise' ? '+ EXERCISE' : '+ CARDIO'}
                    </Text>
                  </View>
                </Tappable>
              ))}
            </View>
          )}
        </Card>

        {/* An existing routine saves as it is edited, so it has no Cancel: there
            would be nothing left to cancel, and a Cancel that kept the changes
            would be lying. A new one exists only once it is created. */}
        {editing === 'new' ? (
          <>
            <Button tone="loud" label={busy ? 'Creating…' : 'Create routine'} onPress={save} disabled={busy} />
            <Button tone="loud" label="Cancel" variant="subtle" onPress={() => setEditing(null)} />
          </>
        ) : (
          <>
            <Button tone="loud" label={busy ? 'Saving…' : 'Done'} onPress={save} disabled={busy} />
            <Text style={[styles.note, styles.centred, { color: loud.figureFaint }]}>
              Changes save as you go, and apply from the next workout you start.
            </Text>
          </>
        )}

        <ReorderSheet
          open={reorderPick !== null}
          initialPick={reorderPick}
          items={draft.map((d) => ({ name: d.name, isCardio: d.isCardio, setCount: d.isCardio ? undefined : d.targetSets }))}
          onMove={(from, to) =>
            setDraft((c) => {
              // Lifted out and dropped in, as a session does, so the ones in
              // between keep their order.
              const next = [...c];
              const [moved] = next.splice(from, 1);
              next.splice(to, 0, moved);
              return next;
            })
          }
          onClose={() => setReorderPick(null)}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title="Routines"
      tone="loud"
      action={
        routines.length > 1 ? (
          <Pressable onPress={() => setReorderingList(true)} style={styles.iconBtn} accessibilityLabel="Reorder routines">
            <Ionicons name="swap-vertical" size={20} color={loud.figureMuted} />
          </Pressable>
        ) : undefined
      }
    >
      {routines.map((routine) => (
        <Card
          key={routine.id}
          loud
          title={routine.name}
          subtitle={routine.exercises.length > 0 ? planSummary(routine.exercises) : 'No exercises'}
        >
          <Text style={[styles.note, { color: loud.figureMuted }]} numberOfLines={3}>
            {routine.exercises.map((e) => e.name).join(' · ')}
          </Text>
          {/* Starting is the point of a routine, so it is here and not only on
              the Train tab, which is where this screen used to send you. */}
          <View style={styles.actions}>
            <Tappable
              onPress={() => router.push(`/session?routine=${routine.id}`)}
              scaleTo={0.96}
              accessibilityRole="button"
              accessibilityLabel={`Start ${routine.name}`}
            >
              <View style={[styles.startBtn, { backgroundColor: loud.loud }]}>
                <Ionicons name="play" size={14} color={loud.onLoud} />
                <Text style={{ fontFamily: font.uiStrong, fontSize: 14, color: loud.onLoud }}>Start</Text>
              </View>
            </Tappable>
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => edit(routine)} style={styles.textBtn} accessibilityRole="button">
              <Text style={{ fontFamily: font.uiStrong, color: loud.figure }}>Edit</Text>
            </Pressable>
            <Pressable
              onPress={() => void remove(routine)}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${routine.name}`}
            >
              <Ionicons name="trash-outline" size={18} color={loud.figureFaint} />
            </Pressable>
          </View>
        </Card>
      ))}

      {/* Three ways in, said plainly, with building first. "New routine" next
          to "Build or import routines" read as two names for the same thing,
          and nothing said the app would write the routines for you. */}
      <Card loud title={routines.length === 0 ? 'Get your first routine' : 'Add a routine'}>
        {WAYS.map((way) => (
          <Pressable
            key={way.key}
            onPress={() => (way.key === 'scratch' ? startNew('', []) : router.push(`/add-routines?mode=${way.key}`))}
            style={[
              styles.way,
              way.key === 'build'
                ? { backgroundColor: loud.panel, borderColor: loud.loud }
                : { borderColor: loud.rule },
            ]}
            accessibilityRole="button"
          >
            <View style={[styles.wayIcon, { backgroundColor: way.key === 'build' ? loud.loud : loud.panel }]}>
              <Ionicons name={way.icon} size={18} color={way.key === 'build' ? loud.onLoud : loud.figure} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.uiStrong, fontSize: 15, color: loud.figure }}>{way.title}</Text>
              <Text style={[styles.note, { color: loud.figureFaint }]}>{way.detail}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={loud.figureFaint} />
          </Pressable>
        ))}
      </Card>

      {past.length > 0 && (
        <Card loud title="Copy a past session" subtitle="Its exercises, in the order you did them.">
          {past.slice(0, 8).map((session) => (
            <Pressable
              key={session.id}
              onPress={() =>
                startNew(
                  session.name,
                  session.exercises.map((name) => {
                    const k = known.find((item) => item.name === name);
                    return {
                      name,
                      bodyweightBased: k?.bodyweightBased ?? false,
                      targetSets: k?.isCardio ? 1 : 3,
                      isCardio: k?.isCardio ?? false,
                      cardioMode: k?.cardioMode ?? 'treadmill',
                      targetTime: k?.isCardio ? '30m' : null,
                    };
                  }),
                )
              }
              style={[styles.row, { borderColor: loud.rule }]}
              accessibilityRole="button"
            >
              <View style={{ flex: 1, paddingVertical: space.xs }}>
                <Text style={{ fontFamily: font.uiStrong, color: loud.figure }}>{session.name}</Text>
                <Text style={[styles.note, { color: loud.figureFaint }]} numberOfLines={1}>
                  {formatDate(session.date)} · {session.exercises.join(', ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={loud.figureFaint} />
            </Pressable>
          ))}
        </Card>
      )}

      <ReorderSheet
        open={reorderingList}
        title="Reorder routines"
        items={routines.map((r) => ({ name: r.name }))}
        onMove={(from, to) => void placeRoutine(routines[from].id, from, to)}
        onClose={() => setReorderingList(false)}
      />
    </Screen>
  );
}

const WAYS = [
  {
    key: 'build',
    icon: 'barbell',
    title: 'Build them for me',
    detail: 'Pick your days, equipment and level. You get balanced routines that use the lifts you already do.',
  },
  {
    key: 'import',
    icon: 'document-text-outline',
    title: 'Import a programme',
    detail: 'From a PDF or a screenshot of one you were given.',
  },
  {
    key: 'scratch',
    icon: 'add',
    title: 'Make one yourself',
    detail: 'Name it and pick each exercise.',
  },
] as const;

/**
 * "4 exercises · 12 sets · about 30 min", for a routine or a draft of one.
 * Minutes use the same rough rule as the built routines, from lifting sets
 * only, since a cardio block's length is its own target time.
 */
const planSummary = (exercises: { isCardio?: boolean; targetSets: number }[]): string => {
  const sets = exercises.filter((e) => !e.isCardio).reduce((sum, e) => sum + e.targetSets, 0);
  const parts = [`${exercises.length} ${exercises.length === 1 ? 'exercise' : 'exercises'}`];
  if (sets > 0) parts.push(`${sets} ${sets === 1 ? 'set' : 'sets'}`, `about ${estimateMinutes(sets)} min`);
  return parts.join(' · ');
};

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGET,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.xs,
  },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: space.sm },
  iconBtn: {
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBtn: { minHeight: TOUCH_TARGET, paddingHorizontal: space.sm, justifyContent: 'center' },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  centred: { textAlign: 'center' },
  way: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: TOUCH_TARGET,
    padding: space.sm,
    marginTop: space.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
  },
  wayIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  exercise: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: space.xs },
  exerciseHead: { flexDirection: 'row', alignItems: 'center', minHeight: TOUCH_TARGET },
  exerciseName: { flex: 1, fontFamily: font.uiStrong, fontSize: 15 },
  targets: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs, paddingBottom: space.xs },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
  },
  stepBtn: { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { fontFamily: font.uiStrong, fontSize: 18 },
  targetText: { fontFamily: font.figure, fontSize: 14, minWidth: 52, textAlign: 'center' },
  repsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
  },
  repsInput: { fontFamily: font.figure, fontSize: 14, width: 56, minHeight: TOUCH_TARGET, textAlign: 'center' },
  option: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  addButtonsRow: { flexDirection: 'row', gap: space.xs, marginTop: space.sm },
  addSlab: {
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
