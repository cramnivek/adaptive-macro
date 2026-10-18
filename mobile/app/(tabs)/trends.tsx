import {
  addDays,
  bodyweightForDates,
  computeVolumeDiagnostics,
  diffDays,
  projectedDate,
  summarisePeriod,
  todayISO,
} from '@adaptive-macros/engine';
import type { DatedSet, PeriodSummary, VolumeDiagnostics } from '@adaptive-macros/engine';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../src/components/Card';
import { CountUp } from '../../src/components/CountUp';
import { FadeIn } from '../../src/components/FadeIn';
import { LineChart } from '../../src/components/LineChart';
import { LoggingStrip } from '../../src/components/LoggingStrip';
import { MethodSheet } from '../../src/components/MethodSheet';
import { MuscleFigure } from '../../src/components/MuscleFigure';
import { REGION_LABELS, type MuscleRegion } from '../../src/components/muscleMap';
import { Screen } from '../../src/components/Screen';
import { SlashPanel } from '../../src/components/SlashPanel';
import { StatTile } from '../../src/components/StatTile';
import { Tappable } from '../../src/components/Tappable';
import { VolumeLandmarksCard } from '../../src/components/VolumeLandmarksCard';
import { WeeklyBars } from '../../src/components/WeeklyBars';
import { WeeklyReviewModal } from '../../src/components/WeeklyReviewModal';
import {
  catalogueRegionsByExerciseName,
  dailyIntakeBetween,
  finishedSessionTimes,
  listAllSets,
} from '../../src/db';
import { calculateCoachingGoalAdjustment } from '../../src/ai/coachingAdjustment';
import {
  axisDecimals,
  displayWeight,
  formatDateLong,
  formatDayMonth,
  formatRate,
  formatWeight,
  weightUnit,
} from '../../src/format';
import { loggingStrip } from '../../src/loggingStrip';
import { useApp } from '../../src/state/AppStore';
import { font, radius, space, useTheme, type Palette } from '../../src/theme';
import { session as loud } from '../../src/theme/sessionTheme';
import { volumeComparison } from '../../src/volume';
import { weeklyTotals, type SessionTimes } from '../../src/weeklyTraining';
import {
  extractWeeklyMetrics,
  requestWeeklyReview,
  type WeeklyExtractedMetrics,
  type WeeklyReviewResult,
} from '../../src/ai/weeklyReview';
import { notify } from '../../src/dialog';
import { thud } from '../../src/platform/haptics';
import { getEventCopy } from '../../src/copy/personality';

const WINDOW_DAYS = 90;

type TrendTab = 'all' | 'body' | 'workouts';

