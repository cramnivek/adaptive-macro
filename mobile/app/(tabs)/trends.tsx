import {
  addDays,
  averageLoggedDay,
  bodyweightForDates,
  computeVolumeDiagnostics,
  diffDays,
  projectedDate,
  summarisePeriod,
} from '@adaptive-macros/engine';
import type { DatedSet, LogEntry, PeriodSummary, VolumeDiagnostics } from '@adaptive-macros/engine';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../src/components/Card';
import { CountUp } from '../../src/components/CountUp';
import { FadeIn } from '../../src/components/FadeIn';
import { LineChart } from '../../src/components/LineChart';
import { LoggingStrip } from '../../src/components/LoggingStrip';
import { NutritionQualityCard } from '../../src/components/NutritionQualityCard';
import { MethodSheet } from '../../src/components/MethodSheet';
import { MuscleFigure } from '../../src/components/MuscleFigure';
import { REGION_LABELS, type MuscleRegion } from '../../src/components/muscleMap';
import { Screen } from '../../src/components/Screen';
import { TOUCH_TARGET } from '../../src/components/Controls';
import { StatTile } from '../../src/components/StatTile';
import { Tappable } from '../../src/components/Tappable';
import { VolumeLandmarksCard } from '../../src/components/VolumeLandmarksCard';
import { WeeklyBars } from '../../src/components/WeeklyBars';
import { WeeklyReviewModal } from '../../src/components/WeeklyReviewModal';
import {
  catalogueRegionsByExerciseName,
  dailyIntakeBetween,
  listLogEntriesBetween,
  finishedSessionTimes,
  getDailyStepsBetween,
  getLatestBodyMeasurements,
  type BodyMeasurementRecord,
  listAllSets,
  type DailyStepRecord,
} from '../../src/db';
import { StepBars } from '../../src/components/StepBars';
import { StepLogModal } from '../../src/components/StepLogModal';
import { calculateNeatKcal } from '../../src/health/neat';
import { calculateCoachingGoalAdjustment } from '../../src/ai/coachingAdjustment';
import {
  axisDecimals,
  displayWeight,
  formatDateLong,
  formatDayMonth,
  formatWeight,
  weightUnit,
} from '../../src/format';
import { loggingStrip } from '../../src/loggingStrip';
import { useApp } from '../../src/state/AppStore';
import { font, radius, space, useTheme, type Palette } from '../../src/theme';
import { session as loud } from '../../src/theme/sessionTheme';
import { intakeSummary, periodCoverage, trendChange } from '../../src/trendsPeriod';
import { volumeComparison } from '../../src/volume';
import { weeklyTotals, weeklyTotalsForPeriod, type SessionTimes } from '../../src/weeklyTraining';
import {
  extractWeeklyMetrics,
  requestWeeklyReview,
  type WeeklyExtractedMetrics,
  type WeeklyReviewResult,
} from '../../src/ai/weeklyReview';
import {
  extractMonthlyMetrics,
  requestMonthlyReview,
  type MonthlyExtractedMetrics,
  type MonthlyReviewResult,
} from '../../src/ai/monthlyReview';
import { notify } from '../../src/dialog';
import { thud } from '../../src/platform/haptics';
import { getEventCopy } from '../../src/copy/personality';
import { adviceOf, previousCheckIn, type SavedCheckIn } from '../../src/previousCheckIn';
import {
  CHECK_IN_WEEKS,
  checkInAppliedKey,
  checkInLockedNote,
  checkInStatus,
  checkInStorageKey,
  firstLoggedDate,
  loggedDays,
  type CheckInKind,
  type CheckInPeriod,
} from '../../src/checkInSchedule';

export type Timeframe = 'week' | 'month' | 'year';

export const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  week: 7,
  month: 30,
  year: 365,
};

type TrendTab = 'all' | 'body' | 'food' | 'workouts';

