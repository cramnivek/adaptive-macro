import { addDays, bodyweightForDates, summarisePeriod, todayISO } from '@adaptive-macros/engine';
import type { DatedSet, PeriodSummary } from '@adaptive-macros/engine';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
import { CountUp } from '../src/components/CountUp';
import { FadeIn } from '../src/components/FadeIn';
import { MuscleFigure } from '../src/components/MuscleFigure';
import { REGION_LABELS } from '../src/components/muscleMap';
import type { MuscleRegion } from '../src/components/muscleMap';
import { Screen } from '../src/components/Screen';
import { SlashPanel } from '../src/components/SlashPanel';
import { Tappable } from '../src/components/Tappable';
import { catalogueRegionsByExerciseName, listAllSets, listLoggedDates } from '../src/db';
import { displayWeight, weightUnit } from '../src/format';
import { useApp } from '../src/state/AppStore';
import { font, radius, space } from '../src/theme';
import { session as loud } from '../src/theme/sessionTheme';
import { volumeComparison } from '../src/volume';

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
  const { series, settings } = useApp();
  const unit = weightUnit(settings.units);

  const [periodIndex, setPeriodIndex] = useState(0);
  const [sets, setSets] = useState<DatedSet[]>([]);
  const [regions, setRegions] = useState<
    Record<string, { primary: MuscleRegion; secondary: MuscleRegion[] }>
  >({});
  const [loggedDates, setLoggedDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let current = true;
      void (async () => {
        const [allSets, byName, dates] = await Promise.all([
          listAllSets(),
          catalogueRegionsByExerciseName(),
          // Enough to cover the longest window with room to spare.
          listLoggedDates(60),
        ]);
        if (!current) return;
        setSets(allSets);
        setRegions(byName);
        setLoggedDates(dates);
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
              style={styles.switchItem}
              accessibilityLabel={`Show the ${option.label.toLowerCase()}`}
            >
              <SlashPanel color={active ? loud.loud : loud.panel} style={styles.switchPanel}>
                <Text
                  style={[styles.switchLabel, { color: active ? loud.onLoud : loud.figureMuted }]}
                >
                  {option.label}
                </Text>
              </SlashPanel>
            </Tappable>
          );
        })}
      </View>

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
  switcher: { flexDirection: 'row', gap: space.sm, marginBottom: space.lg },
  switchItem: { flex: 1 },
  switchPanel: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
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
    borderRadius: radius.md,
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
});
