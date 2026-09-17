import { addDays } from '../src/dates';
import type { DailyObservation } from '../src/types';

/**
 * mulberry32 — small, fast, seeded PRNG. Tests need repeatable "noise", and
 * Math.random would make a tolerance failure impossible to reproduce.
 */
export const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Box-Muller, so the simulated scale noise is actually Gaussian. */
export const gaussian = (random: () => number) => {
  const u = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
};

export interface SimulationSpec {
  startDate: string;
  days: number;
  startKg: number;
  /** True expenditure on a given day index — a function so it can step or drift. */
  tdeeOn: (day: number) => number;
  /** Logged intake on a given day index. */
  intakeOn: (day: number) => number;
  kcalPerKgTissue: number;
  scaleNoiseSdKg: number;
  seed: number;
  /** Day indices where the user did not step on the scale. */
  skipWeightOn?: (day: number) => boolean;
  /** Day indices where the user did not log food. */
  skipIntakeOn?: (day: number) => boolean;
}

export interface SimulationResult {
  observations: DailyObservation[];
  trueWeightKg: number[];
  trueTdee: number[];
}

/**
 * Generates a ground-truth history under exactly the energy balance the model
 * assumes, then hides it behind noisy scale readings. If the filter cannot
 * recover the TDEE here it has a bug, because this is the best case.
 */
export const simulate = (spec: SimulationSpec): SimulationResult => {
  const random = rng(spec.seed);
  const observations: DailyObservation[] = [];
  const trueWeightKg: number[] = [];
  const trueTdee: number[] = [];

  let weight = spec.startKg;

  for (let day = 0; day < spec.days; day++) {
    const tdee = spec.tdeeOn(day);
    const intake = spec.intakeOn(day);
    trueWeightKg.push(weight);
    trueTdee.push(tdee);

    const observation: DailyObservation = { date: addDays(spec.startDate, day) };
    if (!spec.skipWeightOn?.(day)) {
      observation.weightKg = weight + gaussian(random) * spec.scaleNoiseSdKg;
    }
    if (!spec.skipIntakeOn?.(day)) {
      observation.intakeKcal = intake;
    }
    observations.push(observation);

    weight += (intake - tdee) / spec.kcalPerKgTissue;
  }

  return { observations, trueWeightKg, trueTdee };
};

export const rmse = (a: number[], b: number[]): number =>
  Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0) / a.length);
