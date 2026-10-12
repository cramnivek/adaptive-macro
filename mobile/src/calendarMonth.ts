import { addDays } from '@adaptive-macros/engine';
import type { ISODate } from '@adaptive-macros/engine';

export interface CalendarDay {
  date: ISODate;
  inMonth: boolean;
}

// Spelled out rather than taken from Intl, so the title does not depend on the
// device's locale data (Hermes ships a partial Intl on some builds).
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * The weeks of a month as rows of seven days, Monday first (the app's weeks
 * start on Monday, as the weekly check-in does), padded with the neighbouring
 * months' days so every row is full. `month` is 1–12.
 *
 * Only the day-of-week and the month length come from a `Date`, and both are
 * read at UTC midnight, so the result is the same in every timezone. Building
 * the dates from a local midnight and calling `toISOString()` would move them
 * back a day east of UTC, which is where the owner lives.
 */
export const monthGrid = (year: number, month: number): CalendarDay[][] => {
  const first: ISODate = `${year}-${pad(month)}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // getUTCDay() is 0 for Sunday; shifting by six makes Monday 0.
  const leading = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const rows = Math.ceil((leading + daysInMonth) / 7);
  const start = addDays(first, -leading);

  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: 7 }, (_, column) => {
      const offset = row * 7 + column;
      return {
        date: addDays(start, offset),
        inMonth: offset >= leading && offset < leading + daysInMonth,
      };
    }),
  );
};

/** "October 2026". */
export const monthTitle = (year: number, month: number): string =>
  `${MONTH_NAMES[month - 1]} ${year}`;

/** The month before and after, wrapping the year. */
export const shiftMonth = (
  year: number,
  month: number,
  by: -1 | 1,
): { year: number; month: number } => {
  const next = month + by;
  if (next < 1) return { year: year - 1, month: 12 };
  if (next > 12) return { year: year + 1, month: 1 };
  return { year, month: next };
};
