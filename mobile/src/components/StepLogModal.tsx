import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ISODate } from '@adaptive-macros/engine';
import { deleteDailySteps } from '../db';
import { notify } from '../dialog';
import { calculateDistanceKm, calculateNeatKcal } from '../health/neat';
import {
  loadHealthSyncConfig,
  logDailyStepCount,
} from '../health/healthSync';
import type { HealthSyncConfig } from '../health/types';
import { thud } from '../platform/haptics';
import { font, radius, space, useTheme } from '../theme';
import { Button } from './Controls';
import { Tappable } from './Tappable';

export interface StepLogModalProps {
  visible: boolean;
  onClose: () => void;
  date: ISODate;
  initialSteps?: number;
  userWeightKg?: number;
  onSaved?: (steps: number) => void;
}

export const StepLogModal = ({
  visible,
  onClose,
  date,
  initialSteps = 0,
  userWeightKg = 75,
  onSaved,
}: StepLogModalProps) => {
  const { colors } = useTheme();

  const [steps, setSteps] = useState<number>(initialSteps);
  const [stepInput, setStepInput] = useState<string>(initialSteps > 0 ? String(initialSteps) : '');
  const [config, setConfig] = useState<HealthSyncConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setSteps(initialSteps);
      setStepInput(initialSteps > 0 ? String(initialSteps) : '');
      void loadHealthSyncConfig().then(setConfig);
    }
  }, [visible, initialSteps]);

  const handleStepChange = (valStr: string) => {
    const cleaned = valStr.replace(/[^0-9]/g, '');
    setStepInput(cleaned);
    const num = parseInt(cleaned, 10);
    setSteps(isNaN(num) ? 0 : num);
  };

  const addSteps = (delta: number) => {
    thud('light');
    const newSteps = Math.max(0, steps + delta);
    setSteps(newSteps);
    setStepInput(String(newSteps));
  };

  const handleSave = async () => {
    thud('heavy');
    setIsSaving(true);
    try {
      // Zero clears the day: a stored zero would count as a logged day and
      // pull the average down for a day that was simply not recorded.
      if (steps === 0) {
        await deleteDailySteps(date);
      } else {
        await logDailyStepCount({
          date,
          steps,
          bodyWeightKg: userWeightKg,
          source: 'manual',
        });
      }
      onSaved?.(steps);
      notify(
        steps === 0 ? 'Steps cleared' : 'Steps Logged',
        steps === 0 ? `No step count for ${date}.` : `${steps.toLocaleString()} steps saved for ${date}`,
      );
      onClose();
    } catch (err) {
      notify('Error', (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const goal = config?.dailyStepGoal ?? 10000;
  const progressPct = Math.min(100, Math.round((steps / goal) * 100));
  const neatKcal = calculateNeatKcal(steps, userWeightKg);
  const distanceKm = calculateDistanceKm(steps);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <Ionicons name="footsteps" size={22} color={colors.accent} />
              <Text style={[styles.title, { color: colors.text }]}>Daily Steps & Activity</Text>
            </View>
            <Tappable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Tappable>
          </View>

          <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
            {/* Main Stats Card */}
            <View style={[styles.statsCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <View style={styles.statsRow}>
                <View style={styles.statCol}>
                  <Text style={[styles.statValue, { color: colors.text }]}>
                    {steps.toLocaleString()}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                    of {goal.toLocaleString()} steps
                  </Text>
                </View>
                <View style={styles.badgesCol}>
                  <View style={[styles.pillBadge, { backgroundColor: colors.accent + '20', borderColor: colors.accent }]}>
                    <Ionicons name="flame" size={14} color={colors.accent} />
                    <Text style={[styles.pillText, { color: colors.accent }]}>
                      {neatKcal} kcal NEAT
                    </Text>
                  </View>
                  <View style={[styles.pillBadge, { backgroundColor: colors.border, borderColor: colors.border }]}>
                    <Ionicons name="navigate" size={14} color={colors.textMuted} />
                    <Text style={[styles.pillText, { color: colors.textMuted }]}>
                      {distanceKm} km
                    </Text>
                  </View>
                </View>
              </View>

              {/* Progress Bar */}
              <View style={[styles.progressBarTrack, { backgroundColor: colors.surface }]}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      backgroundColor: progressPct >= 100 ? colors.positive : colors.accent,
                      width: `${progressPct}%`,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.progressSubtitle, { color: colors.textFaint }]}>
                {progressPct}% of daily activity goal
              </Text>
            </View>

            {/* Quick Add Buttons */}
            <Text style={[styles.sectionHeading, { color: colors.textMuted }]}>QUICK ADD STEPS</Text>
            <View style={styles.quickAddRow}>
              {[1000, 2500, 5000].map((delta) => (
                <Tappable
                  key={delta}
                  onPress={() => addSteps(delta)}
                  style={[
                    styles.quickAddBtn,
                    { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
                  ]}
                >
                  <Ionicons name="add" size={14} color={colors.accent} />
                  <Text style={[styles.quickAddText, { color: colors.text }]}>
                    +{delta.toLocaleString()}
                  </Text>
                </Tappable>
              ))}
            </View>

            {/* Manual Exact Input */}
            <Text style={[styles.sectionHeading, { color: colors.textMuted }]}>OR ENTER EXACT COUNT</Text>
            <View style={[styles.inputRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <Ionicons name="create-outline" size={18} color={colors.textMuted} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={stepInput}
                onChangeText={handleStepChange}
                placeholder="e.g. 8420"
                placeholderTextColor={colors.textFaint}
                keyboardType="numeric"
                returnKeyType="done"
              />
              {stepInput.length > 0 && (
                <Tappable onPress={() => handleStepChange('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Tappable>
              )}
            </View>

            {/* There is no health-app connection yet: the web app cannot read Apple
                Health or Health Connect. This used to offer a "connect" button that
                saved a made-up 8,500 steps and said syncing had started. */}
            <Text style={[styles.syncSubtitle, { color: colors.textMuted }]}>
              Steps are entered by hand for now. Copy today's count from your phone's health app; automatic
              sync needs the phone app, which is not out yet.
            </Text>

            {/* Save Button */}
            <View style={styles.actionWrap}>
              <Button
                label={isSaving ? 'Saving...' : steps === 0 && initialSteps > 0 ? 'Clear steps for this day' : 'Save Steps'}
                onPress={() => void handleSave()}
                disabled={isSaving}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  title: {
    fontFamily: font.display,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  closeBtn: {
    padding: space.xs,
  },
  scrollBody: {
    maxHeight: 520,
  },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
    gap: space.md,
  },
  statsCard: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statCol: {
    gap: 2,
  },
  statValue: {
    fontFamily: font.figure,
    fontSize: 28,
    fontWeight: '700',
  },
  statLabel: {
    fontFamily: font.ui,
    fontSize: 13,
  },
  badgesCol: {
    alignItems: 'flex-end',
    gap: 6,
  },
  pillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillText: {
    fontFamily: font.figure,
    fontSize: 12,
    fontWeight: '600',
  },
  progressBarTrack: {
    height: 8,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginTop: space.xs,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  progressSubtitle: {
    fontFamily: font.ui,
    fontSize: 12,
  },
  sectionHeading: {
    fontFamily: font.figure,
    fontSize: 11,
    letterSpacing: 0.8,
    marginTop: space.xs,
  },
  quickAddRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  quickAddBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickAddText: {
    fontFamily: font.figure,
    fontSize: 13,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    height: 48,
  },
  input: {
    flex: 1,
    fontFamily: font.figure,
    fontSize: 16,
    padding: 0,
  },
  syncSubtitle: {
    fontFamily: font.ui,
    fontSize: 12,
  },
  actionWrap: {
    marginTop: space.sm,
  },
});
