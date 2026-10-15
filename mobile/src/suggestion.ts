import { lbToKg, suggestNextLoad } from '@adaptive-macros/engine';
import type { SetType } from '@adaptive-macros/engine';
import { displayWeight } from './format';
import { formatRpe } from './rpe';
import type { UnitSystem } from './state/settings';

interface PreviousSet {
  weightKg: number | null;
  reps: number | null;
  setType: SetType;
  rpe: number | null;
}

/**
 * The line under an exercise saying what to load, from how last time felt.
 *
 * Read off the *top* set — the heaviest working set of the last session —
 * because that is the one a lifter is progressing. If the top set was not
 * rated there is no hint, and deliberately so: falling back to a lighter set's
 * rating would describe a different effort and suggest from it as if it were
 * the same one.
 */
export const nextLoadHint = (
  previous: PreviousSet[],
  units: UnitSystem,
  targetReps?: string | null,
  isCompound?: boolean,
): string | null => {
  const working = previous.filter(
    (set) => set.setType !== 'warmup' && set.weightKg !== null && set.weightKg > 0,
  );
  if (working.length === 0) return null;

  const top = working.reduce((best, set) => ((set.weightKg ?? 0) > (best.weightKg ?? 0) ? set : best));
  const step = units === 'metric' ? 2.5 : lbToKg(5);
  const suggestion = suggestNextLoad(top.weightKg, top.rpe, step, {
    lastReps: top.reps,
    targetReps,
    isCompound,
  });
  if (suggestion === null || top.rpe === null) return null;

  const unit = units === 'metric' ? 'kg' : 'lb';
  const show = (kg: number) => {
    // Rounded first: pounds come back from kilos carrying float dust, so a
    // 230 lb suggestion arrived as 229.99999 and printed as "230.0".
    const value = Math.round(displayWeight(kg, units) * 10) / 10;
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  };

  const last = `${show(top.weightKg ?? 0)} × ${top.reps ?? '?'} @${formatRpe(top.rpe)}`;
  const next = `${show(suggestion.weightKg)} ${unit}`;

  if (suggestion.reason === 'rep-target') {
    return `Last top set ${last} — aim for ${suggestion.suggestedReps} reps before adding weight.`;
  }
  if (suggestion.suggestedReps && suggestion.reason !== 'hold') {
    return `Last top set ${last} — top of range hit! Try ${next} for ${suggestion.suggestedReps} reps.`;
  }
  if (suggestion.reason === 'hold') return `Last top set ${last} — near the limit. Hold ${next}.`;
  return `Last top set ${last} — try ${next}.`;
};
