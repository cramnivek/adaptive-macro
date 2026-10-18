import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card } from '../src/components/Card';
import { Button, Field, TOUCH_TARGET } from '../src/components/Controls';
import { ExercisePicker } from '../src/components/ExercisePicker';
import { Tappable } from '../src/components/Tappable';
import { Screen } from '../src/components/Screen';
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
  const [autoSaved, setAutoSaved] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save existing routines on every edit
  useEffect(() => {
    if (!editing || editing === 'new' || !draftName.trim() || draft.length === 0) return;
    setAutoSaved(false);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await setRoutineExercises(editing, draft);
        const existing = routines?.find((r) => r.id === editing);
        if (existing && existing.name !== draftName.trim()) {
          const { renameRoutine } = await import('../src/db');
          await renameRoutine(editing, draftName.trim());
        }
        setAutoSaved(true);
      } catch (err) {
        console.warn('Failed to auto-save routine:', err);
      }
    }, 400);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [editing, draftName, draft, routines]);

  const refresh = async () => {
    setRoutines(await listRoutines());
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

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    [next[index], next[target]] = [next[target], next[index]];
    setDraft(next);
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
        <ActivityIndicator color={loud.loud} />
      </Screen>
    );
  }

  if (editing) {
    return (
      <Screen tone="loud" title={editing === 'new' ? 'New routine' : 'Edit routine'}>
        <View style={styles.disclaimerBox}>
          <Ionicons name="information-circle" size={18} color="#F59E0B" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.disclaimerTitle}>ROUTINE TEMPLATE</Text>
            <Text style={styles.disclaimerText}>
              Routines are templates for future workouts. Changes auto-save and apply to your next workout without altering any active workout session in progress.
            </Text>
          </View>
        </View>

        <Card loud title="Name">
          <Field label="Routine name" value={draftName} onChangeText={setDraftName} placeholder="Push A" />
        </Card>

        <Card loud title="Exercises & Cardio">
          <Text style={[styles.note, { color: loud.figureFaint }]}>
            The order here is the order you do them in.
          </Text>
          {draft.map((item, index) => (
            <View key={item.name} style={[styles.row, { borderColor: loud.rule }]}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                  <Text style={{ fontFamily: font.uiStrong, color: loud.figure }}>{item.name}</Text>
                  {item.isCardio && (
                    <Text style={{ fontFamily: font.display, fontSize: 10, color: loud.loud }}>
                      CARDIO
                    </Text>
                  )}
                </View>
                <Text style={[styles.note, { color: loud.figureFaint }]}>
                  {item.isCardio
                    ? `${item.cardioMode === 'outside' ? 'Outside' : 'Machine'} · ${item.targetTime ?? '30m'}`
                    : `${item.targetSets} sets${item.targetReps ? ` of ${item.targetReps}` : ''}${
                        item.bodyweightBased ? ' · bodyweight' : ''
                      }`}
                </Text>
              </View>
              <Pressable onPress={() => move(index, -1)} style={styles.iconBtn}>
                <Text style={{ color: loud.figureMuted }}>↑</Text>
              </Pressable>
              <Pressable onPress={() => move(index, 1)} style={styles.iconBtn}>
                <Text style={{ color: loud.figureMuted }}>↓</Text>
              </Pressable>
              {item.isCardio ? (
                <Pressable
                  onPress={() =>
                    setDraft((c) =>
                      c.map((d, i) =>
                        i === index
                          ? {
                              ...d,
                              cardioMode: d.cardioMode === 'outside' ? 'treadmill' : 'outside',
                            }
                          : d,
                      ),
                    )
                  }
                  style={styles.iconBtn}
                >
                  <Text style={{ fontFamily: font.uiStrong, color: loud.loud, fontSize: 11 }}>
                    {item.cardioMode === 'outside' ? '🌲' : '🏃'}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() =>
                    setDraft((c) =>
                      c.map((d, i) =>
                        i === index ? { ...d, targetSets: (d.targetSets % 6) + 1 } : d,
                      ),
                    )
                  }
                  style={styles.iconBtn}
                >
                  <Text style={{ fontFamily: font.uiStrong, color: loud.loud }}>sets</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => setDraft((c) => c.filter((_, i) => i !== index))}
                style={styles.iconBtn}
              >
                <Text style={{ color: loud.loud }}>✕</Text>
              </Pressable>
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
            <View style={styles.addButtonsRow}>
              <Tappable
                onPress={() => {
                  setPickerMode('exercise');
                  setPicking(true);
                }}
                scaleTo={0.97}
                style={{ flex: 1 }}
              >
                <View style={[styles.addSlab, { backgroundColor: loud.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: loud.rule }]}>
                  <Text style={{ fontFamily: font.display, fontSize: 12, letterSpacing: 1.2, color: loud.figure }}>
                    + EXERCISE
                  </Text>
                </View>
              </Tappable>
              <Tappable
                onPress={() => {
                  setPickerMode('cardio');
                  setPicking(true);
                }}
                scaleTo={0.97}
                style={{ flex: 1 }}
              >
                <View style={[styles.addSlab, { backgroundColor: loud.loud }]}>
                  <Text style={{ fontFamily: font.display, fontSize: 12, letterSpacing: 1.2, color: loud.onLoud }}>
                    + CARDIO
                  </Text>
                </View>
              </Tappable>
            </View>
          )}
        </Card>

        {autoSaved && editing !== 'new' && (
          <Text style={styles.autoSavedBadge}>✓ Changes auto-saved to template</Text>
        )}
        <Button
          tone="loud"
          label={editing === 'new' ? (busy ? 'Creating…' : 'Create routine') : (busy ? 'Saving…' : 'Done')}
          onPress={save}
          disabled={busy}
        />
        <Button tone="loud" label="Cancel" variant="subtle" onPress={() => setEditing(null)} />
      </Screen>
    );
  }

  return (
    <Screen title="Routines" tone="loud">
      {routines.length === 0 && (
        <Card loud title="No routines yet">
          <Text style={[styles.note, { color: loud.figureFaint }]}>
            A routine is a named list of exercises in the order you do them. You can start one
            from scratch, or build it from a session you have already done.
          </Text>
        </Card>
      )}

      {routines.map((routine, index) => (
        <Card key={routine.id} title={routine.name}>
          <Text style={[styles.note, { color: loud.figureFaint }]}>
            {routine.exercises
              .map((e) =>
                e.isCardio
                  ? `${e.name} (${e.cardioMode === 'outside' ? 'Outside' : 'Machine'}${
                      e.targetTime ? `, ${e.targetTime}` : ''
                    })`
                  : `${e.name} × ${e.targetSets}${e.targetReps ? ` (${e.targetReps})` : ''}`,
              )
              .join(' · ') || 'No exercises'}
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={() => void moveRoutine(routine.id, -1).then(refresh)} style={styles.iconBtn}>
              <Text style={{ color: loud.figureMuted }}>↑</Text>
            </Pressable>
            <Pressable onPress={() => void moveRoutine(routine.id, 1).then(refresh)} style={styles.iconBtn}>
              <Text style={{ color: loud.figureMuted }}>↓</Text>
            </Pressable>
            <Pressable onPress={() => edit(routine)} style={styles.iconBtn}>
              <Text style={{ fontFamily: font.uiStrong, color: loud.loud }}>Edit</Text>
            </Pressable>
            <Pressable onPress={() => void remove(routine)} style={styles.iconBtn}>
              <Text style={{ fontFamily: font.uiStrong, color: loud.loud }}>Delete</Text>
            </Pressable>
          </View>
          {index === 0 && (
            <Text style={[styles.note, { color: loud.figureFaint }]}>
              Start a workout from the Train tab.
            </Text>
          )}
        </Card>
      ))}

      <Button tone="loud" label="New routine" onPress={() => startNew('', [])} />
      <Button
        tone="loud"
        label="Build or import routines"
        variant="subtle"
        onPress={() => router.push('/add-routines')}
      />

      {past.length > 0 && (
        <Card loud title="Build one from a past session">
          <Text style={[styles.note, { color: loud.figureFaint }]}>
            Takes that session's exercises, in the order they were done.
          </Text>
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
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.uiStrong, color: loud.figure }}>{session.name}</Text>
                <Text style={[styles.note, { color: loud.figureFaint }]} numberOfLines={1}>
                  {formatDate(session.date)} · {session.exercises.join(', ')}
                </Text>
              </View>
            </Pressable>
          ))}
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
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: space.xs },
  iconBtn: {
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonsRow: { flexDirection: 'row', gap: space.xs, marginTop: space.sm },
  addExercise: { marginTop: space.sm },
  addSlab: { minHeight: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg },
  disclaimerBox: {
    flexDirection: 'row',
    gap: space.sm,
    backgroundColor: '#1E1810',
    borderWidth: 1,
    borderColor: '#78350F',
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
    alignItems: 'flex-start',
  },
  disclaimerTitle: {
    fontFamily: font.display,
    fontSize: 10,
    color: '#F59E0B',
    letterSpacing: 1.5,
    marginBottom: 2,
    fontWeight: '800',
  },
  disclaimerText: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 17,
    color: loud.figureMuted,
  },
  autoSavedBadge: {
    fontFamily: font.uiStrong,
    fontSize: 12,
    color: '#34D399',
    textAlign: 'center',
    marginBottom: space.sm,
  },
});
