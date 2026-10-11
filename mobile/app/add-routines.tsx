import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  buildRoutinesWithGemini,
  documentKindOf,
  MAX_DOCUMENT_BYTES,
  readRoutinesWithGemini,
} from '../src/ai/geminiRoutine';
import {
  EQUIPMENT_LABEL,
  EQUIPMENT_OPTIONS,
  type Equipment,
  FOCUS_LABEL,
  ROUTINE_FOCUSES,
  type RoutineFocus,
} from '../src/ai/routineBuild';
import { type ResolvedExercise, type RoutineDraft, resolveAgainstLog } from '../src/ai/routineImport';
import { Card } from '../src/components/Card';
import { Button, TOUCH_TARGET } from '../src/components/Controls';
import { Screen } from '../src/components/Screen';
import { createRoutine, listExerciseNames } from '../src/db';
import { notify } from '../src/dialog';
import { pickBinaryFile } from '../src/platform/files';
import { useApp } from '../src/state/AppStore';
import { font, radius, space } from '../src/theme';
import { session as loud } from '../src/theme/sessionTheme';

type Found = { name: string; exercises: ResolvedExercise[]; include: boolean };

/**
 * New routines, built for the person or read out of a programme they were given.
 *
 * Both end on the same list, and nothing is saved until it has been seen. The
 * model is good at this but not perfect, and a routine that quietly drops a
 * lift is worse than typing it in, so every exercise is shown, with which ones
 * join existing history and which start new.
 */
