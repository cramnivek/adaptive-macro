import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
import { Button, Field, TOUCH_TARGET } from '../src/components/Controls';
import { Screen } from '../src/components/Screen';
import {
  createRoutine,
  deleteRoutine,
  listExerciseNames,
  listRoutines,
  moveRoutine,
  recentSessions,
  setRoutineExercises,
} from '../src/db';
import type { Routine } from '../src/db';
import { confirm, notify } from '../src/dialog';
import { formatDate } from '../src/format';
import { font, radius, space, useTheme } from '../src/theme';

type Draft = { name: string; bodyweightBased: boolean; targetSets: number };

/**
 * Routines: named, ordered exercise lists with a target set count each.
 *
 * A routine can also be built from a past session. After importing hundreds of
 * sessions, assembling "Push A" from a picker is tedious when the answer is
 * already in the history.
 */
export default function RoutinesScreen() {
  const { colors } = useTheme();

  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [known, setKnown] = useState<{ name: string; bodyweightBased: boolean }[]>([]);
  const [past, setPast] = useState<{ id: string; name: string; date: string; exercises: string[] }[]>([]);

  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draft, setDraft] = useState<Draft[]>([]);
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setRoutines(await listRoutines());
    setKnown(await listExerciseNames());
    setPast(await recentSessions(15));
  };

  useEffect(() => {
    void refresh();
  }, []);

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
      })),
    );
  };

  const addToDraft = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (draft.some((d) => d.name === trimmed)) {
      return notify('Already in this routine', `${trimmed} is already listed.`);
    }
    setDraft((current) => [
      ...current,
      {
        name: trimmed,
        bodyweightBased: known.find((k) => k.name === trimmed)?.bodyweightBased ?? false,
        targetSets: 3,
      },
    ]);
    setAdding('');
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
    if (draft.length === 0) return notify('No exercises', 'Add at least one exercise.');

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
      <Screen title="Routines">
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  if (editing) {
    return (
      <Screen title={editing === 'new' ? 'New routine' : 'Edit routine'}>
        <Card title="Name">
          <Field label="Routine name" value={draftName} onChangeText={setDraftName} placeholder="Push A" />
        </Card>

        <Card title="Exercises">
          <Text style={[styles.note, { color: colors.textFaint }]}>
            The order here is the order you do them in.
          </Text>
          {draft.map((item, index) => (
            <View key={item.name} style={[styles.row, { borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text }}>{item.name}</Text>
                <Text style={[styles.note, { color: colors.textFaint }]}>
                  {item.targetSets} sets{item.bodyweightBased ? ' · bodyweight' : ''}
                </Text>
              </View>
              <Pressable onPress={() => move(index, -1)} style={styles.iconBtn}>
                <Text style={{ color: colors.textMuted }}>↑</Text>
              </Pressable>
              <Pressable onPress={() => move(index, 1)} style={styles.iconBtn}>
                <Text style={{ color: colors.textMuted }}>↓</Text>
              </Pressable>
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
                <Text style={{ color: colors.accent }}>sets</Text>
              </Pressable>
              <Pressable
                onPress={() => setDraft((c) => c.filter((_, i) => i !== index))}
                style={styles.iconBtn}
              >
                <Text style={{ color: colors.danger }}>✕</Text>
              </Pressable>
            </View>
          ))}

          <Field
            label="Add an exercise"
            value={adding}
            onChangeText={setAdding}
            placeholder="Bench Press (Barbell)"
            hint="Names match exactly, so reuse one below to keep history joined up."
          />
          <Button label="Add" variant="subtle" onPress={() => addToDraft(adding)} />

          {known.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
              {known.slice(0, 20).map((item) => (
                <Pressable
                  key={item.name}
                  onPress={() => addToDraft(item.name)}
                  style={[styles.chip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
                >
                  <Text style={{ fontFamily: font.uiStrong, color: colors.text, fontSize: 13 }}>{item.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </Card>

        <Button label={busy ? 'Saving…' : 'Save routine'} onPress={save} disabled={busy} />
        <Button label="Cancel" variant="subtle" onPress={() => setEditing(null)} />
      </Screen>
    );
  }

  return (
    <Screen title="Routines">
      {routines.length === 0 && (
        <Card title="No routines yet">
          <Text style={[styles.note, { color: colors.textFaint }]}>
            A routine is a named list of exercises in the order you do them. You can start one
            from scratch, or build it from a session you have already done.
          </Text>
        </Card>
      )}

      {routines.map((routine, index) => (
        <Card key={routine.id} title={routine.name}>
          <Text style={[styles.note, { color: colors.textFaint }]}>
            {routine.exercises.map((e) => `${e.name} × ${e.targetSets}`).join(' · ') ||
              'No exercises'}
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={() => void moveRoutine(routine.id, -1).then(refresh)} style={styles.iconBtn}>
              <Text style={{ color: colors.textMuted }}>↑</Text>
            </Pressable>
            <Pressable onPress={() => void moveRoutine(routine.id, 1).then(refresh)} style={styles.iconBtn}>
              <Text style={{ color: colors.textMuted }}>↓</Text>
            </Pressable>
            <Pressable onPress={() => edit(routine)} style={styles.iconBtn}>
              <Text style={{ color: colors.accent }}>Edit</Text>
            </Pressable>
            <Pressable onPress={() => void remove(routine)} style={styles.iconBtn}>
              <Text style={{ color: colors.danger }}>Delete</Text>
            </Pressable>
          </View>
          {index === 0 && (
            <Text style={[styles.note, { color: colors.textFaint }]}>
              Start a workout from the Train tab.
            </Text>
          )}
        </Card>
      ))}

      <Button label="New routine" onPress={() => startNew('', [])} />

      {past.length > 0 && (
        <Card title="Build one from a past session">
          <Text style={[styles.note, { color: colors.textFaint }]}>
            Takes that session's exercises, in the order they were done.
          </Text>
          {past.slice(0, 8).map((session) => (
            <Pressable
              key={session.id}
              onPress={() =>
                startNew(
                  session.name,
                  session.exercises.map((name) => ({
                    name,
                    bodyweightBased: known.find((k) => k.name === name)?.bodyweightBased ?? false,
                    targetSets: 3,
                  })),
                )
              }
              style={[styles.row, { borderColor: colors.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text }}>{session.name}</Text>
                <Text style={[styles.note, { color: colors.textFaint }]} numberOfLines={1}>
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
  chips: { marginTop: space.sm },
  chip: {
    minHeight: TOUCH_TARGET - 14,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    marginRight: space.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
