/**
 * Non-Exercise Activity Thermogenesis (NEAT) and Step Distance Calculations.
 *
 * Energetics foundation:
 * Walking energy expenditure scales directly with body mass. In metabolic chamber
 * and accelerometer validation studies, the metabolic cost of free-living ambulation
 * is approximately ~0.0005 kcal per kg of body mass per step.
 *
 * Examples:
 * - 70 kg individual walking 10,000 steps: ~350 kcal.
 * - 80 kg individual walking 10,000 steps: ~400 kcal.
 * - 90 kg individual walking 10,000 steps: ~450 kcal.
 */

export const DEFAULT_NEAT_WEIGHT_KG = 75;

/**
 * Calculates estimated active NEAT energy expenditure (in kcal) from steps and body weight.
 */
export const calculateNeatKcal = (
  steps: number,
  bodyWeightKg: number = DEFAULT_NEAT_WEIGHT_KG,
): number => {
  if (steps <= 0) return 0;
  const weight = bodyWeightKg > 0 ? bodyWeightKg : DEFAULT_NEAT_WEIGHT_KG;
  // 0.0005 kcal/kg/step
  return Math.round(steps * weight * 0.0005);
};

/**
 * Calculates estimated walking distance (in km) from steps and optional height (cm).
 * Uses standard biomechanical stride length ratio (0.414 * height) or default 0.75m per step.
 */
export const calculateDistanceKm = (
  steps: number,
  heightCm?: number | null,
): number => {
  if (steps <= 0) return 0;
  // Stride length in meters:
  const strideMeters = heightCm && heightCm > 100 && heightCm < 250
    ? (heightCm * 0.414) / 100
    : 0.75;
  const totalMeters = steps * strideMeters;
  return Math.round((totalMeters / 1000) * 10) / 10;
};
