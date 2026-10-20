import type { Sex } from './types.ts';

/**
 * How much energy a kilogram of weight change holds, from body composition.
 *
 * The estimator turns weight change into an energy balance, so this number
 * scales everything it infers. The classic 7700 kcal/kg treats every kilo
 * lost as fat; Hall (2008) showed that holds only above about 30 kg of body
 * fat, because a leaner body loses proportionally more lean tissue, which
 * carries far less energy per kilo. For someone with 15 kg of fat losing half
 * a kilo a week, 7700 overstated expenditure by about 100 kcal a day.
 *
 * The model is Chow & Hall's, "The Dynamics of Human Body Weight Change"
 * (PLoS Comput Biol 2008): the share of an energy imbalance that goes to lean
 * tissue is p = 2 / (2 + F), F being fat mass in kg (Forbes's law expressed
 * in energy terms), and the energy density of the change is
 *
 *     ρ = ρF·ρL / (ρL + (ρF − ρL)·p)
 *
 * with ρF = 39.5 MJ/kg for fat and ρL = 7.6 MJ/kg for lean tissue (protein at
 * 19.7 MJ/kg carrying 1.6 kg of water per kg).
 */

const FAT_MJ_PER_KG = 39.5;
const LEAN_MJ_PER_KG = 7.6;
const KCAL_PER_MJ = 239.006;

export const energyDensityKcalPerKg = (fatMassKg: number): number => {
  const fat = Math.max(0, fatMassKg);
  const p = 2 / (2 + fat);
  const mj = (FAT_MJ_PER_KG * LEAN_MJ_PER_KG) / (LEAN_MJ_PER_KG + (FAT_MJ_PER_KG - LEAN_MJ_PER_KG) * p);
  return mj * KCAL_PER_MJ;
};

/**
 * Body fat percentage from BMI, age and sex: Deurenberg, Weststrate & Seidell
 * (Br J Nutr 1991), for adults. Its standard error is about 4 points of body
 * fat and it slightly overestimates in obesity, so it is a fallback for when
 * nobody has measured, never a figure to show as a result.
 */
export const deurenbergBodyFatPct = (weightKg: number, heightCm: number, age: number, sex: Sex): number => {
  const metres = heightCm / 100;
  const bmi = weightKg / (metres * metres);
  const pct = 1.2 * bmi + 0.23 * age - 10.8 * (sex === 'male' ? 1 : 0) - 5.4;
  // Outside this the formula is extrapolating past anyone it was fitted on.
  return Math.min(60, Math.max(3, pct));
};
