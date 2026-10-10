import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it } from 'vitest';
import { DELETE_ROUTINE_STEPS } from '../routineQueries';
import { MIGRATIONS } from '../schema';

/*
  Against a real SQLite built from the app's own migrations, as in
  `catalogueQueries.test.ts`, and loaded the same way for the same reason.
*/
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): { get(...params: unknown[]): unknown; run(...params: unknown[]): unknown };
  };
};

let db: InstanceType<typeof DatabaseSync>;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const step of MIGRATIONS) db.exec(step);

  db.prepare("INSERT INTO routines (id, name, position, created_at) VALUES ('r1', 'Push', 0, '2026-01-01')").run();
  db.prepare("INSERT INTO exercises (id, name, bodyweight_based, created_at) VALUES ('e1', 'Bench Press', 0, '2026-01-01')").run();
  db.prepare(
    "INSERT INTO routine_exercises (routine_id, exercise_id, position, target_sets, target_reps) VALUES ('r1', 'e1', 0, 4, '6-8')",
  ).run();
  db.prepare(
    `INSERT INTO sessions (id, date, routine_id, name, started_at, finished_at, notes)
     VALUES ('s1', '2026-10-01', 'r1', 'Push', '2026-10-01T18:00:00', '2026-10-01T19:00:00', NULL)`,
  ).run();
});

const deleteRoutine = (id: string) => {
  for (const step of DELETE_ROUTINE_STEPS) db.prepare(step).run(id);
};

describe('deleting a routine', () => {
  it('cannot be done by deleting the row alone once a session used it', () => {
    // The hazard this order exists for. If this ever stops throwing, the
    // detach step is no longer needed — not the other way round.
    db.prepare('DELETE FROM routine_exercises WHERE routine_id = ?').run('r1');
    expect(() => db.prepare('DELETE FROM routines WHERE id = ?').run('r1')).toThrow(/FOREIGN KEY/);
  });

  it('removes the routine and its exercise list', () => {
    deleteRoutine('r1');
    expect(db.prepare("SELECT COUNT(*) AS n FROM routines WHERE id = 'r1'").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM routine_exercises WHERE routine_id = 'r1'").get()).toEqual({ n: 0 });
  });

  it('keeps every session started from it, with only the link cleared', () => {
    deleteRoutine('r1');
    expect(db.prepare("SELECT name, routine_id FROM sessions WHERE id = 's1'").get()).toEqual({
      name: 'Push',
      routine_id: null,
    });
  });
});
