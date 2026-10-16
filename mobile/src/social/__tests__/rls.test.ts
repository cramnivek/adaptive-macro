import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { as, freshDatabase, USER_A, USER_B, USER_C, USER_D } from './postgres';

const addProfile = (db: PGlite, user: string, username: string, id = user) =>
  as(db, user, `insert into profiles (id, username, display_name) values ($1, $2, $3)`, [id, username, username]);

const addPost = (
  db: PGlite,
  user: string,
  { session = 's1', author = user, caption = null as string | null } = {},
) =>
  as(
    db,
    user,
    `insert into posts (author_id, session_id, title, performed_on, duration_min, sets, volume_kg, exercises, caption)
     values ($1, $2, 'Push', '2026-10-11', 60, 12, 4200, '[]'::jsonb, $3)`,
    [author, session, caption],
  );

let db: PGlite;

beforeEach(async () => {
  db = await freshDatabase();
  await addProfile(db, USER_A, 'alice');
  await addProfile(db, USER_B, 'bob');
});

describe('profiles', () => {
  it('can be read by anyone signed in', async () => {
    expect(await as(db, USER_B, `select username from profiles where id = $1`, [USER_A])).toEqual([{ username: 'alice' }]);
  });

  it('cannot be read signed out', async () => {
    expect(await as(db, null, `select username from profiles`)).toEqual([]);
  });

  it('cannot be created for someone else', async () => {
    await expect(addProfile(db, USER_B, 'carol', USER_C)).rejects.toThrow(/row-level security/);
  });

  it('cannot be changed by someone else', async () => {
    await as(db, USER_B, `update profiles set display_name = 'mallory' where id = $1`, [USER_A]);
    expect(await as(db, USER_A, `select display_name from profiles where id = $1`, [USER_A])).toEqual([
      { display_name: 'alice' },
    ]);
  });

  it('are private until their owner says otherwise', async () => {
    expect(await as(db, USER_A, `select is_private from profiles where id = $1`, [USER_A])).toEqual([{ is_private: true }]);
  });

  it('refuse a username outside the rules', async () => {
    await expect(
      as(db, USER_A, `update profiles set username = 'Al' where id = $1`, [USER_A]),
    ).rejects.toThrow(/profiles_username_check/);
  });

  it('keep usernames unique', async () => {
    await expect(addProfile(db, USER_C, 'alice')).rejects.toThrow(/profiles_username_key/);
  });
});

describe('posts', () => {
  it('are readable by their author only', async () => {
    await addPost(db, USER_A);
    expect(await as(db, USER_A, `select title from posts`)).toEqual([{ title: 'Push' }]);
    expect(await as(db, USER_B, `select title from posts`)).toEqual([]);
    expect(await as(db, null, `select title from posts`)).toEqual([]);
  });

  it('cannot be written under someone else’s name', async () => {
    await expect(addPost(db, USER_B, { author: USER_A })).rejects.toThrow(/row-level security/);
  });

  it('cannot be changed or deleted by anyone else', async () => {
    await addPost(db, USER_A);
    await as(db, USER_B, `update posts set caption = 'defaced'`);
    await as(db, USER_B, `delete from posts`);
    expect(await as(db, USER_A, `select caption from posts`)).toEqual([{ caption: null }]);
  });

  it('are one per workout, so a retry cannot post twice', async () => {
    await addPost(db, USER_A, { session: 's1' });
    await expect(addPost(db, USER_A, { session: 's1' })).rejects.toThrow(/posts_author_id_session_id_key/);
  });

  it('refuse a caption over 500 characters', async () => {
    await addPost(db, USER_A, { session: 's1', caption: 'x'.repeat(500) });
    await expect(addPost(db, USER_A, { session: 's2', caption: 'x'.repeat(501) })).rejects.toThrow(/posts_caption_check/);
  });

  it('need a profile behind them', async () => {
    await expect(addPost(db, USER_C)).rejects.toThrow(/posts_author_id_fkey/);
  });
});

describe('delete_account', () => {
  it('removes the account, its profile and its posts, and nothing of anyone else’s', async () => {
    await addPost(db, USER_A);
    await addPost(db, USER_B);
    await as(db, USER_A, `select delete_account()`);

    expect((await db.query(`select id from auth.users order by id`)).rows).toEqual([{ id: USER_B }, { id: USER_C }, { id: USER_D }]);
    expect((await db.query(`select username from profiles`)).rows).toEqual([{ username: 'bob' }]);
    expect((await db.query(`select author_id from posts`)).rows).toEqual([{ author_id: USER_B }]);
  });

  it('cannot be called signed out', async () => {
    await expect(as(db, null, `select delete_account()`)).rejects.toThrow(/permission denied/);
  });
});
