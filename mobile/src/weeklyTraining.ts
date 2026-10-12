import { addDays, checkInWeekFor, isWorkingSet } from '@adaptive-macros/engine';
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
 * The Monday on or before a date.
 *
 * `checkInWeekFor` already decides where a week starts for the weekly check-in,
 * and returns last week; the week after its start is this one. Reusing it keeps
 * the chart's weeks and the check-in's weeks from ever disagreeing, and it does
 * its arithmetic on the ISO string, so a reader east of Greenwich gets no
 * off-by-one from a local midnight.
 */
const mondayOf = (date: ISODate): ISODate => addDays(checkInWeekFor(date).start, 7);

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
): WeekTotal[] => {
  const thisMonday = mondayOf(today);
  const totals = Array.from({ length: weeks }, (_, index): WeekTotal => ({
    weekStart: addDays(thisMonday, -7 * (weeks - 1 - index)),
    minutes: 0,
    volumeKg: 0,
    sets: 0,
  }));
  const byWeek = new Map(totals.map((total) => [total.weekStart, total]));

  for (const item of sessions) {
    const week = byWeek.get(mondayOf(item.date));
    if (week === undefined) continue;
    // The same rule as a post's duration: whole minutes, never less than one.
    const minutes = Math.round(
      (new Date(item.finishedAt).getTime() - new Date(item.startedAt).getTime()) / 60000,
    );
    week.minutes += Math.max(1, minutes);
  }

  for (const { date, set } of sets) {
    const week = byWeek.get(mondayOf(date));
    if (week === undefined || !isWorkingSet(set)) continue;
    week.sets += 1;
    // A set with no recorded reps is still a set, but it has no volume to add.
    week.volumeKg += (set.weightKg ?? 0) * (set.reps ?? 0);
  }

  return totals;
};
