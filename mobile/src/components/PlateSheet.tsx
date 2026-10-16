import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { thud } from '../platform/haptics';
import {
  BAR_WEIGHT,
  type BarChoice,
  PLATE_SETS,
  describeFormula,
  describePlates,
  platesFor,
  totalFromPlates,
} from '../plates';
import { generateWarmupRamp, type WarmupSet } from '../warmup';
import type { UnitSystem } from '../state/settings';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { SlashPanel } from './SlashPanel';
import { Tappable } from './Tappable';

interface PlateSheetProps {
  /** The weight to load, in the display unit; null when the sheet is closed. */
  weight: number | null;
  /** Whether the sheet is open. If omitted, derives from weight !== null. */
  open?: boolean;
  /** Which tab to open first ('plates' or 'warmup'). */
  initialMode?: 'plates' | 'warmup';
  /** Whether the exercise uses a barbell (true) or pin/cable/dumbbell (false). */
  isBarbell?: boolean;
  units: UnitSystem;
  bar: BarChoice;
  /** Name of the exercise this calculation targets, e.g. "Bench Press". */
  exerciseName?: string | null;
  /** Custom plate sizes available in the gym, in the display unit. */
  customPlates?: number[];
  onBarChange: (bar: BarChoice) => void;
  /** Callback to write the calculated total back to the target set. */
  onApplyWeight?: (weight: number) => void;
  /** Callback to insert warm-up sets directly into the active exercise. */
  onInsertWarmups?: (warmups: WarmupSet[]) => void;
  /** Callback when a new custom plate size is added. */
  onAddCustomPlate?: (plate: number) => void;
  /** Callback when a custom plate size is removed. */
  onRemoveCustomPlate?: (plate: number) => void;
  onClose: () => void;
}

/**
 * Competition colours by rank — the heaviest plate red, then blue, yellow,
 * green, white — so a glance at the drawing matches a glance at the rack.
 * The smallest plates share a steel grey: they are change, not landmarks.
 */
const PLATE_COLOURS = ['#D62828', '#1D5FD1', '#E8B730', '#2E9E4F', '#ECEAE4', '#8A8D93', '#8A8D93'];

/**
 * The barbell plate calculator and warm-up ramp generator.
 */
