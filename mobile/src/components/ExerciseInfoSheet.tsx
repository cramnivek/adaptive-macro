import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CatalogueEntry } from '../db';
import { font, radius, space, useTheme } from '../theme';
import { Button } from './Controls';
import { ExerciseIcon } from './ExerciseIcon';
import { MuscleFigure } from './MuscleFigure';
import { REGION_LABELS } from './muscleMap';

interface ExerciseInfoSheetProps {
  entry: CatalogueEntry | null;
  onClose: () => void;
}

/**
 * What a movement is, and how to do it.
 *
 * Behind a tap rather than beside the set rows: it is reference material, and
 * the rows are what you are actually doing. The caveat is not decoration — a
 * wrong macro costs you an inaccurate day, a wrong cue under a loaded barbell
 * costs more.
 */
export const ExerciseInfoSheet = ({ entry, onClose }: ExerciseInfoSheetProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={entry !== null} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            paddingBottom: insets.bottom + space.lg,
          },
        ]}
      >
        {entry && (
          <ScrollView>
            <View style={styles.header}>
              <ExerciseIcon pattern={entry.movementPattern} size={28} color={colors.text} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{entry.canonicalName}</Text>
                <Text style={[styles.meta, { color: colors.textFaint }]}>
                  {entry.primaryMuscle} · {entry.equipment}
                  {entry.bodyweightBased ? ' · bodyweight' : ''}
                </Text>
              </View>
            </View>

            {entry.primaryRegion !== null && (
              <View style={styles.map}>
                {/*
                  Both sides, always. Which one carries the primary muscle is
                  not something to make someone work out from a single view, and
                  a pull shades the back while its secondaries sit on the front.
                */}
                <MuscleFigure
                  view="front"
                  primary={entry.primaryRegion}
                  secondary={entry.secondaryRegions}
                  size={96}
                  outline={colors.border}
                  fill={colors.accent}
                />
                <MuscleFigure
                  view="back"
                  primary={entry.primaryRegion}
                  secondary={entry.secondaryRegions}
                  size={96}
                  outline={colors.border}
                  fill={colors.accent}
                />
                <View style={styles.legend}>
                  <Text style={[styles.legendPrimary, { color: colors.text }]}>
                    {REGION_LABELS[entry.primaryRegion]}
                  </Text>
                  {entry.secondaryRegions.length > 0 && (
                    <Text style={[styles.legendSecondary, { color: colors.textFaint }]}>
                      also {entry.secondaryRegions.map((r) => REGION_LABELS[r].toLowerCase()).join(', ')}
                    </Text>
                  )}
                </View>
              </View>
            )}

            {entry.steps.length > 0 ? (
              entry.steps.map((step, index) => (
                // Index, not the text: a model emitting "Repeat." twice would collide.
                <View key={index} style={styles.step}>
                  <Text style={[styles.stepNumber, { color: colors.textFaint }]}>{index + 1}</Text>
                  <Text style={[styles.stepText, { color: colors.textMuted }]}>{step}</Text>
                </View>
              ))
            ) : entry.instructions ? (
              // An entry catalogued before steps existed still has its prose,
              // and showing that beats showing nothing while a backfill waits.
              <Text style={[styles.body, { color: colors.textMuted }]}>{entry.instructions}</Text>
            ) : (
              <Text style={[styles.body, { color: colors.textFaint }]}>
                No instructions for this one yet.
              </Text>
            )}

            {(entry.instructions || entry.steps.length > 0) && (
              <Text style={[styles.caveat, { color: colors.warning }]}>
                Written by a model. Check it against a source you trust before loading a bar.
              </Text>
            )}

            <View style={{ height: space.md }} />
            <Button label="Close" variant="subtle" onPress={onClose} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    maxHeight: '78%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  name: { fontFamily: font.uiStrong, fontSize: 17 },
  meta: { fontFamily: font.ui, fontSize: 12, marginTop: 2 },
  body: { fontFamily: font.ui, fontSize: 14, lineHeight: 21 },
  map: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  legend: { flex: 1, gap: 2 },
  legendPrimary: { fontFamily: font.uiStrong, fontSize: 14 },
  legendSecondary: { fontFamily: font.ui, fontSize: 12, lineHeight: 17 },
  step: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  stepNumber: { fontFamily: font.figure, fontSize: 13, minWidth: 14 },
  stepText: { flex: 1, fontFamily: font.ui, fontSize: 14, lineHeight: 21 },
  caveat: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, marginTop: space.md },
});
