import { diffDays, sessionEnergyKcal, weeklyVolume } from '@adaptive-macros/engine';
import type { DailyEstimate, DatedSet } from '@adaptive-macros/engine';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { listAllSets, listSessionSpans } from '../db';
import { formatDate } from '../format';
import { useTheme } from '../theme';
import { Card } from './Card';
import { LineChart } from './LineChart';

const weekStartOf = (date: string): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

/**
 * Training volume beside the filter's own expenditure estimate.
 *
 * The point is to check the model against something outside itself: weeks of
 * heavy training should be visible in an estimate that was derived without
 * knowing anything about training.
 *
 * **The energy figure here is display-only and nothing consumes it.** The
 * target, the diary and the trend never see it. `expenditure.ts` already
 * absorbs training through the intake-versus-weight gap, so adding this on top
 * would count the same energy twice — which is exactly the defect that makes
 * exercise calories untrustworthy elsewhere.
 */
export const TrainingCrossReference = ({ series }: { series: DailyEstimate[] }) => {
  const { colors } = useTheme();
  const [sets, setSets] = useState<DatedSet[] | null>(null);
  const [spans, setSpans] = useState<{ date: string; minutes: number | null }[]>([]);

  useEffect(() => {
    void (async () => {
      setSets(await listAllSets());
      setSpans(await listSessionSpans());
    })();
  }, []);

  const bodyweightByDate = useMemo(
    () => new Map(series.map((day) => [day.date, day.trendWeightKg])),
    [series],
  );

  const chart = useMemo(() => {
    if (!sets?.length) return null;

    const volume = weeklyVolume(sets, bodyweightByDate);
    if (!volume.length) return null;

    // Weekly training energy, summed from each session that has a duration.
    // Sessions without one contribute nothing rather than a default.
    const energy = new Map<string, { lo: number; mid: number; hi: number }>();
    let sessionsWithoutDuration = 0;
    for (const span of spans) {
      const band = sessionEnergyKcal(bodyweightByDate.get(span.date) ?? null, span.minutes);
      if (!band) {
        sessionsWithoutDuration += 1;
        continue;
      }
      const week = weekStartOf(span.date);
      const running = energy.get(week) ?? { lo: 0, mid: 0, hi: 0 };
      energy.set(week, {
        lo: running.lo + band.lo,
        mid: running.mid + band.mid,
        hi: running.hi + band.hi,
      });
    }

    // The filter's estimate as kcal per week, so it is comparable with the
    // band above rather than being a daily figure next to a weekly one.
    const expenditureByWeek = new Map<string, { total: number; days: number }>();
    for (const day of series) {
      const week = weekStartOf(day.date);
      const running = expenditureByWeek.get(week) ?? { total: 0, days: 0 };
      expenditureByWeek.set(week, {
        total: running.total + day.expenditureKcal,
        days: running.days + 1,
      });
    }

    const origin = volume[0].weekStart;
    const x = (week: string) => diffDays(origin, week) / 7;

    return {
      origin,
      volume: volume.map((w) => ({ x: x(w.weekStart), y: w.volumeKg })),
      band: [...energy.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, b]) => ({ x: x(week), lo: b.lo, hi: b.hi })),
      expenditure: [...expenditureByWeek.entries()]
        .filter(([week]) => energy.has(week))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, e]) => ({ x: x(week), y: (e.total / e.days) * 7 })),
      sessionsWithoutDuration,
    };
  }, [sets, spans, bodyweightByDate, series]);

  if (sets === null) return null;

  if (!chart) {
    return (
      <Card title="Training">
        <Text style={[styles.note, { color: colors.textFaint }]}>
          No scoreable training yet. Import your history in Settings, or log a session.
        </Text>
      </Card>
    );
  }

  const label = (value: number) => formatDate(shiftWeeks(chart.origin, value));

  return (
    <>
      <Card title="Weekly training volume">
        <LineChart
          series={[{ points: chart.volume, color: colors.accent, strokeWidth: 2 }]}
          formatY={(value) => `${Math.round(value / 1000)}t`}
          formatX={label}
        />
        <Text style={[styles.note, { color: colors.textFaint }]}>
          Load × reps across working sets, in tonnes lifted per week. Bodyweight work counts at
          your weight trend on the day.
        </Text>
      </Card>

      <Card title="Training energy against the estimate">
        <LineChart
          series={[{ points: chart.expenditure, color: colors.textMuted, strokeWidth: 2 }]}
          band={{ points: chart.band, color: colors.accent }}
          formatY={(value) => `${Math.round(value / 1000)}k`}
          formatX={label}
        />
        <Text style={[styles.note, { color: colors.textFaint }]}>
          The band is a rough estimate of what your sessions cost — bodyweight × duration × an
          activity constant, which for lifting spans about ±40%. The line is your total weekly
          expenditure as the filter measures it.
        </Text>
        <Text style={[styles.note, { color: colors.textFaint }]}>
          Nothing here feeds your target. Your expenditure estimate already includes training:
          it is measured from what your weight actually did, so counting these calories again
          would raise your target for work already accounted for.
        </Text>
        {chart.sessionsWithoutDuration > 0 && (
          <Text style={[styles.note, { color: colors.textFaint }]}>
            {chart.sessionsWithoutDuration} sessions have no recorded duration and are left out
            of the band rather than estimated.
          </Text>
        )}
      </Card>
    </>
  );
};

const shiftWeeks = (origin: string, weeks: number): string =>
  new Date(new Date(`${origin}T00:00:00Z`).getTime() + Math.round(weeks) * 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

const styles = StyleSheet.create({
  note: { fontSize: 12, lineHeight: 17, marginTop: 6 },
});
