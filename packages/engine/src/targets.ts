import type { Goal, Nutrients } from './types.js';
import { KCAL_PER_G, KCAL_PER_KG_TISSUE, roundTo } from './units.js';

export interface TargetOptions {
  kcalPerKgTissue: number;
  /**
   * Protein per kg of reference body weight. 1.6–2.2 g/kg covers the range the
   * literature supports for preserving lean mass in a deficit; 1.8 sits in the
   * middle and is not worth agonising over.
   */
  proteinGPerKg: number;
  /** Floor on dietary fat, kg-scaled, for hormonal and satiety reasons. */
  minFatGPerKg: number;
  /** Fat's share of total calories when that lands above the g/kg floor. */
  fatShareOfKcal: number;
  /** Largest deficit allowed, as a fraction of expenditure. */
  maxDeficitFraction: number;
  /** Largest surplus allowed, as a fraction of expenditure. */
  maxSurplusFraction: number;
  /** Hard lower bound on the calorie target regardless of anything else. */
  floorKcal: number;
  /** Protein is capped here so an aggressive g/kg cannot crowd out everything else. */
  maxProteinShareOfKcal: number;
}

export const DEFAULT_TARGET_OPTIONS: TargetOptions = {
  kcalPerKgTissue: KCAL_PER_KG_TISSUE,
  proteinGPerKg: 1.8,
  minFatGPerKg: 0.6,
  fatShareOfKcal: 0.25,
  maxDeficitFraction: 0.25,
  maxSurplusFraction: 0.2,
  floorKcal: 1200,
  maxProteinShareOfKcal: 0.4,
};

export type TargetClampReason =
  | 'deficitCapped'
  | 'surplusCapped'
  | 'calorieFloor'
  | 'fatFloorReducedCarbs'
  | 'macroFloorsExceedBudget';

export interface CalorieTarget {
  kcal: number;
  /** Signed: negative in a deficit, positive in a surplus. */
  adjustmentKcal: number;
  /** The rate actually implied by `kcal`, after any clamping. */
  achievableRateKgPerWeek: number;
  /** Non-empty when the requested goal could not be honoured as asked. */
  clamps: TargetClampReason[];
}

/**
 * Converts a goal rate into a daily calorie target against the current
 * expenditure estimate.
 *
 * The requested rate is a request, not a promise: it gets capped by the
 * deficit/surplus fractions and the absolute floor, and `achievableRateKgPerWeek`
 * reports what the clamped target will actually produce so the UI can show the
 * real number instead of the one that was asked for.
 */
export const calorieTarget = (
  expenditureKcal: number,
  goal: Goal,
  options: TargetOptions = DEFAULT_TARGET_OPTIONS,
): CalorieTarget => {
  const clamps: TargetClampReason[] = [];

  const rate = goal.direction === 'maintain' ? 0 : Math.abs(goal.rateKgPerWeek);
  const sign = goal.direction === 'lose' ? -1 : goal.direction === 'gain' ? 1 : 0;
  let adjustment = (sign * rate * options.kcalPerKgTissue) / 7;

  const maxDeficit = expenditureKcal * options.maxDeficitFraction;
  const maxSurplus = expenditureKcal * options.maxSurplusFraction;

  if (adjustment < -maxDeficit) {
    adjustment = -maxDeficit;
    clamps.push('deficitCapped');
  }
  if (adjustment > maxSurplus) {
    adjustment = maxSurplus;
    clamps.push('surplusCapped');
  }

  let kcal = expenditureKcal + adjustment;
  if (kcal < options.floorKcal) {
    kcal = options.floorKcal;
    adjustment = kcal - expenditureKcal;
    clamps.push('calorieFloor');
  }

  return {
    kcal: roundTo(kcal),
    adjustmentKcal: roundTo(adjustment),
    achievableRateKgPerWeek: roundTo((adjustment * 7) / options.kcalPerKgTissue, 3),
    clamps,
  };
};

export interface MacroTargets extends Nutrients {
  /** Percent of total calories, for display. Sums to ~100. */
  split: { protein: number; carbs: number; fat: number };
  clamps: TargetClampReason[];
}

