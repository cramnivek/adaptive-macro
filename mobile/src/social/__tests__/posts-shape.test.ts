import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LoggedSet } from '../../db';
import { type FinishedWorkout, postPayload } from '../postPayload';
import { as, freshDatabase, USER_A } from './postgres';

/**
 * What the database accepts in a post before anyone else can read it. The app
 * writes only well-formed posts, but any account can write a row by hand, so
 * these are the rules a follower's phone can rely on.
 */

const lift = (overrides: Record<string, unknown> = {}) => ({
  name: 'Bench Press (Barbell)',
  sets: 3,
  best_kg: 100,
  best_reps: 6,
  ...overrides,
});

const addPost = (
  db: PGlite,
  { session = 's1', exercises = [lift()] as unknown, highlight = undefined as unknown } = {},
) =>
  as(
    db,
    USER_A,
    `insert into posts (author_id, session_id, title, performed_on, duration_min, sets, volume_kg, exercises, highlight)
     values ($1, $2, 'Push', '2026-10-11', 60, 12, 4200, $3::jsonb, $4::jsonb)`,
    [USER_A, session, JSON.stringify(exercises), highlight === undefined ? null : JSON.stringify(highlight)],
  );

let db: PGlite;

beforeEach(async () => {
  db = await freshDatabase();
  await as(db, USER_A, `insert into profiles (id, username, display_name) values ($1, 'alice', 'alice')`, [USER_A]);
});

