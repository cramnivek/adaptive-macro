import { useEffect, useMemo, useState } from 'react';
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
import type { MonthlyExtractedMetrics, MonthlyReviewResult } from '../ai/monthlyReview';
import type { Goal } from '@adaptive-macros/engine';
import { calculateCoachingGoalAdjustment } from '../ai/coachingAdjustment';
import type { AppPersonality, UnitSystem } from '../state/settings';
import { getEventCopy } from '../copy/personality';
import { displayWeight, formatDayMonth, formatWeight, weightUnit } from '../format';
import { useReduceMotion } from '../theme/motion';
import { CheckInRecap } from './CheckInRecap';
import type { CheckInPeriod } from '../checkInSchedule';
import type { SavedCheckIn } from '../previousCheckIn';

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
  personality?: AppPersonality;
  // Monthly Review additions
  monthlyReview?: MonthlyReviewResult | null;
  monthlyMetrics?: MonthlyExtractedMetrics | null;
  monthlyLoading?: boolean;
  monthlyError?: string | null;
  monthlyApplied?: boolean;
  onGenerateMonthly?: () => void;
  onApplyMonthlyAdjustment?: () => void;
  initialMode?: 'weekly' | 'monthly';
  units?: UnitSystem;
  /**
   * Set while the period has not earned a check-in yet: why, in one sentence.
   * The generate button is replaced by it, so a review is never written from
   * a week or month too thin to say anything about.
   */
  weeklyLockedNote?: string | null;
  monthlyLockedNote?: string | null;
  /**
   * The weekly check-in before this one. Shown under a locked week, so a thin
   * week does not hide what the last earned one said, and opened in full on tap.
   */
  previousWeekly?: SavedCheckIn | null;
  onOpenPrevious?: (period: CheckInPeriod) => void;
  weightReadings?: readonly { date: string; kg: number }[];
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
  personality = 'ascend',
  monthlyReview,
  monthlyMetrics,
  monthlyLoading = false,
  monthlyError = null,
  monthlyApplied = false,
  onGenerateMonthly,
  onApplyMonthlyAdjustment,
  initialMode = 'weekly',
  units = 'metric',
  weeklyLockedNote = null,
  monthlyLockedNote = null,
  previousWeekly = null,
  onOpenPrevious,
  weightReadings,
}: WeeklyReviewModalProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [reviewMode, setReviewMode] = useState<'weekly' | 'monthly'>(initialMode);
  const [presentation, setPresentation] = useState<'recap' | 'summary'>('summary');
  const [showScience, setShowScience] = useState(false);
  const [showMonthlyScience, setShowMonthlyScience] = useState(false);

  useEffect(() => {
    if (open) {
      setReviewMode(initialMode);
    }
  }, [open, initialMode]);

  const weeklyRecapReady = Boolean(review && !loading && !error && !weeklyLockedNote);
  const monthlyRecapReady = Boolean(monthlyReview && monthlyMetrics && !monthlyLoading && !monthlyError && !monthlyLockedNote);
  const recapReady = reviewMode === 'weekly' ? weeklyRecapReady : monthlyRecapReady;

  useEffect(() => {
    if (open) setPresentation(recapReady ? 'recap' : 'summary');
  }, [open, reviewMode, recapReady, metrics.period.from, metrics.period.to, monthlyMetrics?.period.from, monthlyMetrics?.period.to]);

  const showRecap = open && presentation === 'recap' && recapReady;
  const recapMetrics = reviewMode === 'weekly' ? metrics : monthlyMetrics;
  const weeklyNextStep =
    review?.suggestedAdjustment?.title?.trim() ||
    review?.nutritionInsight?.trim() ||
    review?.plainSummary?.trim() ||
    review?.synthesis?.trim() || '';
  const monthlyNextStep =
    monthlyReview?.suggestedAdjustment?.title?.trim() ||
    monthlyReview?.nutritionInsight?.trim() ||
    monthlyReview?.plainSummary?.trim() ||
    monthlyReview?.synthesis?.trim() || '';
  const recapNextStep = reviewMode === 'weekly' ? weeklyNextStep : monthlyNextStep;

  const hasMonthlySupport = Boolean(monthlyMetrics && onGenerateMonthly);
  // The long review is a month (4 weeks) or a quarter (13): its labels say
  // which, and how many days, rather than a fixed "30".
  const longDays = (monthlyMetrics?.weeks ?? 4) * 7;
  const isQuarter = (monthlyMetrics?.weeks ?? 4) >= 13;
  const longName = isQuarter ? 'Quarterly' : 'Monthly';

  // Weekly review calculations
  const weeklyConf = review?.dataConfidence ?? metrics.confidence;
  const weeklyConfColor = CONFIDENCE_COLORS[weeklyConf];

  const weeklyAdjustmentPreview = useMemo(() => {
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

  const weeklyConfLabel =
    weeklyConf === 'high'
      ? 'High Confidence · Great logging this week'
      : weeklyConf === 'moderate'
        ? 'Moderate Confidence · Partial logging'
        : 'Early Data · Log more days for best precision';

  // Monthly review calculations
  const monthlyConf = monthlyReview?.dataConfidence ?? monthlyMetrics?.confidence ?? 'low';
  const monthlyConfColor = CONFIDENCE_COLORS[monthlyConf];

  const monthlyAdjustmentPreview = useMemo(() => {
    if (!monthlyReview?.suggestedAdjustment?.hasAdjustment || !monthlyReview.suggestedAdjustment.deltaKcal) {
      return null;
    }
    const exp = expenditureKcal ?? monthlyMetrics?.nutrition.avgExpenditure ?? 2200;
    const currentGoal: Goal = goal ?? { direction: 'maintain', rateKgPerWeek: 0 };
    return calculateCoachingGoalAdjustment({
      currentGoal,
      expenditureKcal: exp,
      deltaKcal: monthlyReview.suggestedAdjustment.deltaKcal,
    });
  }, [monthlyReview?.suggestedAdjustment, expenditureKcal, monthlyMetrics?.nutrition.avgExpenditure, goal]);

  const monthlyConfLabel =
    monthlyConf === 'high'
      ? `High Confidence · ${monthlyMetrics?.weeks ?? 4} weeks of consistent data`
      : monthlyConf === 'moderate'
        ? `Moderate Confidence · Partial ${longDays}-day logs`
        : `Early Data · Log more days for ${longName.toLowerCase()} precision`;

  const unit = weightUnit(units);

  return (
    <Modal visible={open} animationType={reduceMotion ? 'none' : 'slide'} transparent={false} onRequestClose={onClose}>
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: showRecap ? loud.ground : colors.surface,
            borderColor: colors.border,
            paddingTop: showRecap ? 0 : insets.top + space.md,
            paddingBottom: showRecap ? 0 : insets.bottom + space.lg,
          },
        ]}
      >
        {showRecap && recapMetrics ? (
          <CheckInRecap
            key={`${reviewMode}-${recapMetrics.period.from}-${recapMetrics.period.to}`}
            metrics={recapMetrics}
            units={units}
            mode={reviewMode}
            showModeSwitch={hasMonthlySupport}
            longDays={longDays}
            longName={longName}
            nextStep={recapNextStep}
            weightReadings={weightReadings}
            onModeChange={(mode) => {
              thud('light');
              setReviewMode(mode);
            }}
            onSummary={() => setPresentation('summary')}
            onClose={onClose}
          />
        ) : (
          <>
        {/* Header Bar */}
        <View style={styles.header}>
          <View style={styles.headerTitleWrap}>
            <View style={styles.badgeRow}>
              <Ionicons name="sparkles" size={15} color={colors.accent} />
              <Text style={[styles.headerBadge, { color: colors.textMuted }]}>
                {reviewMode === 'weekly'
                  ? getEventCopy('trends.weekly_recap_tag', { personality }) || 'WEEKLY COACH'
                  : `${longName.toUpperCase()} COACH REVIEW`}
              </Text>
            </View>
            <Text style={[styles.headerPeriod, { color: colors.textMuted }]}>
              {reviewMode === 'weekly'
                ? `${metrics.period.from} to ${metrics.period.to} (7 Days)`
                : monthlyMetrics
                  ? `${monthlyMetrics.period.from} to ${monthlyMetrics.period.to} (${monthlyMetrics.weeks} Weeks)`
                  : `${longDays}-Day Period`}
            </Text>
          </View>

          <Pressable
            onPress={onClose}
            style={[styles.closeButton, { backgroundColor: colors.surfaceRaised }]}
            accessibilityRole="button"
            accessibilityLabel="Close review modal"
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
        </View>

        {/* Mode Switcher Tabs (Weekly vs Monthly) */}
        {hasMonthlySupport && (
          <View style={[styles.modeTabs, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Pressable
              onPress={() => {
                thud('light');
                setReviewMode('weekly');
              }}
              style={[
                styles.modeTab,
                reviewMode === 'weekly' && [styles.modeTabActive, { backgroundColor: colors.brand.fill }],
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: reviewMode === 'weekly' }}
            >
              <Ionicons
                name="calendar-outline"
                size={13}
                color={reviewMode === 'weekly' ? colors.brand.onFill : colors.textMuted}
              />
              <Text
                style={[
                  styles.modeTabText,
                  { color: reviewMode === 'weekly' ? colors.brand.onFill : colors.textMuted },
                ]}
              >
                WEEKLY RECAP (7D)
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                thud('light');
                setReviewMode('monthly');
              }}
              style={[
                styles.modeTab,
                reviewMode === 'monthly' && [styles.modeTabActive, { backgroundColor: colors.brand.fill }],
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: reviewMode === 'monthly' }}
            >
              <Ionicons
                name="sparkles"
                size={13}
                color={reviewMode === 'monthly' ? colors.brand.onFill : colors.textMuted}
              />
              <Text
                style={[
                  styles.modeTabText,
                  { color: reviewMode === 'monthly' ? colors.brand.onFill : colors.textMuted },
                ]}
              >
                {`${longName.toUpperCase()} REVIEW (${longDays}D)`}
              </Text>
            </Pressable>
          </View>
        )}

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {recapReady && (
            <Pressable
              onPress={() => setPresentation('recap')}
              style={[styles.replayButton, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
              accessibilityRole="button"
              accessibilityLabel="Play check-in recap again"
            >
              <Ionicons name="play" size={16} color={colors.brand.text} />
              <Text style={[styles.replayText, { color: colors.brand.text }]}>PLAY YOUR RECAP</Text>
            </Pressable>
          )}
          {/* ========================================================= */}
          {/* 1. WEEKLY REVIEW MODE                                    */}
          {/* ========================================================= */}
          {reviewMode === 'weekly' && (
            <>
              {/* Data Confidence Banner: rates a check-in, so none while there is nothing to rate */}
              {!weeklyLockedNote && (
                <View
                  style={[
                    styles.confBanner,
                    { backgroundColor: weeklyConfColor.bg, borderColor: weeklyConfColor.border },
                  ]}
                >
                  <View style={[styles.confDot, { backgroundColor: weeklyConfColor.text }]} />
                  <Text style={[styles.confText, { color: weeklyConfColor.text }]}>{weeklyConfLabel}</Text>
                </View>
              )}

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
                  <ActivityIndicator size="large" color={colors.accent} />
                  <Text style={styles.loadingTitle}>
                    {personality === 'gymrat'
                      ? 'COOKING UP YOUR WEEKLY RECAP... 🔥'
                      : personality === 'classic'
                        ? 'Preparing your weekly summary...'
                        : 'Reviewing your week...'}
                  </Text>
                  <Text style={[styles.loadingDesc, { color: colors.textMuted }]}>
                    Synthesizing your workouts, weight trends, and energy balance to tune your plan.
                  </Text>
                </View>
              )}

              {/* No Review Yet State */}
              {!review && !loading && weeklyLockedNote && (
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>Not earned yet</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>{weeklyLockedNote}</Text>
                  {previousWeekly && (
                    <Tappable
                      onPress={() => onOpenPrevious?.(previousWeekly.period)}
                      accessibilityRole="button"
                      accessibilityLabel={`Open your last check-in, ${previousWeekly.headline}`}
                      style={[styles.previousCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
                    >
                      <Text style={[styles.previousLabel, { color: colors.textFaint }]}>
                        YOUR LAST CHECK-IN · {formatDayMonth(previousWeekly.period.from)} to {formatDayMonth(previousWeekly.period.to)}
                      </Text>
                      <Text style={[styles.previousHeadline, { color: colors.text }]}>{previousWeekly.headline}</Text>
                      <Text style={[styles.previousAdvice, { color: colors.textMuted }]}>
                        {previousWeekly.advice
                          ? `${previousWeekly.advice} · ${previousWeekly.applied ? 'applied' : 'not applied'}`
                          : 'Advice: hold steady'}
                      </Text>
                      <Text style={[styles.previousOpen, { color: colors.accent }]}>Read it again ›</Text>
                    </Tappable>
                  )}
                </View>
              )}

              {!review && !loading && !weeklyLockedNote && (
                <View style={styles.emptyState}>
                  <View style={[styles.emptyIconCircle, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                    <Ionicons name="analytics" size={32} color={colors.accent} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>
                    {getEventCopy('trends.weekly_recap_ready', { personality }) || 'Ready for your 7-day coaching check-in'}
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                    Connect what you lifted in the gym with your scale trends and calorie balance to keep your progress on track.
                  </Text>
                  <View style={styles.btnWrap}>
                    <Button
                      label={getEventCopy('trends.weekly_recap_action', { personality }) || 'CHECK IN WITH COACH'}
                      onPress={onGenerate}
                      tone="loud"
                    />
                  </View>
                </View>
              )}

              {/* Review Loaded Content */}
              {review && !loading && (
                <>
                  {/* Headline */}
                  <View style={[styles.headlineBox, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                    <Text style={[styles.headlineText, { color: colors.text }]}>"{review.headline}"</Text>
                  </View>

                  {/* Friendly Summary */}
                  <View style={[styles.sectionBox, { backgroundColor: colors.surfaceRaised }]}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>
                      {personality === 'gymrat' ? 'THE RECAP SCRIPT 👀' : 'THE BIG PICTURE'}
                    </Text>
                    <Text style={[styles.plainSummary, { color: colors.text }]}>
                      {review.plainSummary ?? review.synthesis}
                    </Text>
                  </View>

                  {/* Key Wins */}
                  {review.keyWins.length > 0 && (
                    <View style={[styles.sectionBox, { backgroundColor: colors.surfaceRaised }]}>
                      <Text style={[styles.sectionTitle, { color: colors.text }]}>
                        {personality === 'gymrat' ? 'THE WINS OF THE WEEK 🏆' : 'HIGHLIGHTS & WINS'}
                      </Text>
                      {review.keyWins.map((win, idx) => (
                        <View key={idx} style={styles.winRow}>
                          <Ionicons name="checkmark-circle" size={16} color={colors.positive} />
                          <Text style={[styles.winText, { color: colors.text }]}>{win}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Dual Cards: Gym & Kitchen Insights */}
                  <View style={styles.cardsGrid}>
                    <View style={[styles.insightCard, { backgroundColor: colors.surfaceRaised }]}>
                      <View style={styles.cardHeaderRow}>
                        <Ionicons name="barbell-outline" size={16} color={colors.accent} />
                        <Text style={[styles.cardHeaderTitle, { color: colors.text }]}>WORKOUT INSIGHT</Text>
                      </View>
                      <Text style={[styles.cardBody, { color: colors.textMuted }]}>{review.trainingInsight}</Text>
                    </View>

                    <View style={[styles.insightCard, { backgroundColor: colors.surfaceRaised }]}>
                      <View style={styles.cardHeaderRow}>
                        <Ionicons name="nutrition-outline" size={16} color={colors.accent} />
                        <Text style={[styles.cardHeaderTitle, { color: colors.text }]}>NUTRITION INSIGHT</Text>
                      </View>
                      <Text style={[styles.cardBody, { color: colors.textMuted }]}>{review.nutritionInsight}</Text>
                    </View>
                  </View>

                  {/* Suggested Adjustment */}
                  {review.suggestedAdjustment && (
                    <View
                      style={[
                        styles.adjustBox,
                        {
                          backgroundColor: colors.surfaceRaised,
                          borderColor: review.suggestedAdjustment.hasAdjustment ? colors.accent : colors.border,
                        },
                      ]}
                    >
                      <View style={styles.adjustTop}>
                        <View style={styles.adjustBadge}>
                          <Ionicons
                            name={review.suggestedAdjustment.hasAdjustment ? 'trending-up' : 'checkmark-done'}
                            size={14}
                            color={review.suggestedAdjustment.hasAdjustment ? colors.accent : colors.positive}
                          />
                          <Text
                            style={[
                              styles.adjustBadgeText,
                              {
                                color: review.suggestedAdjustment.hasAdjustment ? colors.accent : colors.positive,
                              },
                            ]}
                          >
                            {review.suggestedAdjustment.hasAdjustment
                              ? 'PROPOSED PLAN TUNING'
                              : 'TARGETS ON POINT'}
                          </Text>
                        </View>
                        <Text style={[styles.adjustTitle, { color: colors.text }]}>
                          {review.suggestedAdjustment.title}
                        </Text>
                      </View>

                      <Text style={[styles.adjustRationale, { color: colors.textMuted }]}>
                        {review.suggestedAdjustment.rationale}
                      </Text>

                      {/* Before / After Preview */}
                      {weeklyAdjustmentPreview && !applied && (
                        <View
                          style={[
                            styles.beforeAfterContainer,
                            { backgroundColor: colors.surface, borderColor: colors.border },
                          ]}
                        >
                          <View style={styles.beforeAfterItem}>
                            <Text style={[styles.beforeAfterLabel, { color: colors.textFaint }]}>CURRENT</Text>
                            <Text style={[styles.beforeAfterVal, { color: colors.textMuted }]}>
                              {Math.round(weeklyAdjustmentPreview.currentKcal)} kcal
                            </Text>
                          </View>
                          <Ionicons name="arrow-forward" size={16} color={colors.textFaint} />
                          <View style={styles.beforeAfterItem}>
                            <Text style={[styles.beforeAfterLabel, { color: colors.accent }]}>PROPOSED</Text>
                            <Text style={[styles.beforeAfterVal, { color: colors.text, fontWeight: '700' }]}>
                              {Math.round(weeklyAdjustmentPreview.achievableKcal)} kcal
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* Action buttons */}
                      {review.suggestedAdjustment.hasAdjustment && onApplyAdjustment && (
                        <View style={styles.actionRow}>
                          {applied ? (
                            <View style={styles.appliedPill}>
                              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                              <Text style={styles.appliedText}>ADJUSTMENT APPLIED TO GOAL</Text>
                            </View>
                          ) : (
                            <Tappable
                              onPress={onApplyAdjustment}
                              accessibilityRole="button"
                              scaleTo={0.97}
                              style={[styles.applyBtn, { backgroundColor: colors.accent }]}
                            >
                              <Text style={[styles.applyBtnText, { color: colors.onFill }]}>
                                APPLY {review.suggestedAdjustment.title.toUpperCase()}
                              </Text>
                            </Tappable>
                          )}
                        </View>
                      )}
                    </View>
                  )}

                  {/* Deep Science Toggle */}
                  {review.scienceExplanation && (
                    <View style={[styles.scienceBox, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
                      <Pressable
                        onPress={() => {
                          thud('light');
                          setShowScience(!showScience);
                        }}
                        style={styles.scienceHeader}
                      >
                        <View style={styles.scienceTitleGroup}>
                          <Ionicons name="flask-outline" size={16} color={colors.accent} />
                          <Text style={[styles.scienceTitle, { color: colors.text }]}>THE DEEP PHYSIOLOGY</Text>
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
                            {review.scienceExplanation}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Recalculate button */}
                  <Tappable onPress={onGenerate} style={styles.regenBtn} scaleTo={0.98}>
                    <Ionicons name="refresh" size={14} color={colors.textMuted} />
                    <Text style={[styles.regenText, { color: colors.textMuted }]}>Recalculate weekly check-in</Text>
                  </Tappable>
                </>
              )}
            </>
          )}

          {/* ========================================================= */}
          {/* 2. MONTHLY REVIEW MODE                                    */}
          {/* ========================================================= */}
          {reviewMode === 'monthly' && monthlyMetrics && (
            <>
              {/* Data Confidence Banner: rates a check-in, so none while there is nothing to rate */}
              {!monthlyLockedNote && (
                <View
                  style={[
                    styles.confBanner,
                    { backgroundColor: monthlyConfColor.bg, borderColor: monthlyConfColor.border },
                  ]}
                >
                  <View style={[styles.confDot, { backgroundColor: monthlyConfColor.text }]} />
                  <Text style={[styles.confText, { color: monthlyConfColor.text }]}>{monthlyConfLabel}</Text>
                </View>
              )}

              {/* Error Message */}
              {monthlyError && (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={loud.warn} />
                  <Text style={styles.errorText}>{monthlyError}</Text>
                </View>
              )}

              {/* Loading Indicator */}
              {monthlyLoading && (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator size="large" color={colors.accent} />
                  <Text style={styles.loadingTitle}>
                    {personality === 'gymrat'
                      ? `REVIEWING YOUR ${monthlyMetrics?.weeks ?? 4}-WEEK BLOCK & GAINS... 🔥`
                      : personality === 'classic'
                        ? `Analyzing ${longDays}-day trends and weekly adherence...`
                        : `Reviewing your past ${longDays} days...`}
                  </Text>
                  <Text style={[styles.loadingDesc, { color: colors.textMuted }]}>
                    Evaluating adherence to weekly calorie adjustments, metabolic adaptation, and progressive overload.
                  </Text>
                </View>
              )}

              {/* No Review Yet State */}
              {!monthlyReview && !monthlyLoading && monthlyLockedNote && (
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>Not earned yet</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>{monthlyLockedNote}</Text>
                </View>
              )}

              {!monthlyReview && !monthlyLoading && !monthlyLockedNote && (
                <View style={styles.emptyState}>
                  <View style={[styles.emptyIconCircle, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                    <Ionicons name="pie-chart-outline" size={32} color={colors.accent} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>
                    {`Ready for your ${longDays}-Day ${longName} Review`}
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                    Get deep feedback on how strictly you adhered to weekly calorie adjustments and how that shaped your scale weight and strength.
                  </Text>
                  <View style={styles.btnWrap}>
                    <Button
                      label={personality === 'gymrat' ? `LOCK IN ${longDays}-DAY CHECK-IN 🔥` : `CHECK IN FOR ${longName.toUpperCase()} REVIEW`}
                      onPress={onGenerateMonthly ?? (() => {})}
                      tone="loud"
                    />
                  </View>
                </View>
              )}

              {/* Monthly Review Content */}
              {monthlyReview && !monthlyLoading && (
                <>
                  {/* Headline */}
                  <View style={[styles.headlineBox, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                    <Text style={[styles.headlineText, { color: colors.text }]}>"{monthlyReview.headline}"</Text>
                  </View>

                  {/* 4-Week Adherence & Verdict Card */}
                  <View style={[styles.sectionBox, { backgroundColor: colors.surfaceRaised }]}>
                    <View style={styles.adherenceScoreHeader}>
                      <View style={{ flex: 1, marginRight: space.sm }}>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>
                          {personality === 'gymrat' ? 'WEEKLY TARGET LOCK-IN 🔥' : 'WEEKLY ADJUSTMENT ADHERENCE'}
                        </Text>
                        <Text style={[styles.adherenceSummaryText, { color: colors.textMuted }]}>
                          {monthlyMetrics.overallAdherence.adherenceSummary}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.adherenceScorePill,
                          {
                            minWidth: 84,
                            flexShrink: 0,
                            backgroundColor:
                              monthlyMetrics.overallAdherence.score >= 80
                                ? colors.positive + '25'
                                : colors.warning + '25',
                            borderColor:
                              monthlyMetrics.overallAdherence.score >= 80 ? colors.positive : colors.warning,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.adherenceScoreNum,
                            {
                              color:
                                monthlyMetrics.overallAdherence.score >= 80 ? colors.positive : colors.warning,
                            },
                          ]}
                        >
                          {monthlyMetrics.overallAdherence.score}%
                        </Text>
                        <Text
                          style={[
                            styles.adherenceScoreLabel,
                            {
                              color:
                                monthlyMetrics.overallAdherence.score >= 80 ? colors.positive : colors.warning,
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {personality === 'gymrat'
                            ? monthlyMetrics.overallAdherence.score >= 90
                              ? 'BEAST MODE'
                              : monthlyMetrics.overallAdherence.score >= 78
                                ? 'LOCKED IN'
                                : monthlyMetrics.overallAdherence.score >= 60
                                  ? 'MID ⚖️'
                                  : 'SLACKING 💀'
                            : monthlyMetrics.overallAdherence.rating.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.adherenceVerdictText, { color: colors.text }]}>
                      {monthlyReview.adherenceVerdict}
                    </Text>

                    {/* 4-Week Adherence Breakdown Grid */}
                    <View style={styles.weeklyAdherenceList}>
                      {monthlyMetrics.weeklyAdherence.map((w) => {
                        const isGood = w.status === 'on_target';
                        const badgeColor = isGood ? colors.positive : colors.warning;

                        return (
                          <View
                            key={w.weekNumber}
                            style={[
                              styles.adherenceWeekRow,
                              { backgroundColor: colors.surface, borderColor: colors.border },
                            ]}
                          >
                            <View style={styles.adherenceWeekLeft}>
                              <Text style={[styles.adherenceWeekTag, { color: colors.text }]}>
                                WEEK {w.weekNumber}
                              </Text>
                              <Text style={[styles.adherenceWeekPeriod, { color: colors.textFaint }]}>
                                {w.period.from.slice(5)} to {w.period.to.slice(5)}
                              </Text>
                            </View>

                            <View style={styles.adherenceWeekCenter}>
                              <Text style={[styles.adherenceWeekKcal, { color: colors.text }]}>
                                {w.avgActualKcal > 0 ? `${w.avgActualKcal} kcal` : 'No logs'}
                                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                                  {' '}/ {w.targetKcal} target
                                </Text>
                              </Text>
                              <Text style={[styles.adherenceWeekMeta, { color: colors.textFaint }]}>
                                {w.deltaKcal !== 0
                                  ? `${w.deltaKcal >= 0 ? '+' : ''}${w.deltaKcal} kcal/day · `
                                  : ''}
                                {w.loggedDays}/7 days
                              </Text>
                            </View>

                            <View
                              style={[
                                styles.adherenceWeekBadge,
                                { backgroundColor: badgeColor + '20', borderColor: badgeColor },
                              ]}
                            >
                              <Text style={[styles.adherenceWeekBadgeText, { color: badgeColor }]}>
                                {personality === 'gymrat'
                                  ? w.loggedDays === 0
                                    ? 'GHOSTED 👻'
                                    : isGood
                                      ? `${w.adherencePct}% LOCKED IN 🎯`
                                      : w.status === 'under'
                                        ? `${w.adherencePct}% DEFICIT 📉`
                                        : `${w.adherencePct}% SURPLUS 📈`
                                  : `${w.adherencePct}% ${isGood ? 'TARGET' : w.status.toUpperCase()}`}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  {/* 30-Day Physiological & Training Vitals */}
                  <View style={styles.cardsGrid}>
                    <View style={[styles.insightCard, { backgroundColor: colors.surfaceRaised }]}>
                      <View style={styles.cardHeaderRow}>
                        <Ionicons name="body-outline" size={16} color={colors.accent} />
                        <Text style={[styles.cardHeaderTitle, { color: colors.text }]}>
                          {personality === 'gymrat' ? `${longDays}-DAY SCALE & PHYSIQUE SHIFT ⚡` : `${longDays}-DAY BODY COMPOSITION`}
                        </Text>
                      </View>
                      <View style={styles.vitalStatRow}>
                        <View style={styles.vitalStatItem}>
                          <Text style={[styles.vitalStatLabel, { color: colors.textFaint }]}>START</Text>
                          <Text style={[styles.vitalStatValue, { color: colors.text }]}>
                            {monthlyMetrics.weight.startWeightKg !== null
                              ? formatWeight(monthlyMetrics.weight.startWeightKg, units)
                              : '—'}
                          </Text>
                        </View>
                        <Ionicons name="arrow-forward" size={14} color={colors.textFaint} />
                        <View style={styles.vitalStatItem}>
                          <Text style={[styles.vitalStatLabel, { color: colors.textFaint }]}>END</Text>
                          <Text style={[styles.vitalStatValue, { color: colors.text }]}>
                            {monthlyMetrics.weight.endWeightKg !== null
                              ? formatWeight(monthlyMetrics.weight.endWeightKg, units)
                              : '—'}
                          </Text>
                        </View>
                        <View style={styles.vitalStatItem}>
                          <Text style={[styles.vitalStatLabel, { color: colors.textFaint }]}>NET DELTA</Text>
                          <Text
                            style={[
                              styles.vitalStatValue,
                              {
                                color:
                                  monthlyMetrics.weight.deltaKg !== null && monthlyMetrics.weight.deltaKg < 0
                                    ? colors.positive
                                    : colors.text,
                              },
                            ]}
                          >
                            {monthlyMetrics.weight.deltaKg !== null
                              ? `${monthlyMetrics.weight.deltaKg >= 0 ? '+' : ''}${displayWeight(monthlyMetrics.weight.deltaKg, units).toFixed(1)} ${unit}`
                              : '—'}
                          </Text>
                        </View>
                      </View>
                      {monthlyMetrics.nutrition.expenditureChangeKcal !== null && (
                        <Text style={[styles.metabolicNote, { color: colors.textMuted }]}>
                          TDEE adaptation shift: {monthlyMetrics.nutrition.expenditureChangeKcal >= 0 ? '+' : ''}
                          {monthlyMetrics.nutrition.expenditureChangeKcal} kcal/day across the month.
                        </Text>
                      )}
                    </View>

                    <View style={[styles.insightCard, { backgroundColor: colors.surfaceRaised }]}>
                      <View style={styles.cardHeaderRow}>
                        <Ionicons name="barbell-outline" size={16} color={colors.accent} />
                        <Text style={[styles.cardHeaderTitle, { color: colors.text }]}>
                          {personality === 'gymrat' ? `${longDays}-DAY TONNAGE & IRON MOVED 🏋️` : `${longDays}-DAY TRAINING VOLUME`}
                        </Text>
                      </View>
                      <View style={styles.vitalStatRow}>
                        <View style={styles.vitalStatItem}>
                          <Text style={[styles.vitalStatLabel, { color: colors.textFaint }]}>WORKOUTS</Text>
                          <Text style={[styles.vitalStatValue, { color: colors.text }]}>
                            {monthlyMetrics.training.totalSessions}
                          </Text>
                        </View>
                        <View style={styles.vitalStatItem}>
                          <Text style={[styles.vitalStatLabel, { color: colors.textFaint }]}>AVG/WEEK</Text>
                          <Text style={[styles.vitalStatValue, { color: colors.text }]}>
                            {monthlyMetrics.training.avgSessionsPerWeek}
                          </Text>
                        </View>
                        <View style={styles.vitalStatItem}>
                          <Text style={[styles.vitalStatLabel, { color: colors.textFaint }]}>TOTAL VOLUME</Text>
                          <Text style={[styles.vitalStatValue, { color: colors.text }]}>
                            {Math.round(displayWeight(monthlyMetrics.training.totalVolumeKg, units)).toLocaleString()}{' '}
                            <Text style={{ fontSize: 11 }}>{unit}</Text>
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Monthly Wins */}
                  {monthlyReview.keyWins.length > 0 && (
                    <View style={[styles.sectionBox, { backgroundColor: colors.surfaceRaised }]}>
                      <Text style={[styles.sectionTitle, { color: colors.text }]}>
                        {personality === 'gymrat' ? `MASSIVE ${longName.toUpperCase()} Ws 🏆` : `${longName.toUpperCase()} MILESTONE WINS 🏆`}
                      </Text>
                      {monthlyReview.keyWins.map((win, idx) => (
                        <View key={idx} style={styles.winRow}>
                          <Ionicons name="checkmark-circle" size={16} color={colors.positive} />
                          <Text style={[styles.winText, { color: colors.text }]}>{win}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Monthly Big Picture */}
                  <View style={[styles.sectionBox, { backgroundColor: colors.surfaceRaised }]}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>
                      {personality === 'gymrat' ? 'COACH BREAKDOWN: THE BIG PICTURE 🧠' : `${longName.toUpperCase()} SYNTHESIS & ANALYSIS`}
                    </Text>
                    <Text style={[styles.plainSummary, { color: colors.text }]}>
                      {monthlyReview.plainSummary ?? monthlyReview.synthesis}
                    </Text>
                  </View>

                  {/* Month-Ahead Strategic Plan */}
                  <View style={[styles.strategyBox, { backgroundColor: colors.surfaceRaised, borderColor: colors.accent }]}>
                    <View style={styles.cardHeaderRow}>
                      <Ionicons name="compass-outline" size={18} color={colors.accent} />
                      <Text style={[styles.strategyTitle, { color: colors.accent }]}>
                        {personality === 'gymrat' ? `NEXT ${isQuarter ? 'QUARTER' : 'MONTH'} BATTLE PLAN 🚀` : `STRATEGY FOR THE NEXT ${isQuarter ? 'QUARTER' : 'MONTH'}`}
                      </Text>
                    </View>
                    <Text style={[styles.strategyText, { color: colors.text }]}>
                      {monthlyReview.monthAheadStrategy}
                    </Text>
                  </View>

                  {/* Training & Nutrition Insights */}
                  <View style={styles.cardsGrid}>
                    <View style={[styles.insightCard, { backgroundColor: colors.surfaceRaised }]}>
                      <View style={styles.cardHeaderRow}>
                        <Ionicons name="barbell-outline" size={16} color={colors.accent} />
                        <Text style={[styles.cardHeaderTitle, { color: colors.accent }]}>
                          {personality === 'gymrat' ? 'MESOCYCLE & OVERLOAD INTEL 💥' : 'MESOCYCLE INSIGHT'}
                        </Text>
                      </View>
                      <Text style={[styles.cardBody, { color: colors.textMuted }]}>
                        {monthlyReview.trainingInsight}
                      </Text>
                    </View>

                    <View style={[styles.insightCard, { backgroundColor: colors.surfaceRaised }]}>
                      <View style={styles.cardHeaderRow}>
                        <Ionicons name="nutrition-outline" size={16} color={colors.accent} />
                        <Text style={[styles.cardHeaderTitle, { color: colors.accent }]}>
                          {personality === 'gymrat' ? 'MACRO & FUEL INTEL 🥩' : 'NUTRITION INSIGHT'}
                        </Text>
                      </View>
                      <Text style={[styles.cardBody, { color: colors.textMuted }]}>
                        {monthlyReview.nutritionInsight}
                      </Text>
                    </View>
                  </View>

                  {/* Suggested Monthly Adjustment */}
                  {monthlyReview.suggestedAdjustment && (
                    <View
                      style={[
                        styles.adjustBox,
                        {
                          backgroundColor: colors.surfaceRaised,
                          borderColor: monthlyReview.suggestedAdjustment.hasAdjustment ? colors.accent : colors.border,
                        },
                      ]}
                    >
                      <View style={styles.adjustTop}>
                        <View style={styles.adjustBadge}>
                          <Ionicons
                            name={monthlyReview.suggestedAdjustment.hasAdjustment ? 'trending-up' : 'checkmark-done'}
                            size={14}
                            color={monthlyReview.suggestedAdjustment.hasAdjustment ? colors.accent : colors.positive}
                          />
                          <Text
                            style={[
                              styles.adjustBadgeText,
                              {
                                color: monthlyReview.suggestedAdjustment.hasAdjustment ? colors.accent : colors.positive,
                              },
                            ]}
                          >
                            {monthlyReview.suggestedAdjustment.hasAdjustment
                              ? (personality === 'gymrat' ? 'RECOMMENDED COACH PROTOCOL 🔥' : `RECOMMENDED ${longName.toUpperCase()} ADJUSTMENT`)
                              : (personality === 'gymrat' ? 'TARGETS LOCKED IN · KEEP CRUSHING 🎯' : `${longName.toUpperCase()} TARGETS ON TRACK`)}
                          </Text>
                        </View>
                        <Text style={[styles.adjustTitle, { color: colors.text }]}>
                          {monthlyReview.suggestedAdjustment.title}
                        </Text>
                      </View>

                      <Text style={[styles.adjustRationale, { color: colors.textMuted }]}>
                        {monthlyReview.suggestedAdjustment.rationale}
                      </Text>

                      {/* Before / After Preview */}
                      {monthlyAdjustmentPreview && !monthlyApplied && (
                        <View
                          style={[
                            styles.beforeAfterContainer,
                            { backgroundColor: colors.surface, borderColor: colors.border },
                          ]}
                        >
                          <View style={styles.beforeAfterItem}>
                            <Text style={[styles.beforeAfterLabel, { color: colors.textFaint }]}>CURRENT</Text>
                            <Text style={[styles.beforeAfterVal, { color: colors.textMuted }]}>
                              {Math.round(monthlyAdjustmentPreview.currentKcal)} kcal
                            </Text>
                          </View>
                          <Ionicons name="arrow-forward" size={16} color={colors.textFaint} />
                          <View style={styles.beforeAfterItem}>
                            <Text style={[styles.beforeAfterLabel, { color: colors.accent }]}>PROPOSED</Text>
                            <Text style={[styles.beforeAfterVal, { color: colors.text, fontWeight: '700' }]}>
                              {Math.round(monthlyAdjustmentPreview.achievableKcal)} kcal
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* Action buttons */}
                      {monthlyReview.suggestedAdjustment.hasAdjustment && onApplyMonthlyAdjustment && (
                        <View style={styles.actionRow}>
                          {monthlyApplied ? (
                            <View style={styles.appliedPill}>
                              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                              <Text style={styles.appliedText}>
                                {personality === 'gymrat' ? 'ADJUSTMENT LOCKED IN 🔒🔥' : `${longName.toUpperCase()} ADJUSTMENT APPLIED`}
                              </Text>
                            </View>
                          ) : (
                            <Tappable
                              onPress={onApplyMonthlyAdjustment}
                              accessibilityRole="button"
                              scaleTo={0.97}
                              style={[styles.applyBtn, { backgroundColor: colors.accent }]}
                            >
                              <Text style={[styles.applyBtnText, { color: colors.onFill }]}>
                                {personality === 'gymrat'
                                  ? `LOCK IN ${monthlyReview.suggestedAdjustment.title.toUpperCase()} 🔥`
                                  : `APPLY ${monthlyReview.suggestedAdjustment.title.toUpperCase()}`}
                              </Text>
                            </Tappable>
                          )}
                        </View>
                      )}
                    </View>
                  )}

                  {/* Deep Science Toggle */}
                  {monthlyReview.scienceExplanation && (
                    <View style={[styles.scienceBox, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}>
                      <Pressable
                        onPress={() => {
                          thud('light');
                          setShowMonthlyScience(!showMonthlyScience);
                        }}
                        style={styles.scienceHeader}
                      >
                        <View style={styles.scienceTitleGroup}>
                          <Ionicons name="flask-outline" size={16} color={colors.accent} />
                          <Text style={[styles.scienceTitle, { color: colors.text }]}>
                            {personality === 'gymrat' ? 'HYPERTROPHY & METABOLIC SCIENCE 🔬' : 'THE DEEP PHYSIOLOGY'}
                          </Text>
                        </View>
                        <Ionicons
                          name={showMonthlyScience ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={colors.textMuted}
                        />
                      </Pressable>
                      {showMonthlyScience && (
                        <View style={styles.scienceBody}>
                          <Text style={[styles.scienceText, { color: colors.textMuted }]}>
                            {monthlyReview.scienceExplanation}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Recalculate button */}
                  <Tappable onPress={onGenerateMonthly} style={styles.regenBtn} scaleTo={0.98}>
                    <Ionicons name="refresh" size={14} color={colors.textMuted} />
                    <Text style={[styles.regenText, { color: colors.textMuted }]}>
                      {personality === 'gymrat' ? 'Re-cook Monthly Review 🔄' : 'Recalculate monthly review'}
                    </Text>
                  </Tappable>
                </>
              )}
            </>
          )}
        </ScrollView>
          </>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '100%',
    borderRadius: 0,
    borderWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: space.sm,
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
    letterSpacing: 1.5,
  },
  headerPeriod: {
    fontFamily: font.ui,
    fontSize: 12,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTabs: {
    flexDirection: 'row',
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    padding: 3,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  modeTab: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: space.xs + 2,
    borderRadius: radius.sm,
  },
  modeTabActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  modeTabText: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  scrollArea: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
    gap: space.md,
  },
  replayButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  replayText: {
    fontFamily: font.uiStrong,
    fontSize: 12,
    letterSpacing: 0.8,
  },
  confBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  confDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  confText: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: space.md,
    backgroundColor: '#2A1818',
    borderColor: loud.warn,
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
    fontSize: 16,
    color: '#FFFFFF',
    marginTop: space.sm,
    textAlign: 'center',
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  previousCard: {
    alignSelf: 'stretch',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    gap: 4,
  },
  previousLabel: { fontFamily: font.display, fontSize: 10, letterSpacing: 1 },
  previousHeadline: { fontFamily: font.uiStrong, fontSize: 15 },
  previousAdvice: { fontFamily: font.ui, fontSize: 13, lineHeight: 18 },
  previousOpen: { fontFamily: font.uiStrong, fontSize: 13, marginTop: 4 },
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
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
  headlineText: {
    fontFamily: font.display,
    fontSize: 18,
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
  },
  cardBody: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 19,
  },
  adjustBox: {
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
    fontSize: 11,
    letterSpacing: 1.2,
  },
  adjustTitle: {
    fontFamily: font.display,
    fontSize: 17,
  },
  adjustRationale: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 18,
  },
  beforeAfterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginVertical: 4,
  },
  beforeAfterItem: {
    alignItems: 'center',
    flex: 1,
  },
  beforeAfterLabel: {
    fontFamily: font.uiStrong,
    fontSize: 9,
    letterSpacing: 1,
  },
  beforeAfterVal: {
    fontFamily: font.ui,
    fontSize: 14,
    marginTop: 2,
  },
  actionRow: {
    marginTop: 4,
  },
  appliedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: space.sm,
    justifyContent: 'center',
  },
  appliedText: {
    fontFamily: font.uiStrong,
    fontSize: 12,
    color: '#10B981',
    letterSpacing: 0.8,
  },
  applyBtn: {
    minHeight: 44,
    paddingVertical: space.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  applyBtnText: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    letterSpacing: 0.8,
  },
  strategyBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.xs,
  },
  strategyTitle: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  strategyText: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 19,
  },
  // Monthly adherence specific styles
  adherenceScoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.xs,
  },
  adherenceSummaryText: {
    fontFamily: font.ui,
    fontSize: 12,
    marginTop: 2,
  },
  adherenceScorePill: {
    paddingVertical: 4,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  adherenceScoreNum: {
    fontFamily: font.display,
    fontSize: 16,
    fontWeight: '700',
  },
  adherenceScoreLabel: {
    fontFamily: font.uiStrong,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  adherenceVerdictText: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: space.sm,
  },
  weeklyAdherenceList: {
    gap: space.xs,
  },
  adherenceWeekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.sm,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  adherenceWeekLeft: {
    width: 68,
  },
  adherenceWeekTag: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  adherenceWeekPeriod: {
    fontFamily: font.ui,
    fontSize: 10,
  },
  adherenceWeekCenter: {
    flex: 1,
    paddingHorizontal: space.sm,
  },
  adherenceWeekKcal: {
    fontFamily: font.uiStrong,
    fontSize: 12,
  },
  adherenceWeekMeta: {
    fontFamily: font.ui,
    fontSize: 10,
  },
  adherenceWeekBadge: {
    paddingVertical: 3,
    paddingHorizontal: space.xs + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  adherenceWeekBadgeText: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  vitalStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
  },
  vitalStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  vitalStatLabel: {
    fontFamily: font.uiStrong,
    fontSize: 9,
    letterSpacing: 1,
  },
  vitalStatValue: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    marginTop: 2,
  },
  metabolicNote: {
    fontFamily: font.ui,
    fontSize: 11,
    marginTop: 2,
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
  },
  scienceTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scienceTitle: {
    fontFamily: font.uiStrong,
    fontSize: 13,
  },
  scienceBody: {
    padding: space.md,
    gap: space.sm,
  },
  scienceText: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 18,
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
