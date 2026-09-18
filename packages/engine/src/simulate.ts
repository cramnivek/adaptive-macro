import { addDays } from './dates.ts';
import type { DailyObservation, ISODate } from './types.ts';

/**
 * Synthetic history generation.
 *
 * This exists first for the tests: the only way to know the filter is right is
 * to run it against data whose true expenditure you already know, and check
 * that it recovers it. It is exported from the package rather than kept beside
 * the tests because the app needs the same thing to populate demo data — the
 * charts have nothing to draw until a few weeks of history exist.
 */

/**
 * mulberry32 — small, fast, seeded PRNG.
 *
 * Seeded rather than Math.random so a generated history is reproducible: a test
 * that fails on a tolerance can be re-run to the same numbers, and the same
 * demo seed always produces the same demo.
 */
export const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Box-Muller, so the simulated scale noise is actually Gaussian. */
export const gaussian = (random: () => number): number => {
  const u = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
};

export interface SimulationSpec {
  startDate: ISODate;
  days: number;
  startKg: number;
  /** True expenditure on a given day index — a function so it can step or drift. */
  tdeeOn: (day: number) => number;
  /** Intake on a given day index. */
  intakeOn: (day: number) => number;
  kcalPerKgTissue: number;
  scaleNoiseSdKg: number;
  seed: number;
  /** Day indices where the user did not step on the scale. */
  skipWeightOn?: (day: number) => boolean;
  /** Day indices where the user did not log food. */
  skipIntakeOn?: (day: number) => boolean;
}

export interface SimulatedDay {
  date: ISODate;
  /** The weight the body actually was — never visible to the filter. */
  trueWeightKg: number;
  /** The expenditure that actually applied — the number the filter must recover. */
  trueTdee: number;
  /** What the scale read, trend plus noise. Absent on a skipped weigh-in. */
  observedWeightKg?: number;
  /** Absent on an unlogged day. */
  intakeKcal?: number;
}

export interface SimulationResult {
  days: SimulatedDay[];
  /** The same history in the shape the estimator consumes. */
  observations: DailyObservation[];
  trueWeightKg: number[];
  trueTdee: number[];
}

/**
 * Generates a ground-truth history under exactly the energy balance the model
 * assumes, then hides it behind noisy scale readings.
 *
 * This is the filter's best case — real bodies do not follow the equation this
 * cleanly. If the estimate cannot be recovered here, the bug is in the filter,
 * not in the data.
 */
export const simulate = (spec: SimulationSpec): SimulationResult => {
  const random = rng(spec.seed);
  const days: SimulatedDay[] = [];
  const observations: DailyObservation[] = [];
  const trueWeightKg: number[] = [];
  const trueTdee: number[] = [];

  let weight = spec.startKg;

  for (let day = 0; day < spec.days; day++) {
    const tdee = spec.tdeeOn(day);
    const intake = spec.intakeOn(day);
    const date = addDays(spec.startDate, day);

    trueWeightKg.push(weight);
    trueTdee.push(tdee);

    const observation: DailyObservation = { date };
    const entry: SimulatedDay = { date, trueWeightKg: weight, trueTdee: tdee };

    if (!spec.skipWeightOn?.(day)) {
      const reading = weight + gaussian(random) * spec.scaleNoiseSdKg;
      observation.weightKg = reading;
      entry.observedWeightKg = reading;
    }
    if (!spec.skipIntakeOn?.(day)) {
      observation.intakeKcal = intake;
      entry.intakeKcal = intake;
    }

    observations.push(observation);
    days.push(entry);

    // Tomorrow's weight follows from today's energy balance, which is the one
    // relationship the estimator is trying to invert.
    weight += (intake - tdee) / spec.kcalPerKgTissue;
  }

  return { days, observations, trueWeightKg, trueTdee };
};
