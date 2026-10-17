import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
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
  onOpenModal?: () => void;
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
  onOpenModal,
  onApplyAdjustment,
}: WeeklyReviewCardProps) => {
  const [review, setReview] = useState<WeeklyReviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [showScience, setShowScience] = useState(false);

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
      notify('Review ready', 'Your weekly coaching review is ready.');
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
    notify('Adjustment Applied', `Updated target: ${review.suggestedAdjustment.title}`);
  }, [review, applied, onApplyAdjustment]);

  const conf = review?.dataConfidence ?? metrics.confidence;
  const confColor = CONFIDENCE_COLORS[conf];

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

        <View style={styles.headerRightWrap}>
          <View style={[styles.confPill, { backgroundColor: confColor.bg, borderColor: confColor.border }]}>
            <View style={[styles.confDot, { backgroundColor: confColor.text }]} />
            <Text style={[styles.confPillText, { color: confColor.text }]}>
              {conf.toUpperCase()}
            </Text>
          </View>

          {onOpenModal && (
            <Tappable
              onPress={onOpenModal}
              style={styles.openPopupBtn}
              scaleTo={0.92}
              accessibilityLabel="Open coaching review as full popup"
            >
              <Ionicons name="expand" size={14} color="#00E5FF" />
            </Tappable>
          )}
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
              <Text style={styles.glanceLabel}>KG CHANGE</Text>
            </View>
            <View style={styles.glanceDivider} />
            <View style={styles.glanceItem}>
              <Text style={styles.glanceVal}>
                {metrics.nutrition.avgEnergyDeltaKcal !== null
                  ? `${metrics.nutrition.avgEnergyDeltaKcal > 0 ? `+${metrics.nutrition.avgEnergyDeltaKcal}` : metrics.nutrition.avgEnergyDeltaKcal}`
                  : '—'}
              </Text>
              <Text style={styles.glanceLabel}>CALORIE BALANCE</Text>
            </View>
          </View>

          <Text style={styles.promptPitch}>
            Connect your gym progress, scale weight readings, and nutrition balance into clear, personalized coaching advice.
          </Text>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.btnRow}>
            <Tappable
              onPress={handleGenerate}
              style={styles.generateBtn}
              scaleTo={0.97}
              accessibilityRole="button"
              accessibilityLabel="Generate weekly AI coaching review"
            >
              <Ionicons name="sparkles" size={16} color="#0A0A0B" style={{ marginRight: 6 }} />
              <Text style={styles.generateBtnText}>GENERATE REVIEW</Text>
            </Tappable>

            {onOpenModal && (
              <Tappable
                onPress={onOpenModal}
                style={styles.popupLauncherBtn}
                scaleTo={0.97}
                accessibilityRole="button"
                accessibilityLabel="Open review popup"
              >
                <Ionicons name="open-outline" size={16} color="#00E5FF" />
              </Tappable>
            )}
          </View>
        </View>
      )}

      {/* State B: Loading */}
      {loading && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#00E5FF" style={{ marginBottom: space.sm }} />
          <Text style={styles.loadingText}>Analyzing workouts, scale trends & nutrition...</Text>
          <Text style={styles.loadingSub}>Synthesizing your progress into plain-English coaching</Text>
        </View>
      )}

      {/* State C: Generated Review */}
      {review && !loading && (
        <View style={styles.reviewContent}>
          {/* Headline */}
          <Text style={styles.headline}>"{review.headline}"</Text>

          {/* Key Wins */}
          <View style={styles.winsWrap}>
            <Text style={styles.sectionTitle}>WINS THIS WEEK</Text>
            {review.keyWins.map((win, idx) => (
              <View key={idx} style={styles.winRow}>
                <Ionicons name="checkmark-circle" size={15} color="#10B981" style={{ marginTop: 2 }} />
                <Text style={styles.winText}>{win}</Text>
              </View>
            ))}
          </View>

          {/* Holistic Summary */}
          <View style={styles.synthesisWrap}>
            <Text style={styles.sectionTitle}>THE BIG PICTURE</Text>
            <Text style={styles.synthesisBody}>{review.plainSummary ?? review.synthesis}</Text>
          </View>

          {/* Dual Insight Cards */}
          <View style={styles.insightsRow}>
            <View style={styles.insightBox}>
              <View style={styles.insightHeader}>
                <Ionicons name="barbell-outline" size={14} color="#00E5FF" />
                <Text style={styles.insightTitle}>WORKOUTS & STRENGTH</Text>
              </View>
              <Text style={styles.insightBody}>{review.trainingInsight}</Text>
            </View>

            <View style={styles.insightBox}>
              <View style={styles.insightHeader}>
                <Ionicons name="nutrition-outline" size={14} color="#FBBF24" />
                <Text style={[styles.insightTitle, { color: '#FBBF24' }]}>NUTRITION & SCALE</Text>
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

          {/* Expandable Science Drawer */}
          <View style={styles.scienceBox}>
            <Pressable
              style={styles.scienceHeader}
              onPress={() => {
                thud('light');
                setShowScience((prev) => !prev);
              }}
            >
              <View style={styles.scienceTitleGroup}>
                <Ionicons name="school-outline" size={15} color="#00E5FF" />
                <Text style={styles.scienceTitle}>The Science & References</Text>
              </View>
              <Ionicons
                name={showScience ? 'chevron-up' : 'chevron-down'}
                size={14}
                color="#64748B"
              />
            </Pressable>

            {showScience && (
              <View style={styles.scienceBody}>
                <Text style={styles.scienceText}>
                  {review.scienceExplanation ??
                    'Ascend evaluates your progressive overload against exercise physiology volume landmarks (Israetel et al., 2020) and energy availability kinetics (Helms et al., 2014) to maintain lean mass and prevent fatigue accumulation.'}
                </Text>
                <Text style={styles.scienceCitation}>
                  • Schoenfeld, B. J. et al. (2017). Dose-response volume in muscle hypertrophy. J Sports Sci.
                </Text>
                <Text style={styles.scienceCitation}>
                  • Helms, E. R. et al. (2014). Nutrition recommendations for natural bodybuilding. JISSN.
                </Text>
              </View>
            )}
          </View>

          {/* Bottom Action Row */}
          <View style={styles.bottomActionRow}>
            {onOpenModal && (
              <Tappable
                onPress={onOpenModal}
                style={styles.popupTextBtn}
                scaleTo={0.96}
                accessibilityRole="button"
                accessibilityLabel="Open popup view"
              >
                <Ionicons name="expand" size={13} color="#00E5FF" />
                <Text style={styles.popupTextBtnText}>OPEN AS POPUP</Text>
              </Tappable>
            )}

            <Tappable
              onPress={handleGenerate}
              style={styles.refreshBtn}
              scaleTo={0.96}
              accessibilityRole="button"
              accessibilityLabel="Regenerate review"
            >
              <Ionicons name="refresh-outline" size={13} color={loud.figureMuted} />
              <Text style={styles.refreshText}>RE-ANALYZE</Text>
            </Tappable>
          </View>
        </View>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#070D14',
    borderColor: '#162333',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1A293D',
    marginBottom: space.md,
  },
  headerTitleWrap: {
    gap: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerBadge: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 1.2,
    color: '#00E5FF',
  },
  headerSubtitle: {
    fontFamily: font.figure,
    fontSize: 11,
    color: loud.figureFaint,
  },
  headerRightWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  confPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  confDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  confPillText: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  openPopupBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#092532',
    borderWidth: 1,
    borderColor: '#00E5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unopenedWrap: {
    gap: space.md,
  },
  glanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0B1522',
    borderRadius: radius.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1A2C42',
  },
  glanceItem: {
    alignItems: 'center',
    flex: 1,
  },
  glanceVal: {
    fontFamily: font.figure,
    fontSize: 16,
    color: loud.figure,
    fontVariant: ['tabular-nums'],
  },
  glanceLabel: {
    fontFamily: font.display,
    fontSize: 9,
    letterSpacing: 1,
    color: loud.figureFaint,
    marginTop: 2,
  },
  glanceDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    backgroundColor: '#1E324A',
  },
  promptPitch: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 17,
    color: loud.figureMuted,
  },
  errorText: {
    fontFamily: font.ui,
    fontSize: 12,
    color: loud.warn,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  generateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00E5FF',
    borderRadius: radius.sm,
    paddingVertical: 11,
    paddingHorizontal: space.md,
  },
  generateBtnText: {
    fontFamily: font.uiStrong,
    fontSize: 12,
    letterSpacing: 1,
    color: '#0A0A0B',
  },
  popupLauncherBtn: {
    width: 44,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: '#092532',
    borderWidth: 1,
    borderColor: '#00E5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingWrap: {
    paddingVertical: space.lg,
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    color: loud.figure,
    marginBottom: 2,
  },
  loadingSub: {
    fontFamily: font.ui,
    fontSize: 11,
    color: loud.figureFaint,
  },
  reviewContent: {
    gap: space.md,
  },
  headline: {
    fontFamily: font.display,
    fontSize: 16,
    lineHeight: 22,
    color: '#E0F7FF',
    fontStyle: 'italic',
  },
  winsWrap: {
    backgroundColor: '#0B1A24',
    borderColor: '#133930',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: space.sm,
    gap: 4,
  },
  sectionTitle: {
    fontFamily: font.display,
    fontSize: 9,
    letterSpacing: 1.2,
    color: loud.figureFaint,
    marginBottom: 2,
  },
  winRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  winText: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 16,
    color: '#A7F3D0',
    flex: 1,
  },
  synthesisWrap: {
    backgroundColor: '#0B1522',
    borderRadius: radius.sm,
    padding: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1A2C42',
  },
  synthesisBody: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 18,
    color: loud.figure,
  },
  insightsRow: {
    flexDirection: 'column',
    gap: space.sm,
  },
  insightBox: {
    backgroundColor: '#09131F',
    borderRadius: radius.sm,
    padding: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#152438',
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  insightTitle: {
    fontFamily: font.display,
    fontSize: 9,
    letterSpacing: 1,
    color: '#00E5FF',
  },
  insightBody: {
    fontFamily: font.ui,
    fontSize: 11,
    lineHeight: 16,
    color: loud.figureMuted,
  },
  adjustmentWrap: {
    backgroundColor: '#121D2C',
    borderRadius: radius.sm,
    padding: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1E3550',
    gap: 6,
  },
  adjustmentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  adjustmentTitle: {
    fontFamily: font.display,
    fontSize: 11,
    letterSpacing: 1,
  },
  adjustmentRationale: {
    fontFamily: font.ui,
    fontSize: 11,
    lineHeight: 16,
    color: loud.figureMuted,
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00E5FF',
    borderRadius: radius.sm,
    paddingVertical: 9,
    marginTop: 4,
  },
  applyBtnDisabled: {
    backgroundColor: '#102A1E',
  },
  applyBtnText: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 0.8,
    color: '#0A0A0B',
  },
  applyBtnTextDisabled: {
    color: '#10B981',
  },
  scienceBox: {
    backgroundColor: '#08101A',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#16283D',
    overflow: 'hidden',
  },
  scienceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.sm,
  },
  scienceTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scienceTitle: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    color: '#00E5FF',
  },
  scienceBody: {
    padding: space.sm,
    paddingTop: 0,
    gap: 4,
  },
  scienceText: {
    fontFamily: font.ui,
    fontSize: 11,
    lineHeight: 16,
    color: loud.figureMuted,
  },
  scienceCitation: {
    fontFamily: font.ui,
    fontSize: 10,
    color: '#64748B',
    lineHeight: 14,
  },
  bottomActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  popupTextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  popupTextBtnText: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 0.8,
    color: '#00E5FF',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  refreshText: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 0.8,
    color: loud.figureFaint,
  },
});
