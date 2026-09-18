import type { ISODate } from './types.ts';

const MS_PER_DAY = 86_400_000;

/**
 * Calendar days are parsed at UTC midnight rather than local midnight so that
 * day arithmetic never lands on a 23- or 25-hour DST day and silently shifts a
 * date by one. The strings themselves stay local calendar days.
 */
export const parseISODate = (date: ISODate): Date => new Date(`${date}T00:00:00Z`);

export const toISODate = (date: Date): ISODate => date.toISOString().slice(0, 10);

/** Today as the user's local calendar day, not UTC's. */
export const todayISO = (now: Date = new Date()): ISODate => {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const addDays = (date: ISODate, days: number): ISODate =>
  toISODate(new Date(parseISODate(date).getTime() + days * MS_PER_DAY));

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export const diffDays = (from: ISODate, to: ISODate): number =>
  Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / MS_PER_DAY);

/** Every calendar day from `start` to `end` inclusive. */
export const eachDay = (start: ISODate, end: ISODate): ISODate[] => {
  const span = diffDays(start, end);
  if (span < 0) return [];
  return Array.from({ length: span + 1 }, (_, i) => addDays(start, i));
};

export const isValidISODate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseISODate(value).getTime());
