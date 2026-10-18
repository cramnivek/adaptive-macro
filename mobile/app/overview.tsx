import {
  addDays,
  bodyweightForDates,
  computeVolumeDiagnostics,
  summarisePeriod,
  todayISO,
} from '@adaptive-macros/engine';
import type { DatedSet, PeriodSummary, VolumeDiagnostics } from '@adaptive-macros/engine';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../src/components/Card';
import { CountUp } from '../src/components/CountUp';
import { FadeIn } from '../src/components/FadeIn';
import { MuscleFigure } from '../src/components/MuscleFigure';
import { REGION_LABELS } from '../src/components/muscleMap';
import type { MuscleRegion } from '../src/components/muscleMap';
import { Screen } from '../src/components/Screen';
import { TOUCH_TARGET } from '../src/components/Controls';
import { Tappable } from '../src/components/Tappable';
import { VolumeLandmarksCard } from '../src/components/VolumeLandmarksCard';
import { WeeklyReviewCard } from '../src/components/WeeklyReviewCard';
import { WeeklyReviewModal } from '../src/components/WeeklyReviewModal';
import { WeeklyBars } from '../src/components/WeeklyBars';
import { BodyMeasurementsCard } from '../src/components/BodyMeasurementsCard';
import {
  extractWeeklyMetrics,
  requestWeeklyReview,
  type WeeklyExtractedMetrics,
  type WeeklyReviewResult,
} from '../src/ai/weeklyReview';
import { calculateCoachingGoalAdjustment } from '../src/ai/coachingAdjustment';
import { notify } from '../src/dialog';
import { thud } from '../src/platform/haptics';
import {
  catalogueRegionsByExerciseName,
  finishedSessionTimes,
  listAllSets,
  listLoggedDates,
} from '../src/db';
import { displayWeight, weightUnit } from '../src/format';
import { useApp } from '../src/state/AppStore';
import { font, radius, space } from '../src/theme';
import { session as loud } from '../src/theme/sessionTheme';
import { volumeComparison } from '../src/volume';
import { weeklyTotals } from '../src/weeklyTraining';
import type { SessionTimes } from '../src/weeklyTraining';

/**
 * Rolling windows rather than calendar ones.
 *
 * A calendar week is empty every Monday morning, which is the worst possible
 * time to show someone a summary of their training. The last seven days always
 * has something in it, and "this week" is what people mean by it anyway.
 */
const PERIODS = [
  { days: 7, label: 'LAST 7 DAYS', title: 'This week' },
  { days: 30, label: 'LAST 30 DAYS', title: 'This month' },
] as const;

/**
 * What the training actually came to.
 *
 * The figures here are the ones already in the data — sets, volume, records,
 * which muscles got worked — rather than a score invented on top of them. A
 * number that goes up because you opened the app is one people see through;
 * these go up only when you train, which is the only reason they are worth
 * looking at.
 */
