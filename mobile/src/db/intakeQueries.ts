/**
 * Each day's logged intake, as the expenditure estimate is allowed to see it.
 *
 * A day marked as not fully logged is left out entirely, so the estimator
 * treats it as a day with no log — unknown, not low. The diary still shows
 * every entry; only the estimate looks away.
 */
export const DAILY_INTAKE_FOR_ESTIMATE = `SELECT date, SUM(kcal) AS kcal FROM log_entries
  WHERE date NOT IN (SELECT date FROM day_status WHERE complete = 0)
  GROUP BY date`;
