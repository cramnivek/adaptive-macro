import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LoggedSet } from '../db';
import { confirm } from '../dialog';
import { displayWeight, weightUnit } from '../format';
import { readSetEdit } from '../setEdit';
import type { UnitSystem } from '../state/settings';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { Button, TOUCH_TARGET } from './Controls';

interface EditSetSheetProps {
  /** The set being corrected, or null when the sheet is closed. */
  set: LoggedSet | null;
  units: UnitSystem;
  /** The workout's only set: deleting it deletes the workout, and the confirm says so. */
  isLastSet: boolean;
  onCancel: () => void;
  onSave: (weightKg: number | null, reps: number) => Promise<void>;
  onDelete: () => Promise<void>;
}

/**
 * Keeps password managers off the number fields, as the logger does for its set inputs: a number
 * box looks enough like a login to them that they pin their own button inside it.
 */
const NOT_A_LOGIN = {
  autoComplete: 'off',
  dataSet: { lpignore: 'true', '1pIgnore': 'true', bwignore: 'true', formType: 'other' },
} as const;

/**
 * Correct a set of a finished workout, or take it out.
 *
 * Only weight and reps: the slip worth fixing afterwards is a mistyped number, and the rating
 * and the set's kind were not typed. The figures are read by `readSetEdit`, so a 800 for 80 is
 * refused here rather than stored.
 */
export const EditSetSheet = ({ set, units, isLastSet, onCancel, onSave, onDelete }: EditSetSheetProps) => {
  const insets = useSafeAreaInsets();
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Each set opens with its own figures, and without the last attempt's complaint.
  useEffect(() => {
    if (set === null) return;
    setWeight(set.weightKg === null ? '' : String(Math.round(displayWeight(set.weightKg, units) * 10) / 10));
    setReps(String(set.reps));
    setProblem(null);
    setBusy(false);
  }, [set?.id]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (set === null || busy) return;
    const edit = readSetEdit(weight, reps, units, set.bodyweightBased);
    if ('problem' in edit) {
      setProblem(edit.problem);
      return;
    }
    setProblem(null);
    void run(() => onSave(edit.weightKg, edit.reps));
  };

  const remove = async () => {
    if (busy) return;
    const ok = await confirm(
      isLastSet
        ? {
            title: 'Delete this set?',
            message: "This is the workout's only set, so the workout is deleted too.",
            confirmLabel: 'Delete workout',
            destructive: true,
          }
        : {
            title: 'Delete this set?',
            message: 'It is removed from this workout and from your history.',
            confirmLabel: 'Delete',
            destructive: true,
          },
    );
    if (ok) void run(onDelete);
  };

  const unit = weightUnit(units).toUpperCase();

  return (
    <Modal visible={set !== null} animationType="slide" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <Text style={styles.title}>EDIT SET</Text>
          {set && <Text style={styles.subtitle}>{set.exerciseName}</Text>}

          <View style={styles.fields}>
            <View style={styles.field}>
              <Text style={styles.label}>WEIGHT ({unit})</Text>
              <TextInput
                value={weight}
                onChangeText={setWeight}
                {...NOT_A_LOGIN}
                keyboardType="decimal-pad"
                placeholder={set?.bodyweightBased ? 'BW' : '—'}
                placeholderTextColor={loud.figureFaint}
                accessibilityLabel={`Weight in ${weightUnit(units)}`}
                style={styles.input}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>REPS</Text>
              <TextInput
                value={reps}
                onChangeText={setReps}
                {...NOT_A_LOGIN}
                keyboardType="number-pad"
                placeholder="—"
                placeholderTextColor={loud.figureFaint}
                accessibilityLabel="Reps"
                style={styles.input}
              />
            </View>
          </View>

          {problem !== null && <Text style={styles.problem}>{problem}</Text>}

          <View style={styles.actions}>
            <Button tone="loud" label="Save" onPress={save} disabled={busy} />
            <Button tone="loud" variant="danger" label="Delete set" onPress={() => void remove()} disabled={busy} />
            <Button tone="loud" variant="subtle" label="Cancel" onPress={onCancel} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: loud.ground,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    padding: space.lg,
  },
  title: { fontFamily: font.display, fontSize: 16, letterSpacing: 1, color: loud.figure },
  subtitle: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, color: loud.figureFaint, marginTop: 2 },
  fields: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  field: { flex: 1 },
  label: { fontFamily: font.display, fontSize: 9, letterSpacing: 1.3, color: loud.figureFaint, marginBottom: 4 },
  input: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    backgroundColor: loud.panel,
    paddingHorizontal: space.sm,
    textAlign: 'center',
    fontFamily: font.figure,
    fontSize: 20,
    color: loud.figure,
  },
  problem: { fontFamily: font.ui, fontSize: 12, color: loud.warn, marginTop: space.sm },
  actions: { marginTop: space.md },
});
