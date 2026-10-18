import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../schema';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    exec(sql: string): void;
    prepare(sql: string): {
      get(...params: unknown[]): any;
      all(...params: unknown[]): any[];
      run(...params: unknown[]): unknown;
    };
  };
};

let db: InstanceType<typeof DatabaseSync>;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const step of MIGRATIONS) db.exec(step);
});

describe('daily_steps table & queries (migration v13)', () => {
  it('creates the daily_steps table with appropriate columns', () => {
    const info = db.prepare("PRAGMA table_info('daily_steps')").all() as { name: string }[];
    const names = info.map((col) => col.name);
    expect(names).toContain('date');
    expect(names).toContain('steps');
    expect(names).toContain('source');
    expect(names).toContain('active_kcal');
    expect(names).toContain('distance_km');
    expect(names).toContain('created_at');
  });

  it('inserts and updates daily step counts with conflict resolution', () => {
    db.prepare(`
      INSERT INTO daily_steps (date, steps, source, active_kcal, distance_km, created_at)
      VALUES ('2026-10-18', 8400, 'manual', 336.0, 6.3, '2026-10-18T10:00:00Z')
    `).run();

    let row = db.prepare('SELECT date, steps, source, active_kcal, distance_km FROM daily_steps WHERE date = ?').get('2026-10-18') as any;
    expect(row.steps).toBe(8400);
    expect(row.source).toBe('manual');
    expect(row.active_kcal).toBe(336.0);

    // Update with Apple Health sync
    db.prepare(`
      INSERT INTO daily_steps (date, steps, source, active_kcal, distance_km, created_at)
      VALUES ('2026-10-18', 11200, 'apple_health', 448.0, 8.4, '2026-10-18T20:00:00Z')
      ON CONFLICT(date) DO UPDATE SET
        steps = excluded.steps,
        source = excluded.source,
        active_kcal = excluded.active_kcal,
        distance_km = excluded.distance_km
    `).run();

    row = db.prepare('SELECT date, steps, source, active_kcal, distance_km FROM daily_steps WHERE date = ?').get('2026-10-18') as any;
    expect(row.steps).toBe(11200);
    expect(row.source).toBe('apple_health');
    expect(row.active_kcal).toBe(448.0);
    expect(row.distance_km).toBe(8.4);
  });

  it('queries ranges of daily step records', () => {
    db.prepare(`
      INSERT INTO daily_steps (date, steps, source, active_kcal, distance_km, created_at)
      VALUES
        ('2026-10-15', 7000, 'manual', 280, 5.2, '2026-10-15T12:00:00Z'),
        ('2026-10-16', 10500, 'manual', 420, 7.8, '2026-10-16T12:00:00Z'),
        ('2026-10-17', 12000, 'apple_health', 480, 9.0, '2026-10-17T12:00:00Z'),
        ('2026-10-18', 9500, 'apple_health', 380, 7.1, '2026-10-18T12:00:00Z')
    `).run();

    const rows = db.prepare(
      'SELECT date, steps FROM daily_steps WHERE date >= ? AND date <= ? ORDER BY date ASC'
    ).all('2026-10-16', '2026-10-18') as any[];

    expect(rows.length).toBe(3);
    expect(rows[0].date).toBe('2026-10-16');
    expect(rows[0].steps).toBe(10500);
    expect(rows[2].date).toBe('2026-10-18');
    expect(rows[2].steps).toBe(9500);
  });
});
