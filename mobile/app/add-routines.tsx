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
  type BuildOptions,
  estimateMinutes,
  EQUIPMENT_ITEMS,
  EQUIPMENT_LABEL,
  FOCUS_LABEL,
  isBodyweightOnly,
  LEVEL_COACHING,
  LEVEL_LABEL,
  missingEquipment,
  ROUTINE_FOCUSES,
  type RoutineFocus,
  TRAINING_LEVELS,
} from '../src/ai/routineBuild';
import { type ResolvedExercise, type RoutineDraft, resolveAgainstLog } from '../src/ai/routineImport';
import { Card } from '../src/components/Card';
import { Button, TOUCH_TARGET } from '../src/components/Controls';
import { ExerciseInfoSheet } from '../src/components/ExerciseInfoSheet';
import { Screen } from '../src/components/Screen';
import { Tappable } from '../src/components/Tappable';
import { type CatalogueEntry, createRoutine, listExerciseNames } from '../src/db';
import { notify } from '../src/dialog';
import { exerciseInfoFor } from '../src/exerciseInfo';
import { pickBinaryFile } from '../src/platform/files';
import { useApp } from '../src/state/AppStore';
import { font, radius, space } from '../src/theme';
import { session as loud } from '../src/theme/sessionTheme';

type FoundExercise = ResolvedExercise & { include: boolean };
type Found = { name: string; exercises: FoundExercise[]; include: boolean };

/** A routine is saved only if it is kept and still has an exercise in it. */
const kept = (routine: Found) => routine.include && routine.exercises.some((e) => e.include);

/**
 * New routines, built for the person or read out of a programme they were given.
 *
 * Both end on the same list, and nothing is saved until it has been seen. The
 * model is good at this but not perfect, and a routine that quietly drops a
 * lift is worse than typing it in, so every exercise is shown, with which ones
 * join existing history and which start new — and each can be dropped on its
 * own, or tapped to see what it is before deciding.
 */
