import type { LoggedSet } from './db';
import { displayWeight } from './format';
import { formatRpe } from './rpe';
import { trim } from './social/postPayload';
import type { UnitSystem } from './state/settings';

/** A finished workout's sets, grouped by exercise in the order they were first done. */
export const groupByExercise = (sets: LoggedSet[]): { name: string; sets: LoggedSet[] }[] => {
  const groups: { name: string; sets: LoggedSet[] }[] = [];
  for (const set of sets) {
    // A later set of an earlier lift joins its group: supersets and a returned-to
    // exercise are one lift in the record, not two.
    const group = groups.find((candidate) => candidate.name === set.exerciseName);
    if (group) group.sets.push(set);
    else groups.push({ name: set.exerciseName, sets: [set] });
  }
  return groups;
};

/**
 * One set as a line: "80 kg × 8", "220.5 lb × 5", "12 reps" for a set with no added load,
 * with " @ 8" appended when an RPE was recorded. Weights rounded to 0.1 in the reader's units.
 */
export const setLine = (set: LoggedSet, units: UnitSystem): string => {
  const loaded = set.weightKg !== null && set.weightKg > 0;
  const body = loaded
    ? `${trim(Math.round(displayWeight(set.weightKg as number, units) * 10) / 10)} ${units === 'metric' ? 'kg' : 'lb'} × ${set.reps}`
    : `${set.reps} ${set.reps === 1 ? 'rep' : 'reps'}`;
  return set.rpe === null ? body : `${body} @ ${formatRpe(set.rpe)}`;
};
