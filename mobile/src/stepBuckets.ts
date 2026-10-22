import { addDays, type ISODate } from '@adaptive-macros/engine';

/**
 * The bars of the steps chart for the period Trends is showing.
 *
 * The chart was always the last seven days while the sentence under it
 * averaged over the chosen period, so on Month the bars and the words were
 * about different things. A week and a month are a bar a day; a year is a bar
 * a month, the average of the days that have a count, because 365 bars is a
 * smudge and a month with nothing logged is not a month of zero steps.
 */

export type StepSpan = 'week' | 'month' | 'year';

export interface StepBucket {
  key: string;
  label: string;
  /** Undefined when nothing was counted, which is not zero. */
  steps: number | undefined;
  /** The day, for a bar that is one; tapping it opens that day. */
  date?: ISODate;
  /** Days with a count behind a month's average. */
  days?: number;
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const dayBuckets = (today: ISODate, byDate: ReadonlyMap<string, number>, count: number): StepBucket[] =>
  Array.from({ length: count }, (_, i) => {
    const date = addDays(today, i - (count - 1));
    const fromEnd = count - 1 - i;
    const weekday = WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()];
    // Thirty labels do not fit under thirty thin bars; one a week does.
    const label =
      date === today ? 'Today' : count <= 7 ? weekday : fromEnd % 7 === 0 ? String(Number(date.slice(8, 10))) : '';
    return { key: date, label, steps: byDate.get(date), date };
  });

const monthBuckets = (today: ISODate, byDate: ReadonlyMap<string, number>): StepBucket[] => {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(year, month - (11 - i), 1));
    const prefix = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-`;
    let total = 0;
    let days = 0;
    for (const [date, steps] of byDate) {
      if (date.startsWith(prefix) && date <= today) {
        total += steps;
        days += 1;
      }
    }
    return {
      key: prefix,
      label: MONTH[d.getUTCMonth()],
      steps: days > 0 ? Math.round(total / days) : undefined,
      days,
    };
  });
};

export const stepBuckets = (today: ISODate, byDate: ReadonlyMap<string, number>, span: StepSpan): StepBucket[] =>
  span === 'year' ? monthBuckets(today, byDate) : dayBuckets(today, byDate, span === 'week' ? 7 : 30);
