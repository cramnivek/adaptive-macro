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
  bodyweightBased = false,
  bodyweightKg?: number | null,
): string | null => {
  const working = previous.filter(
    (set) =>
      set.setType !== 'warmup' &&
      (bodyweightBased ? true : set.weightKg !== null && set.weightKg > 0),
  );
  if (working.length === 0) return null;

  const top = working.reduce((best, set) => ((set.weightKg ?? 0) > (best.weightKg ?? 0) ? set : best));
  if (top.rpe === null) return null;

  const effectiveWeight = bodyweightBased
    ? (bodyweightKg ?? 0) + (top.weightKg ?? 0)
    : top.weightKg;
  if (effectiveWeight === null || effectiveWeight <= 0) return null;

  const step = units === 'metric' ? 2.5 : lbToKg(5);
  const suggestion = suggestNextLoad(effectiveWeight, top.rpe, step, {
    lastReps: top.reps,
    targetReps,
    isCompound,
  });
  if (suggestion === null) return null;

  const unit = units === 'metric' ? 'kg' : 'lb';
  const show = (kg: number) => {
    // Rounded first: pounds come back from kilos carrying float dust, so a
    // 230 lb suggestion arrived as 229.99999 and printed as "230.0".
    const value = Math.round(displayWeight(kg, units) * 10) / 10;
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  };

  const isPureBW = bodyweightBased && (top.weightKg === null || top.weightKg === 0);
  const lastLoad = isPureBW ? 'BW' : show(top.weightKg ?? 0);
  const last = `${lastLoad} × ${top.reps ?? '?'} @${formatRpe(top.rpe)}`;

  if (suggestion.reason === 'rep-target') {
    return `Last top set ${last} — aim for ${suggestion.suggestedReps} reps before adding weight.`;
  }

  if (bodyweightBased) {
    const addedKg = Math.max(0, suggestion.weightKg - (bodyweightKg ?? 0));
    const nextAdded = addedKg > 0 ? `+${show(addedKg)} ${unit}` : `${show(step)} ${unit}`;
    if (suggestion.suggestedReps && suggestion.reason !== 'hold') {
      return `Last top set ${last} — top of range hit! Try adding ${nextAdded} for ${suggestion.suggestedReps} reps.`;
    }
    if (suggestion.reason === 'hold') {
      return `Last top set ${last} — near the limit. Hold ${isPureBW ? 'BW' : nextAdded}.`;
    }
    return `Last top set ${last} — try adding ${nextAdded}.`;
  }

  const next = `${show(suggestion.weightKg)} ${unit}`;
  if (suggestion.suggestedReps && suggestion.reason !== 'hold') {
    return `Last top set ${last} — top of range hit! Try ${next} for ${suggestion.suggestedReps} reps.`;
  }
  if (suggestion.reason === 'hold') return `Last top set ${last} — near the limit. Hold ${next}.`;
  return `Last top set ${last} — try ${next}.`;
};