export default function AddRoutinesScreen() {
  const router = useRouter();
  const { settings, updateSettings } = useApp();
  const apiKey = settings.foodLookup.geminiApiKey;

  const [known, setKnown] = useState<{ name: string; bodyweightBased: boolean }[]>([]);
  const [focuses, setFocuses] = useState<RoutineFocus[]>([]);
  // What the drafts on screen were built with: for the equipment warnings, and
  // so a bodyweight routine saves its new exercises as bodyweight ones.
  const [builtWith, setBuiltWith] = useState<BuildOptions | null>(null);
  const [found, setFound] = useState<Found[] | null>(null);
  const [source, setSource] = useState('');
  const [working, setWorking] = useState<{ title: string; detail: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState<CatalogueEntry | null>(null);
  const [lookingUp, setLookingUp] = useState<string | null>(null);

  const equipment = settings.routineEquipment;
  const level = settings.trainingLevel;

  useEffect(() => {
    void listExerciseNames().then(setKnown);
  }, []);

  const show = (drafts: RoutineDraft[]) => {
    const names = known.map((k) => k.name);
    setFound(
      drafts.map((draft) => {
        const resolved = resolveAgainstLog(draft, names);
        return { ...resolved, include: true, exercises: resolved.exercises.map((e) => ({ ...e, include: true })) };
      }),
    );
  };

  const toggleFocus = (focus: RoutineFocus) =>
    // Kept in the order of the chips, so "Push, Pull, Legs" comes back in that order.
    setFocuses((current) =>
      ROUTINE_FOCUSES.filter((f) => (f === focus ? !current.includes(f) : current.includes(f))),
    );

  const toggleEquipment = (item: (typeof EQUIPMENT_ITEMS)[number]) =>
    void updateSettings({
      routineEquipment: EQUIPMENT_ITEMS.filter((i) => (i === item ? !equipment.includes(i) : equipment.includes(i))),
    });

  const build = async () => {
    const options: BuildOptions = { equipment, level };
    setWorking({ title: 'Building your routines', detail: focuses.map((f) => FOCUS_LABEL[f]).join(', ') });
    try {
      show(await buildRoutinesWithGemini(focuses, known.map((k) => k.name), apiKey, options));
      setSource('built');
      setBuiltWith(options);
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
      show(await readRoutinesWithGemini({ mimeType: kind.mimeType, base64 }, apiKey));
      setSource(picked.name);
      setBuiltWith(null);
    } catch (error) {
      notify('Could not read the programme', (error as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const showInfo = async (name: string) => {
    if (lookingUp !== null) return;
    setLookingUp(name);
    try {
      const entry = await exerciseInfoFor(name, apiKey);
      if (entry) setInfo(entry);
      else notify('No how-to yet', `Could not look up ${name} just now.`);
    } catch {
      notify('No how-to yet', `Could not look up ${name} just now. Check your connection.`);
    } finally {
      setLookingUp(null);
    }
  };

  const toggleRoutine = (index: number) =>
    setFound((current) => current?.map((r, i) => (i === index ? { ...r, include: !r.include } : r)) ?? null);

  const toggleExercise = (routineIndex: number, exerciseIndex: number) =>
    setFound(
      (current) =>
        current?.map((r, i) =>
          i !== routineIndex
            ? r
            : { ...r, exercises: r.exercises.map((e, j) => (j === exerciseIndex ? { ...e, include: !e.include } : e)) },
        ) ?? null,
    );

  const chosen = found?.filter(kept) ?? [];

  const save = async () => {
    setSaving(true);
    try {
      const bodyweightOnly = builtWith !== null && isBodyweightOnly(builtWith.equipment);
      for (const routine of chosen) {
        await createRoutine(
          routine.name,
          routine.exercises
            .filter((e) => e.include)
            .map((e) => ({
              name: e.name,
              bodyweightBased: known.find((k) => k.name === e.name)?.bodyweightBased ?? bodyweightOnly,
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
              {ROUTINE_FOCUSES.map((focus) => (
                <Chip key={focus} label={FOCUS_LABEL[focus]} on={focuses.includes(focus)} onPress={() => toggleFocus(focus)} />
              ))}
            </View>

            <Text style={[styles.label, { color: loud.figureMuted }]}>WHAT YOU HAVE</Text>
            <View style={styles.chips}>
              {EQUIPMENT_ITEMS.map((item) => (
                <Chip
                  key={item}
                  label={EQUIPMENT_LABEL[item]}
                  on={equipment.includes(item)}
                  onPress={() => toggleEquipment(item)}
                  quiet
                />
              ))}
            </View>
            {isBodyweightOnly(equipment) && (
              <Text style={[styles.note, { color: loud.figureFaint }]}>
                Nothing that adds load, so every exercise will be bodyweight.
              </Text>
            )}

            <Text style={[styles.label, { color: loud.figureMuted }]}>YOUR LEVEL</Text>
            <View style={styles.chips}>
              {TRAINING_LEVELS.map((option) => (
                <Chip
                  key={option}
                  label={LEVEL_LABEL[option]}
                  on={level === option}
                  onPress={() => void updateSettings({ trainingLevel: option })}
                  quiet
                  radio
                />
              ))}
            </View>

            <Button
              tone="loud"
              label={focuses.length === 0 ? 'Pick at least one day' : `Build ${count(focuses.length)}`}
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
            Nothing is saved yet. Tap an exercise to see how it is done.
          </Text>
          {builtWith && (
            <View style={[styles.coaching, { borderColor: loud.rule }]}>
              <Text style={[styles.label, { color: loud.loud, marginTop: 0 }]}>
                {LEVEL_LABEL[builtWith.level].toUpperCase()}
              </Text>
              <Text style={[styles.note, { color: loud.figureMuted }]}>{LEVEL_COACHING[builtWith.level]}</Text>
            </View>
          )}

          {found.map((routine, routineIndex) => (
            <View key={`${routine.name}-${routineIndex}`} style={{ opacity: routine.include ? 1 : 0.4 }}>
              <Card
                loud
                title={routine.name}
                subtitle={(() => {
                  // Of the exercises still kept, so dropping one shows what it saves.
                  const sets = routine.exercises.filter((e) => e.include).reduce((sum, e) => sum + e.sets, 0);
                  return `${sets} sets · about ${estimateMinutes(sets)} min`;
                })()}
                right={
                  <Tappable
                    onPress={() => toggleRoutine(routineIndex)}
                    scaleTo={0.9}
                    style={styles.toggle}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: routine.include }}
                    accessibilityLabel={`${routine.include ? 'Leave out' : 'Keep'} ${routine.name}`}
                  >
                    <Text style={{ fontFamily: font.uiStrong, color: routine.include ? loud.loud : loud.figureFaint }}>
                      {routine.include ? 'KEEP' : 'SKIP'}
                    </Text>
                  </Tappable>
                }
              >
                {routine.exercises.map((exercise, exerciseIndex) => {
                  const lacking = builtWith ? missingEquipment(exercise.name, builtWith.equipment) : [];
                  return (
                    <View
                      key={exercise.name}
                      style={[styles.row, { borderColor: loud.rule, opacity: exercise.include ? 1 : 0.4 }]}
                    >
                      <Pressable
                        onPress={() => void showInfo(exercise.name)}
                        style={styles.rowMain}
                        accessibilityRole="button"
                        accessibilityLabel={`How to do ${exercise.name}`}
                      >
                        <Text style={{ fontFamily: font.uiStrong, color: loud.figure }}>{exercise.name}</Text>
                        <Text style={[styles.note, { color: loud.figureFaint }]}>
                          {lookingUp === exercise.name
                            ? 'Looking it up…'
                            : exercise.known
                              ? exercise.importedAs
                                ? `“${exercise.importedAs}” · joins your history`
                                : 'joins your history'
                              : 'new exercise'}
                        </Text>
                        {lacking.length > 0 && (
                          <Text style={[styles.note, { color: loud.warn }]}>
                            Needs {lacking.map((item) => EQUIPMENT_LABEL[item].toLowerCase()).join(' and ')}, which
                            you did not pick
                          </Text>
                        )}
                      </Pressable>
                      <Text style={[styles.target, { color: loud.figure }]}>
                        {exercise.sets} × {exercise.reps ?? '—'}
                      </Text>
                      <Tappable
                        onPress={() => toggleExercise(routineIndex, exerciseIndex)}
                        scaleTo={0.85}
                        style={styles.toggle}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: exercise.include }}
                        accessibilityLabel={`${exercise.include ? 'Leave out' : 'Keep'} ${exercise.name}`}
                      >
                        <Text style={{ fontSize: 16, color: exercise.include ? loud.figureFaint : loud.loud }}>
                          {exercise.include ? '✕' : '+'}
                        </Text>
                      </Tappable>
                    </View>
                  );
                })}
              </Card>
            </View>
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

      <ExerciseInfoSheet entry={info} onClose={() => setInfo(null)} />
    </Screen>
  );
}

/**
 * One choice. Days are the loud red, because they are the question; equipment
 * and level are quiet white, because they are settings that mostly stay put.
 */
const Chip = ({
  label,
  on,
  onPress,
  quiet = false,
  radio = false,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  quiet?: boolean;
  radio?: boolean;
}) => {
  const fill = quiet ? loud.figure : loud.loud;
  return (
    <Pressable
      accessibilityRole={radio ? 'radio' : 'checkbox'}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: on ? fill : loud.panel, borderColor: on ? fill : loud.rule }]}
    >
      <Text
        style={{ fontFamily: font.uiStrong, fontSize: 14, color: on ? (quiet ? loud.ground : loud.onLoud) : loud.figure }}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: space.xs },
  label: { fontFamily: font.display, fontSize: 11, letterSpacing: 1.2, marginTop: space.sm },
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
  rowMain: { flex: 1, paddingVertical: space.xs },
  coaching: { borderLeftWidth: 2, paddingLeft: space.sm, marginVertical: space.sm },
  target: { fontFamily: font.figure, fontSize: 15 },
  toggle: { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
});
