import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CatalogueEntry } from '../db';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { Tappable } from './Tappable';
import { ExerciseIcon } from './ExerciseIcon';
import { motionFor } from '../exerciseMotion';
import { videoBundleFor } from '../exerciseVideos';
import { ExerciseVideoPlayer } from './ExerciseVideoPlayer';
import { KinematicMotionStudio } from './MovementFigure';
import { MuscleFigure } from './MuscleFigure';
import { REGION_LABELS } from './muscleMap';
import { researchProfileFor } from '../exerciseResearch';

interface ExerciseInfoSheetProps {
  entry: CatalogueEntry | null;
  onClose: () => void;
}

const getEffectiveExerciseName = (entry: CatalogueEntry | null): string => {
  if (!entry) return '';
  if (entry.recordedName) {
    const recLower = entry.recordedName.toLowerCase();
    const canLower = entry.canonicalName.toLowerCase();
    const variationWords = [
      'incline',
      'decline',
      'close-grip',
      'close grip',
      'cgbp',
      'dumbbell',
      'db',
      'barbell',
      'bb',
      'machine',
      'cable',
      'smith',
      'deficit',
      'spoto',
      'floor',
      'front',
      'hack',
      'zercher',
      'romanian',
      'rdl',
      'sumo',
      'trap bar',
      'trap',
      'hex',
      'sissy',
      'split',
      'bulgarian',
      'goblet',
      'overhead',
      'seated',
      'standing',
      'lying',
      'preacher',
      'spider',
      'hammer',
      'reverse',
    ];
    for (const word of variationWords) {
      if (recLower.includes(word) && !canLower.includes(word)) {
        return entry.recordedName;
      }
    }
  }
  return entry.canonicalName;
};

/**
 * What a movement is, and how to do it.
 *
 * Behind a tap rather than beside the set rows: it is reference material, and
 * the rows are what you are actually doing. Provides evidence-based execution steps
 * and peer-reviewed biomechanical research.
 */