export default function OverviewScreen() {
  const { series, settings, latest, program, updateSettings, observations } = useApp();
  const unit = weightUnit(settings.units);

  const [periodIndex, setPeriodIndex] = useState(0);
  const [sets, setSets] = useState<DatedSet[]>([]);
  const [regions, setRegions] = useState<
    Record<string, { primary: MuscleRegion; secondary: MuscleRegion[] }>
  >({});
  const [loggedDates, setLoggedDates] = useState<string[]>([]);
  const [sessionTimes, setSessionTimes] = useState<SessionTimes[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let current = true;
      void (async () => {
        const [allSets, byName, dates, times] = await Promise.all([
          listAllSets(),
          catalogueRegionsByExerciseName(),
          // Enough to cover the longest window with room to spare.
          listLoggedDates(60),
          // Twelve weeks is at most 84 days back from the Monday of this one.
          finishedSessionTimes(addDays(todayISO(), -84)),
        ]);
        if (!current) return;
        setSets(allSets);
        setRegions(byName);
        setLoggedDates(dates);
        setSessionTimes(times);
        setLoading(false);
      })();
      return () => {
        current = false;
      };
    }, []),
  );

  const period = PERIODS[periodIndex] ?? PERIODS[0];
  const to = todayISO();
  const from = addDays(to, -(period.days - 1));

  const bodyweightByDate = useMemo(
    () => bodyweightForDates(series, sets.map((s) => s.date), { extend: true }),
    [series, sets],
  );

  const summary: PeriodSummary = useMemo(
    () => summarisePeriod(sets, bodyweightByDate, from, to),
    [sets, bodyweightByDate, from, to],
  );

  /**
   * Which regions the period touched, and which one it touched most.
   *
   * The figure takes a single primary and a list of secondaries, so the
   * most-trained region is lit solid and everything else is shaded — the same
   * reading as the how-to sheet, applied to a month instead of a movement.
   */
  const coverage = useMemo(() => {
    const counts = new Map<MuscleRegion, number>();
    for (const name of summary.exercises) {
      const entry = regions[name];
      if (entry === undefined) continue;
      counts.set(entry.primary, (counts.get(entry.primary) ?? 0) + 2);
      for (const region of entry.secondary) {
        counts.set(region, (counts.get(region) ?? 0) + 1);
      }
    }
    const ranked = [...counts.entries()].sort(([, a], [, b]) => b - a).map(([region]) => region);
    return { primary: ranked[0] ?? null, secondary: ranked.slice(1) };
  }, [summary.exercises, regions]);

  const diagnostics: VolumeDiagnostics = useMemo(
    () =>
      computeVolumeDiagnostics({
        sets,
        exerciseRegions: regions,
        from,
        to,
        periodDays: period.days,
      }),
    [sets, regions, from, to, period.days],
  );

  const [coachingModalOpen, setCoachingModalOpen] = useState(false);
  const [coachingReview, setCoachingReview] = useState<WeeklyReviewResult | null>(null);
  const [coachingLoading, setCoachingLoading] = useState(false);
  const [coachingError, setCoachingError] = useState<string | null>(null);
  const [coachingApplied, setCoachingApplied] = useState(false);

  const coachingMetrics: WeeklyExtractedMetrics = useMemo(
    () =>
      extractWeeklyMetrics({
        series,
        observations,
        sets,
        diagnostics: diagnostics.totalWorkingSets > 0 ? diagnostics : null,
        goalDirection: settings.goal?.direction,
        targetKcal: program?.calories?.kcal,
        targetProteinG: program?.macros?.proteinG,
        units: settings.units,
      }),
    [
      series,
      observations,
      sets,
      diagnostics,
      settings.goal?.direction,
      program?.calories?.kcal,
      program?.macros?.proteinG,
      settings.units,
    ],
  );

  const coachingFingerprint = `${coachingMetrics.period.to}_${sets.length}_${observations.length}_${program?.calories?.kcal ?? 0}`;
  const coachingCacheKey = `ascend_weekly_review_${coachingMetrics.period.to}`;

  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(coachingCacheKey).then((saved) => {
      if (alive && saved) {
        try {
          const parsed = JSON.parse(saved) as
            | { review: WeeklyReviewResult; fingerprint: string }
            | WeeklyReviewResult;
          if (parsed && 'fingerprint' in parsed && parsed.fingerprint) {
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
    });
    return () => {
      alive = false;
    };
  }, [coachingCacheKey, coachingFingerprint]);

  const handleGenerateCoaching = useCallback(async () => {
    setCoachingLoading(true);
    setCoachingError(null);
    try {
      thud('light');
      const result = await requestWeeklyReview(coachingMetrics, '', settings.goal?.direction);
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
  }, [coachingMetrics, settings.goal?.direction, coachingCacheKey, coachingFingerprint]);

  const handleApplyCoachingAdjustment = useCallback(async () => {
    if (!coachingReview?.suggestedAdjustment?.hasAdjustment || coachingApplied) return;
    thud('heavy');
    setCoachingApplied(true);
    const adj = coachingReview.suggestedAdjustment;
    if (adj.deltaKcal && program?.calories?.kcal && settings.goal) {
      const exp = latest?.expenditureKcal ?? program?.expenditureKcal ?? 2200;
      const result = calculateCoachingGoalAdjustment({
        currentGoal: settings.goal,
        expenditureKcal: exp,
        deltaKcal: adj.deltaKcal,
      });
      await updateSettings({
        goal: result.proposedGoal,
      });
      notify(
        'Adjustment Applied',
        `Goal updated to ${result.rateChangeDescription} (${Math.round(result.achievableKcal)} kcal/day)`,
      );
    }
  }, [coachingReview, coachingApplied, program, settings.goal, latest?.expenditureKcal, updateSettings]);

  const weeks = useMemo(() => weeklyTotals(sessionTimes, sets, to), [sessionTimes, sets, to]);
  // Older weeks can have training in them when this window is empty, and that
  // is when seeing the trend matters most.
  const anyWeekTrained = weeks.some((week) => week.sets > 0 || week.minutes > 0);

  const daysLogged = loggedDates.filter((date) => date >= from && date <= to).length;

  const weightChange = useMemo(() => {
    const lookup = bodyweightForDates(series, [from, to], { extend: true });
    const start = lookup.get(from);
    const end = lookup.get(to);
    if (start === undefined || end === undefined) return null;
    return displayWeight(end, settings.units) - displayWeight(start, settings.units);
  }, [series, from, to, settings.units]);

  if (loading) {
    return (
      <Screen tone="loud">
        <ActivityIndicator color={loud.loud} />
      </Screen>
    );
  }

  const comparison = volumeComparison(summary.volumeKg);

  return (
    <Screen title={period.title} tone="loud">
      <View style={styles.switcher}>
        {PERIODS.map((option, index) => {
          const active = index === periodIndex;
          return (
            <Tappable
              key={option.days}
              onPress={() => setPeriodIndex(index)}
              scaleTo={0.97}
              style={[styles.switchItem, active && styles.switchItemActive]}
              accessibilityLabel={`Show the ${option.label.toLowerCase()}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[styles.switchLabel, { color: active ? loud.onLoud : loud.figureMuted }]}
              >
                {option.label}
              </Text>
            </Tappable>
          );
        })}
      </View>

      {/* Prominent High-Visibility Coaching Banner */}
      <FadeIn>
        <Tappable
          onPress={() => {
            thud('light');
            setCoachingModalOpen(true);
          }}
          style={styles.coachingBanner}
          accessibilityRole="button"
          accessibilityLabel="Open Weekly Coach Review"
        >
          <View style={styles.coachingBannerLeft}>
            <View style={styles.coachingIconCircle}>
              <Ionicons name="sparkles" size={18} color="#00E5FF" />
            </View>
            <View style={styles.coachingBannerContent}>
              <View style={styles.coachingTagRow}>
                <Text style={styles.coachingTag}>WEEKLY COACH</Text>
                <View
                  style={[
                    styles.readyPill,
                    coachingReview ? styles.readyPillActive : styles.readyPillPending,
                  ]}
                >
                  <Text
                    style={[
                      styles.readyPillText,
                      coachingReview ? styles.readyTextActive : styles.readyTextPending,
                    ]}
                  >
                    {coachingReview ? 'REVIEW READY' : 'TAP TO CHECK IN'}
                  </Text>
                </View>
              </View>
              <Text style={styles.coachingHeadline} numberOfLines={1}>
                {coachingReview ? `"${coachingReview.headline}"` : 'See what your workouts & nutrition achieved this week'}
              </Text>
            </View>
          </View>
          <View style={styles.coachingArrowWrap}>
            <Ionicons name="chevron-forward" size={18} color="#00E5FF" />
          </View>
        </Tappable>
      </FadeIn>

      {summary.sessions === 0 ? (
        <Card loud title="Nothing yet">
          <Text style={styles.note}>
            No sets logged in this window. Train once and this fills up.
          </Text>
        </Card>
      ) : (
        <>
          <FadeIn>
            <Card loud title="You moved">
              <View style={styles.volumeRow}>
                <CountUp
                  value={Math.round(displayWeight(summary.volumeKg, settings.units))}
                  format={(value) => Math.round(value).toLocaleString()}
                  style={styles.volumeFigure}
                />
                <Text style={styles.volumeUnit}>{unit}</Text>
              </View>
              {comparison !== null && <Text style={styles.comparison}>{comparison}</Text>}
            </Card>
          </FadeIn>

          <FadeIn delay={60}>
            <Card loud title="What you did">
              <View style={styles.stats}>
                <Stat label="SESSIONS" value={summary.sessions} />
                <Stat label="WORKING SETS" value={summary.workingSets} />
                <Stat label="RECORDS" value={summary.records} accent={summary.records > 0} />
              </View>
              {summary.records > 0 && (
                <Text style={styles.note}>
                  {summary.records === 1
                    ? 'One lift went heavier than it ever has.'
                    : `${summary.records} lifts went heavier than they ever have.`}
                </Text>
              )}
            </Card>
          </FadeIn>

          <FadeIn delay={120}>
            <Card loud title="What you trained">
              {coverage.primary === null ? (
                <Text style={styles.note}>
                  None of these exercises are catalogued yet, so there is nothing to map. Settings
                  can build the catalogue from your history.
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
                  <View style={styles.legend}>
                    <Text style={styles.legendPrimary}>{REGION_LABELS[coverage.primary]}</Text>
                    {coverage.secondary.length > 0 && (
                      <Text style={styles.legendSecondary}>
                        also{' '}
                        {coverage.secondary
                          .slice(0, 5)
                          .map((region) => REGION_LABELS[region].toLowerCase())
                          .join(', ')}
                      </Text>
                    )}
                  </View>
                </View>
              )}
              <Text style={styles.exercises} numberOfLines={3}>
                {summary.exercises.join(' · ')}
              </Text>
            </Card>
          </FadeIn>

          {/* Weekly AI Coaching Review */}
          <FadeIn delay={130}>
            <WeeklyReviewCard
              series={series}
              observations={observations}
              sets={sets}
              diagnostics={diagnostics.totalWorkingSets > 0 ? diagnostics : null}
              goalDirection={settings.goal?.direction}
              targetKcal={program?.calories?.kcal}
              targetProteinG={program?.macros?.proteinG}
              units={settings.units}
              onOpenModal={() => setCoachingModalOpen(true)}
              onApplyAdjustment={async (adj) => {
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
                  notify(
                    'Adjustment Applied',
                    `Goal updated to ${result.rateChangeDescription} (${Math.round(result.achievableKcal)} kcal/day)`,
                  );
                }
              }}
            />
          </FadeIn>

          {diagnostics.totalWorkingSets > 0 && (
            <FadeIn delay={150}>
              <VolumeLandmarksCard
                diagnostics={diagnostics}
                periodDays={period.days}
                goal={settings.goal?.direction}
                targetKcalDelta={
                  latest?.expenditureKcal != null && program?.calories?.kcal != null
                    ? Math.round(program.calories.kcal - latest.expenditureKcal)
                    : undefined
                }
              />
            </FadeIn>
          )}
        </>
      )}

      <FadeIn delay={180}>
        <Card loud title="Alongside">
          <View style={styles.stats}>
            <Stat label="DAYS LOGGED" value={daysLogged} suffix={` of ${period.days}`} />
            {weightChange !== null && (
              <Stat
                label="WEIGHT"
                value={Number(weightChange.toFixed(1))}
                suffix={` ${unit}`}
                signed
              />
            )}
          </View>
        </Card>
      </FadeIn>

      {anyWeekTrained && (
        <FadeIn delay={240}>
          <Card loud title="Week by week">
            <WeeklyBars weeks={weeks} units={settings.units} />
          </Card>
        </FadeIn>
      )}

      <FadeIn delay={280}>
        <BodyMeasurementsCard units={settings.units} />
      </FadeIn>

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
        expenditureKcal={latest?.expenditureKcal ?? program?.expenditureKcal}
      />
    </Screen>
  );
}

interface StatProps {
  label: string;
  value: number;
  suffix?: string;
  accent?: boolean;
  /** Prints a leading + for a gain, so a direction reads without a chart. */
  signed?: boolean;
}

const Stat = ({ label, value, suffix, accent = false, signed = false }: StatProps) => (
  <View style={styles.stat}>
    <Text style={styles.statLabel}>{label}</Text>
    <View style={styles.statValueRow}>
      <CountUp
        value={value}
        format={(current) =>
          signed
            ? `${current > 0 ? '+' : ''}${current.toFixed(1)}`
            : String(Math.round(current))
        }
        style={[styles.statValue, accent && { color: loud.loud }]}
      />
      {suffix !== undefined && <Text style={styles.statSuffix}>{suffix}</Text>}
    </View>
  </View>
);

const styles = StyleSheet.create({
  switcher: {
    flexDirection: 'row',
    backgroundColor: loud.panel,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    padding: 3,
    marginBottom: space.lg,
  },
  switchItem: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: space.xs,
  },
  switchItemActive: {
    backgroundColor: loud.loud,
  },
  switchLabel: { fontFamily: font.display, fontSize: 11, letterSpacing: 1.4 },

  note: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, color: loud.figureFaint, marginTop: 4 },

  volumeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  volumeFigure: {
    fontFamily: font.figure,
    fontSize: 42,
    lineHeight: 46,
    letterSpacing: -2,
    color: loud.figure,
    fontVariant: ['tabular-nums'],
  },
  volumeUnit: { fontFamily: font.display, fontSize: 14, letterSpacing: 1, color: loud.figureMuted },
  comparison: { fontFamily: font.ui, fontSize: 13, color: loud.loud, marginTop: 2 },

  stats: { flexDirection: 'row', gap: space.sm },
  stat: {
    flex: 1,
    minWidth: 92,
    backgroundColor: loud.panel,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  statLabel: { fontFamily: font.display, fontSize: 9, letterSpacing: 1.3, color: loud.figureFaint },
  statValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  statValue: {
    fontFamily: font.figure,
    fontSize: 24,
    letterSpacing: -1,
    color: loud.figure,
    fontVariant: ['tabular-nums'],
  },
  statSuffix: { fontFamily: font.ui, fontSize: 11, color: loud.figureFaint, marginLeft: 2 },

  map: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  legend: { flex: 1, gap: 2 },
  legendPrimary: { fontFamily: font.display, fontSize: 14, color: loud.figure },
  legendSecondary: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, color: loud.figureFaint },
  exercises: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 17,
    color: loud.figureFaint,
    marginTop: space.md,
  },
  coachingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#071626',
    borderWidth: 1,
    borderColor: '#00E5FF',
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    marginBottom: space.lg,
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
    backgroundColor: '#092532',
    borderWidth: 1,
    borderColor: '#00E5FF',
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
    fontSize: 10,
    letterSpacing: 1.2,
    color: '#00E5FF',
  },
  readyPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  readyPillActive: {
    backgroundColor: '#102A1E',
    borderColor: '#1D5A3C',
  },
  readyPillPending: {
    backgroundColor: '#1C1914',
    borderColor: '#4D3B18',
  },
  readyPillText: {
    fontFamily: font.uiStrong,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  readyTextActive: {
    color: '#10B981',
  },
  readyTextPending: {
    color: '#FBBF24',
  },
  coachingHeadline: {
    fontFamily: font.ui,
    fontSize: 13,
    color: '#F0F9FF',
    lineHeight: 18,
  },
  coachingArrowWrap: {
    marginLeft: space.sm,
  },
});
