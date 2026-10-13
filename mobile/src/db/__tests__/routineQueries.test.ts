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

describe('cardio routines and sets', () => {
  it('stores cardio routine targets and sets correctly in the database', () => {
    db.prepare("INSERT INTO exercises (id, name, bodyweight_based, is_cardio, cardio_mode, created_at) VALUES ('e2', 'Treadmill', 0, 1, 'treadmill', '2026-01-01')").run();
    db.prepare(
      `INSERT INTO routine_exercises (routine_id, exercise_id, position, target_sets, target_reps, is_cardio, cardio_mode, target_time, target_speed)
       VALUES ('r1', 'e2', 1, 1, NULL, 1, 'treadmill', '30m', 8.5)`,
    ).run();

    const routineEx = db.prepare("SELECT is_cardio, cardio_mode, target_time, target_speed FROM routine_exercises WHERE routine_id = 'r1' AND exercise_id = 'e2'").get() as {
      is_cardio: number;
      cardio_mode: string;
      target_time: string;
      target_speed: number;
    };
    expect(routineEx.is_cardio).toBe(1);
    expect(routineEx.cardio_mode).toBe('treadmill');
    expect(routineEx.target_time).toBe('30m');
    expect(routineEx.target_speed).toBe(8.5);

    db.prepare(
      `INSERT INTO sets (id, session_id, exercise_id, exercise_name, set_index, weight_kg, reps, set_type, is_cardio, cardio_mode, speed_kph, duration_seconds, created_at)
       VALUES ('set-1', 's1', 'e2', 'Treadmill', 0, NULL, 0, 'normal', 1, 'treadmill', 8.5, 1800, '2026-10-01T18:00:00')`,
    ).run();

    const logged = db.prepare("SELECT speed_kph, duration_seconds, cardio_mode FROM sets WHERE id = 'set-1'").get() as {
      speed_kph: number;
      duration_seconds: number;
      cardio_mode: string;
    };
    expect(logged.speed_kph).toBe(8.5);
    expect(logged.duration_seconds).toBe(1800);
    expect(logged.cardio_mode).toBe('treadmill');
  });
});