describe('a post’s exercises', () => {
  it('accept a loaded lift and a bodyweight one', async () => {
    await addPost(db, { exercises: [lift(), lift({ name: 'Pull Up', best_kg: null, best_reps: 12 })] });
    expect(await as(db, USER_A, `select jsonb_array_length(exercises) as n from posts`)).toEqual([{ n: 2 }]);
  });

  it('accept none, and the limits of every field', async () => {
    await addPost(db, { session: 'none', exercises: [] });
    await addPost(db, {
      session: 'limits',
      exercises: [
        lift({ name: 'x'.repeat(80), sets: 100, best_kg: 1000, best_reps: 1000 }),
        lift({ name: 'y', sets: 0, best_kg: 0, best_reps: 0 }),
      ],
    });
  });

  it('accept a whole number written with a decimal point', async () => {
    await as(
      db,
      USER_A,
      `insert into posts (author_id, session_id, title, performed_on, duration_min, sets, exercises)
       values ($1, 'point', 'Push', '2026-10-11', 60, 3, '[{"name":"Bench","sets":3.0,"best_kg":100.0,"best_reps":6.0}]'::jsonb)`,
      [USER_A],
    );
  });

  it('refuse a weight that is a string', async () => {
    await expect(addPost(db, { exercises: [lift({ best_kg: '100' })] })).rejects.toThrow(/posts_exercises_valid/);
  });

  it('refuse a weight outside 0 to 1000 kg', async () => {
    await expect(addPost(db, { exercises: [lift({ best_kg: -1 })] })).rejects.toThrow(/posts_exercises_valid/);
    await expect(addPost(db, { exercises: [lift({ best_kg: 1000.5 })] })).rejects.toThrow(/posts_exercises_valid/);
  });

  it('refuse reps that are not a whole number', async () => {
    await expect(addPost(db, { exercises: [lift({ best_reps: 8.5 })] })).rejects.toThrow(/posts_exercises_valid/);
  });

  it('refuse an extra key', async () => {
    await expect(addPost(db, { exercises: [lift({ note: 'hi' })] })).rejects.toThrow(/posts_exercises_valid/);
  });

  it('refuse a missing key', async () => {
    const { best_reps: _gone, ...short } = lift();
    await expect(addPost(db, { exercises: [short] })).rejects.toThrow(/posts_exercises_valid/);
  });

  it('refuse a name of 81 characters, or none', async () => {
    await expect(addPost(db, { exercises: [lift({ name: 'x'.repeat(81) })] })).rejects.toThrow(/posts_exercises_valid/);
    await expect(addPost(db, { exercises: [lift({ name: '' })] })).rejects.toThrow(/posts_exercises_valid/);
  });

  it('refuse 101 sets', async () => {
    await expect(addPost(db, { exercises: [lift({ sets: 101 })] })).rejects.toThrow(/posts_exercises_valid/);
  });

  it('refuse an element that is not an object, and a value that is not an array', async () => {
    await expect(addPost(db, { exercises: ['Bench'] })).rejects.toThrow(/posts_exercises_valid/);
    await expect(addPost(db, { exercises: [null] })).rejects.toThrow(/posts_exercises_valid/);
    // The first migration's own check, which Postgres tries first, already stops this one.
    await expect(addPost(db, { exercises: { name: 'Bench' } })).rejects.toThrow(/posts_exercises_(check|valid)/);
  });

  it('refuse more than 30', async () => {
    await expect(addPost(db, { exercises: Array.from({ length: 31 }, () => lift()) })).rejects.toThrow(
      /posts_exercises_(check|valid)/,
    );
  });

  it('are judged false by the function itself, not only by the older check', async () => {
    const [{ many, notArray, nothing }] = await as(
      db,
      USER_A,
      `select public.valid_post_exercises($1::jsonb) as many,
              public.valid_post_exercises('{"name":"Bench"}'::jsonb) as "notArray",
              public.valid_post_exercises(null) as nothing`,
      [JSON.stringify(Array.from({ length: 31 }, () => lift()))],
    );
    expect([many, notArray, nothing]).toEqual([false, false, false]);
  });

  // 30 lifts with 80-character names cannot reach 8 KB in plain letters, but a
  // name is counted in characters and stored in bytes: an emoji takes four.
  it('refuse a value over 8 KB even when every part of it is the right shape', async () => {
    const heavy = Array.from({ length: 30 }, () => lift({ name: '🏋'.repeat(80) }));
    const [{ valid }] = await as(db, USER_A, `select public.valid_post_exercises($1::jsonb) as valid`, [
      JSON.stringify(heavy),
    ]);
    expect(valid).toBe(true);
    await expect(addPost(db, { exercises: heavy })).rejects.toThrow(/posts_exercises_size/);
  });

  it('refuse a huge blob hidden under an extra key', async () => {
    await expect(addPost(db, { exercises: [lift({ junk: 'x'.repeat(5_000_000) })] })).rejects.toThrow(
      /posts_exercises_(size|valid)/,
    );
  });
});

describe('a post’s highlight', () => {
  it('accepts none, a JSON null, and each kind', async () => {
    await addPost(db, { session: 'sql-null' });
    await addPost(db, { session: 'json-null', highlight: null });
    await addPost(db, { session: 'load', highlight: { kind: 'load', value: 102.06, exercise: 'Bench Press (Barbell)' } });
    await addPost(db, { session: 'volume', highlight: { kind: 'volume', value: 100000 } });
    await addPost(db, { session: 'sessions', highlight: { kind: 'sessions', value: 50 } });
    expect(await as(db, USER_A, `select count(*)::int as n from posts`)).toEqual([{ n: 5 }]);
  });

  it('refuses a kind the engine does not have', async () => {
    await expect(addPost(db, { highlight: { kind: 'bogus', value: 1 } })).rejects.toThrow(/posts_highlight_valid/);
  });

  it('refuses an extra key', async () => {
    await expect(addPost(db, { highlight: { kind: 'sessions', value: 50, note: 'hi' } })).rejects.toThrow(
      /posts_highlight_valid/,
    );
  });

  it('refuses a missing, non-numeric or negative value', async () => {
    await expect(addPost(db, { highlight: { kind: 'sessions' } })).rejects.toThrow(/posts_highlight_valid/);
    await expect(addPost(db, { highlight: { kind: 'sessions', value: '50' } })).rejects.toThrow(/posts_highlight_valid/);
    await expect(addPost(db, { highlight: { kind: 'sessions', value: -1 } })).rejects.toThrow(/posts_highlight_valid/);
  });

  it('refuses an exercise name of 81 characters, or one that is not a string', async () => {
    await expect(addPost(db, { highlight: { kind: 'load', value: 100, exercise: 'x'.repeat(81) } })).rejects.toThrow(
      /posts_highlight_valid/,
    );
    await expect(addPost(db, { highlight: { kind: 'load', value: 100, exercise: 7 } })).rejects.toThrow(
      /posts_highlight_valid/,
    );
  });

  it('refuses something that is not an object', async () => {
    await expect(addPost(db, { highlight: 'load' })).rejects.toThrow(/posts_highlight_valid/);
    await expect(addPost(db, { highlight: [] })).rejects.toThrow(/posts_highlight_valid/);
  });
});

