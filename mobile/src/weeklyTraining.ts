import { addDays, checkInWeekFor, diffDays, isWorkingSet } from '@adaptive-macros/engine';
import type { DatedSet, ISODate } from '@adaptive-macros/engine';

export interface SessionTimes {
  id: string;
  date: ISODate;
  startedAt: string;
  finishedAt: string;
}

export interface WeekTotal {
  /** The Monday the week starts on. */
  weekStart: ISODate;
  minutes: number;
  /** Kilograms over working sets (warm-ups left out), weight × reps; sets with no weight add nothing. */
  volumeKg: number;
  /** Working sets. */
  sets: number;
}

/**
 * The first day of the week holding a date: the day after the person's
 * check-in day, Monday unless they chose another.
 *
 * `checkInWeekFor` already decides where a week starts for the weekly check-in,
 * and returns last week; the week after its start is this one. Reusing it keeps
 * the chart's weeks and the check-in's weeks from ever disagreeing, and it does
 * its arithmetic on the ISO string, so a reader east of Greenwich gets no
 * off-by-one from a local midnight.
 */
const weekStartOf = (date: ISODate, weekEndsOn: number): ISODate =>
  addDays(checkInWeekFor(date, weekEndsOn).start, 7);

/**
 * The last `weeks` weeks, oldest first, ending with the week that contains `today`,
 * every week present even when nothing was done in it (so the bars are evenly spaced
 * and a gap reads as a gap).
 */
export const weeklyTotals = (
  sessions: SessionTimes[],
  sets: DatedSet[],
  today: ISODate,
  weeks = 12,
  weekEndsOn = 0,
): WeekTotal[] => {
  const thisMonday = weekStartOf(today, weekEndsOn);
  const totals = Array.from({ length: weeks }, (_, index): WeekTotal => ({
    weekStart: addDays(thisMonday, -7 * (weeks - 1 - index)),
    minutes: 0,
    volumeKg: 0,
    sets: 0,
  }));
  const byWeek = new Map(totals.map((total) => [total.weekStart, total]));

  for (const item of sessions) {
    const week = byWeek.get(weekStartOf(item.date, weekEndsOn));
    if (week === undefined) continue;
    // The same rule as a post's duration: whole minutes, never less than one.
    const minutes = Math.round(
      (new Date(item.finishedAt).getTime() - new Date(item.startedAt).getTime()) / 60000,
    );
    week.minutes += Math.max(1, minutes);
  }

  for (const { date, set } of sets) {
    const week = byWeek.get(weekStartOf(date, weekEndsOn));
    if (week === undefined || !isWorkingSet(set)) continue;
    week.sets += 1;
    // A set with no recorded reps is still a set, but it has no volume to add.
    week.volumeKg += (set.weightKg ?? 0) * (set.reps ?? 0);
  }

  return totals;
};

/** Weekly totals clipped to the aligned check-in weeks intersecting a date period. */
export const weeklyTotalsForPeriod = (
  sessions: SessionTimes[],
  sets: DatedSet[],
  from: ISODate,
  to: ISODate,
  weekEndsOn = 0,
): WeekTotal[] => {
  const firstWeek = weekStartOf(from, weekEndsOn);
  const lastWeek = weekStartOf(to, weekEndsOn);
  const weeks = Math.floor(diffDays(firstWeek, lastWeek) / 7) + 1;
  return weeklyTotals(
    sessions.filter((item) => item.date >= from && item.date <= to),
    sets.filter((item) => item.date >= from && item.date <= to),
    to,
    weeks,
    weekEndsOn,
  );
};
