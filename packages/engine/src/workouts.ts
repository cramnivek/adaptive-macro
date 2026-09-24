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

/** A set paired with the date of the session it belongs to. */
export interface DatedSet {
  date: ISODate;
  set: WorkoutSet;
}

export interface ProgressionPoint {
  date: ISODate;
  /** Effective load of the heaviest working set that day. */
  heaviestWorkingSetKg: number;
  /** Sum of effective load × reps across that day's working sets. */
  workingVolumeKg: number;
  /** True when this day beat every earlier one. A tie is not a record. */
  isRecord: boolean;
}

/**
 * One exercise's progression over time, one point per session date.
 *
 * Both figures are computed on effective load, so bodyweight work counts for
 * what it actually moved. Warmups are excluded, and so is any set that cannot
 * be scored — a session left with nothing usable produces no point at all
 * rather than a zero, which would read as a session where the weight
 * collapsed.
 *
 * `bodyweightByDate` is supplied by the caller from the expenditure series'
 * `trendWeightKg`. Taking it as a parameter is what keeps this module free of
 * the filter and testable on its own.
 */
export const progressionFor = (
  sets: DatedSet[],
  bodyweightByDate: ReadonlyMap<ISODate, number>,
): ProgressionPoint[] => {
  const byDate = new Map<ISODate, { heaviest: number; volume: number }>();

  for (const { date, set } of sets) {
    if (!isWorkingSet(set)) continue;
    if (set.reps === null) continue;

    const load = effectiveLoadKg(set, bodyweightByDate.get(date) ?? null);
    if (load === null) continue;

    const day = byDate.get(date) ?? { heaviest: 0, volume: 0 };
    day.heaviest = Math.max(day.heaviest, load);
    day.volume += load * set.reps;
    byDate.set(date, day);
  }

  // Sorted before the record pass, because "beats everything before it" is a
  // statement about chronology rather than about input order.
  const ordered = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));

  let best = 0;
  return ordered.map(([date, day]) => {
    const isRecord = day.heaviest > best;
    if (isRecord) best = day.heaviest;
    return {
      date,
      heaviestWorkingSetKg: day.heaviest,
      workingVolumeKg: day.volume,
      isRecord,
    };
  });
};
