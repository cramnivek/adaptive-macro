import type { SetType } from '@adaptive-macros/engine';
import type { AppPersonality } from '../state/settings';
import { getEventCopy } from '../copy/personality';

export interface ImpactContent {
  /** The large figure: "102.5 × 8", "BW × 12". */
  figure: string;
  /** The word stamped under it. */
  verdict: string;
  /** True when this set is an all-time personal record */
  isPR?: boolean;
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
  isPR = false,
  personality?: AppPersonality,
  seed?: string | number,
): ImpactContent => {
  let verdict = '';
  if (isPR && setType !== 'warmup') {
    verdict = getEventCopy('workout.impact_pr', { personality, seed });
  } else if (setType === 'failure') {
    verdict = getEventCopy('workout.impact_failure', { personality, seed });
  } else if (setType === 'dropset') {
    verdict = getEventCopy('workout.impact_dropset', { personality, seed });
  } else if (setType === 'warmup') {
    verdict = getEventCopy('workout.impact_warmup', { personality, seed });
  } else {
    verdict = getEventCopy('workout.impact_done', { personality, seed });
  }

  return {
    figure: `${weight === null ? 'BW' : Number.isInteger(weight) ? String(weight) : weight.toFixed(1)} × ${reps}`,
    verdict: verdict || (isPR && setType !== 'warmup' ? 'NEW PR!' : VERDICTS[setType]),
    isPR: isPR && setType !== 'warmup',
  };
};