export const ExerciseInfoSheet = ({ entry, onClose }: ExerciseInfoSheetProps) => {
  const insets = useSafeAreaInsets();
  const [activeSection, setActiveSection] = useState<'steps' | 'research'>('steps');
  const effectiveName = getEffectiveExerciseName(entry);
  const research = entry
    ? researchProfileFor(effectiveName, entry.movementPattern) ??
      researchProfileFor(entry.canonicalName, entry.movementPattern)
    : null;

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
                <Text style={[styles.name, { color: loud.figure }]}>
                  {effectiveName || entry.canonicalName}
                </Text>
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

            {/*
              Two-Tier Motion Architecture:
              - Tier 1: Photorealistic 8K Keyframe Studio for the Big 5 movement families.
              - Tier 2: Interactive 60 FPS Kinematic Studio for all 120+ accessory movements.
            */}
            {(() => {
              const bundle = videoBundleFor(effectiveName);
              if (bundle !== null) {
                return (
                  <ExerciseVideoPlayer
                    bundle={bundle}
                    exerciseName={effectiveName}
                    equipment={entry.equipment}
                  />
                );
              }
              const motion = motionFor(effectiveName) ?? motionFor(entry.canonicalName);
              return motion === null ? null : (
                <KinematicMotionStudio
                  motion={motion}
                  exerciseName={effectiveName}
                  equipment={entry.equipment}
                />
              );
            })()}

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

            {/* Segmented Switcher: Steps vs Research */}
            <View style={styles.sectionTabs}>
              <Pressable
                onPress={() => setActiveSection('steps')}
                style={[styles.sectionTab, activeSection === 'steps' && styles.sectionTabActive]}
              >
                <Text style={[styles.sectionTabLabel, activeSection === 'steps' && styles.sectionTabLabelActive]}>
                  EXECUTION STEPS
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveSection('research')}
                style={[styles.sectionTab, activeSection === 'research' && styles.sectionTabActive]}
              >
                <Text style={[styles.sectionTabLabel, activeSection === 'research' && styles.sectionTabLabelActive]}>
                  🔬 RESEARCH & EVIDENCE
                </Text>
              </Pressable>
            </View>

            {activeSection === 'steps' ? (
              <>
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
              </>
            ) : (
              research && (
                <View style={styles.researchContainer}>
                  {/* Breathing & Bracing Protocol Card */}
                  <View style={styles.researchCard}>
                    <View style={styles.researchCardHeader}>
                      <Text style={styles.researchCardBadge}>🫁 BREATHING & BRACING PROTOCOL</Text>
                    </View>
                    <Text style={styles.researchCardTitle}>{research.breathing.title}</Text>
                    <Text style={styles.researchCardBody}>{research.breathing.instruction}</Text>
                    <Text style={styles.researchCardRationale}>
                      <Text style={{ fontWeight: '700', color: loud.loud }}>Biomechanics: </Text>
                      {research.breathing.biomechanicalRationale}
                    </Text>
                    <Text style={styles.researchCitationTag}>Ref: {research.breathing.citation}</Text>
                  </View>

                  {/* Meta-Analyses Evidence Card */}
                  <View style={styles.researchCard}>
                    <View style={styles.researchCardHeader}>
                      <Text style={styles.researchCardBadge}>📚 PEER-REVIEWED META-ANALYSES</Text>
                    </View>
                    {research.metaAnalyses.map((meta, idx) => (
                      <View key={idx} style={[styles.metaItem, idx > 0 && styles.itemDivider]}>
                        <Text style={styles.metaCitation}>
                          {meta.citation} ({meta.year}) • {meta.journal}
                        </Text>
                        <Text style={styles.metaFinding}>{meta.keyFinding}</Text>
                        <Text style={styles.metaTakeaway}>
                          <Text style={{ fontWeight: '700', color: '#10B981' }}>Takeaway: </Text>
                          {meta.practicalTakeaway}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Common Biomechanical Mistakes & Evidence-Based Fixes */}
                  <View style={styles.researchCard}>
                    <View style={styles.researchCardHeader}>
                      <Text style={styles.researchCardBadge}>⚠️ COMMON MISTAKES & EVIDENCE-BASED FIXES</Text>
                    </View>
                    {research.diagnostics.map((diag, idx) => (
                      <View key={idx} style={[styles.diagItem, idx > 0 && styles.itemDivider]}>
                        <Text style={styles.diagTitle}>{diag.title}</Text>
                        <Text style={styles.diagStandard}>
                          <Text style={{ fontWeight: '700', color: loud.figure }}>Standard: </Text>
                          {diag.biomechanicalStandard}
                        </Text>
                        {diag.idealAngleOrPosition && (
                          <Text style={styles.diagAngle}>
                            <Text style={{ fontWeight: '700', color: '#00E5FF' }}>Ideal Target: </Text>
                            {diag.idealAngleOrPosition}
                          </Text>
                        )}
                        <Text style={styles.diagFlaw}>
                          <Text style={{ fontWeight: '700', color: loud.warn }}>Flaw / Risk: </Text>
                          {diag.biomechanicalFlawOrRisk}
                        </Text>
                        <Text style={styles.diagFix}>
                          <Text style={{ fontWeight: '700', color: '#10B981' }}>Fix: </Text>
                          {diag.evidenceBasedFix}
                        </Text>
                        <Text style={styles.diagCitation}>
                          Evidence: {diag.evidence.citation} ({diag.evidence.year})
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )
            )}

            <View style={{ height: space.md }} />
            <Tappable onPress={onClose} scaleTo={0.97}>
              <View style={styles.close}>
                <Text style={styles.closeLabel}>CLOSE</Text>
              </View>
            </Tappable>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  demo: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.sm,
    marginBottom: space.md,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    maxHeight: '78%',
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
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
  close: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, backgroundColor: loud.loud },
  closeLabel: { fontFamily: font.display, fontSize: 13, letterSpacing: 1.4, color: loud.onLoud },
  stepText: { flex: 1, fontFamily: font.ui, fontSize: 14, lineHeight: 21 },
  sectionTabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(9, 10, 13, 0.6)',
    borderRadius: radius.pill,
    padding: 3,
    marginBottom: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  sectionTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  sectionTabActive: {
    backgroundColor: loud.ground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  sectionTabLabel: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 0.8,
    color: loud.figureFaint,
  },
  sectionTabLabelActive: {
    color: loud.figure,
    fontWeight: '700',
  },
  researchContainer: {
    gap: space.md,
    marginBottom: space.sm,
  },
  researchCard: {
    backgroundColor: 'rgba(9, 10, 13, 0.75)',
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  researchCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.xs,
  },
  researchCardBadge: {
    fontFamily: font.display,
    fontSize: 9,
    letterSpacing: 0.8,
    color: '#00E5FF',
    fontWeight: '700',
  },
  researchCitationTag: {
    fontFamily: font.figure,
    fontSize: 9,
    color: loud.figureFaint,
    marginTop: space.xs,
  },
  researchCardTitle: {
    fontFamily: font.uiStrong,
    fontSize: 14,
    color: loud.figure,
    marginBottom: 4,
  },
  researchCardBody: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 19,
    color: loud.figureMuted,
    marginBottom: 6,
  },
  researchCardRationale: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 18,
    color: loud.figureMuted,
    backgroundColor: 'rgba(255, 85, 0, 0.08)',
    padding: space.xs,
    borderRadius: radius.sm,
    borderLeftWidth: 2,
    borderLeftColor: loud.loud,
  },
  metaItem: {
    gap: 4,
    paddingVertical: space.xs,
  },
  itemDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: loud.rule,
    marginTop: space.xs,
    paddingTop: space.xs,
  },
  metaCitation: {
    fontFamily: font.uiStrong,
    fontSize: 12,
    color: '#00E5FF',
  },
  metaFinding: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 18,
    color: loud.figureMuted,
  },
  metaTakeaway: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 18,
    color: loud.figure,
  },
  diagItem: {
    gap: 4,
    paddingVertical: space.xs,
  },
  diagTitle: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    color: loud.figure,
  },
  diagStandard: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 17,
    color: loud.figureMuted,
  },
  diagAngle: {
    fontFamily: font.figure,
    fontSize: 11,
    lineHeight: 16,
    color: loud.figureMuted,
  },
  diagFlaw: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 17,
    color: loud.figureMuted,
  },
  diagFix: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 17,
    color: loud.figure,
  },
  diagCitation: {
    fontFamily: font.figure,
    fontSize: 10,
    color: loud.figureFaint,
    marginTop: 2,
  },
});
