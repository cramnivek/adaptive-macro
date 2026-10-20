/**
 * Roughly what a lifting session burned above resting, as a range.
 *
 * From the Compendium of Physical Activities: resistance training runs at
 * about 3.5 METs for moderate effort and 6 for vigorous, where 1 MET is about
 * 1 kcal per kilogram per hour at rest. Subtracting that resting MET gives what
 * the session added, which is the honest figure: someone sitting on the sofa
 * for the same hour would have burned the rest anyway.
 *
 * It is a range because a session's rest periods, density and load move it a
 * long way, and formula estimates for lifting are off by 30–50% either way.
 * It is never added to expenditure: the adaptive estimate is measured from
 * intake against the weight trend, so it already includes every session, and
 * adding this on top would count it twice.
 */

export const LIFTING_MET = { moderate: 3.5, vigorous: 6 } as const;

/**
 * Longer than this and the timer was almost certainly left running, so a
 * figure from it would be invented.
 */
export const MAX_LIFTING_MINUTES = 180;

export interface LiftingEnergy {
  lowKcal: number;
  highKcal: number;
}

/** Null for no time, an implausibly long session, or no body weight to scale by. */
export const liftingEnergyKcal = (minutes: number, bodyweightKg: number | null): LiftingEnergy | null => {
  if (!(minutes > 0) || minutes > MAX_LIFTING_MINUTES || !bodyweightKg || bodyweightKg <= 0) return null;
  const hours = minutes / 60;
  // Rounded to tens: a range this wide quoted to the calorie would claim a
  // precision it does not have.
  const round = (kcal: number) => Math.round(kcal / 10) * 10;
  return {
    lowKcal: round((LIFTING_MET.moderate - 1) * bodyweightKg * hours),
    highKcal: round((LIFTING_MET.vigorous - 1) * bodyweightKg * hours),
  };
};
