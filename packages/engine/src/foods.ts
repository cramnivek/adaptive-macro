import type { ISODate, Nutrients } from './types.js';
import { KCAL_PER_G, roundTo } from './units.js';

export type FoodSource = 'openfoodfacts' | 'usda' | 'custom' | 'recipe';

/** A named amount, so the user can log "1 slice" instead of weighing it. */
export interface FoodPortion {
  label: string;
  grams: number;
}

export interface Food {
  id: string;
  name: string;
  brand?: string;
  /** UPC/EAN, present for scanned packaged items. */
  barcode?: string;
  source: FoodSource;
  /**
   * Nutrients per 100 g. Both food APIs normalise to 100 g, and storing one
   * canonical basis means portion maths is a single multiply everywhere
   * instead of a per-food special case.
   */
  per100g: Nutrients;
  /** Always includes a 100 g entry; APIs may add serving sizes on top. */
  portions: FoodPortion[];
  /** Set when the food came from a remote database, for cache invalidation. */
  fetchedAt?: string;
}

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface LogEntry {
  id: string;
  date: ISODate;
  foodId: string;
  grams: number;
  meal: Meal;
  /** Denormalised so the diary still renders if a cached food is evicted. */
  foodName: string;
  nutrients: Nutrients;
}

export const EMPTY_NUTRIENTS: Nutrients = {
  kcal: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: 0,
};

export const scaleNutrients = (per100g: Nutrients, grams: number): Nutrients => {
  const factor = grams / 100;
  return {
    kcal: per100g.kcal * factor,
    proteinG: per100g.proteinG * factor,
    carbsG: per100g.carbsG * factor,
    fatG: per100g.fatG * factor,
    fiberG: (per100g.fiberG ?? 0) * factor,
  };
};

export const addNutrients = (a: Nutrients, b: Nutrients): Nutrients => ({
  kcal: a.kcal + b.kcal,
  proteinG: a.proteinG + b.proteinG,
  carbsG: a.carbsG + b.carbsG,
  fatG: a.fatG + b.fatG,
  fiberG: (a.fiberG ?? 0) + (b.fiberG ?? 0),
});

export const sumNutrients = (items: Nutrients[]): Nutrients =>
  items.reduce(addNutrients, EMPTY_NUTRIENTS);

export const roundNutrients = (n: Nutrients): Nutrients => ({
  kcal: roundTo(n.kcal),
  proteinG: roundTo(n.proteinG, 1),
  carbsG: roundTo(n.carbsG, 1),
  fatG: roundTo(n.fatG, 1),
  fiberG: roundTo(n.fiberG ?? 0, 1),
});

/** Signed remainder against a target; negative means over. */
export const remainingAgainst = (target: Nutrients, consumed: Nutrients): Nutrients => ({
  kcal: target.kcal - consumed.kcal,
  proteinG: target.proteinG - consumed.proteinG,
  carbsG: target.carbsG - consumed.carbsG,
  fatG: target.fatG - consumed.fatG,
  fiberG: (target.fiberG ?? 0) - (consumed.fiberG ?? 0),
});

/**
 * Calories implied by the macros, for cross-checking a food's own kcal field.
 *
 * Crowd-sourced database entries are frequently internally inconsistent — the
 * macros say one thing and the calorie field another. Comparing the two is the
 * cheapest available signal that an entry is junk.
 */
export const kcalFromMacros = (n: Nutrients): number =>
  n.proteinG * KCAL_PER_G.protein +
  n.carbsG * KCAL_PER_G.carbs +
  n.fatG * KCAL_PER_G.fat;

/**
 * True when a food's stated calories are within `tolerance` (fractional) of
 * what its macros imply. Foods failing this should be surfaced to the user as
 * suspect rather than silently corrected — the database might be right about
 * kcal and wrong about a macro, and guessing which would be inventing data.
 */
export const isNutritionallyConsistent = (n: Nutrients, tolerance = 0.15): boolean => {
  const implied = kcalFromMacros(n);
  if (n.kcal <= 0) return implied <= 0;
  return Math.abs(implied - n.kcal) / n.kcal <= tolerance;
};
