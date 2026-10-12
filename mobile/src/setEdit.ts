import { parseWeight } from './format';
import type { UnitSystem } from './state/settings';

export type SetEdit = { weightKg: number | null; reps: number } | { problem: string };

const MAX_REPS = 999;
/** Heavier than any lift on record, so anything at or past it is a slipped key. */
const MAX_WEIGHT_KG = 1000;

/**
 * Reads the edit fields. Weight is in the reader's units and converted to kg;
 * empty weight is allowed only for a bodyweight exercise (null = no added load).
 *
 * The limits are wide on purpose: this exists to catch a mistyped 800 or 18,
 * not to second-guess a real set.
 */
export const readSetEdit = (
  weightText: string,
  repsText: string,
  units: UnitSystem,
  bodyweightBased: boolean,
): SetEdit => {
  // Digits only: parseInt would let "8.5" through as 8 and "1e2" as 1.
  const reps = /^\d+$/.test(repsText.trim()) ? Number.parseInt(repsText, 10) : NaN;
  if (!(reps >= 1 && reps <= MAX_REPS)) {
    return { problem: `Reps must be a whole number from 1 to ${MAX_REPS}.` };
  }

  // A typed zero means the same as an empty box, as it does in the logger, where parseWeight
  // refuses 0 and the set is stored with no weight rather than a weight of 0.
  const typed = Number.parseFloat(weightText.replace(',', '.'));
  if (weightText.trim() === '' || typed === 0) {
    return bodyweightBased ? { weightKg: null, reps } : { problem: 'Enter a weight.' };
  }

  const weightKg = parseWeight(weightText, units);
  if (weightKg === null) {
    return {
      problem: bodyweightBased
        ? 'Enter a weight, or leave it empty for bodyweight.'
        : 'That weight looks wrong.',
    };
  }
  if (weightKg >= MAX_WEIGHT_KG) return { problem: 'That weight looks wrong.' };

  return { weightKg, reps };
};
