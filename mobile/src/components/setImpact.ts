import type { SetType } from '@adaptive-macros/engine';

export interface ImpactContent {
  /** The large figure: "102.5 × 8", "BW × 12". */
  figure: string;
  /** The word stamped under it. */
  verdict: string;
}

/**
 * What the impact frame shouts when a set goes down.
 *
 * Kept separate from the component that draws it because `vitest` runs under
 * `environment: 'node'`, where importing anything from `react-native` fails
 * outright — the same split as `muscleMap.ts` and `exerciseIconPaths.ts`.
 *
 * `weight` is already converted to the user's unit; this does not know about
 * kilos versus pounds, only about how to render the number. Whole weights lose
 * their decimal, because "100 × 8" is what you would say out loud and
 * "100.0 × 8" is what a spreadsheet would say.
 */
const VERDICTS: Record<SetType, string> = {
  normal: 'DONE',
  warmup: 'WARM-UP',
  dropset: 'DROP SET',
  failure: 'TO FAILURE',
};

export const impactContent = (
  weight: number | null,
  reps: number,
  setType: SetType,
): ImpactContent => ({
  figure: `${weight === null ? 'BW' : Number.isInteger(weight) ? String(weight) : weight.toFixed(1)} × ${reps}`,
  verdict: VERDICTS[setType],
});
