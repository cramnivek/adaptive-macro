import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BAR_WEIGHT, type BarChoice, PLATE_SETS, describePlates, platesFor } from '../plates';
import type { UnitSystem } from '../state/settings';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { SlashPanel } from './SlashPanel';
import { Tappable } from './Tappable';

interface PlateSheetProps {
  /** The weight to load, in the display unit; null when the sheet is closed. */
  weight: number | null;
  units: UnitSystem;
  bar: BarChoice;
  onBarChange: (bar: BarChoice) => void;
  onClose: () => void;
}

/**
 * Competition colours by rank — the heaviest plate red, then blue, yellow,
 * green, white — so a glance at the drawing matches a glance at the rack.
 * The smallest plates share a steel grey: they are change, not landmarks.
 */
const PLATE_COLOURS = ['#D62828', '#1D5FD1', '#E8B730', '#2E9E4F', '#ECEAE4', '#8A8D93', '#8A8D93'];

/**
 * What to put on the bar for this set.
 *
 * One side only, drawn from the collar outward, because that is how a bar is
 * loaded and the other side is the same. The words underneath say it again for
 * anyone who would rather read than count rectangles.
 */
export const PlateSheet = ({ weight, units, bar, onBarChange, onClose }: PlateSheetProps) => {
  const insets = useSafeAreaInsets();
  const unit = units === 'metric' ? 'kg' : 'lb';
  const load = weight === null ? null : platesFor(weight, units, bar);
  const plates = PLATE_SETS[units];
  const largest = plates[0];

  return (
    <Modal visible={weight !== null} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
        {load && weight !== null && (
          <>
            <Text style={styles.title}>
              {weight} {unit.toUpperCase()}
            </Text>

            <View style={styles.bar} accessibilityLabel={`Each side: ${describePlates(load.perSide) || 'nothing'}`}>
              <View style={styles.sleeve} />
              <View style={styles.collar} />
              {load.perSide.map((plate, index) => {
                const rank = plates.indexOf(plate);
                return (
                  <View
                    key={`${plate}-${index}`}
                    style={[
                      styles.plate,
                      {
                        // Diameter by weight, but never so small a plate vanishes.
                        height: 34 + 66 * (plate / largest),
                        width: plate >= plates[2] ? 16 : 11,
                        backgroundColor: PLATE_COLOURS[rank] ?? PLATE_COLOURS[PLATE_COLOURS.length - 1],
                      },
                    ]}
                  />
                );
              })}
            </View>

            <Text style={styles.sides}>
              {load.belowBar
                ? `Lighter than the ${load.bar} ${unit} bar.`
                : load.perSide.length === 0
                  ? 'Just the bar.'
                  : `Each side: ${describePlates(load.perSide)}`}
            </Text>
            {!load.belowBar && Math.abs(load.loaded - weight) > 1e-6 && (
              <Text style={styles.note}>
                {weight} {unit} cannot be made with standard plates. Closest under it: {load.loaded} {unit}.
              </Text>
            )}

            <View style={styles.bars}>
              {(['standard', 'light'] as const).map((choice) => {
                const on = bar === choice;
                return (
                  <Tappable key={choice} onPress={() => onBarChange(choice)} scaleTo={0.95} style={{ flex: 1 }}>
                    <SlashPanel color={on ? loud.loud : loud.panel} style={styles.barChoice}>
                      <Text style={[styles.barLabel, { color: on ? loud.onLoud : loud.figureMuted }]}>
                        {BAR_WEIGHT[units][choice]} {unit.toUpperCase()} BAR
                      </Text>
                    </SlashPanel>
                  </Tappable>
                );
              })}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: loud.ground,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    padding: space.lg,
  },
  title: { fontFamily: font.display, fontSize: 28, letterSpacing: 1, color: loud.figure },
  bar: { flexDirection: 'row', alignItems: 'center', height: 110, marginVertical: space.md, gap: 2 },
  sleeve: { position: 'absolute', left: 0, right: 0, height: 6, backgroundColor: loud.rule, top: 52 },
  collar: { width: 10, height: 28, backgroundColor: loud.figureMuted, marginRight: 4 },
  plate: { borderRadius: 2 },
  sides: { fontFamily: font.figure, fontSize: 18, color: loud.figure },
  note: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, color: loud.warn, marginTop: space.xs },
  bars: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  barChoice: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  barLabel: { fontFamily: font.display, fontSize: 13, letterSpacing: 1.2 },
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
 * It was a small PLATES label beside the exercise name, easy to miss and a tap
 * away from any answer. The answer is the point, so it is shown: one side of
 * the bar in plate colours and the plates in words, updating as the weight is
 * typed. A tap still opens the full sheet, with the bar choice.
 */
export const PlatePreview = ({ weight, units, bar, onPress }: PlatePreviewProps) => {
  const unit = units === 'metric' ? 'kg' : 'lb';
  const load = weight === null ? null : platesFor(weight, units, bar);
  const plates = PLATE_SETS[units];
  const largest = plates[0];

  const words =
    load === null
      ? 'Enter a weight to see the plates'
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
