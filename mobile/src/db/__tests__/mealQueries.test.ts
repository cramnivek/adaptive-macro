import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it } from 'vitest';
import { LAST_MEALS_BEFORE } from '../mealQueries';
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

const eat = (date: string, meal: string, kcal: number) => {
  n += 1;
  db.prepare(
    `INSERT INTO log_entries (id, date, food_id, food_name, grams, meal, kcal, protein_g, carbs_g, fat_g, created_at)
     VALUES (?, ?, 'f', 'Food', 100, ?, ?, 0, 0, 0, '2026-10-01')`,
  ).run(`e${n}`, date, meal, kcal);
};

/** Today is 2026-10-11; the window is the seven days before it. */
const lastMeals = () =>
  (db.prepare(LAST_MEALS_BEFORE).all('2026-10-11', '2026-10-04') as { meal: string }[]).sort((a, b) =>
    a.meal.localeCompare(b.meal),
  );

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  for (const step of MIGRATIONS) db.exec(step);
});

describe('last meals before a day', () => {
  it('finds yesterday’s meal, totalled across its items', () => {
    eat('2026-10-10', 'breakfast', 400);
    eat('2026-10-10', 'breakfast', 185);
    expect(lastMeals()).toEqual([{ meal: 'breakfast', date: '2026-10-10', kcal: 585, items: 2 }]);
  });

  it('reaches past a day the meal was skipped, to the latest one in the week', () => {
    eat('2026-10-08', 'breakfast', 500);
    eat('2026-10-10', 'lunch', 700);
    expect(lastMeals()).toEqual([
      { meal: 'breakfast', date: '2026-10-08', kcal: 500, items: 1 },
      { meal: 'lunch', date: '2026-10-10', kcal: 700, items: 1 },
    ]);
  });

  it('takes only the latest day, not every day the meal appears', () => {
    eat('2026-10-07', 'dinner', 900);
    eat('2026-10-09', 'dinner', 650);
    expect(lastMeals()).toEqual([{ meal: 'dinner', date: '2026-10-09', kcal: 650, items: 1 }]);
  });

  it('ignores the day itself and anything older than a week', () => {
    eat('2026-10-11', 'snack', 200);
    eat('2026-10-03', 'snack', 300);
    expect(lastMeals()).toEqual([]);
  });
});
