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
 * Now a check-in belongs to a finished period and is earned by enough logging
 * inside it. Periods are calendar weeks ending on the person's check-in day,
 * Sunday unless they chose another, so the weekly check-in covers the same
 * week as the target note on Today. A month is four of those weeks and a
 * quarter thirteen, both counted from the start of the first week anything was
 * logged, so the longer ones line up with the weeks inside them.
 */

export type CheckInKind = 'weekly' | 'monthly' | 'quarterly';

export const CHECK_IN_WEEKS: Record<CheckInKind, number> = { weekly: 1, monthly: 4, quarterly: 13 };

/**
 * Days of a period that need food logged: five of every seven, so 5, 20 and
 * 65. A day without food is a day the estimate cannot read at all, and fewer
 * would leave the review reading the gaps.
 */
export const requiredDays = (kind: CheckInKind): number => Math.ceil((CHECK_IN_WEEKS[kind] * 7 * 5) / 7);

/**
 * Weigh-ins a period needs: three a week. Not one a day, because the weight
 * trend only grows less certain without one, where a day without food is a
 * day missing. A week used to need five days with both, so six days of food
 * and four weigh-ins earned nothing.
 */
export const requiredWeighIns = (kind: CheckInKind): number => CHECK_IN_WEEKS[kind] * 3;

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

/** The days with food logged and the days with a weigh-in, counted apart. */
export interface LoggedDays {
  food: Set<ISODate>;
  weighIns: Set<ISODate>;
}

/** Food on a day the person marked as not a full day of logging does not count. */
export const loggedDays = (days: readonly DayRecord[], dayStatus: ReadonlyMap<ISODate, boolean>): LoggedDays => ({
  food: new Set(
    days
      .filter((d) => typeof d.intakeKcal === 'number' && d.intakeKcal > 0 && dayStatus.get(d.date) !== false)
      .map((d) => d.date),
  ),
  weighIns: new Set(days.filter((d) => typeof d.weightKg === 'number').map((d) => d.date)),
});

/** The first day of the week holding `date`: the day after the engine's "last week" ends. */
const weekStartOf = (date: ISODate, weekEndsOn: number): ISODate => addDays(checkInWeekFor(date, weekEndsOn).end, 1);

const periodAt = (kind: CheckInKind, anchor: ISODate, index: number): CheckInPeriod => {
  const length = CHECK_IN_WEEKS[kind] * 7;
  const from = addDays(anchor, index * length);
  return { kind, from, to: addDays(from, length - 1) };
};

export interface PeriodProgress {
  period: CheckInPeriod;
  food: number;
  foodNeeded: number;
  weighIns: number;
  weighInsNeeded: number;
}

export interface CheckInStatus {
  /** The most recent finished period, and whether it earned a check-in. */
  last: (PeriodProgress & { earned: boolean }) | null;
  /**
   * The period in progress, and the days left in it after today. After today,
   * because today is already in the counts: "3 so far, 5 to go" counting today
   * in both read as eight days in a seven-day week.
   */
  current: PeriodProgress & { daysLeftAfterToday: number };
}

const countIn = (period: CheckInPeriod, days: ReadonlySet<ISODate>): number => {
  let n = 0;
  for (const date of days) if (date >= period.from && date <= period.to) n++;
  return n;
};

const progressOf = (period: CheckInPeriod, logged: LoggedDays): PeriodProgress => ({
  period,
  food: countIn(period, logged.food),
  foodNeeded: requiredDays(period.kind),
  weighIns: countIn(period, logged.weighIns),
  weighInsNeeded: requiredWeighIns(period.kind),
});

/**
 * Null until anything has been logged. `firstLogged` is the earliest date with
 * a weigh-in or food, which anchors the months and quarters; `weekEndsOn` is
 * the check-in day, 0 for Sunday through 6 for Saturday.
 */
export const checkInStatus = (
  kind: CheckInKind,
  firstLogged: ISODate | null,
  today: ISODate,
  logged: LoggedDays,
  weekEndsOn = 0,
): CheckInStatus | null => {
  if (firstLogged === null || firstLogged > today) return null;
  const anchor = weekStartOf(firstLogged, weekEndsOn);
  const length = CHECK_IN_WEEKS[kind] * 7;
  const index = Math.floor(diffDays(anchor, today) / length);

  const currentPeriod = periodAt(kind, anchor, index);
  const current = { ...progressOf(currentPeriod, logged), daysLeftAfterToday: diffDays(today, currentPeriod.to) };
  if (index === 0) return { last: null, current };

  const last = progressOf(periodAt(kind, anchor, index - 1), logged);
  return {
    last: { ...last, earned: last.food >= last.foodNeeded && last.weighIns >= last.weighInsNeeded },
    current,
  };
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

/** What a finished period had, naming only the part that fell short as short. */
const lacked = ({ food, foodNeeded, weighIns, weighInsNeeded }: PeriodProgress): string => {
  const foodMet = food >= foodNeeded;
  const weighMet = weighIns >= weighInsNeeded;
  const foodPart = foodMet ? `food logged on ${days(food)}` : `food logged on ${food} of the ${foodNeeded} days needed`;
  const weighPart = weighMet ? `${weighIns} weigh-ins` : `${weighIns} of the ${weighInsNeeded} weigh-ins needed`;
  return `${foodPart}${foodMet !== weighMet ? ' but ' : ' and '}${weighPart}`;
};

/** Where the period in progress stands, and how long is left. */
const sofar = (current: CheckInStatus['current']): string => {
  const { food, foodNeeded, weighIns, weighInsNeeded, daysLeftAfterToday } = current;
  const foodPart = food >= foodNeeded ? `food on ${days(food)}` : `food on ${food} of the ${foodNeeded} days needed`;
  const weighPart = weighIns >= weighInsNeeded ? `${weighIns} weigh-ins` : `${weighIns} of the ${weighInsNeeded} weigh-ins`;
  const left = daysLeftAfterToday === 0 ? ', and it ends today' : `, with ${days(daysLeftAfterToday)} left after today`;
  return `${foodPart} and ${weighPart}${left}`;
};

/**
 * Why there is no check-in to read yet, in one or two sentences, or null when
 * the last period earned one. It names the period and what is still needed,
 * because "not enough data" on its own reads as the app being broken.
 */
export const checkInLockedNote = (status: CheckInStatus): string | null => {
  if (status.last?.earned) return null;
  const { current } = status;
  const noun = NOUN[current.period.kind];
  if (status.last === null) {
    return (
      `Your first ${noun} runs to ${formatDayMonth(current.period.to)}. Its check-in unlocks with food logged on ` +
      `${current.foodNeeded} of its days and ${current.weighInsNeeded} weigh-ins. So far: ${sofar(current)}.`
    );
  }
  const { period } = status.last;
  return (
    `The ${noun} of ${formatDayMonth(period.from)} to ${formatDayMonth(period.to)} had ${lacked(status.last)}, ` +
    `too few for a check-in. This ${noun} so far: ${sofar(current)}.`
  );
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
 * month and a quarter end on the same day, the quarter is the one worth
 * prompting for; the others are still there on Trends.
 */
export const earnedCheckIns = (
  firstLogged: ISODate | null,
  today: ISODate,
  logged: LoggedDays,
  weekEndsOn = 0,
): CheckInPeriod[] =>
  (['quarterly', 'monthly', 'weekly'] as const).flatMap((kind) => {
    const last = checkInStatus(kind, firstLogged, today, logged, weekEndsOn)?.last;
    return last?.earned ? [last.period] : [];
  });
