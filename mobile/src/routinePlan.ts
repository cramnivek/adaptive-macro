/**
 * What a routine puts on the session screen before anything is logged.
 *
 * A routine's exercise opens with as many set rows as it targets, so the grid
 * at the rack is the plan rather than one row and a button. The rows are drafts,
 * as every row is until ticked: nothing is written until a set is done.
 */

/** How many draft rows an exercise still needs to reach its target. */
export const draftsToAdd = (targetSets: number, rowsAlready: number): number =>
  Math.max(0, targetSets - rowsAlready);

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
