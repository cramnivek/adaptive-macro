import { addDays, checkInWeekFor, diffDays, type ISODate } from '@adaptive-macros/engine';
import { formatDayMonth } from './format';

/**
 * When a coaching check-in is earned, and which period it covers.
 *
 * Check-ins used to be produced for "the last 7 days" counted back from today,
 * and cached under today's date and the number of rows logged so far. A new
 * day, or one more meal, threw the review away, so the card kept resetting,
 * and a review could be asked for after two days of data and would say
 * something confident about them.
 *
 * Now a check-in belongs to a finished period and is earned by enough logged
 * days inside it. Periods are calendar weeks, Monday to Sunday, so the weekly
 * check-in covers the same week as the target note on Today. A month is four
 * of those weeks and a quarter thirteen, both counted from the Monday of the
 * first week anything was logged, so every period ends on a Sunday and the
 * longer ones line up with the weeks inside them.
 */

export type CheckInKind = 'weekly' | 'monthly' | 'quarterly';

export const CHECK_IN_WEEKS: Record<CheckInKind, number> = { weekly: 1, monthly: 4, quarterly: 13 };

/**
 * Days of a period that need a weigh-in and a counted food log: five of every
 * seven, so 5, 20 and 65. Fewer, and the review would be reading the gaps.
 */
export const requiredDays = (kind: CheckInKind): number => Math.ceil((CHECK_IN_WEEKS[kind] * 7 * 5) / 7);

export interface CheckInPeriod {
  kind: CheckInKind;
  from: ISODate;
  to: ISODate;
}

export interface DayRecord {
  date: ISODate;
  weightKg?: number;
  intakeKcal?: number;
}

/**
 * Days with both a weigh-in and food logged, leaving out any the person marked
 * as not a full day of logging.
 */
export const qualifyingDays = (
  days: readonly DayRecord[],
  dayStatus: ReadonlyMap<ISODate, boolean>,
): Set<ISODate> =>
  new Set(
    days
      .filter(
        (d) =>
          typeof d.weightKg === 'number' &&
          typeof d.intakeKcal === 'number' &&
          d.intakeKcal > 0 &&
          dayStatus.get(d.date) !== false,
      )
      .map((d) => d.date),
  );

/** The Monday of the week holding `date`: the day after the engine's "last week" ends. */
const mondayOf = (date: ISODate): ISODate => addDays(checkInWeekFor(date).end, 1);

const periodAt = (kind: CheckInKind, anchorMonday: ISODate, index: number): CheckInPeriod => {
  const length = CHECK_IN_WEEKS[kind] * 7;
  const from = addDays(anchorMonday, index * length);
  return { kind, from, to: addDays(from, length - 1) };
};

export interface PeriodProgress {
  period: CheckInPeriod;
  logged: number;
  needed: number;
}

export interface CheckInStatus {
  /** The most recent finished period, and whether it earned a check-in. */
  last: (PeriodProgress & { earned: boolean }) | null;
  /** The period in progress, and how many days are left in it, counting today. */
  current: PeriodProgress & { daysLeft: number };
}

const countIn = (period: CheckInPeriod, days: ReadonlySet<ISODate>): number => {
  let n = 0;
  for (const date of days) if (date >= period.from && date <= period.to) n++;
  return n;
};

/**
 * Null until anything has been logged. `firstLogged` is the earliest date with
 * a weigh-in or food, which anchors the months and quarters.
 */
export const checkInStatus = (
  kind: CheckInKind,
  firstLogged: ISODate | null,
  today: ISODate,
  days: ReadonlySet<ISODate>,
): CheckInStatus | null => {
  if (firstLogged === null || firstLogged > today) return null;
  const anchor = mondayOf(firstLogged);
  const length = CHECK_IN_WEEKS[kind] * 7;
  const index = Math.floor(diffDays(anchor, today) / length);
  const needed = requiredDays(kind);

  const currentPeriod = periodAt(kind, anchor, index);
  const current = {
    period: currentPeriod,
    logged: countIn(currentPeriod, days),
    needed,
    daysLeft: diffDays(today, currentPeriod.to) + 1,
  };
  if (index === 0) return { last: null, current };

  const lastPeriod = periodAt(kind, anchor, index - 1);
  const logged = countIn(lastPeriod, days);
  return { last: { period: lastPeriod, logged, needed, earned: logged >= needed }, current };
};

/**
 * Where a check-in is kept. One per period, never replaced by later logging:
 * it is a record of how that period went, read at the time.
 */
export const checkInStorageKey = (period: CheckInPeriod): string =>
  `ascend_checkin_${period.kind}_${period.from}`;

export const checkInAppliedKey = (period: CheckInPeriod): string =>
  `ascend_checkin_applied_${period.kind}_${period.from}`;

const NOUN: Record<CheckInKind, string> = { weekly: 'week', monthly: 'month', quarterly: 'quarter' };

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/**
 * Why there is no check-in to read yet, in one or two sentences, or null when
 * the last period earned one. It names the period and what is still needed,
 * because "not enough data" on its own reads as the app being broken.
 */
export const checkInLockedNote = (status: CheckInStatus): string | null => {
  if (status.last?.earned) return null;
  const noun = NOUN[status.current.period.kind];
  const { logged, needed, daysLeft } = status.current;
  const progress = `${logged} of ${needed} so far, with ${days(daysLeft)} to go`;
  if (status.last === null) {
    return `Your first ${noun} runs to ${formatDayMonth(status.current.period.to)}. Its check-in unlocks once ${needed} of its days have a weigh-in and food logged: ${progress}.`;
  }
  const { period, logged: lastLogged } = status.last;
  return `The ${noun} of ${formatDayMonth(period.from)} to ${formatDayMonth(period.to)} had ${lastLogged} of ${needed} days with a weigh-in and food logged, too few for a check-in. This ${noun}: ${progress}.`;
};

/** The earliest day with a weigh-in or food, which anchors every period. */
export const firstLoggedDate = (days: readonly DayRecord[]): ISODate | null =>
  days.reduce<ISODate | null>(
    (first, d) =>
      (typeof d.weightKg === 'number' || (d.intakeKcal ?? 0) > 0) && (first === null || d.date < first)
        ? d.date
        : first,
    null,
  );

/**
 * The finished periods that earned a check-in, longest first. When a week, a
 * month and a quarter end on the same Sunday, the quarter is the one worth
 * prompting for; the others are still there on Trends.
 */
export const earnedCheckIns = (
  firstLogged: ISODate | null,
  today: ISODate,
  days: ReadonlySet<ISODate>,
): CheckInPeriod[] =>
  (['quarterly', 'monthly', 'weekly'] as const).flatMap((kind) => {
    const last = checkInStatus(kind, firstLogged, today, days)?.last;
    return last?.earned ? [last.period] : [];
  });
