import type { Backup } from './index';

/**
 * The rows a backup puts back, table by table, in an order foreign keys accept.
 *
 * Kept apart from `restoreBackup` so it can run against a real SQLite in the
 * tests: the restore itself is bound to expo-sqlite and never ran anywhere but
 * a phone, which is how every backup holding a weigh-in came to be refused
 * without anyone noticing.
 */
export const rowsToRestore = (backup: Backup): [table: string, rows: Record<string, unknown>[] | undefined][] => [
  ['settings', backup.settings as Record<string, unknown>[]],
  [
    'weights',
    // Backups used to carry only date and kg, while the table requires
    // created_at, so every one of them failed on its first weigh-in and the
    // transaction took the whole restore with it. The export time is the
    // closest thing to a creation time those files hold.
    backup.weights.map((row) => ({ created_at: backup.exportedAt, ...row })),
  ],
  ['foods', backup.foods as unknown as Record<string, unknown>[]],
  ['log_entries', backup.entries as unknown as Record<string, unknown>[]],
  ['exercise_catalogue', backup.exerciseCatalogue],
  ['exercises', backup.exercises],
  ['routines', backup.routines],
  ['routine_exercises', backup.routineExercises],
  ['sessions', backup.sessions],
  ['sets', backup.sets],
  ['day_status', backup.dayStatus],
];
