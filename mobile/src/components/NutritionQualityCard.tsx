import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LogEntry, Nutrients, UserProfile } from '@adaptive-macros/engine';
import { computeNutritionQualityScore, evaluateElectrolytes } from '@adaptive-macros/engine';
import { thud } from '../platform/haptics';
import { font, radius, space, useTheme } from '../theme';
import { Card } from './Card';
import { Tappable } from './Tappable';
import { NutritionQualityModal } from './NutritionQualityModal';

interface NutritionQualityCardProps {
  consumed: Nutrients;
  entries: LogEntry[];
  profile: UserProfile;
}

export const NutritionQualityCard = ({
  consumed,
  entries,
  profile,
}: NutritionQualityCardProps) => {
  const { colors } = useTheme();
  const [modalOpen, setModalOpen] = useState(false);

  const quality = useMemo(() => {
    return computeNutritionQualityScore(consumed, profile.sex);
  }, [consumed, profile.sex]);

  const electrolytes = useMemo(() => {
    return evaluateElectrolytes(consumed.micros);
  }, [consumed.micros]);

  const targetFiber = profile.sex === 'female' ? 25 : 38;
  const consumedFiber = Math.round(consumed.fiberG ?? 0);

  const gradeColor =
    quality.grade === 'Elite'
      ? colors.positive
      : quality.grade === 'Great'
        ? colors.accent
        : quality.grade === 'Fair'
          ? colors.warning
          : colors.textMuted;

  return (
    <>
      <Card>
        <Tappable
          onPress={() => {
            thud('light');
            setModalOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Open Nutrition Quality and Micronutrients"
          style={styles.container}
        >
          {/* Header Row */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <Ionicons name="nutrition-outline" size={18} color={gradeColor} />
              </View>
              <View>
                <View style={styles.badgeRow}>
                  <Text style={[styles.badgeText, { color: gradeColor }]}>
                    NUTRITION QUALITY · {quality.grade.toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.title, { color: colors.text }]}>
                  Clinical Micronutrients & Health
                </Text>
              </View>
            </View>

            <View style={[styles.scoreBadge, { backgroundColor: colors.surfaceRaised, borderColor: gradeColor }]}>
              <Text style={[styles.scoreValue, { color: gradeColor }]}>{quality.score}</Text>
              <Text style={[styles.scoreScale, { color: colors.textMuted }]}>/100</Text>
            </View>
          </View>

          {/* Quick Vitals Strip */}
          <View style={styles.vitalsRow}>
            <View style={[styles.vitalPill, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <Text style={[styles.vitalLabel, { color: colors.textMuted }]}>FIBER</Text>
              <Text style={[styles.vitalValue, { color: colors.text }]}>
                {consumedFiber} / {targetFiber} g
              </Text>
            </View>

            <View style={[styles.vitalPill, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <Text style={[styles.vitalLabel, { color: colors.textMuted }]}>ELECTROLYTES</Text>
              <Text
                style={[
                  styles.vitalValue,
                  { color: electrolytes.isOptimalRatio ? colors.positive : colors.text },
                ]}
              >
                {electrolytes.ratio ? `Na:K ${electrolytes.ratio}:1` : 'Tracking'}
              </Text>
            </View>

            <View style={[styles.vitalPill, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <Text style={[styles.vitalLabel, { color: colors.textMuted }]}>MICRONUTRIENTS</Text>
              <Text style={[styles.vitalValue, { color: colors.accent }]}>
                {entries.length > 0 ? 'Full Panel' : 'Ready'}
              </Text>
            </View>
          </View>

          {/* Call to action footer */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.accent }]}>
              View full clinical panel & AI food recommendations
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.accent} />
          </View>
        </Tappable>
      </Card>

      <NutritionQualityModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        consumed={consumed}
        entries={entries}
        profile={profile}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flex: 1,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeText: {
    fontFamily: font.figure,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: font.uiStrong,
    fontSize: 14,
    lineHeight: 18,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  scoreValue: {
    fontFamily: font.figure,
    fontSize: 16,
    fontWeight: '800',
  },
  scoreScale: {
    fontFamily: font.figure,
    fontSize: 10,
    marginLeft: 1,
  },
  vitalsRow: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.xs,
  },
  vitalPill: {
    flex: 1,
    paddingVertical: space.xs,
    paddingHorizontal: space.xs + 2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: 2,
  },
  vitalLabel: {
    fontFamily: font.figure,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  vitalValue: {
    fontFamily: font.uiStrong,
    fontSize: 11,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.xs,
  },
  footerText: {
    fontFamily: font.uiStrong,
    fontSize: 12,
  },
});
