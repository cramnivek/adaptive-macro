import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import type { ISODate } from '@adaptive-macros/engine';
import { notify } from '../dialog';
import { calculateDistanceKm, calculateNeatKcal } from '../health/neat';
import {
  importAppleHealthXml,
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
  const [isImporting, setIsImporting] = useState(false);
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
      await logDailyStepCount({
        date,
        steps,
        bodyWeightKg: userWeightKg,
        source: 'manual',
      });
      onSaved?.(steps);
      notify('Steps Logged', `${steps.toLocaleString()} steps saved for ${date}`);
      onClose();
    } catch (err) {
      notify('Error', (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAppleHealthFileImport = async () => {
    thud('light');
    try {
      const doc = await DocumentPicker.getDocumentAsync({
        type: ['text/xml', 'application/xml', '*/*'],
        copyToCacheDirectory: true,
      });

      if (doc.canceled || !doc.assets || doc.assets.length === 0) return;

      const file = doc.assets[0];
      setIsImporting(true);

      let xmlContent = '';
      if (Platform.OS === 'web') {
        const response = await fetch(file.uri);
        xmlContent = await response.text();
      } else {
        xmlContent = await FileSystem.readAsStringAsync(file.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      if (!xmlContent || !xmlContent.includes('<Record')) {
        notify('Invalid File', 'Could not find Apple Health records in the selected file.');
        setIsImporting(false);
        return;
      }

      const result = await importAppleHealthXml(xmlContent, userWeightKg);
      thud('heavy');
      notify(
        'Health Data Imported',
        `Imported ${result.totalStepsImported.toLocaleString()} steps across ${result.stepDaysCount} days and ${result.weightDaysCount} weigh-ins!`,
      );

      // Refresh config
      const refreshed = await loadHealthSyncConfig();
      setConfig(refreshed);
      onSaved?.(steps);
      onClose();
    } catch (err) {
      notify('Import Failed', (err as Error).message);
    } finally {
      setIsImporting(false);
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

            {/* HealthKit / Health Connect Section */}
            <View style={[styles.syncCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <View style={styles.syncHeaderRow}>
                <Ionicons
                  name={Platform.OS === 'ios' ? 'heart' : 'fitness'}
                  size={20}
                  color={colors.positive}
                />
                <View style={styles.syncHeaderTextWrap}>
                  <Text style={[styles.syncTitle, { color: colors.text }]}>
                    {Platform.OS === 'ios'
                      ? 'Apple Health Sync'
                      : Platform.OS === 'android'
                        ? 'Google Health Connect'
                        : 'Apple Health & Health Connect'}
                  </Text>
                  <Text style={[styles.syncSubtitle, { color: colors.textMuted }]}>
                    Sync steps and scale weigh-ins automatically
                  </Text>
                </View>
              </View>

              <View style={styles.syncActionsRow}>
                <Tappable
                  onPress={handleAppleHealthFileImport}
                  disabled={isImporting}
                  style={[
                    styles.syncActionBtn,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  {isImporting ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={16} color={colors.accent} />
                      <Text style={[styles.syncActionBtnText, { color: colors.text }]}>
                        Import Apple Health XML
                      </Text>
                    </>
                  )}
                </Tappable>
              </View>
            </View>

            {/* Save Button */}
            <View style={styles.actionWrap}>
              <Button
                label={isSaving ? 'Saving...' : 'Save Steps'}
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
  syncCard: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  syncHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  syncHeaderTextWrap: {
    flex: 1,
    gap: 2,
  },
  syncTitle: {
    fontFamily: font.uiStrong,
    fontSize: 14,
  },
  syncSubtitle: {
    fontFamily: font.ui,
    fontSize: 12,
  },
  syncActionsRow: {
    marginTop: space.xs,
  },
  syncActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  syncActionBtnText: {
    fontFamily: font.uiStrong,
    fontSize: 13,
  },
  actionWrap: {
    marginTop: space.sm,
  },
});
