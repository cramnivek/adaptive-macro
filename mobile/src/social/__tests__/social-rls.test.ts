import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { as, freshDatabase, USER_A, USER_B, USER_C } from './postgres';

const profile = (db: PGlite, user: string, username: string, isPrivate = true) =>
  as(db, user, `insert into profiles (id, username, display_name, is_private) values ($1, $2, $2, $3)`, [
    user,
    username,
    isPrivate,
  ]);

const post = async (db: PGlite, user: string, session = 's1') =>
  (
    await as<{ id: string }>(
      db,
      user,
      `insert into posts (author_id, session_id, title, performed_on, duration_min, sets, volume_kg, exercises)
       values ($1, $2, 'Push', '2026-10-12', 45, 5, 2400, '[]'::jsonb) returning id`,
      [user, session],
    )
  )[0].id;

const follow = (db: PGlite, from: string, to: string) =>
  as(db, from, `insert into follows (follower_id, followee_id) values ($1, $2)`, [from, to]);

const statusOf = async (db: PGlite, from: string, to: string) =>
  (await db.query<{ status: string }>(`select status from follows where follower_id = $1 and followee_id = $2`, [from, to]))
    .rows[0]?.status ?? null;

const titles = (db: PGlite, user: string) => as<{ title: string }>(db, user, `select title from posts`);

let db: PGlite;

beforeEach(async () => {
  db = await freshDatabase();
  await profile(db, USER_A, 'alice'); // private
  await profile(db, USER_B, 'bob');
  await profile(db, USER_C, 'carol', false); // public
});

describe('follows', () => {
  it('to a private account are requests until accepted', async () => {
    await follow(db, USER_B, USER_A);
    expect(await statusOf(db, USER_B, USER_A)).toBe('pending');
  });

  it('to a public account are accepted at once', async () => {
    await follow(db, USER_B, USER_C);
    expect(await statusOf(db, USER_B, USER_C)).toBe('accepted');
  });

  it('cannot choose their own status', async () => {
    await as(db, USER_B, `insert into follows (follower_id, followee_id, status) values ($1, $2, 'accepted')`, [USER_B, USER_A]);
    expect(await statusOf(db, USER_B, USER_A)).toBe('pending');
  });

  it('cannot be made in someone else’s name', async () => {
    await expect(
      as(db, USER_B, `insert into follows (follower_id, followee_id) values ($1, $2)`, [USER_C, USER_A]),
    ).rejects.toThrow(/row-level security/);
  });

  it('cannot be of oneself', async () => {
    await expect(follow(db, USER_A, USER_A)).rejects.toThrow(/follows_check/);
  });

  it('are accepted by the followee only', async () => {
    await follow(db, USER_B, USER_A);
    await as(db, USER_B, `update follows set status = 'accepted' where follower_id = $1`, [USER_B]);
    expect(await statusOf(db, USER_B, USER_A)).toBe('pending');
    await as(db, USER_A, `update follows set status = 'accepted' where follower_id = $1`, [USER_B]);
    expect(await statusOf(db, USER_B, USER_A)).toBe('accepted');
  });

  it('cannot be re-pointed by an update, only accepted', async () => {
    await follow(db, USER_B, USER_A);
    await expect(
      as(db, USER_A, `update follows set follower_id = $1 where follower_id = $2`, [USER_C, USER_B]),
    ).rejects.toThrow(/permission denied/);
  });

  it('can be removed by either side: unfollow, decline, remove a follower', async () => {
    await follow(db, USER_B, USER_A);
    await as(db, USER_A, `delete from follows where follower_id = $1`, [USER_B]);
    expect(await statusOf(db, USER_B, USER_A)).toBeNull();
    await follow(db, USER_B, USER_C);
    await as(db, USER_B, `delete from follows where followee_id = $1`, [USER_C]);
    expect(await statusOf(db, USER_B, USER_C)).toBeNull();
  });

  it('are visible to the two people in them and nobody else', async () => {
    await follow(db, USER_B, USER_A);
    expect(await as(db, USER_C, `select * from follows`)).toEqual([]);
    expect(await as(db, USER_A, `select follower_id from follows`)).toEqual([{ follower_id: USER_B }]);
  });

  it('pending requests are accepted when an account turns public', async () => {
    await follow(db, USER_B, USER_A);
    await as(db, USER_A, `update profiles set is_private = false where id = $1`, [USER_A]);
    expect(await statusOf(db, USER_B, USER_A)).toBe('accepted');
  });

  it('are counted for any profile, accepted ones only', async () => {
    await follow(db, USER_B, USER_C);
    await follow(db, USER_A, USER_C);
    await follow(db, USER_C, USER_A); // pending: alice is private
    expect(await as(db, USER_B, `select * from follow_counts($1)`, [USER_C])).toEqual([{ followers: 2, following: 0 }]);
  });
});

