import type { ISODate } from './types.ts';

/**
 * Lifting history and progressive overload.
 *
 * Pure by design, like the rest of this package: no I/O, no clock, no
 * database. Bodyweight in particular arrives as a parameter rather than being
 * fetched, which is what lets the bodyweight rules below be tested without a
 * device.
 *
 * Nothing here produces an energy figure. `expenditure.ts` already absorbs
 * training through the gap between logged intake and observed weight change —
 * train harder and the filter raises its estimate to keep explaining the data.
 * Adding workout calories on top of that counts the same energy twice, which
 * is the defect that makes exercise calories untrustworthy elsewhere.
 */

/** Hevy's own set classification, kept verbatim rather than flattened. */
export type SetType = 'normal' | 'warmup' | 'dropset' | 'failure';

export interface WorkoutSet {
  id: string;
  sessionId: string;
  /**
   * Denormalized, as `food_name` is on `log_entries`: renaming an exercise
   * later must not rewrite what history says happened.
   */
  exerciseName: string;
  setIndex: number;
  /** Canonical kg. Null means "not recorded" — never zero. */
  weightKg: number | null;
  reps: number | null;
  setType: SetType;
  /** Recorded and displayed; nothing here computes from it. */
  rpe: number | null;
  /** Carried on the set so load can be resolved without an exercise lookup. */
  bodyweightBased: boolean;
}

export interface WorkoutSession {
  id: string;
  date: ISODate;
  name: string;
  startedAt: string;
  finishedAt: string | null;
}

/**
 * The load a set actually moved, in kg.
 *
 * Null means "cannot be scored" and the caller must drop the set rather than
 * substitute a number. The two ways that happens are different mistakes with
 * the same fix:
 *
 * - A loaded exercise with no weight recorded is a data-entry slip — three
 *   Bench Press and two Deadlift rows in the imported history. Scoring those
 *   as 0 kg drags a real progression line down.
 * - A bodyweight exercise on a date with no weight trend has no basis at all.
 *   Falling back to the added load would report a weighted dip as the plate
 *   alone, wrong by a factor and invisible.
 */
export const effectiveLoadKg = (
  set: Pick<WorkoutSet, 'weightKg' | 'bodyweightBased'>,
  bodyweightKg: number | null,
): number | null => {
  if (!set.bodyweightBased) return set.weightKg;
  if (bodyweightKg === null) return null;
  return bodyweightKg + (set.weightKg ?? 0);
};

/**
 * Whether a set counts toward progression.
 *
 * Only warmups are excluded. A dropset and a set taken to failure are both
 * working sets and belong in the numbers; warmups in a progression series
 * flatten the line and hide the trend.
 */
export const isWorkingSet = (set: Pick<WorkoutSet, 'setType'>): boolean =>
  set.setType !== 'warmup';
