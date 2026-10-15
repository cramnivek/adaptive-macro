import type { UnitSystem } from './state/settings';

/**
 * Which plates go on each side of the bar.
 *
 * Worked in the unit the person lifts in, not in kg: a pound gym's plates are
 * 45, 35, 25, 10, 5 and 2.5, and converting a kg answer would hand back plates
 * that do not exist on its racks.
 */

export type BarChoice = 'standard' | 'light';

export const PLATE_SETS: Record<UnitSystem, number[]> = {
  metric: [25, 20, 15, 10, 5, 2.5, 1.25],
  imperial: [45, 35, 25, 10, 5, 2.5],
};

export const BAR_WEIGHT: Record<UnitSystem, Record<BarChoice, number>> = {
  metric: { standard: 20, light: 15 },
  imperial: { standard: 45, light: 35 },
};

export interface PlateLoad {
  bar: number;
  /** Heaviest first, as they go on: innermost plate first. */
  perSide: number[];
  /** What the bar actually weighs with those plates, which can fall short of the ask. */
  loaded: number;
  /** True when the weight asked for is lighter than the empty bar. */
  belowBar: boolean;
}

// Float dust: 2.5 + 1.25 summed a few times is not always exactly 3.75.
const EPSILON = 1e-6;

/**
 * Heaviest plate first, the way a bar is loaded in a gym.
 *
 * Always exact for any weight the set can make, because every plate is a
 * multiple of the smallest. It is not always the fewest plates — 60 lb a side
 * comes out 45 + 10 + 5 where 35 + 25 is one plate fewer — but it is what
 * people actually reach for, and the sheet should match the rack.
 */
export const platesFor = (total: number, units: UnitSystem, bar: BarChoice): PlateLoad => {
  const barWeight = BAR_WEIGHT[units][bar];
  if (total < barWeight - EPSILON) return { bar: barWeight, perSide: [], loaded: barWeight, belowBar: true };

  let side = (total - barWeight) / 2;
  const perSide: number[] = [];
  for (const plate of PLATE_SETS[units]) {
    while (side >= plate - EPSILON) {
      perSide.push(plate);
      side -= plate;
    }
  }
  const loaded = barWeight + 2 * perSide.reduce((sum, plate) => sum + plate, 0);
  return { bar: barWeight, perSide, loaded: Math.round(loaded * 100) / 100, belowBar: false };
};

/**
 * Whether an exercise is done with a standard barbell, by its name.
 *
 * Smith machines, trap bars and EZ bars are left out on purpose: their bars
 * weigh anything from a counterbalanced few kilos to 25, and a plate count built
 * on the wrong bar is confidently wrong. Better no button than a wrong answer.
 */
export const usesBarbell = (exerciseName: string): boolean =>
  /\b(barbell|bb)\b/i.test(exerciseName) && !/\b(smith|trap|hex|ez)\b/i.test(exerciseName);

/** "25 + 10 + 2.5", with any decimals the plates themselves have. */
export const describePlates = (perSide: number[]): string => perSide.join(' + ');

/**
 * The total weight of a barbell loaded symmetrically with the given plates on each side.
 *
 * Formula: bar + 2 * sum(perSide)
 */
export const totalFromPlates = (perSide: number[], units: UnitSystem, bar: BarChoice): number => {
  const barWeight = BAR_WEIGHT[units][bar];
  const sideSum = perSide.reduce((sum, plate) => sum + plate, 0);
  const total = barWeight + 2 * sideSum;
  return Math.round(total * 100) / 100;
};

/**
 * A one-line explanation of the calculation:
 * e.g. "45 lb bar + 2 × (45 + 25) lb = 185 lb" or "20 kg bar only"
 */
export const describeFormula = (perSide: number[], units: UnitSystem, bar: BarChoice): string => {
  const barWeight = BAR_WEIGHT[units][bar];
  const unit = units === 'metric' ? 'kg' : 'lb';
  if (perSide.length === 0) return `${barWeight} ${unit} bar only`;
  const sideStr = describePlates(perSide);
  return `${barWeight} ${unit} bar + 2 × (${sideStr}) ${unit}`;
};