describe('who can see a post', () => {
  it('the author always', async () => {
    await post(db, USER_A);
    expect(await titles(db, USER_A)).toHaveLength(1);
  });

  it('not a stranger, nor a pending follower, of a private account', async () => {
    await post(db, USER_A);
    expect(await titles(db, USER_B)).toEqual([]);
    await follow(db, USER_B, USER_A);
    expect(await titles(db, USER_B)).toEqual([]);
  });

  it('an accepted follower of a private account', async () => {
    await post(db, USER_A);
    await follow(db, USER_B, USER_A);
    await as(db, USER_A, `update follows set status = 'accepted' where follower_id = $1`, [USER_B]);
    expect(await titles(db, USER_B)).toHaveLength(1);
  });

  it('anyone signed in, for a public account; nobody signed out', async () => {
    await post(db, USER_C);
    expect(await titles(db, USER_B)).toHaveLength(1);
    expect(await as(db, null, `select title from posts`)).toEqual([]);
  });
});

describe('blocks', () => {
  it('hide posts, profiles and likes both ways, and remove follows both ways', async () => {
    const id = await post(db, USER_C);
    await follow(db, USER_B, USER_C);
    await as(db, USER_B, `insert into likes (post_id, user_id) values ($1, $2)`, [id, USER_B]);
    await as(db, USER_B, `update profiles set is_private = false where id = $1`, [USER_B]);
    await post(db, USER_B);
    const bobsPosts = (user: string) => as(db, user, `select title from posts where author_id = $1`, [USER_B]);
    expect(await bobsPosts(USER_C)).toHaveLength(1); // visible until the block
    await as(db, USER_C, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [USER_C, USER_B]);

    expect(await statusOf(db, USER_B, USER_C)).toBeNull();
    expect(await as(db, USER_B, `select title from posts where author_id = $1`, [USER_C])).toEqual([]);
    expect(await bobsPosts(USER_C)).toEqual([]);
    expect(await as(db, USER_B, `select username from profiles where id = $1`, [USER_C])).toEqual([]);
    expect(await as(db, USER_C, `select username from profiles where id = $1`, [USER_B])).toEqual([]);
    expect(await as(db, USER_C, `select user_id from likes`)).toEqual([]);
  });

  it('make a later follow attempt quietly do nothing, so the blocked person learns nothing', async () => {
    await as(db, USER_C, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [USER_C, USER_B]);
    await follow(db, USER_B, USER_C); // no error
    expect(await statusOf(db, USER_B, USER_C)).toBeNull();
  });

  it('cannot be probed by forging a follow: a blocked pair fails like any other', async () => {
    await as(db, USER_C, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [USER_C, USER_B]);
    const forge = (by: string, from: string, to: string) =>
      as(db, by, `insert into follows (follower_id, followee_id) values ($1, $2)`, [from, to]);
    await expect(forge(USER_A, USER_C, USER_B)).rejects.toThrow(/row-level security/); // blocked pair
    await expect(forge(USER_C, USER_B, USER_A)).rejects.toThrow(/row-level security/); // unblocked pair
  });

  it('are not told apart from a missing account when you follow: both quietly do nothing', async () => {
    const nobody = '00000000-0000-4000-8000-0000000000ff';
    await as(db, USER_C, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [USER_C, USER_B]);
    await follow(db, USER_B, USER_C);
    await follow(db, USER_B, nobody);
    expect((await db.query(`select * from follows`)).rows).toEqual([]);
  });

  it('are seen only by the person who made them', async () => {
    await as(db, USER_C, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [USER_C, USER_B]);
    expect(await as(db, USER_B, `select * from blocks`)).toEqual([]);
    expect(await as(db, USER_C, `select blocked_id from blocks`)).toEqual([{ blocked_id: USER_B }]);
  });
});

describe('likes', () => {
  it('are one per person per post, on posts you can see', async () => {
    const visible = await post(db, USER_C);
    const hidden = await post(db, USER_A);
    await as(db, USER_B, `insert into likes (post_id, user_id) values ($1, $2)`, [visible, USER_B]);
    await expect(
      as(db, USER_B, `insert into likes (post_id, user_id) values ($1, $2)`, [visible, USER_B]),
    ).rejects.toThrow(/likes_pkey/);
    await expect(
      as(db, USER_B, `insert into likes (post_id, user_id) values ($1, $2)`, [hidden, USER_B]),
    ).rejects.toThrow(/row-level security/);
  });

  it('cannot be made in someone else’s name', async () => {
    const id = await post(db, USER_C);
    await expect(
      as(db, USER_B, `insert into likes (post_id, user_id) values ($1, $2)`, [id, USER_A]),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('the helper functions', () => {
  it('are not in the public schema, where the API would expose them as RPC', async () => {
    const found = await db.query(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('can_see', 'visible_profile', 'blocked_between')`,
    );
    expect(found.rows).toEqual([]);
  });

  it('are not callable signed out', async () => {
    await expect(as(db, null, `select private.can_see($1)`, [USER_A])).rejects.toThrow(/permission denied/);
    await expect(as(db, null, `select * from public.follow_counts($1)`, [USER_A])).rejects.toThrow(/permission denied/);
  });

  it('follow_counts gives a normal profile its counts, and a blocker or a missing account nothing', async () => {
    await follow(db, USER_B, USER_C);
    expect(await as(db, USER_B, `select * from follow_counts($1)`, [USER_C])).toEqual([{ followers: 1, following: 0 }]);
    await as(db, USER_C, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [USER_C, USER_B]);
    expect(await as(db, USER_B, `select * from follow_counts($1)`, [USER_C])).toEqual([]);
    expect(await as(db, USER_B, `select * from follow_counts($1)`, ['00000000-0000-4000-8000-0000000000ff'])).toEqual([]);
  });
});
