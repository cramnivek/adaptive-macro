import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
import { Button, TOUCH_TARGET } from '../src/components/Controls';
import { Screen } from '../src/components/Screen';
import { notify } from '../src/dialog';
import { commitImport, planImport } from '../src/import/runImport';
import type { ImportPlan } from '../src/import/importWorkouts';
import { space, useTheme } from '../src/theme';

/**
 * Imports lifting history from a Hevy CSV export.
 *
 * Nothing is written until the preview is accepted. The three figures shown
 * are the ones most likely to be wrong — the bodyweight inference, what will
 * be excluded, and the unit conversion — so they are stated rather than left
 * for the user to discover after the fact.
 */
export default function ImportWorkoutsScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const csv = await FileSystem.readAsStringAsync(result.assets[0].uri);
      setPlan(await planImport(csv));
      setOverrides({});
    } catch (error) {
      // The parser throws with the header it received when the format does not
      // match, which is the message worth showing verbatim.
      notify('Could not read that file', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const written = await commitImport(plan, overrides);
      notify(
        'Imported',
        `${written.sessions} sessions and ${written.sets} sets are now in your history.`,
      );
      router.back();
    } catch (error) {
      notify('Import failed', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const isBodyweight = (name: string, inferred: boolean) => overrides[name] ?? inferred;

  return (
    <Screen title="Import workouts">
      {!plan && (
        <Card title="Hevy export">
          <Text style={[styles.note, { color: colors.textFaint }]}>
            In Hevy, go to Settings, then Export Data, and send yourself the CSV. Pick that
            file here. Nothing is saved until you have seen what it found.
          </Text>
          <Button label={busy ? 'Reading…' : 'Choose a CSV file'} onPress={pick} disabled={busy} />
        </Card>
      )}

      {plan && (
        <>
          <Card title="What this file holds">
            <Text style={[styles.line, { color: colors.text }]}>
              {plan.sessions.length} sessions, {plan.setsToWrite} sets
              {plan.dateRange ? `, ${plan.dateRange.first} to ${plan.dateRange.last}` : ''}
            </Text>
            {plan.duplicateSessions > 0 && (
              <Text style={[styles.note, { color: colors.textFaint }]}>
                {plan.duplicateSessions} sessions are already in your history and will be
                skipped. Importing the same file twice changes nothing.
              </Text>
            )}
            {plan.sampleWeight && (
              <Text style={[styles.note, { color: colors.textFaint }]}>
                Weights convert from pounds: {plan.sampleWeight.exerciseName} at{' '}
                {plan.sampleWeight.lbs.toFixed(0)} lb becomes{' '}
                {plan.sampleWeight.kg.toFixed(1)} kg. If that looks wrong by a factor, stop
                here.
              </Text>
            )}
          </Card>

          {plan.exercises.length > 0 && (
            <Card title="Which of these are bodyweight?">
              <Text style={[styles.note, { color: colors.textFaint }]}>
                Bodyweight exercises count your own weight as the load, taken from your
                weight trend on each date. This is guessed from whether a weight was ever
                recorded, so a weighted dip or pull-up needs correcting here — tap to
                change.
              </Text>
              {plan.exercises.map((exercise) => {
                const on = isBodyweight(exercise.name, exercise.bodyweightBased);
                return (
                  <Pressable
                    key={exercise.name}
                    onPress={() =>
                      setOverrides((prev) => ({ ...prev, [exercise.name]: !on }))
                    }
                    style={[styles.row, { borderColor: colors.border }]}
                  >
                    <View style={styles.rowText}>
                      <Text style={{ color: colors.text }}>{exercise.name}</Text>
                      <Text style={[styles.note, { color: colors.textFaint }]}>
                        {exercise.setCount} sets
                      </Text>
                    </View>
                    <Text style={{ color: on ? colors.accent : colors.textFaint }}>
                      {on ? 'Bodyweight' : 'Weighted'}
                    </Text>
                  </Pressable>
                );
              })}
            </Card>
          )}

          <Card title="What will be left out">
            <Text style={[styles.note, { color: colors.textFaint }]}>
              {plan.skipped.noReps} sets have no reps — those are logged by time or
              distance, which this app does not track, so they are not imported.
            </Text>
            <Text style={[styles.note, { color: colors.textFaint }]}>
              {plan.skipped.noWeightOnLoadedLift} sets on weighted exercises have no weight
              recorded. They are imported as part of the session, but left out of
              progression rather than counted as zero.
            </Text>
            <Text style={[styles.note, { color: colors.textFaint }]}>
              These columns are ignored: {plan.droppedColumns.join(', ')}.
            </Text>
          </Card>

          <Button
            label={busy ? 'Importing…' : `Import ${plan.sessions.length} sessions`}
            onPress={commit}
            disabled={busy || plan.sessions.length === 0}
          />
          <Button label="Choose a different file" onPress={pick} variant="subtle" />
        </>
      )}

      {busy && <ActivityIndicator style={{ marginTop: space.md }} color={colors.accent} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { fontSize: 15, marginBottom: 4 },
  note: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: TOUCH_TARGET,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.xs,
  },
  rowText: { flex: 1, paddingRight: space.sm },
});
