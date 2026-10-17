import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import type {
  DailyEstimate,
  DailyObservation,
  DatedSet,
  VolumeDiagnostics,
} from '@adaptive-macros/engine';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { Card } from './Card';
import { Tappable } from './Tappable';
import { notify } from '../dialog';
import { thud } from '../platform/haptics';
import type { UnitSystem } from '../state/settings';
import {
  extractWeeklyMetrics,
  requestWeeklyReview,
  type WeeklyExtractedMetrics,
  type WeeklyReviewResult,
} from '../ai/weeklyReview';

interface WeeklyReviewCardProps {
  series: DailyEstimate[];
  observations?: DailyObservation[];
  sets: DatedSet[];
  diagnostics?: VolumeDiagnostics | null;
  goalDirection?: 'lose' | 'maintain' | 'gain';
  targetKcal?: number;
  targetProteinG?: number;
  units?: UnitSystem;
  geminiApiKey?: string;
  onApplyAdjustment?: (adjustment: { deltaKcal?: number; deltaSets?: number; type: string }) => void;
}

const STORAGE_KEY_PREFIX = 'ascend_weekly_review_';

const CONFIDENCE_COLORS = {
  high: { text: '#10B981', bg: '#102A1E', border: '#1D5A3C' },
  moderate: { text: '#FBBF24', bg: '#292010', border: '#5A4315' },
  low: { text: '#94A3B8', bg: '#181E26', border: '#2B374A' },
};

