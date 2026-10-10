import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it } from 'vitest';
import { DAILY_INTAKE_FOR_ESTIMATE } from '../intakeQueries';
import { MIGRATIONS } from '../schema';

/*
  Against a real SQLite built from the app's own migrations, as in
  `catalogueQueries.test.ts`, and loaded the same way for the same reason.
*/
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): { all(...params: unknown[]): unknown[]; run(...params: unknown[]): unknown };
  };
};

let db: InstanceType<typeof DatabaseSync>;
let n = 0;

const eat = (date: string, kcal: number) => {
  n += 1;
  db.prepare(
    `INSERT INTO log_entries (id, date, food_id, food_name, grams, meal, kcal, protein_g, carbs_g, fat_g, created_at)
     VALUES (?, ?, 'f', 'Food', 100, 'lunch', ?, 0, 0, 0, '2026-10-01')`,
  ).run(`e${n}`, date, kcal);
};

const mark = (date: string, complete: 0 | 1) =>
  db.prepare("INSERT INTO day_status (date, complete, marked_at) VALUES (?, ?, '2026-10-02')").run(date, complete);

const intake = () => db.prepare(DAILY_INTAKE_FOR_ESTIMATE).all();

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const step of MIGRATIONS) db.exec(step);

  eat('2026-10-01', 600);
  eat('2026-10-01', 1400);
  eat('2026-10-02', 450);
  eat('2026-10-03', 2100);
});

describe('daily intake for the estimate', () => {
  it('sums each logged day when nobody has said otherwise', () => {
    expect(intake()).toEqual([
      { date: '2026-10-01', kcal: 2000 },
      { date: '2026-10-02', kcal: 450 },
      { date: '2026-10-03', kcal: 2100 },
    ]);
  });

  it('leaves out a day marked as not fully logged', () => {
    mark('2026-10-02', 0);
    expect(intake()).toEqual([
      { date: '2026-10-01', kcal: 2000 },
      { date: '2026-10-03', kcal: 2100 },
    ]);
  });

  it('keeps a light day confirmed as complete', () => {
    mark('2026-10-02', 1);
    expect(intake()).toContainEqual({ date: '2026-10-02', kcal: 450 });
  });

  it('is unaffected by a mark on a day with nothing logged', () => {
    mark('2026-09-30', 0);
    expect(intake()).toHaveLength(3);
  });
});