export default function TrendsScreen() {
  const { colors } = useTheme();
  const {
    settings,
    series,
    latest,
    trend,
    program,
    confidence,
    weights,
    dayStatus,
    updateSettings,
    observations,
  } = useApp();

  const [activeTab, setActiveTab] = useState<TrendTab>('all');
  const [intake, setIntake] = useState<{ date: string; kcal: number; proteinG?: number }[]>([]);
  const [method, setMethod] = useState(false);
  const [sets, setSets] = useState<DatedSet[]>([]);
  const [regions, setRegions] = useState<
    Record<string, { primary: MuscleRegion; secondary: MuscleRegion[] }>
  >({});
  const [sessionTimes, setSessionTimes] = useState<SessionTimes[]>([]);

  // Coaching review state
  const [coachingModalOpen, setCoachingModalOpen] = useState(false);
  const [coachingReview, setCoachingReview] = useState<WeeklyReviewResult | null>(null);
  const [coachingLoading, setCoachingLoading] = useState(false);
  const [coachingError, setCoachingError] = useState<string | null>(null);
  const [coachingApplied, setCoachingApplied] = useState(false);

  const unit = weightUnit(settings.units);
  const today = todayISO();
  const from = addDays(today, -(WINDOW_DAYS - 1));

  useFocusEffect(
    useCallback(() => {
      let current = true;
      void Promise.all([
        dailyIntakeBetween(from, today),
        listAllSets(),
        catalogueRegionsByExerciseName(),
        finishedSessionTimes(addDays(today, -84)),
      ]).then(([intakeRows, allSets, byName, times]) => {
        if (!current) return;
        setIntake(intakeRows);
        setSets(allSets);
        setRegions(byName);
        setSessionTimes(times);
      });
      return () => {
        current = false;
      };
    }, [from, today]),
  );

  // Rolling 7-day window for workouts and coaching
  const weekFrom = addDays(today, -6);
  const bodyweightByDate = useMemo(
    () => bodyweightForDates(series, sets.map((s) => s.date), { extend: true }),
    [series, sets],
  );

  const summary7D: PeriodSummary = useMemo(
    () => summarisePeriod(sets, bodyweightByDate, weekFrom, today),
    [sets, bodyweightByDate, weekFrom, today],
  );

  const diagnostics7D: VolumeDiagnostics = useMemo(
    () =>
      computeVolumeDiagnostics({
        sets,
        exerciseRegions: regions,
        from: weekFrom,
        to: today,
        periodDays: 7,
      }),
    [sets, regions, weekFrom, today],
  );

  const weeks = useMemo(() => weeklyTotals(sessionTimes, sets, today), [sessionTimes, sets, today]);
  const anyWeekTrained = weeks.some((week) => week.sets > 0 || week.minutes > 0);

  // Volume-weighted muscle coverage: weights regions by actual completed working sets
  const coverage = useMemo(() => {
    const counts = new Map<MuscleRegion, number>();
    let totalSetsInWindow = 0;
    let cataloguedSetsInWindow = 0;

    for (const s of sets) {
      if (s.date < weekFrom || s.date > today) continue;
      if (s.set.reps === null || s.set.reps <= 0) continue;
      totalSetsInWindow++;

      const entry = regions[s.set.exerciseName];
      if (entry === undefined) continue;
      cataloguedSetsInWindow++;

      // Direct training gets full weight, secondary gets half weight
      counts.set(entry.primary, (counts.get(entry.primary) ?? 0) + 1.0);
      for (const region of entry.secondary) {
        counts.set(region, (counts.get(region) ?? 0) + 0.5);
      }
    }

    const uncataloguedPct =
      totalSetsInWindow > 0
        ? Math.round(((totalSetsInWindow - cataloguedSetsInWindow) / totalSetsInWindow) * 100)
        : 0;

    const ranked = [...counts.entries()].sort(([, a], [, b]) => b - a).map(([region]) => region);
    return {
      primary: ranked[0] ?? null,
      secondary: ranked.slice(1),
      uncataloguedPct,
      totalSets: totalSetsInWindow,
    };
  }, [sets, regions, weekFrom, today]);

  // Deterministic coaching review metrics
  const coachingMetrics: WeeklyExtractedMetrics = useMemo(
    () =>
      extractWeeklyMetrics({
        series,
        observations,
        intake,
        sets,
        diagnostics: diagnostics7D.totalWorkingSets > 0 ? diagnostics7D : null,
        goalDirection: settings.goal?.direction,
        targetKcal: program?.calories?.kcal,
        targetProteinG: program?.macros?.proteinG,
        units: settings.units,
      }),
    [
      series,
      observations,
      intake,
      sets,
      diagnostics7D,
      settings.goal?.direction,
      program?.calories?.kcal,
      program?.macros?.proteinG,
      settings.units,
    ],
  );

  const coachingFingerprint = `${coachingMetrics.period.to}_${sets.length}_${observations.length}_${intake.length}_${program?.calories?.kcal ?? 0}_${summary7D.volumeKg}_${summary7D.workingSets}`;
  const coachingCacheKey = `ascend_weekly_review_${settings.personality}_${coachingMetrics.period.to}`;
  const coachingAppliedKey = `ascend_applied_coaching_${coachingMetrics.period.to}`;

  useEffect(() => {
    let alive = true;
    void Promise.all([
      AsyncStorage.getItem(coachingCacheKey),
      AsyncStorage.getItem(coachingAppliedKey),
    ]).then(([savedReview, savedApplied]) => {
      if (!alive) return;
      if (savedReview) {
        try {
          const parsed = JSON.parse(savedReview) as
            | { review: WeeklyReviewResult; fingerprint: string }
            | WeeklyReviewResult;
          if (parsed && 'fingerprint' in parsed && parsed.fingerprint) {
            // Discard stale review if underlying logs, targets, or workouts have changed
            if (parsed.fingerprint === coachingFingerprint) {
              setCoachingReview(parsed.review);
            } else {
              setCoachingReview(null);
            }
          } else {
            setCoachingReview(null);
          }
        } catch {
          setCoachingReview(null);
        }
      } else {
        setCoachingReview(null);
      }
      if (savedApplied) {
        setCoachingApplied(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [coachingCacheKey, coachingAppliedKey, coachingFingerprint]);

  const handleGenerateCoaching = useCallback(async () => {
    setCoachingLoading(true);
    setCoachingError(null);
    try {
      thud('light');
      const result = await requestWeeklyReview(
        coachingMetrics,
        '',
        settings.goal?.direction,
        settings.personality,
      );
      setCoachingReview(result);
      setCoachingApplied(false);
      await AsyncStorage.setItem(
        coachingCacheKey,
        JSON.stringify({ review: result, fingerprint: coachingFingerprint }),
      );
      thud('heavy');
      notify('Review ready', 'Your weekly coaching review is ready.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate coaching review';
      setCoachingError(msg);
      notify('Coaching Review', msg);
    } finally {
      setCoachingLoading(false);
    }
  }, [coachingMetrics, settings.goal?.direction, settings.personality, coachingCacheKey, coachingFingerprint]);

  const handleApplyCoachingAdjustment = useCallback(async () => {
    if (!coachingReview?.suggestedAdjustment?.hasAdjustment || coachingApplied) return;
    thud('heavy');
    const adj = coachingReview.suggestedAdjustment;
    if (adj.deltaKcal && program?.calories?.kcal && settings.goal) {
      const exp = latest?.expenditureKcal ?? program.expenditureKcal ?? 2200;
      const result = calculateCoachingGoalAdjustment({
        currentGoal: settings.goal,
        expenditureKcal: exp,
        deltaKcal: adj.deltaKcal,
      });

      await updateSettings({
        goal: result.proposedGoal,
      });

      // Persist exact applied adjustment so app restarts don't lose applied state
      await AsyncStorage.setItem(
        coachingAppliedKey,
        JSON.stringify({
          appliedAt: Date.now(),
          deltaKcal: adj.deltaKcal,
          previousKcal: result.currentKcal,
          newKcal: result.achievableKcal,
          proposedGoal: result.proposedGoal,
        }),
      );
      setCoachingApplied(true);
      notify(
        'Adjustment Applied',
        `Goal updated to ${result.rateChangeDescription} (${Math.round(result.achievableKcal)} kcal/day)`,
      );
    }
  }, [coachingReview, coachingApplied, program, settings.goal, latest?.expenditureKcal, updateSettings, coachingAppliedKey]);

  // 90-day charts calculations
  const window = useMemo(() => series.slice(-WINDOW_DAYS), [series]);
  const origin = window[0]?.date ?? null;

  const energy = useMemo(() => {
    if (origin === null || window.length < 2) return null;
    return {
      expenditure: window.map((point) => ({
        x: diffDays(origin, point.date),
        y: point.expenditureKcal,
      })),
      band: window.map((point) => ({
        x: diffDays(origin, point.date),
        lo: point.expenditureKcal - point.expenditureSdKcal,
        hi: point.expenditureKcal + point.expenditureSdKcal,
      })),
      intake: intake
        .filter((row) => row.date >= origin && dayStatus.get(row.date) !== false)
        .map((row) => ({ x: diffDays(origin, row.date), y: row.kcal })),
      leftOut: intake
        .filter((row) => row.date >= origin && dayStatus.get(row.date) === false)
        .map((row) => ({ x: diffDays(origin, row.date), y: row.kcal })),
    };
  }, [window, origin, intake, dayStatus]);

  const strip = useMemo(
    () =>
      loggingStrip(
        today,
        new Set(intake.map((row) => row.date)),
        new Set(weights.map((row) => row.date)),
        dayStatus,
      ),
    [today, intake, weights, dayStatus],
  );

  const weight = useMemo(() => {
    if (origin === null || window.length < 2) return null;
    return window.map((point) => ({
      x: diffDays(origin, point.date),
      y: displayWeight(point.trendWeightKg, settings.units),
    }));
  }, [window, origin, settings.units]);

  const weightDecimals = useMemo(() => {
    if (weight === null) return 1;
    const values = weight.map((point) => point.y);
    if (settings.goalWeightKg !== null) {
      values.push(displayWeight(settings.goalWeightKg, settings.units));
    }
    return axisDecimals(Math.max(...values) - Math.min(...values));
  }, [weight, settings.goalWeightKg, settings.units]);

  const projection = useMemo(() => {
    if (!latest || !trend || settings.goalWeightKg === null) return null;
    return projectedDate(today, latest.trendWeightKg, settings.goalWeightKg, trend.rateKgPerWeek);
  }, [latest, trend, settings.goalWeightKg, today]);

  const dayLabel = (x: number) =>
    origin === null ? '' : formatDayMonth(addDays(origin, x));

  const comparison = volumeComparison(summary7D.volumeKg);

  return (
    <Screen title="Trends & Progress">
      {/* Top High-Visibility Weekly Coaching Banner */}
      <FadeIn>
        <Tappable
          onPress={() => {
            thud('light');
            setCoachingModalOpen(true);
          }}
          style={[
            styles.coachingBanner,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open Weekly Coach Review"
        >
          <View style={styles.coachingBannerLeft}>
            <View
              style={[
                styles.coachingIconCircle,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Ionicons name="sparkles" size={18} color={colors.accent} />
            </View>
            <View style={styles.coachingBannerContent}>
              <View style={styles.coachingTagRow}>
                <Text style={[styles.coachingTag, { color: colors.textMuted }]}>
                  {getEventCopy('trends.weekly_recap_tag', {
                    personality: settings.personality,
                    seed: 'weekly_tag',
                  })}
                </Text>
                <View
                  style={[
                    styles.readyPill,
                    coachingReview
                      ? { backgroundColor: colors.positive + '20', borderColor: colors.positive }
                      : { backgroundColor: colors.warning + '20', borderColor: colors.warning },
                  ]}
                >
                  <Text
                    style={[
                      styles.readyPillText,
                      { color: coachingReview ? colors.positive : colors.warning },
                    ]}
                  >
                    {coachingReview
                      ? getEventCopy('trends.weekly_recap_action', {
                          personality: settings.personality,
                          seed: 'recap_action',
                        })
                      : 'TAP TO CHECK IN'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.coachingHeadline, { color: colors.text }]} numberOfLines={1}>
                {coachingReview ? `"${coachingReview.headline}"` : 'See how your workouts, scale weight, and calories connected this week'}
              </Text>
            </View>
          </View>
          <View style={styles.coachingArrowWrap}>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
        </Tappable>
      </FadeIn>

      {/* Unified Tab Switcher */}
      <View style={styles.switcher}>
        {(
          [
            { key: 'all', label: 'OVERVIEW' },
            { key: 'body', label: 'BODY & ENERGY' },
            { key: 'workouts', label: 'TRAINING & MUSCLES' },
          ] as const
        ).map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Tappable
              key={tab.key}
              onPress={() => {
                thud('light');
                setActiveTab(tab.key);
              }}
              style={styles.switchItem}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <SlashPanel color={active ? colors.accent : colors.surfaceRaised} style={styles.switchPanel}>
                <Text style={[styles.switchLabel, { color: active ? colors.onFill : colors.textMuted }]}>
                  {tab.label}
                </Text>
              </SlashPanel>
            </Tappable>
          );
        })}
      </View>

      {/* Contextual Summary Tiles */}
      <View style={styles.atAGlanceGrid}>
        {activeTab === 'all' && (
          <>
            <GlanceTile
              label="WEIGHT TREND"
              value={latest ? formatWeight(latest.trendWeightKg, settings.units) : '—'}
              sub={trend ? formatRate(trend.rateKgPerWeek, settings.units) : 'settling'}
              colors={colors}
            />
            <GlanceTile
              label="CALORIE PLAN"
              value={
                program.calories.adjustmentKcal === 0
                  ? 'Maintenance'
                  : `${program.calories.adjustmentKcal > 0 ? '+' : ''}${program.calories.adjustmentKcal} kcal`
              }
              sub={program?.calories?.kcal ? `${Math.round(program.calories.kcal)} target` : 'target'}
              colors={colors}
            />
            <GlanceTile
              label="WORKOUTS"
              value={`${summary7D.sessions} sessions`}
              sub="past 7 days"
              colors={colors}
            />
            <GlanceTile
              label="RECORDS (PRS)"
              value={summary7D.records}
              sub={`${summary7D.workingSets} working sets`}
              highlight={summary7D.records > 0}
              colors={colors}
            />
          </>
        )}

        {activeTab === 'body' && (
          <>
            <GlanceTile
              label="TREND WEIGHT"
              value={latest ? formatWeight(latest.trendWeightKg, settings.units) : '—'}
              sub="smoothed trend"
              colors={colors}
            />
            <GlanceTile
              label="RATE OF CHANGE"
              value={trend ? formatRate(trend.rateKgPerWeek, settings.units) : '—'}
              sub="per week"
              colors={colors}
            />
            <GlanceTile
              label="CALORIE PLAN"
              value={
                program.calories.adjustmentKcal === 0
                  ? 'Maintenance'
                  : `${program.calories.adjustmentKcal > 0 ? '+' : ''}${program.calories.adjustmentKcal} kcal`
              }
              sub="daily delta"
              colors={colors}
            />
            <GlanceTile
              label="ESTIMATED TDEE"
              value={
                latest ? (
                  <>
                    {Math.round(latest.expenditureKcal)}{' '}
                    <Text style={[styles.glanceUnit, { color: colors.textMuted }]}>kcal</Text>
                  </>
                ) : (
                  '—'
                )
              }
              sub="daily expenditure"
              colors={colors}
            />
          </>
        )}

        {activeTab === 'workouts' && (
          <>
            <GlanceTile
              label="WORKOUTS"
              value={`${summary7D.sessions} sessions`}
              sub="past 7 days"
              colors={colors}
            />
            <GlanceTile
              label="WORKING SETS"
              value={summary7D.workingSets}
              sub="total completed"
              colors={colors}
            />
            <GlanceTile
              label="NEW BESTS (PRS)"
              value={summary7D.records}
              sub="milestone lifts"
              highlight={summary7D.records > 0}
              colors={colors}
            />
            <GlanceTile
              label="GROWTH RANGE"
              value={
                <Text style={{ color: colors.positive }}>
                  {diagnostics7D.optimalMusclesCount} / {diagnostics7D.muscleVolumes.length}
                </Text>
              }
              sub="muscles in range"
              colors={colors}
            />
          </>
        )}
      </View>

      {/* PART 1: BODY & ENERGY CHARTS */}
      {(activeTab === 'all' || activeTab === 'body') && (
        <>
          <Card title="Energy balance & estimated expenditure">
            <View style={styles.legend}>
              <Key color={colors.positive} label="ESTIMATED TDEE" />
              <Key color={colors.carbs} label="eaten" dotted />
              <Key color={colors.accent} label="target" dashed />
            </View>
            <LineChart
              series={energy ? [{ points: energy.expenditure, color: colors.positive, strokeWidth: 2.5 }] : []}
              band={energy ? { points: energy.band, color: colors.positive } : undefined}
              scatter={
                energy
                  ? [
                      { points: energy.intake, color: colors.carbs, radius: 2.5, opacity: 0.8 },
                      { points: energy.leftOut, color: colors.carbs, radius: 2.5, opacity: 0.25 },
                    ]
                  : undefined
              }
              referenceY={{ value: program.calories.kcal, color: colors.accent }}
              formatX={dayLabel}
              emptyMessage="Log weight and food for a couple of weeks"
              height={190}
            />
          </Card>

          <Card title="True scale trend weight">
            <LineChart
              series={weight ? [{ points: weight, color: colors.accent, strokeWidth: 2.5 }] : []}
              includeY={settings.goalWeightKg === null ? [] : [displayWeight(settings.goalWeightKg, settings.units)]}
              referenceY={
                settings.goalWeightKg === null
                  ? undefined
                  : { value: displayWeight(settings.goalWeightKg, settings.units), color: colors.protein }
              }
              formatY={(value) => value.toFixed(weightDecimals)}
              formatX={dayLabel}
              emptyMessage="Weigh in for a couple of weeks"
              height={170}
            />
          </Card>

          <Card title="Goal timeline">
            <View style={styles.tiles}>
              <StatTile
                label="Expenditure"
                value={latest ? String(Math.round(latest.expenditureKcal)) : '—'}
                unit="kcal/day"
                hint={latest ? `± ${Math.round(latest.expenditureSdKcal)} · ${confidence}` : 'No estimate yet'}
              />
              <StatTile
                label="Target"
                value={String(program.calories.kcal)}
                unit="kcal/day"
                hint={
                  program.calories.adjustmentKcal === 0
                    ? 'maintenance'
                    : `${program.calories.adjustmentKcal > 0 ? '+' : ''}${program.calories.adjustmentKcal} kcal`
                }
              />
            </View>
            {settings.goalWeightKg !== null && (
              <Text style={[styles.body, { color: colors.textMuted, marginTop: space.sm }]}>
                {projection
                  ? `At this rate you reach ${formatWeight(settings.goalWeightKg, settings.units)} around ${formatDateLong(projection)}.`
                  : `Your trend is not moving toward ${formatWeight(settings.goalWeightKg, settings.units)}, so there is no date to project.`}
              </Text>
            )}
          </Card>

          <Card title="Logging streak (last 14 days)">
            <LoggingStrip days={strip} />
          </Card>
        </>
      )}

      {/* PART 2: WORKOUTS & MUSCLES */}
      {(activeTab === 'all' || activeTab === 'workouts') && (
        <>
          <FadeIn>
            <Card loud title="You moved (past 7 days)">
              <View style={styles.volumeRow}>
                <CountUp
                  value={Math.round(displayWeight(summary7D.volumeKg, settings.units))}
                  format={(value) => Math.round(value).toLocaleString()}
                  style={styles.volumeFigure}
                />
                <Text style={styles.volumeUnit}>{unit}</Text>
              </View>
              {comparison !== null && <Text style={styles.comparison}>{comparison}</Text>}
            </Card>
          </FadeIn>

          {coachingMetrics.training.progressions.length > 0 && (
            <FadeIn delay={40}>
              <Card loud title="Strength Highlights (Overload)">
                <View style={styles.progressionList}>
                  {coachingMetrics.training.progressions.slice(0, 3).map((p) => (
                    <View key={p.exercise} style={styles.progressionRow}>
                      <View style={styles.progressionLeft}>
                        <Text style={styles.progressionName}>{p.exercise.toUpperCase()}</Text>
                        <Text style={styles.progressionPrev}>Prior: {p.previous}</Text>
                      </View>
                      <View style={styles.progressionRight}>
                        <Text style={styles.progressionCurr}>{p.current}</Text>
                        <Text
                          style={[
                            styles.progressionDelta,
                            {
                              color: p.delta.startsWith('+') ? '#10B981' : loud.figureMuted,
                            },
                          ]}
                        >
                          {p.delta}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </Card>
            </FadeIn>
          )}

          {diagnostics7D.totalWorkingSets > 0 && (
            <FadeIn delay={60}>
              <VolumeLandmarksCard
                diagnostics={diagnostics7D}
                periodDays={7}
                goal={settings.goal?.direction}
                targetKcalDelta={
                  latest?.expenditureKcal != null && program?.calories?.kcal != null
                    ? Math.round(program.calories.kcal - latest.expenditureKcal)
                    : undefined
                }
              />
            </FadeIn>
          )}

          <FadeIn delay={100}>
            <Card loud title="What you trained">
              {coverage.primary === null ? (
                <Text style={styles.note}>
                  No catalogued exercises logged in the past 7 days.
                </Text>
              ) : (
                <View style={styles.map}>
                  <MuscleFigure
                    view="front"
                    primary={coverage.primary}
                    secondary={coverage.secondary}
                    size={104}
                    outline={loud.rule}
                    fill={loud.loud}
                  />
                  <MuscleFigure
                    view="back"
                    primary={coverage.primary}
                    secondary={coverage.secondary}
                    size={104}
                    outline={loud.rule}
                    fill={loud.loud}
                  />
                  <View style={styles.legendWrap}>
                    <Text style={styles.legendPrimary}>{REGION_LABELS[coverage.primary]}</Text>
                    {coverage.secondary.length > 0 && (
                      <Text style={styles.legendSecondary}>
                        also{' '}
                        {coverage.secondary
                          .slice(0, 5)
                          .map((r) => REGION_LABELS[r].toLowerCase())
                          .join(', ')}
                      </Text>
                    )}
                    {coverage.uncataloguedPct > 0 && (
                      <Text style={styles.uncataloguedNote}>
                        {coverage.uncataloguedPct}% of sets from custom / uncatalogued lifts
                      </Text>
                    )}
                  </View>
                </View>
              )}
              {summary7D.exercises.length > 0 && (
                <Text style={styles.exercises} numberOfLines={3}>
                  {summary7D.exercises.join(' · ')}
                </Text>
              )}
            </Card>
          </FadeIn>

          {anyWeekTrained && (
            <FadeIn delay={140}>
              <Card loud title="Week by week volume">
                <WeeklyBars weeks={weeks} units={settings.units} />
              </Card>
            </FadeIn>
          )}
        </>
      )}

      {/* Method & Calculation Explanation */}
      <Tappable onPress={() => setMethod(true)} scaleTo={0.98}>
        <View style={[styles.method, { borderColor: colors.border }]}>
          <Text style={[styles.methodLabel, { color: colors.textMuted }]}>
            How the adaptive algorithm calculates expenditure
          </Text>
          <Text style={{ color: colors.textFaint, fontFamily: font.ui }}>›</Text>
        </View>
      </Tappable>

      <MethodSheet open={method} onClose={() => setMethod(false)} />
      <Text style={[styles.unitNote, { color: colors.textFaint }]}>Weights in {unit}.</Text>

      {/* Weekly Coaching Review Modal Popup */}
      <WeeklyReviewModal
        open={coachingModalOpen}
        onClose={() => setCoachingModalOpen(false)}
        review={coachingReview}
        metrics={coachingMetrics}
        loading={coachingLoading}
        error={coachingError}
        applied={coachingApplied}
        onGenerate={handleGenerateCoaching}
        onApplyAdjustment={handleApplyCoachingAdjustment}
        goal={settings.goal}
        expenditureKcal={latest?.expenditureKcal ?? program.expenditureKcal}
        personality={settings.personality}
      />
    </Screen>
  );
}

const Key = ({
  color,
  label,
  dashed = false,
  dotted = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
  dotted?: boolean;
}) => (
  <View style={styles.key}>
    <View
      style={[
        dotted ? styles.keyDot : styles.keyLine,
        { backgroundColor: color, opacity: dashed ? 0.6 : 1 },
      ]}
    />
    <Text style={[styles.keyLabel, { color }]}>{label}</Text>
  </View>
);

const GlanceTile = ({
  label,
  value,
  sub,
  highlight = false,
  colors,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  highlight?: boolean;
  colors: Palette;
}) => (
  <View style={[styles.glanceTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text style={[styles.glanceTileLabel, { color: colors.textMuted }]}>{label}</Text>
    <Text style={[styles.glanceTileValue, { color: highlight ? loud.loud : colors.text }]}>{value}</Text>
    <Text style={[styles.glanceTileSub, { color: colors.textFaint }]}>{sub}</Text>
  </View>
);

const styles = StyleSheet.create({
  coachingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    marginBottom: space.md,
  },
  coachingBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    flex: 1,
  },
  coachingIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachingBannerContent: {
    flex: 1,
    gap: 2,
  },
  coachingTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  coachingTag: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 1.1,
  },
  readyPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  readyPillText: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  coachingHeadline: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 18,
  },
  coachingArrowWrap: {
    marginLeft: space.sm,
  },

  switcher: {
    flexDirection: 'row',
    gap: space.xs,
    marginBottom: space.md,
  },
  switchItem: {
    flex: 1,
  },
  switchPanel: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  switchLabel: {
    fontFamily: font.display,
    fontSize: 11,
    letterSpacing: 0.8,
    textAlign: 'center',
  },

  atAGlanceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.md,
  },
  glanceTile: {
    flex: 1,
    minWidth: '47%',
    borderRadius: radius.md,
    padding: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  glanceTileLabel: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  glanceTileValue: {
    fontFamily: font.figure,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
  },
  glanceUnit: {
    fontFamily: font.ui,
    fontSize: 11,
  },
  glanceTileSub: {
    fontFamily: font.ui,
    fontSize: 11.5,
    marginTop: 2,
  },

  tiles: { flexDirection: 'row', gap: space.md, marginBottom: space.sm },
  body: { fontFamily: font.ui, fontSize: 13, lineHeight: 19 },
  legend: { flexDirection: 'row', gap: space.md, marginBottom: space.sm },
  key: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  keyLine: { width: 14, height: 2, borderRadius: 1 },
  keyDot: { width: 6, height: 6, borderRadius: 3 },
  keyLabel: { fontFamily: font.uiStrong, fontSize: 11 },

  volumeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  volumeFigure: {
    fontFamily: font.figure,
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -1.5,
    color: loud.figure,
    fontVariant: ['tabular-nums'],
  },
  volumeUnit: { fontFamily: font.display, fontSize: 13, letterSpacing: 1, color: loud.figureMuted },
  comparison: { fontFamily: font.ui, fontSize: 13, color: loud.loud, marginTop: 2 },

  map: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  legendWrap: { flex: 1, gap: 2 },
  legendPrimary: { fontFamily: font.display, fontSize: 14, color: loud.figure },
  legendSecondary: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, color: loud.figureFaint },
  exercises: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 17,
    color: loud.figureFaint,
    marginTop: space.md,
  },
  note: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, color: loud.figureFaint },

  method: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: space.sm,
  },
  methodLabel: { fontFamily: font.uiStrong, fontSize: 12 },
  unitNote: { fontFamily: font.ui, fontSize: 11, textAlign: 'center', marginTop: space.sm },

  uncataloguedNote: {
    fontFamily: font.ui,
    fontSize: 10,
    color: loud.warn,
    marginTop: 4,
  },

  progressionList: {
    gap: space.xs,
  },
  progressionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: loud.rule,
  },
  progressionLeft: {
    flex: 1,
    gap: 2,
  },
  progressionRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  progressionName: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    color: loud.figure,
  },
  progressionPrev: {
    fontFamily: font.ui,
    fontSize: 11,
    color: loud.figureMuted,
  },
  progressionCurr: {
    fontFamily: font.figure,
    fontSize: 14,
    color: loud.figure,
  },
  progressionDelta: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 0.5,
  },
});
