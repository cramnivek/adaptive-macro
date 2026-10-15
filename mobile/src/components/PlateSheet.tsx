import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  units: UnitSystem;
  bar: BarChoice;
  /** Name of the exercise this calculation targets, e.g. "Bench Press". */
  exerciseName?: string | null;
  onBarChange: (bar: BarChoice) => void;
  /** Callback to write the calculated total back to the target set. */
  onApplyWeight?: (weight: number) => void;
  onClose: () => void;
}

/**
 * Competition colours by rank — the heaviest plate red, then blue, yellow,
 * green, white — so a glance at the drawing matches a glance at the rack.
 * The smallest plates share a steel grey: they are change, not landmarks.
 */
const PLATE_COLOURS = ['#D62828', '#1D5FD1', '#E8B730', '#2E9E4F', '#ECEAE4', '#8A8D93', '#8A8D93'];

/**
 * The barbell plate calculator and visual loader.
 *
 * Works in both directions:
 * 1. Target weight -> Plates: pre-loads the sleeve with the optimal plate mix.
 * 2. Plates -> Target weight: tap plates to load one side of the bar; symmetrical
 *    loading automatically doubles each plate and adds the bar weight.
 *
 * Tapping a loaded plate on the sleeve removes it. Tapping "Apply" writes the
 * total directly into the active set, eliminating mid-set mental math.
 */
export const PlateSheet = ({
  weight,
  open,
  units,
  bar,
  exerciseName,
  onBarChange,
  onApplyWeight,
  onClose,
}: PlateSheetProps) => {
  const isVisible = open ?? weight !== null;
  const insets = useSafeAreaInsets();
  const unit = units === 'metric' ? 'kg' : 'lb';
  const plates = PLATE_SETS[units];
  const largest = plates[0];

  const [perSide, setPerSide] = useState<number[]>([]);

  useEffect(() => {
    if (!isVisible) return;
    if (weight !== null && weight > 0) {
      setPerSide(platesFor(weight, units, bar).perSide);
    } else {
      setPerSide([]);
    }
  }, [isVisible, weight, units, bar]);

  const total = totalFromPlates(perSide, units, bar);
  const formula = describeFormula(perSide, units, bar);

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

  return (
    <Modal visible={isVisible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle}>BARBELL CALCULATOR</Text>
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
          <Text style={styles.totalNumber}>
            {total} <Text style={styles.totalUnit}>{unit.toUpperCase()}</Text>
          </Text>
          <Text style={styles.formulaText}>{formula}</Text>
        </View>

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
              const color = PLATE_COLOURS[rank] ?? PLATE_COLOURS[PLATE_COLOURS.length - 1];
              const plateHeight = 36 + 64 * (plate / largest);
              const plateWidth = plate >= plates[2] ? 20 : 15;
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
          <Text style={styles.rackHeader}>ADD PLATES (EACH SIDE)</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.rackStrip}
            contentContainerStyle={styles.rackContent}
          >
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
          </ScrollView>
        </View>

        {/* Bottom Actions */}
        <View style={styles.actionsRow}>
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
  rackHeader: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 1.2,
    color: loud.figureFaint,
    marginBottom: space.xs,
  },
  rackStrip: {
    flexGrow: 0,
  },
  rackContent: {
    flexDirection: 'row',
    gap: space.xs,
    paddingVertical: 2,
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
});

interface PlatePreviewProps {
  /** The next set's weight, in the display unit; null when none is entered yet. */
  weight: number | null;
  units: UnitSystem;
  bar: BarChoice;
  onPress: () => void;
}

/**
 * What goes on the bar for the next set, right in the exercise block.
 *
 * One side of the bar in plate colours and the plates in words. Tapping
 * opens the interactive plate calculator.
 */
export const PlatePreview = ({ weight, units, bar, onPress }: PlatePreviewProps) => {
  const unit = units === 'metric' ? 'kg' : 'lb';
  const load = weight === null ? null : platesFor(weight, units, bar);
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
        {(load?.perSide ?? []).map((plate, index) => (
          <View
            key={`${plate}-${index}`}
            style={{
              width: plate >= plates[2] ? 6 : 4,
              height: 12 + 22 * (plate / largest),
              borderRadius: 1,
              backgroundColor: PLATE_COLOURS[plates.indexOf(plate)] ?? PLATE_COLOURS[PLATE_COLOURS.length - 1],
            }}
          />
        ))}
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