export const PlateSheet = ({
  weight,
  open,
  initialMode = 'plates',
  isBarbell = true,
  units,
  bar,
  exerciseName,
  customPlates = [],
  onBarChange,
  onApplyWeight,
  onInsertWarmups,
  onAddCustomPlate,
  onRemoveCustomPlate,
  onClose,
}: PlateSheetProps) => {
  const isVisible = open ?? weight !== null;
  const insets = useSafeAreaInsets();
  const unit = units === 'metric' ? 'kg' : 'lb';
  const stepSize = units === 'metric' ? 5 : 10;
  const plates = PLATE_SETS[units];
  const largest = plates[0];

  const [perSide, setPerSide] = useState<number[]>([]);
  const [nonBarbellTarget, setNonBarbellTarget] = useState<number>(units === 'metric' ? 50 : 100);
  const [mode, setMode] = useState<'plates' | 'warmup'>(isBarbell ? initialMode : 'warmup');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customInputVal, setCustomInputVal] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  useEffect(() => {
    if (!isVisible) return;
    const startMode = isBarbell ? initialMode : 'warmup';
    setMode(startMode);

    if (!isBarbell) {
      const fallback = units === 'metric' ? 50 : 100;
      setNonBarbellTarget(
        weight !== null && weight > 0 ? Math.round(weight * 10) / 10 : fallback,
      );
      return;
    }

    const barW = BAR_WEIGHT[units][bar];
    const effectiveWeight =
      weight !== null && weight > 0
        ? weight
        : startMode === 'warmup'
          ? units === 'metric'
            ? 60
            : 135
          : 0;
    if (effectiveWeight > barW) {
      setPerSide(platesFor(effectiveWeight, units, bar, customPlates).perSide);
    } else {
      setPerSide([]);
    }
  }, [isVisible, weight, units, bar, customPlates, isBarbell, initialMode]);

  const total = isBarbell ? totalFromPlates(perSide, units, bar) : nonBarbellTarget;
  const formula = isBarbell
    ? describeFormula(perSide, units, bar)
    : `Target working weight · step ±${stepSize} ${unit}`;
  const warmups = generateWarmupRamp(total, units, bar, customPlates, isBarbell);

  const adjustTargetWeight = (delta: number) => {
    thud('light');
    if (!isBarbell) {
      const minW = units === 'metric' ? 5 : 10;
      setNonBarbellTarget((prev) => Math.max(minW, Math.round((prev + delta) * 10) / 10));
    } else {
      const barW = BAR_WEIGHT[units][bar];
      const next = Math.max(barW, total + delta);
      setPerSide(platesFor(next, units, bar, customPlates).perSide);
    }
  };

  const addPlate = (plate: number) => {
    thud('light');
    setPerSide((prev) => [...prev, plate]);
  };

  const removePlateAt = (index: number) => {
    thud('light');
    setPerSide((prev) => prev.filter((_, i) => i !== index));
  };

  const clearPlates = () => {
    thud('light');
    setPerSide([]);
  };

  const handleApply = () => {
    thud('light');
    onApplyWeight?.(total);
    onClose();
  };

  const handleInsertWarmups = () => {
    thud('heavy');
    onInsertWarmups?.(warmups);
    onClose();
  };

  const handleAddCustomPlateSubmit = () => {
    const parsed = Number.parseFloat(customInputVal.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setCustomError('Enter a positive plate weight.');
      return;
    }
    if (parsed > 500) {
      setCustomError('Plate weight too large.');
      return;
    }
    const rounded = Math.round(parsed * 100) / 100;
    thud('light');
    onAddCustomPlate?.(rounded);
    setPerSide((prev) => [...prev, rounded]);
    setShowCustomInput(false);
    setCustomInputVal('');
    setCustomError(null);
  };

  return (
    <Modal visible={isVisible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle}>
              {isBarbell ? 'BARBELL & WARM-UP CALCULATOR' : 'WARM-UP RAMP GENERATOR'}
            </Text>
            {exerciseName && (
              <Text style={styles.sheetSubtitle}>FOR {exerciseName.toUpperCase()}</Text>
            )}
          </View>
          <Tappable onPress={onClose} scaleTo={0.9} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </Tappable>
        </View>

        {/* Hero Total & Breakdown */}
        <View style={styles.hero}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={styles.totalNumber}>
              {total} <Text style={styles.totalUnit}>{unit.toUpperCase()}</Text>
            </Text>
            {(mode === 'warmup' || !isBarbell) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                <Tappable
                  onPress={() => adjustTargetWeight(-stepSize)}
                  scaleTo={0.92}
                  style={styles.rackBtn}
                  accessibilityLabel={`Decrease target weight by ${stepSize} ${unit}`}
                >
                  <Text style={styles.rackBtnText}>−{stepSize}</Text>
                </Tappable>
                <Tappable
                  onPress={() => adjustTargetWeight(stepSize)}
                  scaleTo={0.92}
                  style={styles.rackBtn}
                  accessibilityLabel={`Increase target weight by ${stepSize} ${unit}`}
                >
                  <Text style={styles.rackBtnText}>+{stepSize}</Text>
                </Tappable>
              </View>
            )}
          </View>
          <Text style={styles.formulaText}>{formula}</Text>
        </View>

        {/* Mode Selector Tabs: Load Plates vs Warm-up Ramp (only on barbell exercises) */}
        {isBarbell && (
          <View style={styles.tabRow}>
            <Tappable
              onPress={() => {
                thud('light');
                setMode('plates');
              }}
              scaleTo={0.96}
              style={{ flex: 1 }}
            >
              <SlashPanel color={mode === 'plates' ? loud.loud : loud.panel} style={styles.tabBtn}>
                <Text style={[styles.tabLabel, { color: mode === 'plates' ? loud.onLoud : loud.figureMuted }]}>
                  LOAD PLATES
                </Text>
              </SlashPanel>
            </Tappable>

            <Tappable
              onPress={() => {
                thud('light');
                setMode('warmup');
              }}
              scaleTo={0.96}
              style={{ flex: 1 }}
            >
              <SlashPanel color={mode === 'warmup' ? loud.loud : loud.panel} style={styles.tabBtn}>
                <View style={styles.tabBadgeRow}>
                  <Text style={[styles.tabLabel, { color: mode === 'warmup' ? loud.onLoud : loud.figureMuted }]}>
                    WARM-UP RAMP
                  </Text>
                  {warmups.length > 0 && (
                    <View style={[styles.warmupBadge, mode === 'warmup' && { backgroundColor: loud.onLoud }]}>
                      <Text style={[styles.warmupBadgeText, mode === 'warmup' && { color: loud.loud }]}>
                        {warmups.length}
                      </Text>
                    </View>
                  )}
                </View>
              </SlashPanel>
            </Tappable>
          </View>
        )}

        {isBarbell && mode === 'plates' ? (
          <>
            {/* Interactive Barbell Sleeve */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.barScroll}
              contentContainerStyle={styles.barScrollContent}
            >
              <View style={styles.bar} accessibilityLabel={`Each side: ${describePlates(perSide) || 'nothing'}`}>
                <View style={styles.sleeve} />
                <View style={styles.collar} />
                {perSide.map((plate, index) => {
                  const rank = plates.indexOf(plate);
                  const isCustom = rank === -1;
                  const color = isCustom
                    ? '#8E44AD'
                    : (PLATE_COLOURS[rank] ?? PLATE_COLOURS[PLATE_COLOURS.length - 1]);
                  const plateHeight = Math.max(30, Math.min(104, 36 + 64 * (plate / largest)));
                  const plateWidth = Math.max(14, Math.min(22, plate >= plates[2] ? 20 : 15));
                  return (
                    <Tappable
                      key={`${plate}-${index}`}
                      onPress={() => removePlateAt(index)}
                      scaleTo={0.92}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${plate} ${unit} plate`}
                      style={[
                        styles.plate,
                        {
                          height: plateHeight,
                          width: plateWidth,
                          backgroundColor: color,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.plateNumber,
                          { color: rank === 4 ? '#111' : '#FFF' },
                        ]}
                        numberOfLines={1}
                      >
                        {plate}
                      </Text>
                    </Tappable>
                  );
                })}
                {perSide.length === 0 && (
                  <Text style={styles.emptyPrompt}>EMPTY BAR · TAP PLATES BELOW</Text>
                )}
              </View>
            </ScrollView>
            <Text style={styles.hint}>
              {perSide.length > 0
                ? 'Tap any plate on the sleeve to remove it'
                : 'Barbell is symmetrical · plates chosen are added to both sides'}
            </Text>

            {/* Bar Weight Selection */}
            <View style={styles.bars}>
              {(['standard', 'light'] as const).map((choice) => {
                const on = bar === choice;
                return (
                  <Tappable key={choice} onPress={() => onBarChange(choice)} scaleTo={0.95} style={{ flex: 1 }}>
                    <SlashPanel color={on ? loud.loud : loud.panel} style={styles.barChoice}>
                      <Text style={[styles.barLabel, { color: on ? loud.onLoud : loud.figureMuted }]}>
                        {BAR_WEIGHT[units][choice]} {unit.toUpperCase()} {choice === 'standard' ? 'STANDARD' : 'LIGHT'}
                      </Text>
                    </SlashPanel>
                  </Tappable>
                );
              })}
            </View>

            {/* Plate Rack: Add Plates */}
            <View style={styles.rackSection}>
              <View style={styles.rackHeaderRow}>
                <Text style={styles.rackHeader}>ADD PLATES (EACH SIDE)</Text>
                {!showCustomInput && (
                  <Tappable
                    onPress={() => {
                      thud('light');
                      setShowCustomInput(true);
                    }}
                    scaleTo={0.92}
                    style={styles.customTrigger}
                    accessibilityRole="button"
                    accessibilityLabel="Add custom plate weight"
                  >
                    <Text style={styles.customTriggerLabel}>+ CUSTOM</Text>
                  </Tappable>
                )}
              </View>

              {showCustomInput && (
                <View style={styles.customInputBox}>
                  <View style={styles.customInputHeader}>
                    <Text style={styles.customInputTitle}>
                      CUSTOM PLATE ({unit.toUpperCase()} EACH SIDE)
                    </Text>
                    <Tappable
                      onPress={() => {
                        setShowCustomInput(false);
                        setCustomInputVal('');
                        setCustomError(null);
                      }}
                      scaleTo={0.88}
                      style={styles.customCloseBtn}
                    >
                      <Text style={styles.customCloseText}>✕</Text>
                    </Tappable>
                  </View>
                  <View style={styles.customInputRow}>
                    <TextInput
                      value={customInputVal}
                      onChangeText={(val) => {
                        setCustomInputVal(val);
                        setCustomError(null);
                      }}
                      keyboardType="decimal-pad"
                      placeholder={`e.g. ${units === 'metric' ? '0.5, 7.5' : '15, 1.25'}`}
                      placeholderTextColor={loud.figureFaint}
                      style={styles.customTextInput}
                      autoFocus
                    />
                    <Tappable
                      onPress={handleAddCustomPlateSubmit}
                      scaleTo={0.94}
                      style={styles.customAddBtn}
                    >
                      <SlashPanel color={loud.loud} style={styles.customAddSlab}>
                        <Text style={styles.customAddText}>+ ADD</Text>
                      </SlashPanel>
                    </Tappable>
                  </View>
                  {customError && <Text style={styles.customErrorText}>{customError}</Text>}
                </View>
              )}

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.rackStrip}
                contentContainerStyle={styles.rackContent}
              >
                {/* Standard plates */}
                {plates.map((plate) => {
                  const rank = plates.indexOf(plate);
                  const color = PLATE_COLOURS[rank] ?? PLATE_COLOURS[PLATE_COLOURS.length - 1];
                  return (
                    <Tappable
                      key={plate}
                      onPress={() => addPlate(plate)}
                      scaleTo={0.94}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${plate} ${unit} to each side`}
                      style={[styles.rackBtn, { borderColor: color }]}
                    >
                      <View style={[styles.rackPip, { backgroundColor: color }]} />
                      <Text style={styles.rackBtnText}>+{plate}</Text>
                    </Tappable>
                  );
                })}

                {/* Saved Custom plates */}
                {customPlates
                  .filter((p) => !plates.includes(p))
                  .map((plate) => (
                    <View key={`custom-${plate}`} style={styles.customPlatePillWrap}>
                      <Tappable
                        onPress={() => addPlate(plate)}
                        scaleTo={0.94}
                        accessibilityRole="button"
                        accessibilityLabel={`Add custom ${plate} ${unit} to each side`}
                        style={[styles.rackBtn, styles.customPlateBtn]}
                      >
                        <View style={[styles.rackPip, { backgroundColor: '#8E44AD' }]} />
                        <Text style={styles.rackBtnText}>+{plate}</Text>
                      </Tappable>
                      {onRemoveCustomPlate && (
                        <Tappable
                          onPress={() => {
                            thud('light');
                            onRemoveCustomPlate(plate);
                          }}
                          scaleTo={0.85}
                          style={styles.customPlateDelete}
                          accessibilityLabel={`Delete custom plate ${plate} from rack`}
                        >
                          <Text style={styles.customPlateDeleteText}>✕</Text>
                        </Tappable>
                      )}
                    </View>
                  ))}
              </ScrollView>
            </View>
          </>
        ) : (
          /* Warm-up Ladder View */
          <View style={styles.warmupContainer}>
            <ScrollView style={styles.warmupScroll} contentContainerStyle={styles.warmupContent}>
              {warmups.length === 0 ? (
                <View style={styles.emptyWarmupBox}>
                  <Text style={styles.emptyWarmupTitle}>
                    {isBarbell ? 'EMPTY BAR LOAD' : 'LIGHT WORKING LOAD'}
                  </Text>
                  <Text style={styles.emptyWarmupHint}>
                    Working weight is {total} {unit}. Increase the target weight above (+{stepSize}) to generate a warm-up ramp.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.warmupSectionTitle}>
                    PROGRESSION TO {total} {unit.toUpperCase()} WORK SET
                  </Text>
                  {warmups.map((ws) => (
                    <Tappable
                      key={ws.stage}
                      onPress={() => {
                        thud('light');
                        if (isBarbell) {
                          setPerSide(ws.perSide);
                          setMode('plates');
                        } else if (onApplyWeight) {
                          onApplyWeight(ws.weight);
                          onClose();
                        }
                      }}
                      scaleTo={0.98}
                      style={styles.warmupCard}
                      accessibilityLabel={`Warmup ${ws.stage}: ${ws.weight} ${unit} for ${ws.reps} reps`}
                    >
                      <View style={styles.warmupCardTop}>
                        <View style={styles.warmupBadgeTab}>
                          <Text style={styles.warmupBadgeStage}>W{ws.stage}</Text>
                        </View>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: space.xs }}>
                          <Text style={styles.warmupWeight}>{ws.weight}</Text>
                          <Text style={styles.warmupUnit}>{unit.toUpperCase()}</Text>
                          <Text style={styles.warmupReps}>× {ws.reps} reps</Text>
                        </View>
                        <Text style={styles.warmupPct}>{ws.percent}%</Text>
                      </View>

                      {isBarbell ? (
                        <View style={styles.warmupCardBottom}>
                          <Text style={styles.warmupPlatesLabel}>
                            {ws.perSide.length === 0 ? 'Empty bar' : `${ws.platesLabel} / side`}
                          </Text>
                          <View style={styles.warmupPillsRow}>
                            {ws.perSide.map((plate, pIdx) => {
                              const rank = plates.indexOf(plate);
                              const color =
                                rank >= 0
                                  ? PLATE_COLOURS[rank] ?? PLATE_COLOURS[PLATE_COLOURS.length - 1]
                                  : '#8E44AD';
                              return (
                                <View key={pIdx} style={[styles.warmupPlatePill, { borderColor: color }]}>
                                  <View style={[styles.platePip, { backgroundColor: color }]} />
                                  <Text style={styles.warmupPlateText}>{plate}</Text>
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      ) : (
                        <View style={styles.warmupCardBottom}>
                          <Text style={styles.warmupPlatesLabel}>
                            {ws.percent}% of working weight · Pin / stack / dumbbell load
                          </Text>
                        </View>
                      )}
                    </Tappable>
                  ))}
                  <Text style={styles.warmupTapHint}>
                    {isBarbell
                      ? 'Tap any stage to preview its plate loading on the bar sleeve.'
                      : 'Use − / + above to adjust target working weight before inserting warm-up sets.'}
                  </Text>
                </>
              )}
            </ScrollView>
          </View>
        )}

        {/* Bottom Actions */}
        <View style={styles.actionsRow}>
          {mode === 'warmup' || !isBarbell ? (
            <>
              <Tappable
                onPress={() => {
                  thud('light');
                  if (isBarbell) {
                    setMode('plates');
                  } else {
                    onClose();
                  }
                }}
                scaleTo={0.95}
                style={styles.clearBtn}
              >
                <Text style={styles.clearText}>{isBarbell ? 'PLATES' : 'CLOSE'}</Text>
              </Tappable>
              <Tappable
                onPress={onInsertWarmups && warmups.length > 0 ? handleInsertWarmups : onClose}
                scaleTo={0.97}
                style={styles.mainActionBtn}
              >
                <SlashPanel
                  color={onInsertWarmups && warmups.length > 0 ? loud.loud : loud.panel}
                  style={styles.actionSlab}
                >
                  <Text
                    style={[
                      styles.actionLabel,
                      { color: onInsertWarmups && warmups.length > 0 ? loud.onLoud : loud.figure },
                    ]}
                  >
                    {onInsertWarmups && warmups.length > 0 ? `INSERT ${warmups.length} WARM-UPS` : 'DONE'}
                  </Text>
                </SlashPanel>
              </Tappable>
            </>
          ) : (
            <>
              {perSide.length > 0 && (
                <Tappable onPress={clearPlates} scaleTo={0.95} style={styles.clearBtn}>
                  <Text style={styles.clearText}>CLEAR</Text>
                </Tappable>
              )}
              <Tappable
                onPress={onApplyWeight ? handleApply : onClose}
                scaleTo={0.97}
                style={styles.mainActionBtn}
              >
                <SlashPanel color={onApplyWeight ? loud.loud : loud.panel} style={styles.actionSlab}>
                  <Text style={[styles.actionLabel, { color: onApplyWeight ? loud.onLoud : loud.figure }]}>
                    {onApplyWeight ? `APPLY ${total} ${unit.toUpperCase()}` : 'DONE'}
                  </Text>
                </SlashPanel>
              </Tappable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: {
    backgroundColor: loud.ground,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    padding: space.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: space.xs,
  },
  sheetTitle: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 1.4,
    color: loud.figureFaint,
  },
  sheetSubtitle: {
    fontFamily: font.display,
    fontSize: 14,
    letterSpacing: 0.8,
    color: loud.figure,
    marginTop: 2,
  },
  closeBtn: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontFamily: font.uiStrong,
    fontSize: 18,
    color: loud.figureMuted,
  },
  hero: {
    marginVertical: space.xs,
  },
  totalNumber: {
    fontFamily: font.display,
    fontSize: 34,
    letterSpacing: 0.8,
    color: loud.figure,
  },
  totalUnit: {
    fontFamily: font.uiStrong,
    fontSize: 18,
    letterSpacing: 1,
    color: loud.loud,
  },
  formulaText: {
    fontFamily: font.figure,
    fontSize: 13,
    color: loud.figureMuted,
    marginTop: 2,
  },
  barScroll: {
    marginVertical: space.sm,
  },
  barScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: space.xs,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 104,
    gap: 2,
    minWidth: 200,
  },
  sleeve: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: loud.rule,
    top: 49,
  },
  collar: {
    width: 10,
    height: 32,
    backgroundColor: loud.figureMuted,
    marginRight: 4,
  },
  plate: {
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plateNumber: {
    fontFamily: font.figure,
    fontSize: 9,
    fontWeight: '700',
  },
  emptyPrompt: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 1.2,
    color: loud.figureFaint,
    marginLeft: space.md,
  },
  hint: {
    fontFamily: font.ui,
    fontSize: 11,
    color: loud.figureFaint,
    textAlign: 'center',
    marginBottom: space.sm,
  },
  bars: {
    flexDirection: 'row',
    gap: space.sm,
    marginBottom: space.md,
  },
  barChoice: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barLabel: {
    fontFamily: font.display,
    fontSize: 12,
    letterSpacing: 1.1,
  },
  rackSection: {
    marginBottom: space.lg,
  },
  rackHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.xs,
  },
  rackHeader: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 1.2,
    color: loud.figureFaint,
  },
  customTrigger: {
    minHeight: 28,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(142, 68, 173, 0.4)',
    backgroundColor: 'rgba(142, 68, 173, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customTriggerLabel: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 0.8,
    color: '#B370D4',
  },
  customInputBox: {
    backgroundColor: loud.panel,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(142, 68, 173, 0.45)',
    padding: space.sm,
    marginBottom: space.sm,
    gap: space.xs,
  },
  customInputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customInputTitle: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 1,
    color: '#B370D4',
  },
  customCloseBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customCloseText: {
    fontSize: 13,
    color: loud.figureMuted,
  },
  customInputRow: {
    flexDirection: 'row',
    gap: space.xs,
    alignItems: 'center',
  },
  customTextInput: {
    flex: 1,
    height: 40,
    backgroundColor: loud.ground,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    paddingHorizontal: space.sm,
    fontFamily: font.figure,
    fontSize: 15,
    color: loud.figure,
  },
  customAddBtn: {
    minHeight: 40,
  },
  customAddSlab: {
    minHeight: 40,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customAddText: {
    fontFamily: font.display,
    fontSize: 11,
    letterSpacing: 1,
    color: loud.onLoud,
  },
  customErrorText: {
    fontFamily: font.ui,
    fontSize: 11,
    color: loud.warn,
    marginTop: 2,
  },
  rackStrip: {
    flexGrow: 0,
  },
  rackContent: {
    flexDirection: 'row',
    gap: space.xs,
    paddingVertical: 4,
    alignItems: 'center',
  },
  rackBtn: {
    minHeight: 44,
    minWidth: 54,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    backgroundColor: loud.panel,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  customPlatePillWrap: {
    position: 'relative',
    marginRight: 4,
  },
  customPlateBtn: {
    borderColor: '#8E44AD',
    paddingRight: space.sm + 4,
  },
  customPlateDelete: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: loud.panel,
    borderWidth: 1,
    borderColor: 'rgba(235, 87, 87, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  customPlateDeleteText: {
    fontSize: 9,
    color: loud.warn,
    fontWeight: '700',
    lineHeight: 11,
  },
  rackPip: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  rackBtnText: {
    fontFamily: font.figure,
    fontSize: 13,
    color: loud.figure,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  clearBtn: {
    minHeight: 48,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  clearText: {
    fontFamily: font.uiStrong,
    fontSize: 12,
    letterSpacing: 1,
    color: loud.figureMuted,
  },
  mainActionBtn: {
    flex: 1,
  },
  actionSlab: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontFamily: font.display,
    fontSize: 14,
    letterSpacing: 1.4,
  },
  tabRow: {
    flexDirection: 'row',
    gap: space.xs,
    marginVertical: space.sm,
  },
  tabBtn: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  tabLabel: {
    fontFamily: font.display,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  tabBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  warmupBadge: {
    backgroundColor: loud.loud,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  warmupBadgeText: {
    fontFamily: font.figure,
    fontSize: 10,
    fontWeight: '700',
    color: loud.onLoud,
  },
  warmupContainer: {
    marginVertical: space.xs,
  },
  warmupScroll: {
    maxHeight: 280,
  },
  warmupContent: {
    gap: space.xs,
    paddingVertical: 4,
  },
  warmupSectionTitle: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 1.2,
    color: loud.figureFaint,
    marginBottom: space.xs,
  },
  warmupCard: {
    backgroundColor: loud.panel,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    padding: space.sm,
    gap: 6,
  },
  warmupCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  warmupBadgeTab: {
    backgroundColor: 'rgba(232, 183, 48, 0.15)',
    borderColor: loud.warn,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  warmupBadgeStage: {
    fontFamily: font.display,
    fontSize: 11,
    color: loud.warn,
    letterSpacing: 0.5,
  },
  warmupWeight: {
    fontFamily: font.figure,
    fontSize: 16,
    color: loud.figure,
    fontWeight: '700',
  },
  warmupUnit: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    color: loud.loud,
  },
  warmupReps: {
    fontFamily: font.figure,
    fontSize: 13,
    color: loud.figureMuted,
  },
  warmupPct: {
    fontFamily: font.figure,
    fontSize: 12,
    color: loud.figureFaint,
  },
  warmupCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  warmupPlatesLabel: {
    fontFamily: font.ui,
    fontSize: 11,
    color: loud.figureMuted,
  },
  warmupPillsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  warmupPlatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  platePip: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  warmupPlateText: {
    fontFamily: font.figure,
    fontSize: 10,
    color: loud.figure,
  },
  warmupTapHint: {
    fontFamily: font.ui,
    fontSize: 11,
    color: loud.figureFaint,
    textAlign: 'center',
    marginTop: space.xs,
  },
  emptyWarmupBox: {
    padding: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  emptyWarmupTitle: {
    fontFamily: font.display,
    fontSize: 13,
    letterSpacing: 1.2,
    color: loud.figureMuted,
  },
  emptyWarmupHint: {
    fontFamily: font.ui,
    fontSize: 12,
    color: loud.figureFaint,
    textAlign: 'center',
    lineHeight: 16,
  },
});

interface PlatePreviewProps {
  /** The next set's weight, in the display unit; null when none is entered yet. */
  weight: number | null;
  units: UnitSystem;
  bar: BarChoice;
  customPlates?: number[];
  onPress: () => void;
}

/**
 * What goes on the bar for the next set, right in the exercise block.
 *
 * One side of the bar in plate colours and the plates in words. Tapping
 * opens the interactive plate calculator.
 */
export const PlatePreview = ({ weight, units, bar, customPlates = [], onPress }: PlatePreviewProps) => {
  const unit = units === 'metric' ? 'kg' : 'lb';
  const load = weight === null ? null : platesFor(weight, units, bar, customPlates);
  const plates = PLATE_SETS[units];
  const largest = plates[0];

  const words =
    load === null
      ? 'Tap to calculate or load plates'
      : load.belowBar
        ? `Lighter than the ${load.bar} ${unit} bar`
        : load.perSide.length === 0
          ? 'Just the bar'
          : `${describePlates(load.perSide)} each side`;

  return (
    <Tappable
      onPress={onPress}
      scaleTo={0.98}
      style={[previewStyles.wrap, { backgroundColor: loud.panel, borderColor: loud.rule }]}
      accessibilityRole="button"
      accessibilityLabel={`Plates: ${words}. Opens the plate calculator.`}
    >
      <View style={previewStyles.bar}>
        <View style={[previewStyles.sleeve, { backgroundColor: loud.rule }]} />
        <View style={[previewStyles.collar, { backgroundColor: loud.figureMuted }]} />
        {(load?.perSide ?? []).map((plate, index) => {
          const rank = plates.indexOf(plate);
          const color =
            rank >= 0
              ? PLATE_COLOURS[rank] ?? PLATE_COLOURS[PLATE_COLOURS.length - 1]
              : '#8E44AD';
          return (
            <View
              key={`${plate}-${index}`}
              style={{
                width: plate >= plates[2] ? 6 : 4,
                height: 12 + 22 * (plate / largest),
                borderRadius: 1,
                backgroundColor: color,
              }}
            />
          );
        })}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[previewStyles.label, { color: loud.loud }]}>
          PLATES{weight !== null ? ` · ${weight} ${unit.toUpperCase()}` : ''}
        </Text>
        <Text style={[previewStyles.words, { color: load ? loud.figure : loud.figureFaint }]} numberOfLines={1}>
          {words}
        </Text>
      </View>
      <Text style={[previewStyles.chevron, { color: loud.figureMuted }]}>›</Text>
    </Tappable>
  );
};

const previewStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 52,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: space.sm,
  },
  bar: { width: 64, height: 36, flexDirection: 'row', alignItems: 'center', gap: 1.5 },
  sleeve: { position: 'absolute', left: 0, right: 0, height: 3, top: 16.5 },
  collar: { width: 4, height: 14, marginRight: 2 },
  label: { fontFamily: font.display, fontSize: 10, letterSpacing: 1.2 },
  words: { fontFamily: font.figure, fontSize: 15, marginTop: 2 },
  chevron: { fontSize: 22, marginLeft: space.xs },
});
