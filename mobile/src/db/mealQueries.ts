/**
 * For each meal, the most recent earlier day it was logged, within a window.
 *
 * Takes (before, notBefore): days strictly before the first, on or after the
 * second. Most people eat the same breakfast most days, but not every day, so
 * this looks back over a week rather than at yesterday alone: a skipped
 * Saturday breakfast should not hide Friday's.
 */
export const LAST_MEALS_BEFORE = `SELECT l.meal AS meal, l.date AS date, SUM(l.kcal) AS kcal, COUNT(*) AS items
  FROM log_entries l
  JOIN (
    SELECT meal, MAX(date) AS date FROM log_entries
     WHERE date < ? AND date >= ?
     GROUP BY meal
  ) latest ON latest.meal = l.meal AND latest.date = l.date
  GROUP BY l.meal, l.date`;

/** Dates with food logs strictly before the destination date, newest first. */
export const LOGGED_DATES_BEFORE = `SELECT DISTINCT date FROM log_entries
  WHERE date < ?
  ORDER BY date DESC LIMIT ?`;
