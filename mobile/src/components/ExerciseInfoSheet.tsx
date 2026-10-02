import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CatalogueEntry } from '../db';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { SlashPanel } from './SlashPanel';
import { Tappable } from './Tappable';
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
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={entry !== null} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: loud.panel,
            borderColor: loud.rule,
            paddingBottom: insets.bottom + space.lg,
          },
        ]}
      >
        {entry && (
          <ScrollView>
            <View style={styles.header}>
              <ExerciseIcon pattern={entry.movementPattern} size={28} color={loud.figure} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: loud.figure }]}>{entry.canonicalName}</Text>
                {/*
                  The free-text muscle only appears when there is no diagram.
                  The model answers the two separately and they disagree — a
                  deadlift came back primaryMuscle "Hamstrings" and region
                  "glutes" — so showing both put two answers to one question
                  four lines apart. The legend below is the validated one.
                */}
                <Text style={[styles.meta, { color: loud.figureFaint }]}>
                  {entry.primaryRegion === null ? `${entry.primaryMuscle} · ` : ''}
                  {entry.equipment}
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
                  outline={loud.rule}
                  fill={loud.loud}
                />
                <MuscleFigure
                  view="back"
                  primary={entry.primaryRegion}
                  secondary={entry.secondaryRegions}
                  size={96}
                  outline={loud.rule}
                  fill={loud.loud}
                />
                <View style={styles.legend}>
                  <Text style={[styles.legendPrimary, { color: loud.figure }]}>
                    {REGION_LABELS[entry.primaryRegion]}
                  </Text>
                  {entry.secondaryRegions.length > 0 && (
                    <Text style={[styles.legendSecondary, { color: loud.figureFaint }]}>
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
                  <Text style={[styles.stepNumber, { color: loud.loud }]}>{index + 1}</Text>
                  <Text style={[styles.stepText, { color: loud.figureMuted }]}>{step}</Text>
                </View>
              ))
            ) : entry.instructions ? (
              // An entry catalogued before steps existed still has its prose,
              // and showing that beats showing nothing while a backfill waits.
              <Text style={[styles.body, { color: loud.figureMuted }]}>{entry.instructions}</Text>
            ) : (
              <Text style={[styles.body, { color: loud.figureFaint }]}>
                No instructions for this one yet.
              </Text>
            )}

            {(entry.instructions || entry.steps.length > 0) && (
              <Text style={[styles.caveat, { color: loud.warn }]}>
                Written by a model. Check it against a source you trust before loading a bar.
              </Text>
            )}

            <View style={{ height: space.md }} />
            <Tappable onPress={onClose} scaleTo={0.97}>
              <SlashPanel color={loud.loud} style={styles.close}>
                <Text style={styles.closeLabel}>CLOSE</Text>
              </SlashPanel>
            </Tappable>
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
  name: { fontFamily: font.display, fontSize: 18, letterSpacing: 0.1 },
  meta: { fontFamily: font.ui, fontSize: 12, marginTop: 2 },
  body: { fontFamily: font.ui, fontSize: 14, lineHeight: 21 },
  map: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  legend: { flex: 1, gap: 2 },
  legendPrimary: { fontFamily: font.uiStrong, fontSize: 14 },
  legendSecondary: { fontFamily: font.ui, fontSize: 12, lineHeight: 17 },
  step: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  stepNumber: { fontFamily: font.figure, fontSize: 13, minWidth: 14 },
  close: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  closeLabel: { fontFamily: font.display, fontSize: 13, letterSpacing: 1.4, color: loud.onLoud },
  stepText: { flex: 1, fontFamily: font.ui, fontSize: 14, lineHeight: 21 },
  caveat: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, marginTop: space.md },
});
