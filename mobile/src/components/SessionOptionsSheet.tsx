import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SpeedUnit } from '../cardio';
import { playChime } from '../platform/chime';
import {
  CHIME_OPTIONS,
  type ChimeChoice,
} from '../platform/chimeSound';
import { thud } from '../platform/haptics';
import {
  MAX_REST_SECONDS,
  MIN_REST_SECONDS,
  formatRest,
} from '../rest';
import type { UnitSystem } from '../state/settings';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { Tappable } from './Tappable';

interface SessionOptionsSheetProps {
  open: boolean;
  onClose: () => void;
  units: UnitSystem;
  onToggleUnits: () => void;
  speedUnit: SpeedUnit;
  onToggleSpeedUnits: () => void;
  showWeightSwitcher: boolean;
  showSpeedSwitcher: boolean;
  restSound: boolean;
  onToggleAlert: () => void;
  restChimeChoice: ChimeChoice;
  onChangeChimeChoice: (choice: ChimeChoice) => void;
  restSeconds: number;
  onChangeRestSeconds: (seconds: number) => void;
  onStepRestSeconds: (steps: number) => void;
}

/** Standard lifting rest intervals for 1-tap selection. */
const REST_PRESETS = [45, 60, 90, 120, 180, 300] as const;

const formatPresetLabel = (sec: number): string => {
  if (sec < 60) return `${sec}S`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${m}M`;
};

/**
 * Session preferences sheet.
 *
 * Houses secondary switches (weight units, speed units, rest alert chime,
 * chime sound selection, and rest timer duration) that would otherwise crowd out
 * the workout title.
 */
export const SessionOptionsSheet = ({
  open,
  onClose,
  units,
  onToggleUnits,
  speedUnit,
  onToggleSpeedUnits,
  showWeightSwitcher,
  showSpeedSwitcher,
  restSound,
  onToggleAlert,
  restChimeChoice,
  onChangeChimeChoice,
  restSeconds,
  onChangeRestSeconds,
  onStepRestSeconds,
}: SessionOptionsSheetProps) => {
  const insets = useSafeAreaInsets();
  const canStepDown = restSeconds > MIN_REST_SECONDS;
  const canStepUp = restSeconds < MAX_REST_SECONDS;

  const handlePreview = (choice: ChimeChoice) => {
    thud('light');
    playChime(choice);
    onChangeChimeChoice(choice);
  };

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
        <View style={styles.header}>
          <Text style={styles.title}>WORKOUT OPTIONS</Text>
          <Tappable
            onPress={onClose}
            scaleTo={0.9}
            style={styles.closeHit}
            accessibilityRole="button"
            accessibilityLabel="Close options"
          >
            <Ionicons name="close" size={20} color={loud.figureMuted} />
          </Tappable>
        </View>
        <Text style={styles.subtitle}>Preferences, rest timer, chime tones, and units.</Text>
        <View style={styles.autoSaveNotice}>
          <Ionicons name="checkmark-circle" size={14} color="#34D399" />
          <Text style={styles.autoSaveNoticeText}>
            Workout auto-saved locally · Leave or resume anytime without losing progress.
          </Text>
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Rest Duration Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>REST TIMER DURATION</Text>
              <Text style={styles.sectionBadge}>{formatRest(restSeconds)}</Text>
            </View>

            {/* Hero Stepper Card */}
            <View style={styles.stepperBox}>
              <Tappable
                onPress={() => {
                  if (canStepDown) {
                    thud('light');
                    onStepRestSeconds(-1);
                  }
                }}
                scaleTo={0.92}
                disabled={!canStepDown}
                accessibilityRole="button"
                accessibilityLabel="Decrease rest duration by 15 seconds"
                style={[styles.stepBtnWrap, !canStepDown && styles.btnDisabled]}
              >
                <View
                  style={[
                    styles.stepBtn,
                    {
                      backgroundColor: loud.ground,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: loud.rule,
                    },
                  ]}
                >
                  <Text style={[styles.stepBtnText, !canStepDown && styles.stepBtnTextDisabled]}>
                    − 15S
                  </Text>
                </View>
              </Tappable>

              <View style={styles.stepperReadout}>
                <Text style={styles.stepperDigits}>{formatRest(restSeconds)}</Text>
                <Text style={styles.stepperCaption}>BETWEEN SETS</Text>
              </View>

              <Tappable
                onPress={() => {
                  if (canStepUp) {
                    thud('light');
                    onStepRestSeconds(1);
                  }
                }}
                scaleTo={0.92}
                disabled={!canStepUp}
                accessibilityRole="button"
                accessibilityLabel="Increase rest duration by 15 seconds"
                style={[styles.stepBtnWrap, !canStepUp && styles.btnDisabled]}
              >
                <View
                  style={[
                    styles.stepBtn,
                    {
                      backgroundColor: loud.ground,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: loud.rule,
                    },
                  ]}
                >
                  <Text style={[styles.stepBtnText, !canStepUp && styles.stepBtnTextDisabled]}>
                    + 15S
                  </Text>
                </View>
              </Tappable>
            </View>

            {/* Quick Presets Grid */}
            <View style={styles.presetsGrid}>
              {REST_PRESETS.map((preset) => {
                const active = restSeconds === preset;
                return (
                  <Tappable
                    key={preset}
                    onPress={() => {
                      thud('light');
                      onChangeRestSeconds(preset);
                    }}
                    scaleTo={0.94}
                    style={styles.presetWrap}
                    accessibilityRole="button"
                    accessibilityLabel={`Set rest timer to ${formatRest(preset)}`}
                  >
                    <View
                      style={[
                        styles.presetPanel,
                        {
                          backgroundColor: active ? loud.loud : loud.panel,
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: active ? loud.loud : loud.rule,
                        },
                      ]}
                    >
                      <Text style={[styles.presetText, { color: active ? loud.onLoud : loud.figureMuted }]}>
                        {formatPresetLabel(preset)}
                      </Text>
                    </View>
                  </Tappable>
                );
              })}
            </View>
          </View>

          {/* Rest Chime Alert Section */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>REST CHIME</Text>
            <Tappable
              onPress={() => {
                thud('light');
                onToggleAlert();
              }}
              scaleTo={0.97}
              accessibilityRole="switch"
              accessibilityState={{ checked: restSound }}
              accessibilityLabel={restSound ? 'Rest chime on' : 'Rest chime off'}
            >
              <View
                style={[
                  styles.alertRow,
                  {
                    backgroundColor: loud.panel,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: loud.rule,
                  },
                ]}
              >
                <View style={styles.alertLeft}>
                  <Ionicons
                    name={restSound ? 'notifications' : 'notifications-off-outline'}
                    size={18}
                    color={restSound ? loud.loud : loud.figureMuted}
                  />
                  <View style={styles.alertTextGroup}>
                    <Text style={styles.alertTitle}>CHIME ON REST COMPLETION</Text>
                    <Text style={styles.alertDescription}>
                      {restSound ? 'Plays an audio tone when rest timer reaches 0.' : 'Rest timer finishes silently.'}
                    </Text>
                  </View>
                </View>
                <View style={[styles.statusBadge, restSound ? styles.statusBadgeActive : styles.statusBadgeInactive]}>
                  <Text style={[styles.statusText, { color: restSound ? loud.onLoud : loud.figureFaint }]}>
                    {restSound ? 'ON' : 'OFF'}
                  </Text>
                </View>
              </View>
            </Tappable>

            {/* Chime Tone Selector */}
            <View style={styles.tonesContainer}>
              <View style={styles.tonesHeaderRow}>
                <Text style={styles.tonesSublabel}>SELECT TONE</Text>
                <Text style={styles.tonesTip}>Tap to preview and select</Text>
              </View>

              <View style={styles.tonesList}>
                {CHIME_OPTIONS.map((opt) => {
                  const selected = (restChimeChoice ?? 'chime') === opt.id;
                  return (
                    <Tappable
                      key={opt.id}
                      onPress={() => {
                        if (!restSound) {
                          onToggleAlert();
                        }
                        handlePreview(opt.id);
                      }}
                      scaleTo={0.97}
                      style={styles.toneCardWrap}
                      accessibilityRole="button"
                      accessibilityLabel={`Select chime ${opt.name}`}
                    >
                      <View style={[styles.toneCard, selected ? styles.toneCardActive : styles.toneCardInactive]}>
                        <View style={styles.toneLeft}>
                          <View style={[styles.toneRadio, selected ? styles.toneRadioActive : styles.toneRadioInactive]}>
                            {selected && <View style={styles.toneRadioDot} />}
                          </View>
                          <View style={styles.toneInfo}>
                            <View style={styles.toneTitleRow}>
                              <Text style={[styles.toneName, selected && styles.toneNameActive]}>
                                {opt.name}
                              </Text>
                              <View style={[styles.toneTag, selected ? styles.toneTagActive : styles.toneTagInactive]}>
                                <Text style={[styles.toneTagText, selected ? styles.toneTagTextActive : styles.toneTagTextInactive]}>
                                  {opt.tag}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.toneDescription} numberOfLines={1}>
                              {opt.description}
                            </Text>
                          </View>
                        </View>

                        <View style={[styles.playIndicator, selected ? styles.playIndicatorActive : styles.playIndicatorInactive]}>
                          <Ionicons
                            name="volume-high"
                            size={16}
                            color={selected ? loud.onLoud : loud.figureMuted}
                          />
                        </View>
                      </View>
                    </Tappable>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Units Section */}
          {showWeightSwitcher && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>LIFTING UNIT (WORKOUT)</Text>
              <View style={styles.toggleRow}>
                <Tappable
                  onPress={() => {
                    if (units !== 'metric') {
                      thud('light');
                      onToggleUnits();
                    }
                  }}
                  scaleTo={0.95}
                  style={styles.toggleCol}
                  accessibilityRole="button"
                  accessibilityLabel="Kilograms (kg)"
                >
                  <View
                    style={[
                      styles.panel,
                      {
                        backgroundColor: units === 'metric' ? loud.loud : loud.panel,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: units === 'metric' ? loud.loud : loud.rule,
                      },
                    ]}
                  >
                    <Text style={[styles.toggleText, { color: units === 'metric' ? loud.onLoud : loud.figureMuted }]}>
                      KG (METRIC)
                    </Text>
                  </View>
                </Tappable>

                <Tappable
                  onPress={() => {
                    if (units !== 'imperial') {
                      thud('light');
                      onToggleUnits();
                    }
                  }}
                  scaleTo={0.95}
                  style={styles.toggleCol}
                  accessibilityRole="button"
                  accessibilityLabel="Pounds (lbs)"
                >
                  <View
                    style={[
                      styles.panel,
                      {
                        backgroundColor: units === 'imperial' ? loud.loud : loud.panel,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: units === 'imperial' ? loud.loud : loud.rule,
                      },
                    ]}
                  >
                    <Text style={[styles.toggleText, { color: units === 'imperial' ? loud.onLoud : loud.figureMuted }]}>
                      LBS (IMPERIAL)
                    </Text>
                  </View>
                </Tappable>
              </View>
            </View>
          )}

          {showSpeedSwitcher && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>SPEED UNIT</Text>
              <View style={styles.toggleRow}>
                <Tappable
                  onPress={() => {
                    if (speedUnit !== 'kph') {
                      thud('light');
                      onToggleSpeedUnits();
                    }
                  }}
                  scaleTo={0.95}
                  style={styles.toggleCol}
                  accessibilityRole="button"
                  accessibilityLabel="Kilometres per hour (kph)"
                >
                  <View
                    style={[
                      styles.panel,
                      {
                        backgroundColor: speedUnit === 'kph' ? loud.loud : loud.panel,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: speedUnit === 'kph' ? loud.loud : loud.rule,
                      },
                    ]}
                  >
                    <Text style={[styles.toggleText, { color: speedUnit === 'kph' ? loud.onLoud : loud.figureMuted }]}>
                      KPH
                    </Text>
                  </View>
                </Tappable>

                <Tappable
                  onPress={() => {
                    if (speedUnit !== 'mph') {
                      thud('light');
                      onToggleSpeedUnits();
                    }
                  }}
                  scaleTo={0.95}
                  style={styles.toggleCol}
                  accessibilityRole="button"
                  accessibilityLabel="Miles per hour (mph)"
                >
                  <View
                    style={[
                      styles.panel,
                      {
                        backgroundColor: speedUnit === 'mph' ? loud.loud : loud.panel,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: speedUnit === 'mph' ? loud.loud : loud.rule,
                      },
                    ]}
                  >
                    <Text style={[styles.toggleText, { color: speedUnit === 'mph' ? loud.onLoud : loud.figureMuted }]}>
                      MPH
                    </Text>
                  </View>
                </Tappable>
              </View>
            </View>
          )}

          {/* Close/Done button */}
          <Tappable onPress={onClose} scaleTo={0.97} style={styles.doneWrapper}>
            <View style={[styles.donePanel, { backgroundColor: loud.loud }]}>
              <Text style={styles.doneLabel}>DONE</Text>
            </View>
          </Tappable>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    backgroundColor: loud.ground,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeHit: {
    padding: space.xs,
  },
  title: {
    fontFamily: font.display,
    fontSize: 16,
    letterSpacing: 1,
    color: loud.figure,
  },
  subtitle: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 17,
    color: loud.figureFaint,
    marginTop: 2,
    marginBottom: space.md,
  },
  scrollArea: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: space.md,
  },
  section: {
    marginBottom: space.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  sectionLabel: {
    fontFamily: font.display,
    fontSize: 11,
    letterSpacing: 1.4,
    color: loud.figureMuted,
  },
  sectionBadge: {
    fontFamily: font.figure,
    fontSize: 12,
    color: loud.loud,
    fontVariant: ['tabular-nums'],
  },
  stepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: loud.panel,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    padding: space.xs,
    marginBottom: space.sm,
  },
  stepBtnWrap: {
    width: 68,
    minHeight: 46,
  },
  btnDisabled: {
    opacity: 0.35,
  },
  stepBtn: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  stepBtnText: {
    fontFamily: font.display,
    fontSize: 12,
    letterSpacing: 1,
    color: loud.figure,
  },
  stepBtnTextDisabled: {
    color: loud.figureFaint,
  },
  stepperReadout: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  stepperDigits: {
    fontFamily: font.figure,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -1,
    color: loud.figure,
    fontVariant: ['tabular-nums'],
  },
  stepperCaption: {
    fontFamily: font.display,
    fontSize: 9,
    letterSpacing: 1.5,
    color: loud.figureFaint,
    marginTop: 1,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs + 2,
  },
  presetWrap: {
    flexBasis: '31%',
    flexGrow: 1,
    minHeight: 40,
  },
  presetPanel: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
    borderRadius: radius.md,
  },
  presetText: {
    fontFamily: font.display,
    fontSize: 12,
    letterSpacing: 1,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    marginTop: space.sm,
    minHeight: 52,
    borderRadius: radius.md,
  },
  alertLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    flex: 1,
    marginRight: space.sm,
  },
  alertTextGroup: {
    flex: 1,
  },
  alertTitle: {
    fontFamily: font.display,
    fontSize: 12,
    letterSpacing: 0.8,
    color: loud.figure,
  },
  alertDescription: {
    fontFamily: font.ui,
    fontSize: 11,
    color: loud.figureFaint,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusBadgeActive: {
    backgroundColor: loud.loud,
    borderColor: loud.loud,
  },
  statusBadgeInactive: {
    backgroundColor: 'transparent',
    borderColor: loud.rule,
  },
  statusText: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 1,
  },
  tonesContainer: {
    marginTop: space.md,
    backgroundColor: 'rgba(23, 23, 26, 0.4)',
    borderRadius: radius.md,
    padding: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  tonesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
    paddingHorizontal: space.xs,
  },
  tonesSublabel: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 1.2,
    color: loud.figureMuted,
  },
  tonesTip: {
    fontFamily: font.ui,
    fontSize: 10,
    color: loud.figureFaint,
  },
  tonesList: {
    gap: 6,
  },
  toneCardWrap: {
    borderRadius: radius.sm,
  },
  toneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  toneCardActive: {
    backgroundColor: 'rgba(232, 53, 42, 0.1)',
    borderColor: loud.loud,
  },
  toneCardInactive: {
    backgroundColor: loud.panel,
    borderColor: loud.rule,
  },
  toneLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    flex: 1,
    marginRight: space.sm,
  },
  toneRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toneRadioActive: {
    borderColor: loud.loud,
  },
  toneRadioInactive: {
    borderColor: loud.figureFaint,
  },
  toneRadioDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: loud.loud,
  },
  toneInfo: {
    flex: 1,
  },
  toneTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toneName: {
    fontFamily: font.display,
    fontSize: 12,
    letterSpacing: 0.8,
    color: loud.figure,
  },
  toneNameActive: {
    color: loud.onLoud,
  },
  toneTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 2,
  },
  toneTagActive: {
    backgroundColor: loud.loud,
  },
  toneTagInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  toneTagText: {
    fontFamily: font.display,
    fontSize: 8,
    letterSpacing: 0.8,
  },
  toneTagTextActive: {
    color: loud.onLoud,
  },
  toneTagTextInactive: {
    color: loud.figureFaint,
  },
  toneDescription: {
    fontFamily: font.ui,
    fontSize: 10,
    color: loud.figureFaint,
    marginTop: 2,
  },
  playIndicator: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIndicatorActive: {
    backgroundColor: loud.loud,
  },
  playIndicatorInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.sm,
  },
  toggleCol: {
    flex: 1,
    minHeight: 44,
  },
  panel: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  toggleText: {
    fontFamily: font.display,
    fontSize: 12,
    letterSpacing: 1,
  },
  doneWrapper: {
    marginTop: space.sm,
    minHeight: 46,
  },
  donePanel: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
  },
  doneLabel: {
    fontFamily: font.display,
    fontSize: 13,
    letterSpacing: 1.4,
    color: loud.onLoud,
  },
  autoSaveNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: '#064E3B',
    borderColor: '#059669',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    marginTop: space.xs,
    marginBottom: space.sm,
  },
  autoSaveNoticeText: {
    fontFamily: font.ui,
    fontSize: 11,
    color: '#A7F3D0',
    flex: 1,
  },
});
