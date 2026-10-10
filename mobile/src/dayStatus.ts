/**
 * When to ask whether a day's log was the whole day.
 *
 * Asking about every day would be a chore nobody keeps up. A day under half the
 * target is the case that matters: it is either a forgotten meal, which would
 * pull the expenditure estimate down by the size of the meal, or a genuinely
 * light day, which only the person can tell apart. Once answered, never again.
 */
export const LIGHT_DAY_SHARE = 0.5;

export const shouldAskAbout = (
  loggedKcal: number | undefined,
  answered: boolean | undefined,
  targetKcal: number,
): boolean =>
  loggedKcal !== undefined &&
  loggedKcal > 0 &&
  answered === undefined &&
  loggedKcal < targetKcal * LIGHT_DAY_SHARE;
