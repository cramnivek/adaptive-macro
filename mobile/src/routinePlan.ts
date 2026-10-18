/**
 * What a routine puts on the session screen before anything is logged.
 *
 * A routine's exercise opens with as many set rows as it targets, so the grid
 * at the rack is the plan rather than one row and a button. The rows are drafts,
 * as every row is until ticked: nothing is written until a set is done.
 */

/**
 * How many draft rows an exercise still needs to reach its target.
 *
 * Warm-up sets do not count toward routine target sets: if a routine specifies
 * 3 working sets, and 1 or more warm-up sets are logged, the routine still targets
 * 3 working sets.
 */
export const draftsToAdd = (targetSets: number, rowsAlready: number, warmupRowsAlready = 0): number => {
  const workingRows = Math.max(0, rowsAlready - warmupRowsAlready);
  return Math.max(0, targetSets - workingRows);
};

/**
 * The reps a draft row opens with.
 *
 * Last time's reps at that set, the same rule a new row already follows. With
 * no history, a target that is one number is the obvious entry; a range or
 * "AMRAP" is not a number to type, so the box is left for the lifter.
 */
export const repsPrefill = (previousReps: number | undefined, targetReps: string | null): string => {
  if (previousReps !== undefined) return String(previousReps);
  return targetReps !== null && /^\d+$/.test(targetReps) ? targetReps : '';
};

/**
 * The order exercises come back in when a session is reopened: the routine's,
 * then anything added during the session, in the order it was first logged.
 * It is the order the screen showed before it was closed.
 */
export const resumeOrder = (planned: string[], logged: string[]): string[] => {
  const names = [...planned];
  for (const name of logged) if (!names.includes(name)) names.push(name);
  return names;
};

/** The line under an exercise's name saying what the routine asks for. */
export const targetLabel = (sets: number, reps: string | null): string =>
  reps === null ? `TARGET ${sets} SETS` : `TARGET ${sets} × ${reps.toUpperCase()}`;

export interface LoggedSetLike {
  id?: string;
  weightKg: number | null;
  reps: number;
  setType: string;
  rpe?: number | null;
  isCardio?: boolean;
  speedKph?: number | null;
  inclinePct?: number | null;
  durationSeconds?: number | null;
  distanceKm?: number | null;
}

export interface RowLike {
  setType: string;
  isCardio?: boolean;
}

/**
 * Resolves the matching set from the previous session for a row.
 * Separates warm-ups from working sets:
 * - A warm-up row matches against the previous session's warm-ups at that warm-up index.
 * - A working set row matches against the previous session's working sets at that working set index.
 *   If the lifter is performing more working sets than last time, it falls back to the last working set.
 */
export const previousSetFor = <T extends LoggedSetLike>(
  previousSets: T[] | undefined,
  rows: RowLike[],
  rowIndex: number,
  setType: string = rows[rowIndex]?.setType ?? 'normal',
): T | undefined => {
  if (!previousSets || previousSets.length === 0) return undefined;

  if (setType === 'warmup') {
    const warmupIndex = rows.slice(0, rowIndex).filter((r) => r.setType === 'warmup').length;
    const prevWarmups = previousSets.filter((s) => s.setType === 'warmup');
    return prevWarmups[warmupIndex];
  }

  // Working sets:
  const workingIndex = rows.slice(0, rowIndex).filter((r) => r.setType !== 'warmup').length;
  const prevWorking = previousSets.filter((s) => s.setType !== 'warmup');
  if (prevWorking.length === 0) return undefined;
  return prevWorking[workingIndex] ?? prevWorking[prevWorking.length - 1];
};

