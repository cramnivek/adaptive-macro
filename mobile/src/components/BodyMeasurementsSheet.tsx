import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { navyBodyFatPct, todayISO } from '@adaptive-macros/engine';
import type { ISODate } from '@adaptive-macros/engine';
import {
  deleteBodyMeasurement,
  logBodyMeasurement,
  type BodyFatSource,
  type BodyMeasurementRecord,
} from '../db';
import { notify } from '../dialog';
import { thud } from '../platform/haptics';
import { useApp } from '../state/AppStore';
import type { UnitSystem } from '../state/settings';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { TOUCH_TARGET } from './Controls';
import { Tappable } from './Tappable';

interface BodyMeasurementsSheetProps {
  open: boolean;
  onClose: () => void;
  units: UnitSystem;
  onSaved: () => void;
  initialRecord?: BodyMeasurementRecord | null;
}

const cmToInches = (cm: number): number => cm / 2.54;
const inchesToCm = (inches: number): number => inches * 2.54;

export const BodyMeasurementsSheet = ({
  open,
  onClose,
  units,
  onSaved,
  initialRecord = null,
}: BodyMeasurementsSheetProps) => {
  const { settings } = useApp();
  const isMetric = units === 'metric';
  const unitLabel = isMetric ? 'cm' : 'in';

  const formatInitial = (cmVal: number | null | undefined): string => {
    if (cmVal == null || isNaN(cmVal)) return '';
    const displayVal = isMetric ? cmVal : cmToInches(cmVal);
    return (Math.round(displayVal * 10) / 10).toString();
  };

  const [date, setDate] = useState<ISODate>(initialRecord?.date ?? todayISO());
  const [waist, setWaist] = useState<string>(formatInitial(initialRecord?.waistCm));
  const [chest, setChest] = useState<string>(formatInitial(initialRecord?.chestCm));
  const [arms, setArms] = useState<string>(formatInitial(initialRecord?.armsCm));
  const [thighs, setThighs] = useState<string>(formatInitial(initialRecord?.thighsCm));
  const [calves, setCalves] = useState<string>(formatInitial(initialRecord?.calvesCm));
  const [hips, setHips] = useState<string>(formatInitial(initialRecord?.hipsCm));
  const [neck, setNeck] = useState<string>(formatInitial(initialRecord?.neckCm));
  const [shoulders, setShoulders] = useState<string>(formatInitial(initialRecord?.shouldersCm));
  const [bodyFat, setBodyFat] = useState<string>(
    initialRecord?.bodyFatPct != null ? initialRecord.bodyFatPct.toString() : ''
  );
  // How the figure in the box got there. Typing always makes it 'entered', so a
  // tape or photo figure someone then corrects by hand is stored as theirs.
  const [bodyFatSource, setBodyFatSource] = useState<BodyFatSource>(initialRecord?.bodyFatSource ?? 'entered');
  const [notes, setNotes] = useState<string>(initialRecord?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const parseInputToCm = (text: string): number | null => {
    const clean = text.trim().replace(',', '.');
    if (!clean) return null;
    const num = parseFloat(clean);
    if (isNaN(num) || num <= 0) return null;
    return isMetric ? num : inchesToCm(num);
  };

  const parseBodyFat = (text: string): number | null => {
    const clean = text.trim().replace(',', '.');
    if (!clean) return null;
    const num = parseFloat(clean);
    if (isNaN(num) || num < 2 || num > 70) return null;
    return num;
  };

  // Most people have never had their body fat measured, but most can find a
  // tape. Once the waist and neck are in (and hips, for women), the Navy
  // equations give a figure from their own shape, offered rather than filled
  // in: the box stays theirs, for a scan's number if they have one.
  const { sex, heightCm } = settings.profile;
  const waistNow = parseInputToCm(waist);
  const neckNow = parseInputToCm(neck);
  const navyEstimate =
    waistNow != null && neckNow != null
      ? navyBodyFatPct(sex, heightCm, waistNow, neckNow, parseInputToCm(hips))
      : null;
  const navyText = navyEstimate != null ? navyEstimate.toFixed(1) : null;
  const usingNavy = navyText != null && bodyFatSource === 'tape' && bodyFat.trim().replace(',', '.') === navyText;

  const handleSave = async () => {
    const waistCm = parseInputToCm(waist);
    const chestCm = parseInputToCm(chest);
    const armsCm = parseInputToCm(arms);
    const thighsCm = parseInputToCm(thighs);
    const calvesCm = parseInputToCm(calves);
    const hipsCm = parseInputToCm(hips);
    const neckCm = parseInputToCm(neck);
    const shouldersCm = parseInputToCm(shoulders);
    const bodyFatPct = parseBodyFat(bodyFat);

    const hasAny =
      waistCm != null ||
      chestCm != null ||
      armsCm != null ||
      thighsCm != null ||
      calvesCm != null ||
      hipsCm != null ||
      neckCm != null ||
      shouldersCm != null ||
      bodyFatPct != null;

    if (!hasAny) {
      notify('No measurements entered', 'Please enter at least one measurement or body fat percentage.');
      return;
    }

    try {
      setSaving(true);
      thud('light');
      await logBodyMeasurement({
        date,
        waistCm,
        chestCm,
        armsCm,
        thighsCm,
        calvesCm,
        hipsCm,
        neckCm,
        shouldersCm,
        bodyFatPct,
        bodyFatSource,
        notes: notes.trim() || null,
      });

      notify('Measurement Saved', `Logged for ${date}.`);
      onSaved();
      onClose();
    } catch (e) {
      notify('Error saving', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!initialRecord?.id) return;
    try {
      setSaving(true);
      thud('light');
      await deleteBodyMeasurement(initialRecord.id);
      notify('Measurement Deleted', 'The entry has been removed.');
      onSaved();
      onClose();
    } catch (e) {
      notify('Error deleting', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>
                  {initialRecord ? 'EDIT MEASUREMENTS' : 'LOG BODY MEASUREMENTS'}
                </Text>
                <Text style={styles.subtitle}>
                  Track circumferences ({unitLabel.toUpperCase()}) & body fat % over time.
                </Text>
              </View>
              <Tappable onPress={onClose} scaleTo={0.9} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={loud.figureMuted} />
              </Tappable>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Date & Body Fat Section */}
              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.label}>DATE (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    value={date}
                    onChangeText={setDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={loud.figureMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>BODY FAT (%)</Text>
                  <TextInput
                    style={styles.input}
                    value={bodyFat}
                    onChangeText={(text) => {
                      setBodyFat(text);
                      setBodyFatSource('entered');
                    }}
                    placeholder="e.g. 15.2"
                    placeholderTextColor={loud.figureMuted}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Core Circumferences */}
              <Text style={styles.sectionHeading}>CORE CIRCUMFERENCES ({unitLabel.toUpperCase()})</Text>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.label}>WAIST</Text>
                  <TextInput
                    style={styles.input}
                    value={waist}
                    onChangeText={setWaist}
                    placeholder={`0.0 ${unitLabel}`}
                    placeholderTextColor={loud.figureMuted}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>CHEST</Text>
                  <TextInput
                    style={styles.input}
                    value={chest}
                    onChangeText={setChest}
                    placeholder={`0.0 ${unitLabel}`}
                    placeholderTextColor={loud.figureMuted}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.label}>HIPS</Text>
                  <TextInput
                    style={styles.input}
                    value={hips}
                    onChangeText={setHips}
                    placeholder={`0.0 ${unitLabel}`}
                    placeholderTextColor={loud.figureMuted}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>SHOULDERS</Text>
                  <TextInput
                    style={styles.input}
                    value={shoulders}
                    onChangeText={setShoulders}
                    placeholder={`0.0 ${unitLabel}`}
                    placeholderTextColor={loud.figureMuted}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Limbs */}
              <Text style={styles.sectionHeading}>LIMBS & NECK ({unitLabel.toUpperCase()})</Text>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.label}>ARMS (BICEPS)</Text>
                  <TextInput
                    style={styles.input}
                    value={arms}
                    onChangeText={setArms}
                    placeholder={`0.0 ${unitLabel}`}
                    placeholderTextColor={loud.figureMuted}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>THIGHS</Text>
                  <TextInput
                    style={styles.input}
                    value={thighs}
                    onChangeText={setThighs}
                    placeholder={`0.0 ${unitLabel}`}
                    placeholderTextColor={loud.figureMuted}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.col}>
                  <Text style={styles.label}>CALVES</Text>
                  <TextInput
                    style={styles.input}
                    value={calves}
                    onChangeText={setCalves}
                    placeholder={`0.0 ${unitLabel}`}
                    placeholderTextColor={loud.figureMuted}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>NECK</Text>
                  <TextInput
                    style={styles.input}
                    value={neck}
                    onChangeText={setNeck}
                    placeholder={`0.0 ${unitLabel}`}
                    placeholderTextColor={loud.figureMuted}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {navyText != null ? (
                <View style={styles.estimate}>
                  <View style={styles.estimateText}>
                    <Text style={styles.estimateFigure}>About {navyText}% body fat</Text>
                    <Text style={styles.estimateNote}>
                      An estimate from your waist, neck{sex === 'female' ? ', hips' : ''} and height (the
                      US Navy tape method), usually within 3–4 points of a scan.{' '}
                      {sex === 'female'
                        ? 'The method measures the waist at its narrowest, the hips at their widest and the neck just below the voice box, relaxed.'
                        : 'The method measures the waist at the navel and the neck just below the voice box, relaxed.'}
                    </Text>
                  </View>
                  {usingNavy ? (
                    <Text style={styles.estimateUsed}>IN USE</Text>
                  ) : (
                    <Tappable
                      onPress={() => {
                        setBodyFat(navyText);
                        setBodyFatSource('tape');
                      }}
                      scaleTo={0.95}
                      style={styles.estimateBtn}
                      accessibilityLabel={`Use ${navyText} percent as body fat`}
                    >
                      <Text style={styles.estimateBtnText}>USE IT</Text>
                    </Tappable>
                  )}
                </View>
              ) : (
                waistNow != null &&
                neckNow != null &&
                sex === 'female' && (
                  <Text style={styles.estimateNote}>Add your hips to get a body-fat estimate from the tape.</Text>
                )
              )}

              {/* Notes */}
              <View style={styles.fullCol}>
                <Text style={styles.label}>NOTES (OPTIONAL)</Text>
                <TextInput
                  style={[styles.input, styles.notesInput]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Morning weigh-in, relaxed posture, tape measure notes..."
                  placeholderTextColor={loud.figureMuted}
                  multiline
                />
              </View>

              {/* Actions */}
              <View style={styles.actions}>
                <Tappable
                  onPress={handleSave}
                  scaleTo={0.97}
                  style={styles.saveBtn}
                  disabled={saving}
                >
                  <View style={[styles.saveBtnInner, { backgroundColor: loud.loud }]}>
                    <Text style={[styles.saveBtnText, { color: loud.onLoud }]}>
                      {saving ? 'SAVING...' : 'SAVE MEASUREMENT'}
                    </Text>
                  </View>
                </Tappable>

                {initialRecord && (
                  <Tappable
                    onPress={handleDelete}
                    scaleTo={0.97}
                    style={styles.deleteBtn}
                    disabled={saving}
                  >
                    <View style={styles.deleteBtnInner}>
                      <Text style={styles.deleteBtnText}>DELETE ENTRY</Text>
                    </View>
                  </Tappable>
                )}
              </View>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    maxHeight: '88%',
    width: '100%',
  },
  sheet: {
    backgroundColor: loud.panel,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: loud.rule,
    paddingTop: space.lg,
    paddingBottom: Platform.OS === 'ios' ? 36 : space.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },
  title: {
    fontFamily: font.display,
    fontSize: 16,
    fontWeight: '800',
    color: loud.figure,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontFamily: font.ui,
    fontSize: 12,
    color: loud.figureMuted,
    marginTop: 2,
  },
  closeBtn: {
    padding: space.xs,
    borderRadius: radius.pill,
    backgroundColor: loud.ground,
  },
  scroll: {
    paddingHorizontal: space.lg,
  },
  scrollContent: {
    paddingBottom: space.xl,
    gap: space.md,
  },
  sectionHeading: {
    fontFamily: font.figure,
    fontSize: 11,
    fontWeight: '700',
    color: loud.figureMuted,
    letterSpacing: 1,
    marginTop: space.xs,
  },
  row: {
    flexDirection: 'row',
    gap: space.sm,
  },
  col: {
    flex: 1,
  },
  fullCol: {
    width: '100%',
  },
  label: {
    fontFamily: font.figure,
    fontSize: 10,
    fontWeight: '700',
    color: loud.figureMuted,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  input: {
    backgroundColor: loud.ground,
    borderWidth: 1,
    borderColor: loud.rule,
    borderRadius: radius.md,
    color: loud.figure,
    fontFamily: font.figure,
    fontSize: 14,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: TOUCH_TARGET,
  },
  estimate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: loud.rule,
    backgroundColor: loud.ground,
  },
  estimateText: {
    flex: 1,
    gap: 2,
  },
  estimateFigure: {
    fontFamily: font.figure,
    fontSize: 14,
    fontWeight: '700',
    color: loud.figure,
  },
  estimateNote: {
    fontFamily: font.ui,
    fontSize: 11,
    lineHeight: 16,
    color: loud.figureMuted,
  },
  estimateBtn: {
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: loud.loud,
    alignItems: 'center',
    justifyContent: 'center',
  },
  estimateBtnText: {
    fontFamily: font.display,
    fontSize: 12,
    fontWeight: '800',
    color: loud.loud,
    letterSpacing: 1,
  },
  estimateUsed: {
    fontFamily: font.display,
    fontSize: 11,
    fontWeight: '800',
    color: loud.figureMuted,
    letterSpacing: 1,
  },
  notesInput: {
    minHeight: 64,
    textAlignVertical: 'top',
    paddingTop: space.sm,
  },
  actions: {
    marginTop: space.sm,
    gap: space.sm,
  },
  saveBtn: {
    width: '100%',
  },
  saveBtnInner: {
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH_TARGET + 4,
  },
  saveBtnText: {
    fontFamily: font.display,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  deleteBtn: {
    width: '100%',
  },
  deleteBtnInner: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH_TARGET,
  },
  deleteBtnText: {
    fontFamily: font.display,
    fontSize: 12,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 1,
  },
});
