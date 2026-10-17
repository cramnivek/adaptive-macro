import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { font, radius, space, useTheme } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { Tappable } from './Tappable';
import { Button } from './Controls';
import { thud } from '../platform/haptics';
import type { WeeklyExtractedMetrics, WeeklyReviewResult } from '../ai/weeklyReview';
import type { Goal } from '@adaptive-macros/engine';
import { calculateCoachingGoalAdjustment } from '../ai/coachingAdjustment';

interface WeeklyReviewModalProps {
  open: boolean;
  onClose: () => void;
  review: WeeklyReviewResult | null;
  metrics: WeeklyExtractedMetrics;
  loading: boolean;
  error: string | null;
  applied: boolean;
  onGenerate: () => void;
  onApplyAdjustment?: () => void;
  goal?: Goal;
  expenditureKcal?: number;
}

const CONFIDENCE_COLORS = {
  high: { text: '#10B981', bg: '#102A1E', border: '#1D5A3C' },
  moderate: { text: '#FBBF24', bg: '#292010', border: '#5A4315' },
  low: { text: '#94A3B8', bg: '#181E26', border: '#2B374A' },
};

export const WeeklyReviewModal = ({
  open,
  onClose,
  review,
  metrics,
  loading,
  error,
  applied,
  onGenerate,
  onApplyAdjustment,
  goal,
  expenditureKcal,
}: WeeklyReviewModalProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [showScience, setShowScience] = useState(false);

  const conf = review?.dataConfidence ?? metrics.confidence;
  const confColor = CONFIDENCE_COLORS[conf];

  const adjustmentPreview = useMemo(() => {
    if (!review?.suggestedAdjustment?.hasAdjustment || !review.suggestedAdjustment.deltaKcal) {
      return null;
    }
    const exp = expenditureKcal ?? metrics.nutrition.avgExpenditure ?? 2200;
    const currentGoal: Goal = goal ?? { direction: 'maintain', rateKgPerWeek: 0 };
    return calculateCoachingGoalAdjustment({
      currentGoal,
      expenditureKcal: exp,
      deltaKcal: review.suggestedAdjustment.deltaKcal,
    });
  }, [review?.suggestedAdjustment, expenditureKcal, metrics.nutrition.avgExpenditure, goal]);

  const confLabel =
    conf === 'high'
      ? 'High Confidence · Great logging this week'
      : conf === 'moderate'
        ? 'Moderate Confidence · Partial logging'
        : 'Early Data · Log more days for best precision';

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            paddingTop: space.md,
            paddingBottom: insets.bottom + space.lg,
          },
        ]}
      >
        {/* Header Bar */}
        <View style={styles.header}>
          <View style={styles.headerTitleWrap}>
            <View style={styles.badgeRow}>
              <Ionicons name="sparkles" size={15} color="#00E5FF" />
              <Text style={styles.headerBadge}>WEEKLY AI COACH</Text>
            </View>
            <Text style={[styles.headerPeriod, { color: colors.textMuted }]}>
              {metrics.period.from} to {metrics.period.to}
            </Text>
          </View>

          <Pressable
            hitSlop={12}
            onPress={onClose}
            style={[styles.closeButton, { backgroundColor: colors.surfaceRaised }]}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Data Confidence Banner */}
          <View
            style={[
              styles.confBanner,
              { backgroundColor: confColor.bg, borderColor: confColor.border },
            ]}
          >
            <View style={[styles.confDot, { backgroundColor: confColor.text }]} />
            <Text style={[styles.confText, { color: confColor.text }]}>{confLabel}</Text>
          </View>

          {/* Error Message */}
          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color={loud.warn} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Loading Indicator */}
          {loading && (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#00E5FF" />
              <Text style={styles.loadingTitle}>Analyzing your week...</Text>
              <Text style={[styles.loadingDesc, { color: colors.textMuted }]}>
                Connecting your workouts, weight readings, and energy balance into plain-English advice.
              </Text>
            </View>
          )}

          {/* No Review Yet State */}
          {!review && !loading && (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="analytics" size={32} color="#00E5FF" />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Ready for your 7-day coaching check-in
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                Our AI coach connects what you lifted in the gym with your scale weight and calorie balance, giving you simple, personalized advice.
              </Text>
              <View style={styles.btnWrap}>
                <Button label="GENERATE COACHING REVIEW" onPress={onGenerate} tone="loud" />
              </View>
            </View>
          )}

          {/* Review Loaded Content */}
          {review && !loading && (
            <>
              {/* Headline */}
              <View style={styles.headlineBox}>
                <Text style={styles.headlineText}>"{review.headline}"</Text>
              </View>

              {/* Friendly Summary */}
              <View style={[styles.sectionBox, { backgroundColor: colors.surfaceRaised }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>THE BIG PICTURE</Text>
                <Text style={[styles.plainSummary, { color: colors.text }]}>
                  {review.plainSummary ?? review.synthesis}
                </Text>
              </View>

              {/* Key Wins */}
              {review.keyWins?.length > 0 && (
                <View style={[styles.sectionBox, { backgroundColor: colors.surfaceRaised }]}>
                  <Text style={[styles.sectionTitle, { color: '#10B981' }]}>WINS THIS WEEK</Text>
                  {review.keyWins.map((win, idx) => (
                    <View key={idx} style={styles.winRow}>
                      <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                      <Text style={[styles.winText, { color: colors.text }]}>{win}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Two Column Breakdown */}
              <View style={styles.cardsGrid}>
                {/* Workout Card */}
                <View style={[styles.insightCard, { backgroundColor: colors.surfaceRaised }]}>
                  <View style={styles.cardHeaderRow}>
                    <Ionicons name="barbell" size={16} color="#00E5FF" />
                    <Text style={styles.cardHeaderTitle}>WORKOUTS & STRENGTH</Text>
                  </View>
                  <Text style={[styles.cardBody, { color: colors.textMuted }]}>
                    {review.trainingInsight}
                  </Text>
                </View>

                {/* Nutrition Card */}
                <View style={[styles.insightCard, { backgroundColor: colors.surfaceRaised }]}>
                  <View style={styles.cardHeaderRow}>
                    <Ionicons name="restaurant" size={16} color="#FBBF24" />
                    <Text style={[styles.cardHeaderTitle, { color: '#FBBF24' }]}>
                      NUTRITION & SCALE
                    </Text>
                  </View>
                  <Text style={[styles.cardBody, { color: colors.textMuted }]}>
                    {review.nutritionInsight}
                  </Text>
                </View>
              </View>

              {/* Recommended Target Adjustment */}
              {review.suggestedAdjustment && (
                <View style={styles.adjustBox}>
                  <View style={styles.adjustTop}>
                    <View style={styles.adjustBadge}>
                      <Ionicons name="flash" size={14} color="#00E5FF" />
                      <Text style={styles.adjustBadgeText}>RECOMMENDED ADJUSTMENT</Text>
                    </View>
                    <Text style={styles.adjustTitle}>{review.suggestedAdjustment.title}</Text>
                  </View>

                  <Text style={styles.adjustRationale}>
                    {review.suggestedAdjustment.rationale}
                  </Text>

                  {/* Explicit Before / After Comparison Preview */}
                  {review.suggestedAdjustment.hasAdjustment && (
                    <View style={styles.beforeAfterContainer}>
                      <View style={styles.beforeAfterCol}>
                        <Text style={styles.beforeAfterLabel}>CURRENT TARGET</Text>
                        <Text style={styles.beforeAfterVal}>
                          {adjustmentPreview
                            ? `${Math.round(adjustmentPreview.currentKcal).toLocaleString()} kcal`
                            : (metrics.nutrition.targetCalories
                                ? `${metrics.nutrition.targetCalories.toLocaleString()} kcal`
                                : '—')}
                        </Text>
                        {adjustmentPreview && (
                          <Text style={styles.beforeAfterSub}>
                            {adjustmentPreview.currentGoal.direction === 'maintain'
                              ? 'Maintenance'
                              : adjustmentPreview.currentGoal.direction === 'lose'
                                ? `Lose ${adjustmentPreview.currentGoal.rateKgPerWeek} kg/wk`
                                : `Gain +${adjustmentPreview.currentGoal.rateKgPerWeek} kg/wk`}
                          </Text>
                        )}
                      </View>
                      <Ionicons name="arrow-forward" size={16} color="#00E5FF" />
                      <View style={styles.beforeAfterCol}>
                        <Text style={styles.beforeAfterLabel}>RECALCULATED</Text>
                        <Text style={[styles.beforeAfterVal, { color: '#00E5FF' }]}>
                          {adjustmentPreview
                            ? `${Math.round(adjustmentPreview.achievableKcal).toLocaleString()} kcal`
                            : review.suggestedAdjustment.deltaKcal && metrics.nutrition.targetCalories
                              ? `${(metrics.nutrition.targetCalories + review.suggestedAdjustment.deltaKcal).toLocaleString()} kcal`
                              : '—'}
                        </Text>
                        {adjustmentPreview && (
                          <Text style={[styles.beforeAfterSub, { color: '#00E5FF' }]}>
                            {adjustmentPreview.rateChangeDescription}
                          </Text>
                        )}
                      </View>
                    </View>
                  )}

                  {/* Safety Guardrail Alert if below 1200 kcal */}
                  {adjustmentPreview?.isSafetyFloorTriggered && (
                    <View style={styles.safetyWarningBox}>
                      <Ionicons name="warning-outline" size={14} color="#FBBF24" />
                      <Text style={styles.safetyWarningText}>
                        Safety floor notice: This target reaches the 1,200 kcal/day lower bound. To protect metabolism and lean tissue, Ascend will not program targets below 1,200 kcal/day. Consider increasing daily activity or taking a maintenance break.
                      </Text>
                    </View>
                  )}

                  {review.suggestedAdjustment.hasAdjustment ? (
                    <Tappable
                      onPress={() => {
                        thud('heavy');
                        onApplyAdjustment?.();
                      }}
                      style={[
                        styles.applyBtn,
                        applied && { backgroundColor: '#102A1E', borderColor: '#1D5A3C' },
                      ]}
                    >
                      <Ionicons
                        name={applied ? 'checkmark-circle' : 'arrow-forward-circle'}
                        size={18}
                        color={applied ? '#10B981' : '#050B14'}
                      />
                      <Text
                        style={[
                          styles.applyBtnText,
                          applied && { color: '#10B981' },
                        ]}
                      >
                        {applied ? 'ADJUSTMENT APPLIED' : 'APPLY THIS ADJUSTMENT'}
                      </Text>
                    </Tappable>
                  ) : (
                    <View style={styles.onTrackPill}>
                      <Ionicons name="checkmark-done" size={16} color="#10B981" />
                      <Text style={styles.onTrackText}>Targets are dialed in · Keep going</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Expandable Science & References Drawer */}
              <View style={[styles.scienceBox, { borderColor: colors.border }]}>
                <Pressable
                  style={styles.scienceHeader}
                  onPress={() => {
                    thud('light');
                    setShowScience((prev) => !prev);
                  }}
                >
                  <View style={styles.scienceTitleGroup}>
                    <Ionicons name="school-outline" size={18} color="#00E5FF" />
                    <Text style={styles.scienceTitle}>Learn the Science & Evidence</Text>
                  </View>
                  <Ionicons
                    name={showScience ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textMuted}
                  />
                </Pressable>

                {showScience && (
                  <View style={styles.scienceBody}>
                    <Text style={[styles.scienceText, { color: colors.textMuted }]}>
                      {review.scienceExplanation ??
                        'Ascend uses evidence-based exercise physiology to interpret your week. By comparing working sets against research-proven volume landmarks and tracking progressive overload, we ensure you stay in your muscle-building sweet spot without overreaching.'}
                    </Text>

                    <View style={styles.refDivider} />
                    <Text style={styles.refHeading}>KEY SCIENTIFIC REFERENCES:</Text>
                    <Text style={styles.refItem}>
                      • <Text style={styles.refAuthor}>Schoenfeld, B. J. et al. (2017)</Text>: Dose-response relationship between weekly resistance training volume and increases in muscle mass. <Text style={styles.refJournal}>J Sports Sci</Text>.
                    </Text>
                    <Text style={styles.refItem}>
                      • <Text style={styles.refAuthor}>Israetel, M. A. et al. (2020)</Text>: Hypertrophy Training Volume Framework. <Text style={styles.refJournal}>Renaissance Periodization</Text>.
                    </Text>
                    <Text style={styles.refItem}>
                      • <Text style={styles.refAuthor}>Helms, E. R. et al. (2014)</Text>: Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation. <Text style={styles.refJournal}>JISSN</Text>.
                    </Text>
                    <Text style={styles.refItem}>
                      • <Text style={styles.refAuthor}>Morton, R. W. et al. (2018)</Text>: Systematic review & meta-analysis on dietary protein and resistance training gains. <Text style={styles.refJournal}>Br J Sports Med</Text>.
                    </Text>
                  </View>
                )}
              </View>

              {/* Regenerate Action */}
              <Pressable
                onPress={() => {
                  thud('light');
                  onGenerate();
                }}
                style={styles.regenBtn}
              >
                <Ionicons name="refresh" size={14} color={colors.textMuted} />
                <Text style={[styles.regenText, { color: colors.textMuted }]}>
                  Re-analyze with latest logs
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sheet: {
    marginTop: 40,
    flex: 1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1E2530',
  },
  headerTitleWrap: {
    gap: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerBadge: {
    fontFamily: font.uiStrong,
    fontSize: 12,
    letterSpacing: 1.2,
    color: '#00E5FF',
  },
  headerPeriod: {
    fontFamily: font.figure,
    fontSize: 12,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: space.lg,
    gap: space.md,
  },
  confBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  confDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  confText: {
    fontFamily: font.uiStrong,
    fontSize: 12,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: space.md,
    backgroundColor: '#281414',
    borderColor: '#4D1D1B',
    borderWidth: 1,
    borderRadius: radius.md,
  },
  errorText: {
    fontFamily: font.ui,
    fontSize: 13,
    color: loud.warn,
    flex: 1,
  },
  loadingWrap: {
    paddingVertical: space.xl * 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  loadingTitle: {
    fontFamily: font.uiStrong,
    fontSize: 17,
    color: '#FFFFFF',
    marginTop: space.sm,
  },
  loadingDesc: {
    fontFamily: font.ui,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: space.lg,
    lineHeight: 18,
  },
  emptyState: {
    paddingVertical: space.xl,
    alignItems: 'center',
    gap: space.sm,
    textAlign: 'center',
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#092532',
    borderWidth: 1,
    borderColor: '#00E5FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  emptyTitle: {
    fontFamily: font.display,
    fontSize: 18,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: font.ui,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: space.md,
    marginBottom: space.md,
  },
  btnWrap: {
    width: '100%',
  },
  headlineBox: {
    backgroundColor: '#081726',
    borderColor: '#00E5FF',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
  headlineText: {
    fontFamily: font.display,
    fontSize: 18,
    color: '#E0F7FF',
    lineHeight: 24,
    fontStyle: 'italic',
  },
  sectionBox: {
    padding: space.md,
    borderRadius: radius.md,
    gap: space.xs,
  },
  sectionTitle: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  plainSummary: {
    fontFamily: font.ui,
    fontSize: 14,
    lineHeight: 21,
  },
  winRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 4,
  },
  winText: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  cardsGrid: {
    gap: space.sm,
  },
  insightCard: {
    padding: space.md,
    borderRadius: radius.md,
    gap: space.xs,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardHeaderTitle: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 1,
    color: '#00E5FF',
  },
  cardBody: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 19,
  },
  adjustBox: {
    backgroundColor: '#091A2A',
    borderColor: '#1D4566',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
  },
  adjustTop: {
    gap: 4,
  },
  adjustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  adjustBadgeText: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 1.2,
    color: '#00E5FF',
  },
  adjustTitle: {
    fontFamily: font.display,
    fontSize: 17,
    color: '#FFFFFF',
  },
  adjustRationale: {
    fontFamily: font.ui,
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
  },
  beforeAfterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#05111B',
    borderColor: '#11304A',
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: space.sm,
    marginVertical: 4,
  },
  beforeAfterCol: {
    flex: 1,
    alignItems: 'center',
  },
  beforeAfterLabel: {
    fontFamily: font.uiStrong,
    fontSize: 9,
    letterSpacing: 1,
    color: '#64748B',
    marginBottom: 2,
  },
  beforeAfterVal: {
    fontFamily: font.display,
    fontSize: 14,
    color: '#F8FAFC',
  },
  beforeAfterSub: {
    fontFamily: font.mono,
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  safetyWarningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#2A1F0C',
    borderColor: '#543F16',
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: space.sm,
    marginTop: 4,
  },
  safetyWarningText: {
    fontFamily: font.ui,
    fontSize: 11,
    color: '#FBBF24',
    lineHeight: 16,
    flex: 1,
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#00E5FF',
    paddingVertical: 12,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
  },
  applyBtnText: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    letterSpacing: 0.8,
    color: '#050B14',
  },
  onTrackPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  onTrackText: {
    fontFamily: font.ui,
    fontSize: 12,
    color: '#10B981',
  },
  scienceBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  scienceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.md,
    backgroundColor: '#11161F',
  },
  scienceTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scienceTitle: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    color: '#00E5FF',
  },
  scienceBody: {
    padding: space.md,
    backgroundColor: '#0A0F16',
    gap: space.sm,
  },
  scienceText: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 18,
  },
  refDivider: {
    height: 1,
    backgroundColor: '#1E2530',
    marginVertical: 4,
  },
  refHeading: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 1.1,
    color: '#64748B',
  },
  refItem: {
    fontFamily: font.ui,
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 16,
  },
  refAuthor: {
    fontFamily: font.uiStrong,
    color: '#CBD5E1',
  },
  refJournal: {
    fontStyle: 'italic',
    color: '#64748B',
  },
  regenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: space.sm,
  },
  regenText: {
    fontFamily: font.ui,
    fontSize: 12,
  },
});
