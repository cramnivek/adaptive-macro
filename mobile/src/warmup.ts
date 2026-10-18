import { BAR_WEIGHT, describePlates, platesFor } from './plates';
import type { BarChoice } from './plates';
import type { UnitSystem } from './state/settings';

export interface WarmupSet {
  stage: number;
  weight: number;
  reps: number;
  percent: number;
  perSide: number[];
  platesLabel: string;
}

/**
 * Rounds a raw target load to the nearest loadable barbell total.
 *
 * A barbell jumps by twice the smallest available plate:
 * - Metric: 2 × 1.25 kg = 2.5 kg increments
 * - Imperial: 2 × 2.5 lb = 5 lb increments
 */
export const roundToBarbell = (
  rawWeight: number,
  units: UnitSystem,
  bar: BarChoice,
): number => {
  const barWeight = BAR_WEIGHT[units][bar];
  if (rawWeight <= barWeight) return barWeight;
  const step = units === 'metric' ? 2.5 : 5;
  const overBar = rawWeight - barWeight;
  const steps = Math.round(overBar / step);
  const rounded = barWeight + steps * step;
  return Math.round(rounded * 100) / 100;
};

export const roundToIncrement = (rawWeight: number, step: number, minWeight: number): number => {
  if (rawWeight <= minWeight) return minWeight;
  const rounded = Math.round(rawWeight / step) * step;
  return Math.max(minWeight, Math.round(rounded * 100) / 100);
};

/**
 * Generates an ascending warm-up ladder leading up to a target working weight.
 *
 * Follows standard strength training warm-up protocols:
 * - For barbell lifts (`isBarbell === true`):
 *   1. Base stage: Empty bar × 10 reps (warm the joints and groove the movement).
 *   2. Progressive stages at ~50%, ~70%, ~85% (or adapted to the working load).
 * - For cable, machine, or dumbbell lifts (`isBarbell === false`, e.g. Lat Pulldown):
 *   Progressive stages at ~50% × 10, ~70% × 6, ~85% × 3 rounded to standard stack/dumbbell
 *   increments (5 lb / 2.5 kg), with no 45 lb / 20 kg empty-bar floor.
 */
export const generateWarmupRamp = (
  targetWeight: number,
  units: UnitSystem,
  bar: BarChoice,
  customPlates?: number[],
  isBarbell = true,
): WarmupSet[] => {
  const step = units === 'metric' ? 2.5 : 5;

  if (!isBarbell) {
    const minWeight = units === 'metric' ? 5 : 10;
    if (!Number.isFinite(targetWeight) || targetWeight <= minWeight) return [];

    let candidates: [number, number][];
    if (targetWeight <= minWeight * 2.5) {
      candidates = [[0.6, 10]];
    } else if (targetWeight <= minWeight * 5) {
      candidates = [
        [0.5, 10],
        [0.75, 6],
      ];
    } else {
      candidates = [
        [0.5, 10],
        [0.7, 6],
        [0.85, 3],
      ];
    }

    const result: WarmupSet[] = [];
    let prevWeight = 0;

    for (const [fraction, reps] of candidates) {
      let weight = roundToIncrement(targetWeight * fraction, step, minWeight);
      if (weight <= prevWeight) {
        weight = prevWeight + step;
      }
      if (weight >= targetWeight) {
        break;
      }
      const percent = Math.round((weight / targetWeight) * 100);
      result.push({
        stage: result.length + 1,
        weight,
        reps,
        percent,
        perSide: [],
        platesLabel: 'Warm-up load',
      });
      prevWeight = weight;
    }

    return result;
  }

  const barWeight = BAR_WEIGHT[units][bar];

  if (targetWeight <= barWeight) return [];

  // Stage candidates: [fraction of target, reps]
  let candidates: [number, number][];
  const ratio = targetWeight / barWeight;

  if (ratio <= 1.4) {
    // Very close to bar weight (e.g. 50-60 lb / 22.5-27.5 kg): just the bar
    candidates = [[0, 10]];
  } else if (ratio <= 2.0) {
    // Light-to-moderate (e.g. 65-90 lb / 30-40 kg): bar + ~70%
    candidates = [
      [0, 10],
      [0.7, 5],
    ];
  } else if (ratio <= 2.8) {
    // Moderate (e.g. 95-125 lb / 45-55 kg): bar + ~60% + ~80%
    candidates = [
      [0, 10],
      [0.6, 5],
      [0.8, 3],
    ];
  } else if (ratio <= 4.0) {
    // Standard working weights (e.g. 135-185 lb / 60-80 kg): bar + ~50% + ~70% + ~85%
    candidates = [
      [0, 10],
      [0.5, 5],
      [0.7, 3],
      [0.85, 2],
    ];
  } else {
    // Heavy working weights (e.g. 200+ lb / 90+ kg): bar + ~45% + ~65% + ~80% + ~90%
    candidates = [
      [0, 10],
      [0.45, 5],
      [0.65, 3],
      [0.8, 2],
      [0.9, 1],
    ];
  }

  const result: WarmupSet[] = [];
  let prevWeight = 0;

  for (let i = 0; i < candidates.length; i++) {
    const [fraction, reps] = candidates[i];
    let weight: number;

    if (fraction === 0) {
      weight = barWeight;
    } else {
      const raw = targetWeight * fraction;
      weight = roundToBarbell(raw, units, bar);
    }

    // Must be strictly greater than previous stage
    if (weight <= prevWeight) {
      weight = prevWeight + step;
    }

    // Must be strictly less than target weight
    if (weight >= targetWeight) {
      break;
    }

    const { perSide } = platesFor(weight, units, bar, customPlates);
    const percent = Math.round((weight / targetWeight) * 100);
    const platesLabel = perSide.length === 0 ? 'Bar only' : describePlates(perSide);

    result.push({
      stage: result.length + 1,
      weight,
      reps,
      percent,
      perSide,
      platesLabel,
    });

    prevWeight = weight;
  }

  return result;
};
