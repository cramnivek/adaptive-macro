import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activeSession, createRoutine, listRoutines } from '../db';
import { confirm, notify } from '../dialog';
import {
  routineExercisesFromPost,
  type PostExercise,
} from '../social/postPayload';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { Button, TOUCH_TARGET } from './Controls';
import { Tappable } from './Tappable';

export interface CopyWorkoutSheetProps {
  visible: boolean;
  workoutTitle: string;
  authorName?: string;
  exercises: PostExercise[];
  onClose: () => void;
  onSaved?: (routineId: string, routineName: string) => void;
}

const MAX_NAME = 60;

/**
 * Modal sheet allowing lifters to copy any workout from the social feed,
 * either saving it as a reusable template routine or starting it immediately.
 */
export const CopyWorkoutSheet = ({
  visible,
  workoutTitle,
  authorName,
  exercises,
  onClose,
  onSaved,
}: CopyWorkoutSheetProps) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const defaultTitle = useMemo(() => {
    const raw = workoutTitle.trim();
    if (raw && raw.toLowerCase() !== 'workout') return raw;
    if (authorName) return `${authorName}'s Routine`;
    return 'Workout Routine';
  }, [workoutTitle, authorName]);

  const [name, setName] = useState(defaultTitle);
  const [busy, setBusy] = useState(false);
  const [existingRoutines, setExistingRoutines] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      setName(defaultTitle);
      // Only feeds the duplicate-name warning; unread, saving still works.
      listRoutines()
        .then((routines) => {
          setExistingRoutines(routines.map((r) => r.name.trim().toLowerCase()));
        })
        .catch(() => setExistingRoutines([]));
    }
  }, [visible, defaultTitle]);

  const draftExercises = useMemo(() => routineExercisesFromPost(exercises), [exercises]);
  const trimmedName = name.trim();
  const isDuplicate = existingRoutines.includes(trimmedName.toLowerCase());

  const handleSaveRoutine = async (): Promise<string | null> => {
    if (!trimmedName) {
      notify('Name routine', 'Please enter a name for the routine.');
      return null;
    }
    if (draftExercises.length === 0) {
      notify('No exercises', 'This workout has no exercises to copy.');
      return null;
    }

    setBusy(true);
    try {
      const routineId = await createRoutine(trimmedName, draftExercises);
      notify('Routine saved', `"${trimmedName}" is ready on your Train tab.`);
      onSaved?.(routineId, trimmedName);
      onClose();
      return routineId;
    } catch (error) {
      notify('Could not save routine', (error as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleStartWorkout = async () => {
    if (!trimmedName) {
      notify('Name routine', 'Please enter a name for the routine.');
      return;
    }
    if (draftExercises.length === 0) {
      notify('No exercises', 'This workout has no exercises to copy.');
      return;
    }

    setBusy(true);
    try {
      const active = await activeSession();
      if (active) {
        setBusy(false);
        const saveInstead = await confirm({
          title: 'Workout already in progress',
          message: 'You already have an active workout in progress. Would you like to save this routine to your library instead?',
          confirmLabel: 'Save Routine',
        });
        if (saveInstead) {
          await handleSaveRoutine();
        }
        return;
      }

      // No active workout: create routine and start session immediately
      const routineId = await createRoutine(trimmedName, draftExercises);
      onSaved?.(routineId, trimmedName);
      onClose();
      router.push(`/session?routine=${routineId}`);
    } catch (error) {
      notify('Could not start workout', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.md) + space.md }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitles}>
              <Text style={styles.headerTag}>WORKOUT TEMPLATE</Text>
              <Text style={styles.title}>Copy Workout</Text>
            </View>
            <Tappable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close sheet"
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={20} color={loud.figureMuted} />
            </Tappable>
          </View>

          <Text style={styles.subtitle}>
            Save this workout as a routine or start training immediately.
          </Text>

          {/* Routine Name Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>ROUTINE NAME</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={MAX_NAME}
              placeholder="e.g. Upper Body Hypertrophy"
              placeholderTextColor={loud.figureFaint}
              accessibilityLabel="Routine name"
              style={styles.input}
              autoFocus={false}
              selectTextOnFocus
            />
            {isDuplicate && (
              <Text style={styles.warningText}>
                A routine named "{trimmedName}" already exists. Saving will add another.
              </Text>
            )}
          </View>

          {/* Exercise List Preview */}
          <View style={styles.listSection}>
            <View style={styles.listHeaderRow}>
              <Text style={styles.listLabel}>
                EXERCISES ({draftExercises.length})
              </Text>
              {authorName && (
                <Text style={styles.authorCred} numberOfLines={1}>
                  from @{authorName}
                </Text>
              )}
            </View>

            <ScrollView
              style={styles.exerciseScroll}
              contentContainerStyle={styles.exerciseScrollContent}
              nestedScrollEnabled
            >
              {draftExercises.map((ex, index) => (
                <View key={`${ex.name}-${index}`} style={styles.exerciseRow}>
                  <View style={styles.exerciseIndexPill}>
                    <Text style={styles.exerciseIndexText}>{index + 1}</Text>
                  </View>
                  <View style={styles.exerciseMeta}>
                    <Text style={styles.exerciseName} numberOfLines={1}>
                      {ex.name}
                    </Text>
                    <Text style={styles.exerciseDetail}>
                      {ex.isCardio
                        ? 'Cardio'
                        : `${ex.targetSets} ${ex.targetSets === 1 ? 'set' : 'sets'}${
                            ex.targetReps ? ` · ${ex.targetReps} reps` : ''
                          }`}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            <Button
              tone="loud"
              label={busy ? 'Preparing…' : 'Start Workout Now'}
              onPress={() => void handleStartWorkout()}
              disabled={busy}
            />

            <Button
              tone="loud"
              variant="subtle"
              label={busy ? 'Saving…' : 'Save to My Routines'}
              onPress={() => void handleSaveRoutine()}
              disabled={busy}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 8, 10, 0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: loud.ground,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerTitles: {
    flex: 1,
  },
  headerTag: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 1.2,
    color: loud.loud,
    marginBottom: 2,
  },
  title: {
    fontFamily: font.display,
    fontSize: 22,
    letterSpacing: 1,
    color: loud.figure,
  },
  closeBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontFamily: font.ui,
    fontSize: 13,
    color: loud.figureMuted,
    marginTop: 4,
    marginBottom: space.md,
  },
  inputContainer: {
    marginBottom: space.md,
  },
  inputLabel: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 0.8,
    color: loud.figureMuted,
    marginBottom: space.xs,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: loud.rule,
    borderRadius: radius.md,
    backgroundColor: loud.panel,
    paddingHorizontal: space.md,
    fontFamily: font.ui,
    fontSize: 15,
    color: loud.figure,
  },
  warningText: {
    fontFamily: font.ui,
    fontSize: 12,
    color: '#FFB74D',
    marginTop: space.xs,
  },
  listSection: {
    marginBottom: space.lg,
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.xs,
  },
  listLabel: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 0.8,
    color: loud.figureMuted,
  },
  authorCred: {
    fontFamily: font.ui,
    fontSize: 12,
    color: loud.figureFaint,
  },
  exerciseScroll: {
    maxHeight: 180,
    backgroundColor: loud.panel,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  exerciseScrollContent: {
    paddingVertical: space.xs,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: loud.rule,
  },
  exerciseIndexPill: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: loud.ground,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.sm,
  },
  exerciseIndexText: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    color: loud.figureMuted,
  },
  exerciseMeta: {
    flex: 1,
  },
  exerciseName: {
    fontFamily: font.uiStrong,
    fontSize: 14,
    color: loud.figure,
  },
  exerciseDetail: {
    fontFamily: font.ui,
    fontSize: 12,
    color: loud.figureMuted,
    marginTop: 1,
  },
  actionsContainer: {
    gap: space.xs,
  },
});
