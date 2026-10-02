import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RPE_SCALE, formatRpe, rpeMeaning } from '../rpe';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { SlashPanel } from './SlashPanel';
import { Tappable } from './Tappable';

interface RpeSheetProps {
  /** The set being rated, or null when the sheet is closed. */
  open: boolean;
  /** What is already recorded, so the current choice reads as selected. */
  current: number | null;
  onChoose: (rpe: number | null) => void;
  onClose: () => void;
}

/**
 * How hard was that?
 *
 * A grid rather than a slider or a stepper: the scale has nine stops and you
 * are answering it between sets with one thumb, so every value should be one
 * tap away. A slider would make 8.5 a thing you aim for.
 *
 * Each number carries its reps-in-reserve gloss. "8" means nothing on its own,
 * and a scale nobody can interpret gets filled in at random, which is worse
 * than leaving it blank — so the sheet also has a way out that records nothing.
 */
export const RpeSheet = ({ open, current, onChoose, onClose }: RpeSheetProps) => {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
        <Text style={styles.title}>HOW HARD WAS THAT?</Text>
        <Text style={styles.subtitle}>
          Rate of perceived exertion — how many more reps you had in you.
        </Text>

        <View style={styles.grid}>
          {RPE_SCALE.map((value) => {
            const selected = current === value;
            return (
              <Tappable
                key={value}
                onPress={() => onChoose(value)}
                scaleTo={0.92}
                style={styles.cell}
                accessibilityLabel={`RPE ${formatRpe(value)}, ${rpeMeaning(value)}`}
              >
                <SlashPanel color={selected ? loud.loud : loud.panel} style={styles.cellPanel}>
                  <Text style={[styles.cellValue, { color: selected ? loud.onLoud : loud.figure }]}>
                    {formatRpe(value)}
                  </Text>
                  <Text
                    style={[
                      styles.cellGloss,
                      { color: selected ? loud.onLoud : loud.figureFaint },
                    ]}
                    numberOfLines={1}
                  >
                    {rpeMeaning(value)}
                  </Text>
                </SlashPanel>
              </Tappable>
            );
          })}
        </View>

        <Tappable onPress={() => onChoose(null)} scaleTo={0.97}>
          <SlashPanel color={loud.panel} style={styles.action}>
            <Text style={[styles.actionLabel, { color: loud.figureMuted }]}>
              {current === null ? 'SKIP' : 'CLEAR RATING'}
            </Text>
          </SlashPanel>
        </Tappable>
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
  title: { fontFamily: font.display, fontSize: 16, letterSpacing: 1, color: loud.figure },
  subtitle: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 17,
    color: loud.figureFaint,
    marginTop: 2,
    marginBottom: space.md,
  },
  // Three across: nine stops divide evenly, and a third of a phone is wide
  // enough for the gloss to sit under the number rather than beside it.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  cell: { width: '31%', flexGrow: 1 },
  cellPanel: { minHeight: 58, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  cellValue: { fontFamily: font.figure, fontSize: 20, fontVariant: ['tabular-nums'] },
  cellGloss: { fontFamily: font.ui, fontSize: 9, marginTop: 1 },
  action: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontFamily: font.display, fontSize: 13, letterSpacing: 1.4 },
});