export const WeeklyReviewCard = ({
  series,
  observations,
  sets,
  diagnostics,
  goalDirection = 'maintain',
  targetKcal,
  targetProteinG,
  units = 'metric',
  geminiApiKey = '',
  onApplyAdjustment,
}: WeeklyReviewCardProps) => {
  const [review, setReview] = useState<WeeklyReviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const metrics: WeeklyExtractedMetrics = useMemo(
    () =>
      extractWeeklyMetrics({
        series,
        observations,
        sets,
        diagnostics,
        goalDirection,
        targetKcal,
        targetProteinG,
        units,
      }),
    [series, observations, sets, diagnostics, goalDirection, targetKcal, targetProteinG, units],
  );

  const cacheKey = `${STORAGE_KEY_PREFIX}${metrics.period.to}`;

  // Restore cached review for this week
  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(cacheKey).then((saved) => {
      if (alive && saved) {
        try {
          setReview(JSON.parse(saved) as WeeklyReviewResult);
        } catch {}
      }
    });
    return () => {
      alive = false;
    };
  }, [cacheKey]);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      thud('light');
      const result = await requestWeeklyReview(metrics, geminiApiKey, goalDirection);
      setReview(result);
      setApplied(false);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(result));
      thud('heavy');
      notify('Review generated', 'Your weekly coaching review is ready.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate coaching review';
      setError(msg);
      notify('Coaching Review', msg);
    } finally {
      setLoading(false);
    }
  }, [metrics, geminiApiKey, goalDirection, cacheKey]);

  const handleApply = useCallback(() => {
    if (!review?.suggestedAdjustment?.hasAdjustment || applied) return;
    thud('heavy');
    setApplied(true);
    onApplyAdjustment?.({
      deltaKcal: review.suggestedAdjustment.deltaKcal,
      deltaSets: review.suggestedAdjustment.deltaSets,
      type: review.suggestedAdjustment.type,
    });
    notify('Adjustment Applied', `Updated targets: ${review.suggestedAdjustment.title}`);
  }, [review, applied, onApplyAdjustment]);

  const confColor = review ? CONFIDENCE_COLORS[review.dataConfidence] : CONFIDENCE_COLORS[metrics.confidence];

  return (
    <Card style={styles.container}>
      {/* Card Header Strip */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleWrap}>
          <View style={styles.badgeRow}>
            <Ionicons name="sparkles" size={14} color="#00E5FF" />
            <Text style={styles.headerBadge}>AI COACHING REVIEW</Text>
          </View>
          <Text style={styles.headerSubtitle}>
            {metrics.period.from} to {metrics.period.to}
          </Text>
        </View>

        <View style={[styles.confPill, { backgroundColor: confColor.bg, borderColor: confColor.border }]}>
          <View style={[styles.confDot, { backgroundColor: confColor.text }]} />
          <Text style={[styles.confPillText, { color: confColor.text }]}>
            {(review?.dataConfidence ?? metrics.confidence).toUpperCase()} CONFIDENCE
          </Text>
        </View>
      </View>

      {/* State A: Not Yet Generated */}
      {!review && !loading && (
        <View style={styles.unopenedWrap}>
          <View style={styles.glanceRow}>
            <View style={styles.glanceItem}>
              <Text style={styles.glanceVal}>{metrics.training.sessionsCount}</Text>
              <Text style={styles.glanceLabel}>SESSIONS</Text>
            </View>
            <View style={styles.glanceDivider} />
            <View style={styles.glanceItem}>
              <Text style={styles.glanceVal}>
                {metrics.weight.deltaKg !== null
                  ? `${metrics.weight.deltaKg > 0 ? `+${metrics.weight.deltaKg}` : metrics.weight.deltaKg}`
                  : '—'}
              </Text>
              <Text style={styles.glanceLabel}>KG DELTA</Text>
            </View>
            <View style={styles.glanceDivider} />
            <View style={styles.glanceItem}>
              <Text style={styles.glanceVal}>
                {metrics.nutrition.avgEnergyDeltaKcal !== null
                  ? `${metrics.nutrition.avgEnergyDeltaKcal > 0 ? `+${metrics.nutrition.avgEnergyDeltaKcal}` : metrics.nutrition.avgEnergyDeltaKcal}`
                  : '—'}
              </Text>
              <Text style={styles.glanceLabel}>ENERGY KCAL</Text>
            </View>
          </View>

          <Text style={styles.promptPitch}>
            Synthesize progressive overload on key lifts, 7-day scale weight rate of change, and energy balance into
            actionable guidance.
          </Text>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Tappable
            onPress={handleGenerate}
            style={styles.generateBtn}
            scaleTo={0.97}
            accessibilityRole="button"
            accessibilityLabel="Generate weekly AI coaching review"
          >
            <Ionicons name="sparkles" size={16} color="#0A0A0B" style={{ marginRight: 6 }} />
            <Text style={styles.generateBtnText}>GENERATE WEEKLY REVIEW</Text>
          </Tappable>
        </View>
      )}

      {/* State B: Loading */}
      {loading && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#00E5FF" style={{ marginBottom: space.sm }} />
          <Text style={styles.loadingText}>Synthesizing workouts, scale trends & nutrition...</Text>
          <Text style={styles.loadingSub}>Evaluating progressive overload and energy balance</Text>
        </View>
      )}

      {/* State C: Generated Review */}
      {review && !loading && (
        <View style={styles.reviewContent}>
          {/* Headline */}
          <Text style={styles.headline}>"{review.headline}"</Text>

          {/* Key Wins */}
          <View style={styles.winsWrap}>
            <Text style={styles.sectionTitle}>KEY ACHIEVEMENTS</Text>
            {review.keyWins.map((win, idx) => (
              <View key={idx} style={styles.winRow}>
                <Ionicons name="checkmark-circle" size={15} color="#10B981" style={{ marginTop: 2 }} />
                <Text style={styles.winText}>{win}</Text>
              </View>
            ))}
          </View>

          {/* Holistic Synthesis */}
          <View style={styles.synthesisWrap}>
            <Text style={styles.sectionTitle}>HOLISTIC SYNTHESIS</Text>
            <Text style={styles.synthesisBody}>{review.synthesis}</Text>
          </View>

          {/* Dual Insight Cards */}
          <View style={styles.insightsRow}>
            <View style={styles.insightBox}>
              <View style={styles.insightHeader}>
                <Ionicons name="barbell-outline" size={14} color="#00E5FF" />
                <Text style={styles.insightTitle}>TRAINING & VOLUME</Text>
              </View>
              <Text style={styles.insightBody}>{review.trainingInsight}</Text>
            </View>

            <View style={styles.insightBox}>
              <View style={styles.insightHeader}>
                <Ionicons name="nutrition-outline" size={14} color="#FBBF24" />
                <Text style={[styles.insightTitle, { color: '#FBBF24' }]}>ENERGY & NUTRITION</Text>
              </View>
              <Text style={styles.insightBody}>{review.nutritionInsight}</Text>
            </View>
          </View>

          {/* Suggested Adjustment */}
          <View style={styles.adjustmentWrap}>
            <View style={styles.adjustmentHeaderRow}>
              <Ionicons
                name={review.suggestedAdjustment.hasAdjustment ? 'flash-outline' : 'checkmark-done'}
                size={16}
                color={review.suggestedAdjustment.hasAdjustment ? '#F59E0B' : '#10B981'}
              />
              <Text
                style={[
                  styles.adjustmentTitle,
                  { color: review.suggestedAdjustment.hasAdjustment ? '#F59E0B' : '#10B981' },
                ]}
              >
                RECOMMENDED: {review.suggestedAdjustment.title.toUpperCase()}
              </Text>
            </View>

            <Text style={styles.adjustmentRationale}>{review.suggestedAdjustment.rationale}</Text>

            {review.suggestedAdjustment.hasAdjustment && onApplyAdjustment && (
              <Tappable
                onPress={handleApply}
                disabled={applied}
                style={[styles.applyBtn, applied && styles.applyBtnDisabled]}
                scaleTo={applied ? 1 : 0.96}
                accessibilityRole="button"
                accessibilityLabel={`Apply suggested adjustment: ${review.suggestedAdjustment.title}`}
              >
                <Ionicons
                  name={applied ? 'checkmark' : 'arrow-forward'}
                  size={15}
                  color={applied ? '#64748B' : '#0A0A0B'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.applyBtnText, applied && styles.applyBtnTextDisabled]}>
                  {applied ? 'ADJUSTMENT APPLIED' : `APPLY ${review.suggestedAdjustment.title.toUpperCase()}`}
                </Text>
              </Tappable>
            )}
          </View>

          {/* Refresh / Regenerate button */}
          <Tappable
            onPress={handleGenerate}
            style={styles.refreshBtn}
            scaleTo={0.96}
            accessibilityRole="button"
            accessibilityLabel="Regenerate review"
          >
            <Ionicons name="refresh-outline" size={12} color={loud.figureMuted} />
            <Text style={styles.refreshBtnText}>Re-analyze with latest logs</Text>
          </Tappable>
        </View>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0E1015',
    borderColor: '#1C2230',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: space.sm,
  },
  headerTitleWrap: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  headerBadge: {
    fontFamily: font.display,
    fontSize: 12,
    letterSpacing: 1.2,
    color: '#00E5FF',
  },
  headerSubtitle: {
    fontFamily: font.figure,
    fontSize: 10,
    color: loud.figureMuted,
    letterSpacing: 0.5,
  },
  confPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  confDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  confPillText: {
    fontFamily: font.display,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  unopenedWrap: {
    marginTop: space.sm,
  },
  glanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#141822',
    borderRadius: radius.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#212A3D',
  },
  glanceItem: {
    alignItems: 'center',
  },
  glanceVal: {
    fontFamily: font.figure,
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  glanceLabel: {
    fontFamily: font.display,
    fontSize: 9,
    letterSpacing: 0.8,
    color: loud.figureMuted,
    marginTop: 2,
  },
  glanceDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#2A344A',
  },
  promptPitch: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 17,
    color: loud.figureMuted,
    marginBottom: space.md,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00E5FF',
    paddingVertical: 11,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
  },
  generateBtnText: {
    fontFamily: font.display,
    fontSize: 12,
    letterSpacing: 1,
    color: '#0A0A0B',
    fontWeight: 'bold',
  },
  loadingWrap: {
    paddingVertical: space.lg,
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  loadingSub: {
    fontFamily: font.ui,
    fontSize: 11,
    color: loud.figureMuted,
  },
  errorText: {
    fontFamily: font.ui,
    fontSize: 11,
    color: '#EF4444',
    marginBottom: space.sm,
  },
  reviewContent: {
    marginTop: space.xs,
  },
  headline: {
    fontFamily: font.display,
    fontSize: 15,
    lineHeight: 21,
    color: '#FFFFFF',
    marginBottom: space.md,
    letterSpacing: 0.2,
  },
  winsWrap: {
    backgroundColor: '#111A16',
    borderColor: '#1D3B2E',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: space.sm + 2,
    marginBottom: space.md,
  },
  sectionTitle: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 1,
    color: loud.figureMuted,
    marginBottom: 6,
  },
  winRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  winText: {
    flex: 1,
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 16,
    color: '#E2E8F0',
  },
  synthesisWrap: {
    marginBottom: space.md,
  },
  synthesisBody: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 18,
    color: '#CBD5E1',
  },
  insightsRow: {
    flexDirection: 'column',
    gap: space.sm,
    marginBottom: space.md,
  },
  insightBox: {
    backgroundColor: '#121620',
    borderColor: '#1F293D',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: space.sm + 2,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  insightTitle: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 0.8,
    color: '#00E5FF',
  },
  insightBody: {
    fontFamily: font.ui,
    fontSize: 11,
    lineHeight: 16,
    color: loud.figureMuted,
  },
  adjustmentWrap: {
    backgroundColor: '#1B1710',
    borderColor: '#4D3B18',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: space.sm + 4,
    marginBottom: space.sm,
  },
  adjustmentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  adjustmentTitle: {
    fontFamily: font.display,
    fontSize: 11,
    letterSpacing: 1,
  },
  adjustmentRationale: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 17,
    color: '#D4D4D8',
    marginBottom: space.sm,
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F59E0B',
    paddingVertical: 9,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
  },
  applyBtnDisabled: {
    backgroundColor: '#27272A',
  },
  applyBtnText: {
    fontFamily: font.display,
    fontSize: 11,
    letterSpacing: 0.8,
    color: '#0A0A0B',
    fontWeight: 'bold',
  },
  applyBtnTextDisabled: {
    color: '#71717A',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    marginTop: 4,
  },
  refreshBtnText: {
    fontFamily: font.figure,
    fontSize: 10,
    color: loud.figureMuted,
  },
});