export default function AddRoutinesScreen() {
  const router = useRouter();
  const { settings } = useApp();

  const [known, setKnown] = useState<{ name: string; bodyweightBased: boolean }[]>([]);
  const [focuses, setFocuses] = useState<RoutineFocus[]>([]);
  const [equipment, setEquipment] = useState<Equipment>('gym');
  // What the drafts on screen were built for, so a bodyweight routine saves its
  // new exercises as bodyweight ones rather than as lifts with no load.
  const [builtFor, setBuiltFor] = useState<Equipment | null>(null);
  const [found, setFound] = useState<Found[] | null>(null);
  const [source, setSource] = useState('');
  const [working, setWorking] = useState<{ title: string; detail: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void listExerciseNames().then(setKnown);
  }, []);

  const show = (drafts: RoutineDraft[]) => {
    const names = known.map((k) => k.name);
    setFound(drafts.map((draft) => ({ ...resolveAgainstLog(draft, names), include: true })));
  };

  const toggleFocus = (focus: RoutineFocus) =>
    // Kept in the order of the chips, so "Push, Pull, Legs" comes back in that order.
    setFocuses((current) =>
      ROUTINE_FOCUSES.filter((f) => (f === focus ? !current.includes(f) : current.includes(f))),
    );

  const build = async () => {
    setWorking({ title: 'Building your routines', detail: focuses.map((f) => FOCUS_LABEL[f]).join(', ') });
    try {
      show(
        await buildRoutinesWithGemini(
          focuses,
          known.map((k) => k.name),
          settings.foodLookup.geminiApiKey,
          equipment,
        ),
      );
      setSource('built');
      setBuiltFor(equipment);
    } catch (error) {
      notify('Could not build the routines', (error as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const pick = async () => {
    const picked = await pickBinaryFile().catch((error: Error) => {
      notify('Could not open that file', error.message);
      return null;
    });
    if (!picked) return;

    const kind = documentKindOf(picked.name, picked.mimeType);
    if ('problem' in kind) {
      return notify(
        kind.problem === 'spreadsheet' ? 'Spreadsheets cannot be read directly' : 'That file cannot be read',
        kind.problem === 'spreadsheet'
          ? 'Save the sheet as a PDF (File, then Download or Save as, then PDF), or take a screenshot of it, and pick that instead.'
          : 'Pick a PDF or an image of the programme.',
      );
    }
    if (picked.size !== null && picked.size > MAX_DOCUMENT_BYTES) {
      return notify('That file is too large', 'Pick a file under 14 MB, or a screenshot of the part with the routines.');
    }

    setWorking({ title: 'Reading the programme', detail: picked.name });
    try {
      const base64 = await picked.readBase64();
      show(await readRoutinesWithGemini({ mimeType: kind.mimeType, base64 }, settings.foodLookup.geminiApiKey));
      setSource(picked.name);
      setBuiltFor(null);
    } catch (error) {
      notify('Could not read the programme', (error as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const chosen = found?.filter((f) => f.include) ?? [];

  const save = async () => {
    setSaving(true);
    try {
      for (const routine of chosen) {
        await createRoutine(
          routine.name,
          routine.exercises.map((e) => ({
            name: e.name,
            bodyweightBased:
              known.find((k) => k.name === e.name)?.bodyweightBased ?? builtFor === 'bodyweight',
            targetSets: e.sets,
            targetReps: e.reps,
          })),
        );
      }
      notify('Saved', chosen.length === 1 ? `${chosen[0].name} is in your routines.` : `${chosen.length} routines added.`);
      router.back();
    } catch (error) {
      notify('Could not save the routines', (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const count = (n: number) => (n === 1 ? '1 routine' : `${n} routines`);

  return (
    <Screen title="New routines" tone="loud">
      {!found && !working && (
        <>
          <Card loud title="Build them for me">
            <Text style={[styles.note, { color: loud.figureMuted }]}>
              Pick the days you want. Each becomes a balanced routine, using the exercises you
              already do wherever they fit.
            </Text>
            <View style={styles.chips}>
              {ROUTINE_FOCUSES.map((focus) => {
                const on = focuses.includes(focus);
                return (
                  <Pressable
                    key={focus}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => toggleFocus(focus)}
                    style={[
                      styles.chip,
                      { backgroundColor: on ? loud.loud : loud.panel, borderColor: on ? loud.loud : loud.rule },
                    ]}
                  >
                    <Text style={{ fontFamily: font.uiStrong, fontSize: 14, color: on ? loud.onLoud : loud.figure }}>
                      {FOCUS_LABEL[focus]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.note, { color: loud.figureFaint }]}>With</Text>
            <View style={styles.chips}>
              {EQUIPMENT_OPTIONS.map((option) => {
                const on = equipment === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => setEquipment(option)}
                    style={[
                      styles.chip,
                      { backgroundColor: on ? loud.figure : loud.panel, borderColor: on ? loud.figure : loud.rule },
                    ]}
                  >
                    <Text style={{ fontFamily: font.uiStrong, fontSize: 14, color: on ? loud.ground : loud.figure }}>
                      {EQUIPMENT_LABEL[option]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {equipment === 'bodyweight' && (
              <Text style={[styles.note, { color: loud.figureFaint }]}>
                Assumes a pull-up bar and a bench or sturdy chair.
              </Text>
            )}
            <Button
              tone="loud"
              label={focuses.length === 0 ? 'Pick at least one' : `Build ${count(focuses.length)}`}
              onPress={build}
              disabled={focuses.length === 0}
            />
          </Card>

          <Card loud title="From a PDF or a screenshot">
            <Text style={[styles.note, { color: loud.figureMuted }]}>
              Pick a programme you were given. Each day in it becomes a routine, with its sets and
              rep targets.
            </Text>
            <Text style={[styles.note, { color: loud.figureFaint }]}>
              A spreadsheet? Save it as a PDF or screenshot it first.
            </Text>
            <Button tone="loud" label="Choose a file" variant="subtle" onPress={pick} />
          </Card>
        </>
      )}

      {working && (
        <Card loud title={working.title}>
          <Text style={[styles.note, { color: loud.figureMuted }]} numberOfLines={1}>
            {working.detail}
          </Text>
          <Text style={[styles.note, { color: loud.figureFaint }]}>This can take up to a minute.</Text>
          <ActivityIndicator style={{ marginTop: space.md }} color={loud.loud} />
        </Card>
      )}

      {found && !working && (
        <>
          <Text style={[styles.note, { color: loud.figureMuted }]}>
            {source === 'built' ? `Built ${count(found.length)}.` : `Found ${count(found.length)} in ${source}.`}{' '}
            Nothing is saved yet. Tap one to leave it out.
          </Text>

          {found.map((routine, index) => (
            <Pressable
              key={`${routine.name}-${index}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: routine.include }}
              onPress={() =>
                setFound((current) =>
                  current?.map((r, i) => (i === index ? { ...r, include: !r.include } : r)) ?? null,
                )
              }
              style={{ opacity: routine.include ? 1 : 0.4 }}
            >
              <Card
                loud
                title={routine.name}
                right={
                  <Text style={{ fontFamily: font.uiStrong, color: routine.include ? loud.loud : loud.figureFaint }}>
                    {routine.include ? 'ADD' : 'SKIP'}
                  </Text>
                }
              >
                {routine.exercises.map((exercise) => (
                  <View key={exercise.name} style={[styles.row, { borderColor: loud.rule }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: font.uiStrong, color: loud.figure }}>{exercise.name}</Text>
                      <Text style={[styles.note, { color: loud.figureFaint }]}>
                        {exercise.known
                          ? exercise.importedAs
                            ? `“${exercise.importedAs}” · joins your history`
                            : 'joins your history'
                          : 'new exercise'}
                      </Text>
                    </View>
                    <Text style={[styles.target, { color: loud.figure }]}>
                      {exercise.sets} × {exercise.reps ?? '—'}
                    </Text>
                  </View>
                ))}
              </Card>
            </Pressable>
          ))}

          <Button
            tone="loud"
            label={saving ? 'Saving…' : `Save ${count(chosen.length)}`}
            onPress={save}
            disabled={saving || chosen.length === 0}
          />
          <Button tone="loud" label="Start over" variant="subtle" onPress={() => setFound(null)} disabled={saving} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginVertical: space.sm },
  chip: {
    minHeight: TOUCH_TARGET - 8,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGET,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.xs,
    gap: space.sm,
  },
  target: { fontFamily: font.figure, fontSize: 15 },
});
