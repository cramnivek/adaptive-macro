/**
 * Deleting a routine, as values so the order can be run against real SQLite.
 *
 * `sessions.routine_id` references `routines` with no ON DELETE, and foreign
 * keys are on. Once a session records the routine it was started from, a
 * routine that has ever been used cannot be deleted without first letting its
 * sessions go — they keep their name and every set, and lose only the link.
 */
export const DELETE_ROUTINE_STEPS = [
  'UPDATE sessions SET routine_id = NULL WHERE routine_id = ?',
  'DELETE FROM routine_exercises WHERE routine_id = ?',
  'DELETE FROM routines WHERE id = ?',
] as const;
