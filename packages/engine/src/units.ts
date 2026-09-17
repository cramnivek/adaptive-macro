export const KG_PER_LB = 0.45359237;
export const LB_PER_KG = 1 / KG_PER_LB;

export const lbToKg = (lb: number): number => lb * KG_PER_LB;
export const kgToLb = (kg: number): number => kg * LB_PER_KG;

export const CM_PER_INCH = 2.54;
export const inchesToCm = (inches: number): number => inches * CM_PER_INCH;
export const cmToInches = (cm: number): number => cm / CM_PER_INCH;

/** Atwater factors: kcal yielded per gram of each macronutrient. */
export const KCAL_PER_G = {
  protein: 4,
  carbs: 4,
  fat: 9,
  alcohol: 7,
} as const;

/**
 * Energy density of body-mass change, kcal per kg.
 *
 * 7700 kcal/kg (3500 kcal/lb) is the classic figure and assumes the tissue
 * gained or lost is predominantly adipose. It is an approximation: real tissue
 * change is a mix of fat, lean mass and water, so the true value drifts with
 * deficit size and training status. The estimator treats it as a fixed
 * constant, which means a systematically wrong value shows up as a
 * systematically biased expenditure estimate — hence it is configurable.
 */
export const KCAL_PER_KG_TISSUE = 7700;

export const roundTo = (value: number, decimals = 0): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};
