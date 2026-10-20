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

describe('body_measurements table & queries (migration v11)', () => {
  it('creates the body_measurements table with appropriate columns', () => {
    const info = db.prepare("PRAGMA table_info('body_measurements')").all() as { name: string }[];
    const names = info.map((col) => col.name);
    expect(names).toContain('id');
    expect(names).toContain('date');
    expect(names).toContain('waist_cm');
    expect(names).toContain('chest_cm');
    expect(names).toContain('arms_cm');
    expect(names).toContain('thighs_cm');
    expect(names).toContain('calves_cm');
    expect(names).toContain('hips_cm');
    expect(names).toContain('neck_cm');
    expect(names).toContain('shoulders_cm');
    expect(names).toContain('body_fat_pct');
    expect(names).toContain('notes');
    expect(names).toContain('created_at');
  });

  it('inserts and retrieves body measurements sorted by date descending', () => {
    db.prepare(`
      INSERT INTO body_measurements (id, date, waist_cm, chest_cm, arms_cm, body_fat_pct, notes, created_at)
      VALUES ('bm1', '2026-10-01', 82.5, 104.0, 38.0, 15.5, 'Starting cut', '2026-10-01T08:00:00Z')
    `).run();

    db.prepare(`
      INSERT INTO body_measurements (id, date, waist_cm, chest_cm, arms_cm, body_fat_pct, notes, created_at)
      VALUES ('bm2', '2026-10-15', 80.5, 103.5, 37.8, 14.8, 'Two weeks in', '2026-10-15T08:00:00Z')
    `).run();

    const rows = db.prepare(`
      SELECT id, date, waist_cm, chest_cm, arms_cm, body_fat_pct, notes
        FROM body_measurements
       ORDER BY date DESC
    `).all() as any[];

    expect(rows.length).toBe(2);
    expect(rows[0].date).toBe('2026-10-15');
    expect(rows[0].waist_cm).toBe(80.5);
    expect(rows[0].body_fat_pct).toBe(14.8);
    expect(rows[1].date).toBe('2026-10-01');
    expect(rows[1].waist_cm).toBe(82.5);
  });

  it('deletes a measurement by id', () => {
    db.prepare(`
      INSERT INTO body_measurements (id, date, waist_cm, created_at)
      VALUES ('bm_del', '2026-10-18', 81.0, '2026-10-18T08:00:00Z')
    `).run();

    expect(db.prepare("SELECT COUNT(*) AS c FROM body_measurements WHERE id = 'bm_del'").get().c).toBe(1);
    db.prepare("DELETE FROM body_measurements WHERE id = 'bm_del'").run();
    expect(db.prepare("SELECT COUNT(*) AS c FROM body_measurements WHERE id = 'bm_del'").get().c).toBe(0);
  });
});

describe('body_fat_source (migration v14)', () => {
  it('adds a nullable source column beside the figure', () => {
    const info = db.prepare("PRAGMA table_info('body_measurements')").all() as { name: string; notnull: number }[];
    const column = info.find((col) => col.name === 'body_fat_source');
    expect(column).toBeDefined();
    expect(column!.notnull).toBe(0);
  });
});
