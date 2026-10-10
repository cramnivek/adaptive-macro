import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { documentKindOf, MAX_DOCUMENT_BYTES, readRoutinesWithGemini } from '../src/ai/geminiRoutine';
import { type ResolvedExercise, resolveAgainstLog } from '../src/ai/routineImport';
import { Card } from '../src/components/Card';
import { Button, TOUCH_TARGET } from '../src/components/Controls';
import { Screen } from '../src/components/Screen';
import { createRoutine, listExerciseNames } from '../src/db';
import { notify } from '../src/dialog';
import { pickBinaryFile } from '../src/platform/files';
import { useApp } from '../src/state/AppStore';
import { font, space } from '../src/theme';
import { session as loud } from '../src/theme/sessionTheme';

type Found = { name: string; exercises: ResolvedExercise[]; include: boolean };

/**
 * Routines read out of a programme someone was handed — a coach's PDF, a
 * screenshot of a spreadsheet.
 *
 * Nothing is saved until the list has been seen. The model reads a document
 * well but not perfectly, and a routine that quietly drops a lift is worse than
 * typing it in, so every exercise is shown, with which ones join existing
 * history and which start new.
 */
export default function ImportRoutineScreen() {
  const router = useRouter();
  const { settings } = useApp();

  const [known, setKnown] = useState<{ name: string; bodyweightBased: boolean }[]>([]);
  const [found, setFound] = useState<Found[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void listExerciseNames().then(setKnown);
  }, []);

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

    setReading(true);
    setFileName(picked.name);
    try {
      const base64 = await picked.readBase64();
      const drafts = await readRoutinesWithGemini(
        { mimeType: kind.mimeType, base64 },
        settings.foodLookup.geminiApiKey,
      );
      const names = known.map((k) => k.name);
      setFound(drafts.map((draft) => ({ ...resolveAgainstLog(draft, names), include: true })));
    } catch (error) {
      notify('Could not read the programme', (error as Error).message);
    } finally {
      setReading(false);
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
            bodyweightBased: known.find((k) => k.name === e.name)?.bodyweightBased ?? false,
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

  return (
    <Screen title="Import a programme" tone="loud">
      {!found && !reading && (
        <Card loud title="From a PDF or a screenshot">
          <Text style={[styles.note, { color: loud.figureMuted }]}>
            Pick the programme you were given. Each day in it becomes a routine, with its sets and
            rep targets. Nothing is saved until you have checked what it found.
          </Text>
          <Text style={[styles.note, { color: loud.figureFaint }]}>
            A spreadsheet? Save it as a PDF or screenshot it first.
          </Text>
          <Button tone="loud" label="Choose a file" onPress={pick} />
        </Card>
      )}

      {reading && (
        <Card loud title="Reading the programme">
          <Text style={[styles.note, { color: loud.figureMuted }]} numberOfLines={1}>
            {fileName}
          </Text>
          <Text style={[styles.note, { color: loud.figureFaint }]}>
            A long PDF can take up to a minute.
          </Text>
          <ActivityIndicator style={{ marginTop: space.md }} color={loud.loud} />
        </Card>
      )}

      {found && !reading && (
        <>
          <Text style={[styles.note, { color: loud.figureMuted }]}>
            Found {found.length} {found.length === 1 ? 'routine' : 'routines'} in {fileName}. Tap one to leave it out.
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
            label={
              saving
                ? 'Saving…'
                : chosen.length === 1
                  ? 'Save 1 routine'
                  : `Save ${chosen.length} routines`
            }
            onPress={save}
            disabled={saving || chosen.length === 0}
          />
          <Button tone="loud" label="Choose a different file" variant="subtle" onPress={pick} disabled={saving} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: space.xs },
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
