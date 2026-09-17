// The simulation itself lives in the package's source, not here: the app needs
// it to generate demo data, and having one implementation means the histories
// the tests trust and the histories the app shows come from the same code.
export { gaussian, rng, simulate } from '../src/simulate';
export type { SimulatedDay, SimulationResult, SimulationSpec } from '../src/simulate';

/** Root-mean-square error, for comparing a filtered series against the truth. */
export const rmse = (a: number[], b: number[]): number =>
  Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0) / a.length);
