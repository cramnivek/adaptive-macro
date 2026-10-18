import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createRoutine } from '../db';
import type { LoggedSet } from '../db';
import { notify } from '../dialog';
import { routineExercisesFromSets } from '../routineFromSession';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { Button } from './Controls';

interface SaveRoutineSheetProps {
  visible: boolean;
  /** The session's name, offered as the routine's. Empty when it was only "Workout". */
  initialName: string;
  sets: LoggedSet[];
  /** Names already taken, so a repeat can be flagged rather than silently doubled. */
  existingNames: string[];
  onCancel: () => void;
  onSaved: (routineId: string, name: string) => void;
}

const MAX_NAME = 60;

/** Name a finished session's exercises and keep them as a routine. */
export const SaveRoutineSheet = ({
  visible,
  initialName,
  sets,
  existingNames,
  onCancel,
  onSaved,
}: SaveRoutineSheetProps) => {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const exercises = useMemo(() => routineExercisesFromSets(sets), [sets]);

  // Each opening starts from the session's own name, not the last attempt.
  useEffect(() => {
    if (visible) setName(initialName);
  }, [visible, initialName]);

  const trimmed = name.trim();
  const taken = existingNames.some((n) => n.trim().toLowerCase() === trimmed.toLowerCase());

  const save = async () => {
    if (busy) return;
    if (!trimmed) return notify('Name it', 'Give the routine a name first.');
    if (exercises.length === 0) return notify('Nothing to save', 'This workout has no exercises.');
    setBusy(true);
    try {
      const id = await createRoutine(trimmed, exercises);
      notify('Routine saved', `${trimmed} is ready on the Train tab.`);
      onSaved(id, trimmed);
    } catch (error) {
      notify('Could not save routine', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const describe = (e: (typeof exercises)[number]) =>
    e.isCardio
      ? `${e.cardioMode === 'outside' ? 'Outside' : 'Machine'}${e.targetTime ? ` · ${e.targetTime}` : ''}`
      : `${e.targetSets} sets${e.targetReps ? ` of ${e.targetReps}` : ''}`;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <Text style={styles.title}>SAVE AS ROUTINE</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={MAX_NAME}
            placeholder="e.g. Push Day, Upper A"
            placeholderTextColor={loud.figureFaint}
            accessibilityLabel="Routine name"
            style={styles.input}
          />
          {taken && (
            <Text style={styles.note}>A routine called {trimmed} already exists. Saving adds another.</Text>
          )}
          <View style={styles.list}>
            {exercises.map((e) => (
              <View key={e.name} style={styles.row}>
                <Text style={styles.exName} numberOfLines={1}>{e.name}</Text>
                <Text style={styles.exMeta}>{describe(e)}</Text>
              </View>
            ))}
          </View>
          <Button tone="loud" label={busy ? 'Saving…' : 'Save routine'} onPress={() => void save()} disabled={busy} />
          <Button tone="loud" variant="subtle" label="Cancel" onPress={onCancel} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,10,11,0.9)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: loud.ground,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    padding: space.lg,
  },
  title: { fontFamily: font.display, fontSize: 20, letterSpacing: 1.4, color: loud.figure },
  input: {
    marginTop: space.md,
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    borderRadius: radius.md,
    backgroundColor: loud.panel,
    paddingHorizontal: space.sm,
    fontFamily: font.ui,
    fontSize: 16,
    color: loud.figure,
  },
  note: { fontFamily: font.ui, fontSize: 12, color: loud.figureMuted, marginTop: space.xs },
  list: { marginVertical: space.md, maxHeight: 220, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingVertical: space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  exName: { flex: 1, fontFamily: font.uiStrong, fontSize: 14, color: loud.figure },
  exMeta: { fontFamily: font.ui, fontSize: 13, color: loud.figureFaint },
});