describe('a post’s session id', () => {
  it('may be 64 characters', async () => {
    await addPost(db, { session: 's'.repeat(64) });
  });

  it('may not be 65', async () => {
    await expect(addPost(db, { session: 's'.repeat(65) })).rejects.toThrow(/posts_session_id_length/);
  });
});

describe('a post built by the app', () => {
  let id = 0;
  const set = (
    exerciseName: string,
    weightKg: number | null,
    reps: number,
    setType: LoggedSet['setType'] = 'normal',
  ): LoggedSet => {
    id += 1;
    return { id: `s${id}`, exerciseName, bodyweightBased: weightKg === null, setIndex: id, weightKg, reps, setType, rpe: null };
  };
  const workout = (overrides: Partial<FinishedWorkout> = {}): FinishedWorkout => ({
    sessionId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    title: 'Push',
    date: '2026-10-11',
    startedAt: '2026-10-11T18:00:00',
    finishedAt: new Date('2026-10-11T19:12:00'),
    sets: [
      set('Bench Press (Barbell)', 20, 10, 'warmup'),
      set('Bench Press (Barbell)', 102.5, 5),
      set('Bench Press (Barbell)', 100, 6),
      set('Pull Up', null, 12),
      set('Pull Up', null, 9),
    ],
    milestone: { kind: 'load', value: 100, exercise: 'Bench Press (Barbell)' },
    ...overrides,
  });

  const insert = (row: ReturnType<typeof postPayload>) =>
    as(
      db,
      USER_A,
      `insert into posts (author_id, session_id, title, performed_on, duration_min, sets, volume_kg, exercises, highlight, caption)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)`,
      [
        USER_A,
        row.session_id,
        row.title,
        row.performed_on,
        row.duration_min,
        row.sets,
        row.volume_kg,
        JSON.stringify(row.exercises),
        JSON.stringify(row.highlight),
        row.caption,
      ],
    );

  it('goes in as it is, bodyweight lift and highlight included', async () => {
    await insert(postPayload(workout(), 'felt strong'));
    expect(await as(db, USER_A, `select count(*)::int as n from posts`)).toEqual([{ n: 1 }]);
  });

  it('goes in with no highlight and a bodyweight-only day', async () => {
    await insert(postPayload(workout({ milestone: null, sets: [set('Push-Up', null, 20)] }), null));
  });

  it('goes in when a lift’s name is longer or shorter than the database allows', async () => {
    await insert(
      postPayload(
        workout({
          sets: [set('x'.repeat(120), 50, 5), set('', null, 10)],
          milestone: { kind: 'load', value: 50, exercise: 'x'.repeat(120) },
        }),
        null,
      ),
    );
  });

  it('goes in at more than thirty lifts', async () => {
    const many = Array.from({ length: 35 }, (_, i) => set(`Lift number ${i} with a fairly long name`, 20 + i, 5));
    await insert(postPayload(workout({ sets: many }), null));
  });
});