export default function TrendsScreen() {
  const { colors } = useTheme();
  const {
    localDay,
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
    energyDensity,
  } = useApp();

  const [activeTab, setActiveTab] = useState<TrendTab>('all');
  const [openDetails, setOpenDetails] = useState({ body: false, food: false, training: false });
  // A week first: it is the period people check most often, and the one a new
  // user has data for soonest.
  const [timeframe, setTimeframe] = useState<Timeframe>('week');
  // Arriving from Today's "your week is ready" opens that check-in directly.
  const { checkin } = useLocalSearchParams<{ checkin?: string }>();
  const router = useRouter();
  const [intake, setIntake] = useState<{ date: string; kcal: number; proteinG?: number }[]>([]);
  /** Everything logged over the year, so the quality card can follow the chosen period. */
  const [loggedEntries, setLoggedEntries] = useState<LogEntry[]>([]);
  const [method, setMethod] = useState(false);
  const [sets, setSets] = useState<DatedSet[]>([]);
  const [regions, setRegions] = useState<
    Record<string, { primary: MuscleRegion; secondary: MuscleRegion[] }>
  >({});
  const [sessionTimes, setSessionTimes] = useState<SessionTimes[]>([]);

  // Coaching review state (weekly)
  const [coachingModalOpen, setCoachingModalOpen] = useState(false);
  // A past check-in opened from the history list. While set, the modal and
  // the metrics behind it are about that period instead of the latest one.
  const [pastPeriod, setPastPeriod] = useState<CheckInPeriod | null>(null);
  const [history, setHistory] = useState<SavedCheckIn[]>([]);
  /** For the coach: the waist and body fat around a check-in, as context. */
  const [bodyRows, setBodyRows] = useState<BodyMeasurementRecord[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    if (checkin !== 'weekly' && checkin !== 'monthly' && checkin !== 'quarterly') return;
    setTimeframe(checkin === 'weekly' ? 'week' : checkin === 'monthly' ? 'month' : 'year');
    setCoachingModalOpen(true);
    // Cleared so coming back to the tab later does not reopen it.
    router.setParams({ checkin: undefined });
  }, [checkin, router]);
  const [coachingReview, setCoachingReview] = useState<WeeklyReviewResult | null>(null);
  const [coachingLoading, setCoachingLoading] = useState(false);
  const [coachingError, setCoachingError] = useState<string | null>(null);
  const [coachingApplied, setCoachingApplied] = useState(false);

  // Coaching review state (monthly)
  const [monthlyReview, setMonthlyReview] = useState<MonthlyReviewResult | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyError, setMonthlyError] = useState<string | null>(null);
  const [monthlyApplied, setMonthlyApplied] = useState(false);

  // Daily Steps and Activity Sync State
  const [stepsHistory, setStepsHistory] = useState<DailyStepRecord[]>([]);
  const [stepModalOpen, setStepModalOpen] = useState(false);
  // The day the step sheet is for: today from the button, any of the last
  // seven from the bars.
  const [stepDate, setStepDate] = useState<string>(localDay);
  const [refreshing, setRefreshing] = useState(false);

  const unit = weightUnit(settings.units);
  const today = localDay;
  // Fetch up to 365 days of data so switching between Week, Month, and Year is instantaneous
  const maxHistoryFrom = addDays(today, -365);

  const fetchTrendsData = useCallback(async () => {
    try {
      const [intakeRows, allSets, byName, times, stepRows, yearEntries, measurements] = await Promise.all([
        dailyIntakeBetween(maxHistoryFrom, today),
        listAllSets(),
        catalogueRegionsByExerciseName(),
        finishedSessionTimes(maxHistoryFrom),
        getDailyStepsBetween(maxHistoryFrom, today),
        listLogEntriesBetween(maxHistoryFrom, today),
        getLatestBodyMeasurements(50),
      ]);
      setLoggedEntries(yearEntries);
      setBodyRows(measurements);
      setIntake(intakeRows);
      setSets(allSets);
      setRegions(byName);
      setSessionTimes(times);
      setStepsHistory(stepRows);
    } catch {
      // Graceful fallback
    }
  }, [maxHistoryFrom, today]);

  useFocusEffect(
    useCallback(() => {
      let current = true;
      void fetchTrendsData().then(() => {
        if (!current) return;
      });
      return () => {
        current = false;
      };
    }, [fetchTrendsData]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    thud('light');
    try {
      await fetchTrendsData();
    } finally {
      setRefreshing(false);
    }
  }, [fetchTrendsData]);

  // Windows
  const windowDays = TIMEFRAME_DAYS[timeframe];
  const timeframeFrom = addDays(today, -(windowDays - 1));
  const weekFrom = addDays(today, -6);

  // The quality card read Today's diary, so on a day with nothing logged yet
  // every vitamin said 0 whatever the week held. It is the period's average
  // logged day now, like every other number on this screen.
  const periodEntries = useMemo(
    () => loggedEntries.filter((entry) => entry.date >= timeframeFrom && entry.date <= today),
    [loggedEntries, timeframeFrom, today],
  );
  const periodAverage = useMemo(() => averageLoggedDay(periodEntries), [periodEntries]);
  const monthFrom = addDays(today, -27); // 4 full 7-day weeks = 28 days

  const timeframeSteps = useMemo(() => {
    return stepsHistory.filter((s) => s.date >= timeframeFrom && s.date <= today);
  }, [stepsHistory, timeframeFrom, today]);

  const stepsByDate = useMemo(
    () => new Map(stepsHistory.map((s) => [s.date, s.steps] as const)),
    [stepsHistory],
  );

  const stepsSummary = useMemo(() => {
    const totalSteps = timeframeSteps.reduce((acc, s) => acc + s.steps, 0);
    const count = timeframeSteps.length;
    const avgSteps = count > 0 ? Math.round(totalSteps / count) : 0;
    const totalNeatKcal = timeframeSteps.reduce(
      (acc, s) => acc + (s.activeKcal ?? calculateNeatKcal(s.steps, latest?.trendWeightKg ?? 75)),
      0,
    );
    const avgNeatKcal = count > 0 ? Math.round(totalNeatKcal / count) : 0;
    const totalDistanceKm = timeframeSteps.reduce((acc, s) => acc + (s.distanceKm ?? 0), 0);
    return {
      totalSteps,
      avgSteps,
      totalNeatKcal,
      avgNeatKcal,
      totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
      daysLogged: count,
    };
  }, [timeframeSteps, latest?.trendWeightKg]);

  const bodyweightByDate = useMemo(
    () => bodyweightForDates(series, sets.map((s) => s.date), { extend: true }),
    [series, sets],
  );

  const summaryPeriod: PeriodSummary = useMemo(
    () => summarisePeriod(sets, bodyweightByDate, timeframeFrom, today),
    [sets, bodyweightByDate, timeframeFrom, today],
  );

  const diagnosticsPeriod: VolumeDiagnostics = useMemo(
    () =>
      computeVolumeDiagnostics({
        sets,
        exerciseRegions: regions,
        from: timeframeFrom,
        to: today,
        periodDays: windowDays,
      }),
    [sets, regions, timeframeFrom, today, windowDays],
  );

  const weeks = useMemo(
    () => weeklyTotals(sessionTimes, sets, today, 12, settings.checkInWeekEndsOn),
    [sessionTimes, sets, today, settings.checkInWeekEndsOn],
  );
  const chartWeeks = useMemo(
    () => weeklyTotalsForPeriod(sessionTimes, sets, timeframeFrom, today, settings.checkInWeekEndsOn),
    [sessionTimes, sets, timeframeFrom, today, settings.checkInWeekEndsOn],
  );
  const anyWeekTrained = weeks.some((week) => week.sets > 0 || week.minutes > 0);

  // Volume-weighted muscle coverage: weights regions by actual completed working sets in the selected timeframe
  const coverage = useMemo(() => {
    const counts = new Map<MuscleRegion, number>();
    let totalSetsInWindow = 0;
    let cataloguedSetsInWindow = 0;

    for (const s of sets) {
      if (s.date < timeframeFrom || s.date > today) continue;
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
  }, [sets, regions, timeframeFrom, today]);

  // Which finished periods have earned a check-in (see checkInSchedule). A
  // check-in is always about a finished week, month or quarter, so it no longer
  // moves under the person each day or each time a meal is logged.
  const logged = useMemo(() => loggedDays(observations, dayStatus), [observations, dayStatus]);
  const weekEndsOn = settings.checkInWeekEndsOn;
  const firstLogged = useMemo(() => firstLoggedDate(observations), [observations]);
  const firstPeriodData = useMemo(() => {
    const dates = [
      firstLogged,
      ...intake.map((row) => row.date),
      ...sets.map((item) => item.date),
      ...sessionTimes.map((item) => item.date),
      ...stepsHistory.map((item) => item.date),
    ].filter((date): date is string => date !== null && date <= today);
    return dates.length === 0 ? null : dates.reduce((earliest, date) => date < earliest ? date : earliest);
  }, [firstLogged, intake, sets, sessionTimes, stepsHistory, today]);
  const weeklyStatus = useMemo(
    () => checkInStatus('weekly', firstLogged, today, logged, weekEndsOn),
    [firstLogged, today, logged, weekEndsOn],
  );
  // The month and year views share the longer review: four weeks, or thirteen
  // for a quarter. A full year is too long to wait for a first one.
  const longKind: CheckInKind =
    pastPeriod && pastPeriod.kind !== 'weekly' ? pastPeriod.kind : timeframe === 'year' ? 'quarterly' : 'monthly';
  const longStatus = useMemo(
    () => checkInStatus(longKind, firstLogged, today, logged, weekEndsOn),
    [longKind, firstLogged, today, logged, weekEndsOn],
  );
  // The period each review is about: the last finished one. Before any has
  // finished it is the one in progress, which cannot be reviewed yet.
  const weeklyPeriod =
    pastPeriod?.kind === 'weekly' ? pastPeriod : (weeklyStatus?.last?.period ?? weeklyStatus?.current.period ?? null);
  // The check-in before the week in question: shown when this one is not
  // earned, and given to the coach so it follows up on what it said last.
  const previousWeekly = useMemo(
    () => (weeklyPeriod ? previousCheckIn(history, 'weekly', weeklyPeriod.from) : null),
    [history, weeklyPeriod],
  );
  const longPeriod =
    pastPeriod && pastPeriod.kind !== 'weekly'
      ? pastPeriod
      : (longStatus?.last?.period ?? longStatus?.current.period ?? null);
  const NOTHING_YET = 'Log a weigh-in and your food to start earning check-ins.';
  // A past check-in was earned by definition: it has a saved review.
  const weeklyLockedNote = pastPeriod ? null : weeklyStatus ? checkInLockedNote(weeklyStatus) : NOTHING_YET;
  const longLockedNote = pastPeriod ? null : longStatus ? checkInLockedNote(longStatus) : NOTHING_YET;

  // Every saved check-in, newest first, for the history list. Re-read whenever
  // a review is written so a new one appears without leaving the tab.
  useEffect(() => {
    let alive = true;
    const KEY = /^ascend_checkin_(weekly|monthly|quarterly)_(\d{4}-\d{2}-\d{2})$/;
    void (async () => {
      const keys = (await AsyncStorage.getAllKeys()).filter((k) => KEY.test(k));
      const rows = await AsyncStorage.multiGet(keys);
      const appliedRows = new Map(
        await AsyncStorage.multiGet(keys.map((k) => k.replace('ascend_checkin_', 'ascend_checkin_applied_'))),
      );
      const items = rows.flatMap(([key, value]): SavedCheckIn[] => {
        const match = KEY.exec(key);
        if (!match || !value) return [];
        const kind = match[1] as CheckInKind;
        const from = match[2];
        const period = { kind, from, to: addDays(from, CHECK_IN_WEEKS[kind] * 7 - 1) };
        const review =
          (JSON.parse(value) as {
            review?: { headline?: string; suggestedAdjustment?: { hasAdjustment: boolean; title: string } };
          }).review ?? {};
        return [
          {
            period,
            headline: review.headline ?? '',
            advice: adviceOf(review),
            applied: appliedRows.get(checkInAppliedKey(period)) != null,
          },
        ];
      });
      items.sort((a, b) => (a.period.to === b.period.to ? 0 : a.period.to < b.period.to ? 1 : -1));
      if (alive) setHistory(items);
    })().catch(() => {
      if (alive) setHistory([]);
    });
    return () => {
      alive = false;
    };
  }, [coachingReview, monthlyReview]);

  const weeklyCheckInDiagnostics: VolumeDiagnostics = useMemo(
    () =>
      computeVolumeDiagnostics({
        sets,
        exerciseRegions: regions,
        from: weeklyPeriod?.from ?? weekFrom,
        to: weeklyPeriod?.to ?? today,
        periodDays: 7,
      }),
    [sets, regions, weeklyPeriod?.from, weeklyPeriod?.to, weekFrom, today],
  );
  const longCheckInDiagnostics: VolumeDiagnostics = useMemo(
    () =>
      computeVolumeDiagnostics({
        sets,
        exerciseRegions: regions,
        from: longPeriod?.from ?? monthFrom,
        to: longPeriod?.to ?? today,
        periodDays: CHECK_IN_WEEKS[longKind] * 7,
      }),
    [sets, regions, longPeriod?.from, longPeriod?.to, monthFrom, today, longKind],
  );

  // Deterministic coaching review metrics (weekly)
  const coachingMetrics: WeeklyExtractedMetrics = useMemo(
    () =>
      extractWeeklyMetrics({
        series,
        observations,
        intake,
        sets,
        diagnostics: weeklyCheckInDiagnostics.totalWorkingSets > 0 ? weeklyCheckInDiagnostics : null,
        goalDirection: settings.goal?.direction,
        targetKcal: program?.calories?.kcal,
        targetProteinG: program?.macros?.proteinG,
        units: settings.units,
        endDate: weeklyPeriod?.to ?? today,
        steps: stepsHistory,
        bodyMeasurements: bodyRows,
        previous: previousWeekly
          ? {
              from: previousWeekly.period.from,
              to: previousWeekly.period.to,
              headline: previousWeekly.headline,
              advice: previousWeekly.advice,
              applied: previousWeekly.applied,
            }
          : null,
      }),
    [
      series,
      observations,
      intake,
      sets,
      weeklyCheckInDiagnostics,
      weeklyPeriod?.to,
      stepsHistory,
      bodyRows,
      previousWeekly,
      today,
      settings.goal?.direction,
      program?.calories?.kcal,
      program?.macros?.proteinG,
      settings.units,
    ],
  );

  // Deterministic coaching review metrics (monthly, 4-week adherence breakdown)
  const monthlyMetrics: MonthlyExtractedMetrics = useMemo(
    () =>
      extractMonthlyMetrics({
        series,
        observations,
        intake,
        sets,
        diagnostics: longCheckInDiagnostics.totalWorkingSets > 0 ? longCheckInDiagnostics : null,
        goal: settings.goal,
        targetKcal: program?.calories?.kcal,
        targetProteinG: program?.macros?.proteinG,
        units: settings.units,
        endDate: longPeriod?.to ?? today,
        weeks: CHECK_IN_WEEKS[longKind],
      }),
    [
      series,
      observations,
      intake,
      sets,
      longCheckInDiagnostics,
      longPeriod?.to,
      longKind,
      settings.goal,
      program?.calories?.kcal,
      program?.macros?.proteinG,
      settings.units,
      today,
    ],
  );

  // One saved review per period, under that period's own key. It is never
  // thrown away by later logging: it is a record of how that period went.
  const coachingCacheKey = weeklyPeriod ? checkInStorageKey(weeklyPeriod) : null;
  const coachingAppliedKey = weeklyPeriod ? checkInAppliedKey(weeklyPeriod) : null;
  const monthlyCacheKey = longPeriod ? checkInStorageKey(longPeriod) : null;
  const monthlyAppliedKey = longPeriod ? checkInAppliedKey(longPeriod) : null;

  useEffect(() => {
    let alive = true;
    if (!coachingCacheKey || !coachingAppliedKey) {
      setCoachingReview(null);
      setCoachingApplied(false);
      return;
    }
    void Promise.all([AsyncStorage.getItem(coachingCacheKey), AsyncStorage.getItem(coachingAppliedKey)])
      .then(([saved, applied]) => {
        if (!alive) return;
        setCoachingReview(saved ? (JSON.parse(saved) as { review: WeeklyReviewResult }).review : null);
        setCoachingApplied(Boolean(applied));
      })
      .catch(() => {
        if (alive) setCoachingReview(null);
      });
    return () => {
      alive = false;
    };
  }, [coachingCacheKey, coachingAppliedKey]);

  useEffect(() => {
    let alive = true;
    if (!monthlyCacheKey || !monthlyAppliedKey) {
      setMonthlyReview(null);
      setMonthlyApplied(false);
      return;
    }
    void Promise.all([AsyncStorage.getItem(monthlyCacheKey), AsyncStorage.getItem(monthlyAppliedKey)])
      .then(([saved, applied]) => {
        if (!alive) return;
        setMonthlyReview(saved ? (JSON.parse(saved) as { review: MonthlyReviewResult }).review : null);
        setMonthlyApplied(Boolean(applied));
      })
      .catch(() => {
        if (alive) setMonthlyReview(null);
      });
    return () => {
      alive = false;
    };
  }, [monthlyCacheKey, monthlyAppliedKey]);

  const handleGenerateCoaching = useCallback(async () => {
    if (weeklyLockedNote || !coachingCacheKey) return;
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
      await AsyncStorage.setItem(coachingCacheKey, JSON.stringify({ review: result, savedAt: Date.now() }));
      thud('heavy');
      notify('Review ready', 'Your weekly coaching review is ready.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate coaching review';
      setCoachingError(msg);
      notify('Coaching Review', msg);
    } finally {
      setCoachingLoading(false);
    }
  }, [coachingMetrics, settings.goal?.direction, settings.personality, coachingCacheKey, weeklyLockedNote]);

  const handleGenerateMonthlyCoaching = useCallback(async () => {
    if (longLockedNote || !monthlyCacheKey) return;
    setMonthlyLoading(true);
    setMonthlyError(null);
    try {
      thud('light');
      const result = await requestMonthlyReview(
        monthlyMetrics,
        '',
        settings.goal,
        settings.personality,
      );
      setMonthlyReview(result);
      setMonthlyApplied(false);
      await AsyncStorage.setItem(monthlyCacheKey, JSON.stringify({ review: result, savedAt: Date.now() }));
      thud('heavy');
      notify(
        longKind === 'quarterly' ? 'Quarterly review ready' : 'Monthly review ready',
        `Your ${CHECK_IN_WEEKS[longKind]}-week review is ready.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate monthly review';
      setMonthlyError(msg);
      notify('Monthly Review', msg);
    } finally {
      setMonthlyLoading(false);
    }
  }, [monthlyMetrics, settings.goal, settings.personality, monthlyCacheKey, longLockedNote, longKind]);

  const handleApplyCoachingAdjustment = useCallback(async () => {
    if (!coachingReview?.suggestedAdjustment?.hasAdjustment || coachingApplied || !coachingAppliedKey) return;
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

  const handleApplyMonthlyAdjustment = useCallback(async () => {
    if (!monthlyReview?.suggestedAdjustment?.hasAdjustment || monthlyApplied || !monthlyAppliedKey) return;
    thud('heavy');
    const adj = monthlyReview.suggestedAdjustment;
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

      await AsyncStorage.setItem(
        monthlyAppliedKey,
        JSON.stringify({
          appliedAt: Date.now(),
          deltaKcal: adj.deltaKcal,
          previousKcal: result.currentKcal,
          newKcal: result.achievableKcal,
          proposedGoal: result.proposedGoal,
        }),
      );
      setMonthlyApplied(true);
      notify(
        'Monthly Adjustment Applied',
        `Goal updated to ${result.rateChangeDescription} (${Math.round(result.achievableKcal)} kcal/day)`,
      );
    }
  }, [monthlyReview, monthlyApplied, program, settings.goal, latest?.expenditureKcal, updateSettings, monthlyAppliedKey]);

  // Dynamic timeframe-sliced charts calculations
  const window = useMemo(
    () => series.filter((point) => point.date >= timeframeFrom && point.date <= today),
    [series, timeframeFrom, today],
  );
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
        .filter((row) => row.date >= timeframeFrom && row.date <= today && dayStatus.get(row.date) !== false)
        .map((row) => ({ x: diffDays(origin, row.date), y: row.kcal })),
      leftOut: intake
        .filter((row) => row.date >= timeframeFrom && row.date <= today && dayStatus.get(row.date) === false)
        .map((row) => ({ x: diffDays(origin, row.date), y: row.kcal })),
    };
  }, [window, origin, intake, dayStatus, timeframeFrom, today]);

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

  const timeframeLabel =
    timeframe === 'week' ? 'past 7 days' : timeframe === 'month' ? 'past 30 days' : 'past year';
  const comparison = volumeComparison(summaryPeriod.volumeKg);

  // The overview tiles and the coverage line follow the selected period.
  const dataCoverage = useMemo(
    () => periodCoverage(windowDays, today, firstPeriodData),
    [windowDays, today, firstPeriodData],
  );
  const periodChange = useMemo(() => trendChange(series, dataCoverage.from), [series, dataCoverage.from]);
  const periodIntake = useMemo(
    () => intakeSummary(intake, dayStatus, dataCoverage.from, today, program?.calories?.kcal ?? null),
    [intake, dayStatus, dataCoverage.from, today, program?.calories?.kcal],
  );
  const periodWeightCount = weights.filter((row) => row.date >= timeframeFrom && row.date <= today).length;
  const hasPeriodTraining = summaryPeriod.sessions > 0 || summaryPeriod.workingSets > 0;
  const hasPeriodFood = periodIntake.countedDays > 0;
  const hasPeriodWeight = periodWeightCount > 0;
  const periodHeadline = !hasPeriodFood && !hasPeriodWeight && !hasPeriodTraining
    ? 'Log food, weight, or a workout to start your trends.'
    : hasPeriodFood && !hasPeriodWeight && !hasPeriodTraining
      ? `Food logged on ${periodIntake.countedDays} counted day${periodIntake.countedDays === 1 ? '' : 's'}.`
      : hasPeriodTraining
        ? `${summaryPeriod.sessions} workout${summaryPeriod.sessions === 1 ? '' : 's'} · ${summaryPeriod.records} new best${summaryPeriod.records === 1 ? '' : 's'}`
        : hasPeriodWeight
          ? 'Weight trend recorded.'
          : `Food logged on ${periodIntake.countedDays} counted day${periodIntake.countedDays === 1 ? '' : 's'}.`;
  const periodHeadlineNote = !hasPeriodFood && !hasPeriodWeight && !hasPeriodTraining
    ? 'A weigh-in, food log, or workout will give you a useful starting point.'
    : hasPeriodFood && !hasPeriodWeight && !hasPeriodTraining
      ? 'Add a weigh-in or workout to broaden your trends.'
      : 'See what changed. Keep the bigger picture in view.';
  const periodRangeLabel = dataCoverage.dataDays === 0
    ? 'No data recorded yet'
    : `${formatDayMonth(dataCoverage.from)}${dataCoverage.from.slice(0, 4) !== today.slice(0, 4) ? ` ${dataCoverage.from.slice(0, 4)}` : ''} – ${formatDayMonth(today)}${dataCoverage.from.slice(0, 4) !== today.slice(0, 4) ? ` ${today.slice(0, 4)}` : ''}`;

  // What the check-in card says for the selected view: the weekly check-in on
  // Week, the monthly one on Month, the quarterly one on Year. Until a period
  // has earned its check-in the card shows how far along the current one is,
  // rather than a button that would write a review from a few days of data.
  const card = useMemo(() => {
    const isWeek = timeframe === 'week';
    const kind: CheckInKind = isWeek ? 'weekly' : longKind;
    const status = isWeek ? weeklyStatus : longStatus;
    const review = isWeek ? coachingReview : monthlyReview;
    const locked = isWeek ? weeklyLockedNote : longLockedNote;
    const gymrat = settings.personality === 'gymrat';
    const span = kind === 'weekly' ? 'week' : kind === 'monthly' ? 'month' : 'quarter';
    const tag =
      kind === 'weekly'
        ? getEventCopy('trends.weekly_recap_tag', { personality: settings.personality, seed: 'weekly_tag' })
        : kind === 'monthly'
          ? gymrat ? '4-WEEK RECAP 🔥' : 'MONTHLY CHECK-IN'
          : gymrat ? '13-WEEK RECAP 🏆' : 'QUARTERLY CHECK-IN';
    const last = status?.last?.period;
    const pill = review
      ? gymrat ? 'LOCKED IN 🔥' : 'READ IT'
      : locked
        ? status ? `${Math.min(status.current.food, status.current.foodNeeded)}/${status.current.foodNeeded} DAYS` : 'NOT YET'
        : gymrat ? 'TAP TO CHECK IN 🏋️' : 'READY';
    const headline = review
      ? `"${review.headline}"`
      : locked
        ? status
          ? // "6 to go" read as six more days to log; it is the days left in the period.
            `Food on ${status.current.food} of ${status.current.foodNeeded} days · ${status.current.weighIns} of ${status.current.weighInsNeeded} weigh-ins · ${status.current.daysLeftAfterToday} day${status.current.daysLeftAfterToday === 1 ? '' : 's'} left this ${span}`
          : NOTHING_YET
        : last
          ? `${formatDayMonth(last.from)} to ${formatDayMonth(last.to)} is ready to review`
          : '';
    return { noun: kind, tag, pill, headline, review, locked };
  }, [
    timeframe,
    longKind,
    weeklyStatus,
    longStatus,
    coachingReview,
    monthlyReview,
    weeklyLockedNote,
    longLockedNote,
    settings.personality,
  ]);

  return (
    <Screen
      title="Trends"
      action={
        <Tappable
          onPress={() => void handleRefresh()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Refresh trends data"
          style={styles.refreshBtn}
        >
          <Ionicons name="refresh" size={20} color={colors.textMuted} />
        </Tappable>
      }
      onRefresh={() => void handleRefresh()}
      refreshing={refreshing}
    >
      {/* The selected window drives the summary and every chart below. */}
      <View style={styles.timeframeRow}>
        <View
          style={[
            styles.timeframePillContainer,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
          {(
            [
              { key: 'week', label: 'Week' },
              { key: 'month', label: 'Month' },
              { key: 'year', label: 'Year' },
            ] as const
          ).map((tf) => {
            const active = timeframe === tf.key;
            return (
              <Tappable
                key={tf.key}
                onPress={() => {
                  thud('light');
                  setTimeframe(tf.key);
                }}
                scaleTo={0.96}
                style={[
                  styles.timeframePill,
                  active && [styles.timeframePillActive, { borderBottomColor: colors.brand.fill }],
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.timeframePillText,
                    { color: active ? colors.text : colors.textMuted },
                    active && { fontFamily: font.uiStrong },
                  ]}
                >
                  {tf.label}
                </Text>
              </Tappable>
            );
          })}
        </View>
      </View>

      <View style={styles.coverageRow}>
        <Text style={[styles.coverage, { color: colors.text }]}>
          {periodRangeLabel}
        </Text>
        <Text style={[styles.coverage, { color: colors.textMuted }]}>
          {dataCoverage.dataDays > 0 && dataCoverage.dataDays < dataCoverage.windowDays
            ? `Showing ${dataCoverage.dataDays} of ${dataCoverage.windowDays} days`
            : timeframeLabel[0].toUpperCase() + timeframeLabel.slice(1)}
        </Text>
      </View>

      <Text style={[styles.periodSummary, { color: colors.text }]}>
        {periodHeadline}
      </Text>
      <Text style={[styles.periodSummaryNote, { color: colors.textMuted }]}>
        {periodHeadlineNote}
      </Text>

      <View style={styles.atAGlanceGrid}>
        <GlanceTile
          label="WEIGHT TREND"
          value={
            periodChange
              ? `${periodChange.changeKg < 0 ? '−' : '+'}${formatWeight(Math.abs(periodChange.changeKg), settings.units)}`
              : '—'
          }
          sub={periodChange ? `over ${periodChange.days} days` : 'needs two weigh-ins'}
          colors={colors}
        />
        <GlanceTile
          label="AVG FOOD"
          value={
            periodIntake.averageKcal !== null ? (
              <>
                {Math.round(periodIntake.averageKcal).toLocaleString('en-US')}
                <Text style={[styles.glanceUnit, { color: colors.textMuted }]}> kcal</Text>
              </>
            ) : '—'
          }
          sub={periodIntake.countedDays > 0 ? `${periodIntake.countedDays} counted day${periodIntake.countedDays === 1 ? '' : 's'}` : 'no food logged'}
          colors={colors}
        />
        <GlanceTile
          label="WORKOUTS"
          value={summaryPeriod.sessions}
          sub={`${timeframeLabel} · ${summaryPeriod.sessions === 1 ? 'session' : 'sessions'}`}
          colors={colors}
        />
      </View>

      {/* Focus the chart while keeping the period summary in view. */}
      <View style={[styles.tabsContainer, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        {(
          [
            { key: 'all', label: 'Overview' },
            { key: 'body', label: 'Body' },
            { key: 'food', label: 'Food' },
            { key: 'workouts', label: 'Training' },
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
              scaleTo={0.97}
              style={[
                styles.tabItem,
                active && [styles.tabItemActive, { borderBottomColor: colors.brand.fill }],
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[styles.tabItemText, { color: active ? colors.text : colors.textMuted }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {tab.label}
              </Text>
            </Tappable>
          );
        })}
      </View>

      <FadeIn key={`${timeframe}:${activeTab}`}>
        {activeTab === 'workouts' ? (
          <Card variant="featured" icon="barbell-outline" title={`Training · ${timeframeLabel}`}>
            {summaryPeriod.sessions > 0 || summaryPeriod.workingSets > 0 ? (
              <WeeklyBars weeks={chartWeeks} units={settings.units} />
            ) : (
              <Text style={[styles.chartNote, { color: colors.textMuted }]}>No workouts logged in this period yet.</Text>
            )}
          </Card>
        ) : activeTab === 'food' ? (
          <Card variant="featured" icon="nutrition-outline" title="Food & energy">
            <View style={styles.legend}>
              <Key color={colors.positive} label="ESTIMATED TDEE" />
              <Key color={colors.carbs} label="EATEN" dotted />
              <Key color={colors.accent} label="TARGET" dashed />
            </View>
            <LineChart
              series={energy ? [{ points: energy.expenditure, color: colors.positive, strokeWidth: 2.5 }] : []}
              band={energy ? { points: energy.band, color: colors.positive } : undefined}
              scatter={energy ? [
                { points: energy.intake, color: colors.carbs, radius: 2.5, opacity: 0.8 },
                { points: energy.leftOut, color: colors.carbs, radius: 2.5, opacity: 0.25 },
              ] : undefined}
              referenceY={{ value: program.calories.kcal, color: colors.accent }}
              formatX={dayLabel}
              emptyMessage="Log weight and food for a couple of weeks"
              height={190}
            />
            <Text style={[styles.chartNote, { color: colors.textMuted }]}>Only counted food days contribute to the average.</Text>
            <Text style={[styles.chartNote, { color: colors.textMuted }]}>
              Assumes a kilo of weight change holds about{' '}
              {(Math.round(energyDensity.kcalPerKg / 50) * 50).toLocaleString('en-US')} kcal, from{' '}
              {BODY_FAT_BASIS[energyDensity.source ?? 'guess'](energyDensity.bodyFatPct.toFixed(0))}.
            </Text>
          </Card>
        ) : (
          <Card variant="featured" icon="scale-outline" title="Weight trend">
            <LineChart
              series={weight ? [{ points: weight, color: colors.textMuted, strokeWidth: 2.5 }] : []}
              includeY={settings.goalWeightKg === null ? [] : [displayWeight(settings.goalWeightKg, settings.units)]}
              referenceY={settings.goalWeightKg === null ? undefined : { value: displayWeight(settings.goalWeightKg, settings.units), color: colors.protein }}
              formatY={(value) => value.toFixed(weightDecimals)}
              formatX={dayLabel}
              emptyMessage="Weigh in for a couple of weeks"
              height={170}
            />
            <Text style={[styles.chartNote, { color: colors.textMuted }]}>
              {periodChange ? `${periodWeightCount} weigh-ins · smoothed trend` : 'Log another weigh-in to compare trend change.'}
            </Text>
          </Card>
        )}
      </FadeIn>

      <FadeIn>
        <Tappable
          onPress={() => {
            thud('light');
            setCoachingModalOpen(true);
          }}
          style={[styles.checkInAction, { backgroundColor: colors.brand.fill }]}
          accessibilityRole="button"
          accessibilityLabel={`Open the ${card.noun} check-in: ${card.pill}. ${card.headline}`}
        >
          <Ionicons name="clipboard-outline" size={18} color={colors.brand.onFill} />
          <Text style={[styles.checkInActionText, { color: colors.brand.onFill }]}>Open check-ins</Text>
        </Tappable>
        <Text style={[styles.checkInStatus, { color: colors.textMuted }]}>{card.pill}{card.headline ? ` · ${card.headline}` : ''}</Text>
      </FadeIn>

      {/* Each saved check-in remains available for the period it covers. */}
      {history.length > 0 && (
        <View style={styles.history}>
          <Tappable
            onPress={() => setHistoryOpen((open) => !open)}
            scaleTo={0.98}
            style={styles.historyToggle}
            accessibilityRole="button"
            accessibilityState={{ expanded: historyOpen }}
          >
            <Text style={[styles.historyToggleText, { color: colors.textMuted }]}>
              PAST CHECK-INS ({history.length})
            </Text>
            <Ionicons name={historyOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
          </Tappable>
          {historyOpen &&
            history.map((item) => (
              <Tappable
                key={`${item.period.kind}_${item.period.from}`}
                onPress={() => {
                  thud('light');
                  setPastPeriod(item.period);
                  setCoachingModalOpen(true);
                }}
                scaleTo={0.98}
                style={[styles.historyRow, { borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={`Open the ${item.period.kind} check-in for ${formatDayMonth(item.period.from)} to ${formatDayMonth(item.period.to)}`}
              >
                <Text style={[styles.historyPeriod, { color: colors.textMuted }]}>
                  {item.period.kind === 'weekly' ? 'WEEK' : item.period.kind === 'monthly' ? 'MONTH' : 'QUARTER'} ·{' '}
                  {formatDayMonth(item.period.from)} – {formatDayMonth(item.period.to)}
                </Text>
                <Text style={[styles.historyHeadline, { color: colors.text }]} numberOfLines={1}>
                  {item.headline}
                </Text>
              </Tappable>
            ))}
        </View>
      )}

      {activeTab === 'all' && (
        <View style={styles.disclosures}>
          <DetailDisclosure title="Food & energy" expanded={openDetails.food} onPress={() => setOpenDetails((value) => ({ ...value, food: !value.food }))} colors={colors} />
          <DetailDisclosure title="Body & weight" expanded={openDetails.body} onPress={() => setOpenDetails((value) => ({ ...value, body: !value.body }))} colors={colors} />
          <DetailDisclosure title="Training & muscles" expanded={openDetails.training} onPress={() => setOpenDetails((value) => ({ ...value, training: !value.training }))} colors={colors} />
        </View>
      )}

      {/* Detailed reports open from the overview disclosures or their focus tab. */}
      <>
        {activeTab === 'all' && openDetails.food && (
          <Card variant="featured" icon="pulse-outline" title="Energy balance & estimated expenditure">
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
            {/* The assumption the whole estimate scales with, stated rather
                than hidden: what a kilo of weight change is worth depends on
                body fat, and an estimated body fat is only a starting point. */}
            <Text style={styles.note}>
              Assumes a kilo of weight change holds about{' '}
              {(Math.round(energyDensity.kcalPerKg / 50) * 50).toLocaleString('en-US')} kcal, from{' '}
              {BODY_FAT_BASIS[energyDensity.source ?? 'guess'](energyDensity.bodyFatPct.toFixed(0))}
              .
            </Text>
          </Card>
        )}

        {(activeTab === 'body' || (activeTab === 'all' && openDetails.body)) && (
          <>
          {/* Daily steps & NEAT expenditure */}
          <Card title={settings.personality === 'gymrat' ? 'Daily steps & NEAT burn 🔥' : 'Daily steps & NEAT activity'}>
            <View style={styles.stepsCardContent}>
              <StepBars
                today={today}
                byDate={stepsByDate}
                goal={10000}
                span={timeframe}
                onPressDay={(date) => {
                  thud('light');
                  setStepDate(date);
                  setStepModalOpen(true);
                }}
              />

              {/* What the numbers are: an average of the days with a count, and
                  whether today has one. It used to call that average "daily
                  steps" and say walking fed the energy estimate, which it does not. */}
              <Text style={[styles.stepsExplainer, { color: colors.textMuted }]}>
                {stepsSummary.daysLogged > 0
                  ? `Average ${stepsSummary.avgSteps.toLocaleString()} steps on the ${stepsSummary.daysLogged} of ${dataCoverage.dataDays || windowDays} days with a count, about ${stepsSummary.avgNeatKcal} kcal of walking a day. Today: ${stepsByDate.has(today) ? `${stepsByDate.get(today)!.toLocaleString()} steps` : 'not logged'}.`
                  : 'No steps logged for this period yet.'}{' '}
                Steps are for your own record; the burn estimate comes from your weight and food.
              </Text>

              <Tappable
                onPress={() => {
                  thud('light');
                  setStepDate(today);
                  setStepModalOpen(true);
                }}
                style={[
                  styles.logStepsBtn,
                  { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
                ]}
              >
                <Ionicons name="footsteps" size={15} color={colors.accent} />
                <Text style={[styles.logStepsBtnText, { color: colors.text }]}>
                  {settings.personality === 'gymrat' ? "Log today's steps 🔥" : "Log today's steps"}
                </Text>
              </Tappable>
            </View>
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

        {(activeTab === 'food' || (activeTab === 'all' && openDetails.food)) && (
          <NutritionQualityCard
            consumed={periodAverage.nutrients}
            entries={periodEntries}
            caption={
              periodAverage.days === 0
                ? 'Nothing logged in this period yet.'
                : `Your average logged day, over ${periodAverage.days} day${periodAverage.days === 1 ? '' : 's'}.`
            }
            profile={settings.profile}
          />
        )}
      </>

      {/* PART 2: WORKOUTS & MUSCLES */}
      {(activeTab === 'workouts' || (activeTab === 'all' && openDetails.training)) && (
        <>
          <FadeIn>
            <Card loud title={`You moved (${timeframeLabel})`}>
              <View style={styles.volumeRow}>
                <CountUp
                  value={Math.round(displayWeight(summaryPeriod.volumeKg, settings.units))}
                  format={(value) => Math.round(value).toLocaleString()}
                  style={styles.volumeFigure}
                />
                <Text style={styles.volumeUnit}>{unit}</Text>
              </View>
              {comparison !== null && <Text style={styles.comparison}>{comparison}</Text>}
            </Card>
          </FadeIn>

          {(timeframe === 'month' && monthlyMetrics.training.progressions.length > 0
            ? monthlyMetrics.training.progressions
            : coachingMetrics.training.progressions
          ).length > 0 && (
            <FadeIn delay={40}>
              <Card loud title="Strength Highlights (Overload)">
                <View style={styles.progressionList}>
                  {(timeframe === 'month' && monthlyMetrics.training.progressions.length > 0
                    ? monthlyMetrics.training.progressions
                    : coachingMetrics.training.progressions
                  ).slice(0, 3).map((p) => (
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

          {diagnosticsPeriod.totalWorkingSets > 0 && (
            <FadeIn delay={60}>
              <VolumeLandmarksCard
                diagnostics={diagnosticsPeriod}
                periodDays={windowDays}
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
            <Card loud title={`What you trained (${timeframeLabel})`}>
              {coverage.primary === null ? (
                <Text style={styles.note}>
                  No catalogued exercises logged in the {timeframeLabel}.
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
              {summaryPeriod.exercises.length > 0 && (
                <Text style={styles.exercises} numberOfLines={3}>
                  {summaryPeriod.exercises.join(' · ')}
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

      {/* Weekly & Monthly Coaching Review Modal Popup */}
      <WeeklyReviewModal
        open={coachingModalOpen}
        onClose={() => {
          setCoachingModalOpen(false);
          setPastPeriod(null);
        }}
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
        monthlyReview={monthlyReview}
        monthlyMetrics={monthlyMetrics}
        monthlyLoading={monthlyLoading}
        monthlyError={monthlyError}
        monthlyApplied={monthlyApplied}
        onGenerateMonthly={handleGenerateMonthlyCoaching}
        onApplyMonthlyAdjustment={handleApplyMonthlyAdjustment}
        initialMode={
          pastPeriod ? (pastPeriod.kind === 'weekly' ? 'weekly' : 'monthly') : timeframe === 'week' ? 'weekly' : 'monthly'
        }
        units={settings.units}
        weeklyLockedNote={coachingReview ? null : weeklyLockedNote}
        monthlyLockedNote={monthlyReview ? null : longLockedNote}
        previousWeekly={previousWeekly}
        onOpenPrevious={(period) => setPastPeriod(period)}
      />

      <StepLogModal
        visible={stepModalOpen}
        onClose={() => setStepModalOpen(false)}
        date={stepDate}
        initialSteps={stepsByDate.get(stepDate) ?? 0}
        userWeightKg={latest?.trendWeightKg ?? 75}
        onSaved={() => {
          void fetchTrendsData();
        }}
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

const DetailDisclosure = ({
  title,
  expanded,
  onPress,
  colors,
}: {
  title: string;
  expanded: boolean;
  onPress: () => void;
  colors: Palette;
}) => (
  <Tappable
    onPress={onPress}
    style={[styles.disclosure, { borderBottomColor: colors.border }]}
    accessibilityRole="button"
    accessibilityState={{ expanded }}
  >
    <Text style={[styles.disclosureTitle, { color: colors.text }]}>{title}</Text>
    <Ionicons name={expanded ? 'remove' : 'add'} size={18} color={colors.textMuted} accessible={false} />
  </Tappable>
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

/**
 * Where the body fat behind the energy figure came from, in the note's words.
 * A weaker source says what would sharpen it; measurements live on the
 * Weight tab.
 */
const BODY_FAT_BASIS: Record<'entered' | 'tape' | 'photo' | 'guess', (pct: string) => string> = {
  entered: (pct) => `your logged body fat of ${pct}%`,
  tape: (pct) => `your tape-measure estimate of ${pct}% body fat`,
  photo: (pct) =>
    `your photo estimate of ${pct}% body fat. A tape measurement in body measurements, on the Weight tab, would sharpen it`,
  guess: (pct) =>
    `an estimated ${pct}% body fat. Log a body-fat figure in body measurements, on the Weight tab, to sharpen it`,
};

const styles = StyleSheet.create({
  coachingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: radius.lg,
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
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachingBannerContent: {
    flex: 1,
    gap: 2,
  },
  // Wraps, so a long label pushes the pill to the next line instead of being
  // squeezed into three.
  coachingTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  history: {
    marginBottom: space.md,
    gap: space.xs,
  },
  historyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: TOUCH_TARGET,
  },
  historyToggleText: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 1.1,
  },
  historyRow: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  historyPeriod: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 1,
  },
  historyHeadline: {
    fontFamily: font.ui,
    fontSize: 13,
  },
  coverage: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 17,
  },
  coverageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.md,
  },
  periodSummary: {
    fontFamily: font.uiStrong,
    fontSize: 17,
    marginTop: space.sm,
  },
  periodSummaryNote: {
    fontFamily: font.ui,
    fontSize: 12,
    marginTop: 2,
    marginBottom: space.md,
  },
  checkInAction: {
    minHeight: TOUCH_TARGET + 4,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.lg,
    marginBottom: space.xs,
  },
  checkInActionText: { fontFamily: font.uiStrong, fontSize: 15 },
  checkInStatus: { fontFamily: font.ui, fontSize: 11, textAlign: 'center', marginBottom: space.md },
  disclosures: { marginBottom: space.md },
  disclosure: {
    minHeight: TOUCH_TARGET,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  disclosureTitle: { fontFamily: font.uiStrong, fontSize: 13 },
  chartNote: { fontFamily: font.ui, fontSize: 11, lineHeight: 16, marginTop: space.sm },
  coachingHeadline: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 18,
  },
  coachingArrowWrap: {
    marginLeft: space.sm,
  },
  timeframeRow: {
    marginBottom: space.sm,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  timeframePillContainer: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    gap: 4,
  },
  timeframePill: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  timeframePillActive: {
    borderRadius: radius.md,
  },
  timeframePillText: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 0.5,
  },

  tabsContainer: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    marginBottom: space.md,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH_TARGET,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
  },
  tabItemActive: {
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemText: {
    fontFamily: font.uiStrong,
    fontSize: 10.5,
    letterSpacing: 0.6,
    textAlign: 'center',
  },

  atAGlanceGrid: {
    flexDirection: 'row',
    gap: space.sm,
    marginBottom: space.md,
  },
  glanceTile: {
    flex: 1,
    minWidth: 0,
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderWidth: StyleSheet.hairlineWidth,
  },
  glanceTileLabel: {
    fontFamily: font.uiStrong,
    fontSize: 9.5,
    letterSpacing: 0.3,
    marginBottom: 3,
  },
  glanceTileValue: {
    fontFamily: font.figure,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  glanceUnit: {
    fontFamily: font.ui,
    fontSize: 11,
  },
  glanceTileSub: {
    fontFamily: font.ui,
    fontSize: 10.5,
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
  refreshBtn: {
    padding: space.xs,
  },
  stepsCardContent: {
    gap: space.md,
  },
  stepsExplainer: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 18,
  },
  logStepsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  logStepsBtnText: {
    fontFamily: font.uiStrong,
    fontSize: 13,
  },
});
