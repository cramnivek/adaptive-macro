import { addDays, type ISODate } from '@adaptive-macros/engine';

/**
 * The last two weeks of input, day by day: what the estimate had to work with.
 *
 * The "±" on the expenditure figure is the estimate's own uncertainty, and
 * nearly all of it comes from here — days with no food log, days left out, days
 * with no weigh-in. Shown as squares rather than a sentence, so the reason the
 * band is wide is visible at a glance.
 */
export type FoodDay = 'counted' | 'left-out' | 'none';

export interface StripDay {
  date: ISODate;
  food: FoodDay;
  weighed: boolean;
}

export const STRIP_DAYS = 14;

/**
 * Oldest first, ending yesterday: today's log is still being written, and the
 * estimate does not use a day's intake until the day is over.
 */
export const loggingStrip = (
  today: ISODate,
  loggedDates: Set<ISODate>,
  weighedDates: Set<ISODate>,
  dayStatus: Map<ISODate, boolean>,
): StripDay[] =>
  Array.from({ length: STRIP_DAYS }, (_, index) => {
    const date = addDays(today, index - STRIP_DAYS);
    const food: FoodDay = !loggedDates.has(date)
      ? 'none'
      : dayStatus.get(date) === false
        ? 'left-out'
        : 'counted';
    return { date, food, weighed: weighedDates.has(date) };
  });