/**
 * Splits a calorie target into macros.
 *
 * Priority order is protein, then fat, then carbohydrate as the remainder.
 * That ordering is deliberate: protein and fat both have floors worth
 * defending, while carbohydrate is the flexible fuel. If the floors together
 * exceed the calorie budget, fat is walked back to its g/kg minimum and the
 * shortfall is flagged rather than hidden.
 *
 * `referenceWeightKg` should normally be trend weight. For someone carrying a
 * lot of fat mass, scaling protein off total body weight overshoots what lean
 * tissue can use — pass goal weight or an estimated lean mass instead.
 */
export const macroTargets = (
  kcal: number,
  referenceWeightKg: number,
  options: TargetOptions = DEFAULT_TARGET_OPTIONS,
): MacroTargets => {
  const clamps: TargetClampReason[] = [];

  const proteinCapG = (kcal * options.maxProteinShareOfKcal) / KCAL_PER_G.protein;
  let proteinG = Math.min(options.proteinGPerKg * referenceWeightKg, proteinCapG);

  const fatFloorG = options.minFatGPerKg * referenceWeightKg;
  let fatG = Math.max(fatFloorG, (kcal * options.fatShareOfKcal) / KCAL_PER_G.fat);

  let remainingKcal = kcal - proteinG * KCAL_PER_G.protein - fatG * KCAL_PER_G.fat;

  // Budget already spent before carbohydrate gets any: walk fat back toward its
  // g/kg floor, which is the cheapest concession available.
  if (remainingKcal < 0) {
    const giveBackG = Math.min(fatG - fatFloorG, -remainingKcal / KCAL_PER_G.fat);
    fatG -= giveBackG;
    remainingKcal += giveBackG * KCAL_PER_G.fat;
    clamps.push('fatFloorReducedCarbs');
  }

  // Still over budget means the protein and fat floors are together larger than
  // the whole calorie target — possible for a heavy person pinned at the
  // calorie floor. Scale both down proportionally so the macros still add up to
  // the target exactly, and flag it: returning floors that overshoot the
  // calorie goal would mean the two halves of the plan contradict each other.
  if (remainingKcal < 0) {
    const floorsKcal = proteinG * KCAL_PER_G.protein + fatG * KCAL_PER_G.fat;
    const shrink = kcal / floorsKcal;
    proteinG *= shrink;
    fatG *= shrink;
    remainingKcal = 0;
    clamps.push('macroFloorsExceedBudget');
  }

  const carbsG = remainingKcal / KCAL_PER_G.carbs;

  const totalKcal =
    proteinG * KCAL_PER_G.protein + carbsG * KCAL_PER_G.carbs + fatG * KCAL_PER_G.fat;

  return {
    kcal: roundTo(kcal),
    proteinG: roundTo(proteinG),
    carbsG: roundTo(carbsG),
    fatG: roundTo(fatG),
    split: {
      protein: roundTo((proteinG * KCAL_PER_G.protein * 100) / totalKcal, 1),
      carbs: roundTo((carbsG * KCAL_PER_G.carbs * 100) / totalKcal, 1),
      fat: roundTo((fatG * KCAL_PER_G.fat * 100) / totalKcal, 1),
    },
    clamps,
  };
};

export interface DailyProgram {
  calories: CalorieTarget;
  macros: MacroTargets;
  expenditureKcal: number;
  referenceWeightKg: number;
}

/** Convenience wrapper: expenditure estimate plus goal in, full day plan out. */
export const buildProgram = (
  expenditureKcal: number,
  referenceWeightKg: number,
  goal: Goal,
  options: TargetOptions = DEFAULT_TARGET_OPTIONS,
): DailyProgram => {
  const calories = calorieTarget(expenditureKcal, goal, options);
  const macros = macroTargets(calories.kcal, referenceWeightKg, options);
  return {
    calories,
    macros,
    expenditureKcal: roundTo(expenditureKcal),
    referenceWeightKg: roundTo(referenceWeightKg, 2),
  };
};
