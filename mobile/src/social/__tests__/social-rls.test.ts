import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { as, freshDatabase, USER_A, USER_B, USER_C, USER_D } from './postgres';

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

  it('of a missing account look like blocking a hidden one: no error either way', async () => {
    const nobody = '00000000-0000-4000-8000-0000000000ff';
    await as(db, USER_C, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [USER_C, USER_B]);
    // carol's profile is now hidden from bob, so this is a block of a hidden account
    await as(db, USER_B, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [USER_B, USER_C]);
    await as(db, USER_B, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [USER_B, nobody]);
    expect(await as(db, USER_B, `select blocked_id from blocks`)).toEqual([{ blocked_id: USER_C }]);
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

describe('feed', () => {
  type FeedRow = { id: string; title: string; username: string; like_count: number; liked: boolean; created_at: string };
  const feed = (user: string, after: FeedRow | null = null, size = 20) =>
    as<FeedRow>(
      db,
      user,
      `select id, title, username, like_count::int as like_count, liked, created_at::text from feed_page($1, $2, $3)`,
      [after?.created_at ?? null, after?.id ?? null, size],
    );

  it('shows your own posts and those of people you follow, newest first', async () => {
    await post(db, USER_B, 'mine');
    await post(db, USER_C, 'theirs');
    await follow(db, USER_B, USER_C);
    const rows = await feed(USER_B);
    expect(rows.map((r) => r.username)).toEqual(['carol', 'bob']);
  });

  it('leaves out public strangers', async () => {
    await post(db, USER_C);
    expect(await feed(USER_B)).toEqual([]);
  });

  it('leaves out a private account until the follow is accepted', async () => {
    await post(db, USER_A);
    await follow(db, USER_B, USER_A);
    expect(await feed(USER_B)).toEqual([]);
    await as(db, USER_A, `update follows set status = 'accepted' where follower_id = $1`, [USER_B]);
    expect(await feed(USER_B)).toHaveLength(1);
  });

  it('counts likes, and says whether you liked it', async () => {
    const id = await post(db, USER_C);
    await follow(db, USER_B, USER_C);
    await as(db, USER_B, `insert into likes (post_id, user_id) values ($1, $2)`, [id, USER_B]);
    await as(db, USER_A, `insert into likes (post_id, user_id) values ($1, $2)`, [id, USER_A]);
    const [row] = await feed(USER_B);
    expect(row).toMatchObject({ like_count: 2, liked: true });
  });

  it('pages by time', async () => {
    await post(db, USER_B, 'one');
    await db.query(`update posts set created_at = now() - interval '1 hour' where session_id = 'one'`);
    await post(db, USER_B, 'two');
    const first = await feed(USER_B);
    expect(first).toHaveLength(2);
    const older = await feed(USER_B, first[0]);
    expect(older).toHaveLength(1);
  });

  it('pages posts made at the same moment without skipping or repeating any', async () => {
    await as(
      db,
      USER_B,
      `insert into posts (author_id, session_id, title, performed_on, duration_min, sets, volume_kg, exercises)
       select $1, 's' || n, 'Push', '2026-10-12', 45, 5, 2400, '[]'::jsonb from generate_series(1, 5) n`,
      [USER_B],
    );
    const seen: FeedRow[] = [];
    let page = await feed(USER_B, null, 2);
    while (page.length > 0) {
      seen.push(...page);
      page = await feed(USER_B, page[page.length - 1], 2);
    }
    expect(new Set(seen.map((r) => r.created_at)).size).toBe(1);
    expect(seen.map((r) => r.id)).toEqual((await feed(USER_B)).map((r) => r.id));
    expect(new Set(seen.map((r) => r.id)).size).toBe(5);
  });

  it('treats a missing size as the default', async () => {
    await post(db, USER_B);
    expect(await as(db, USER_B, `select 1 from feed_page(null, null, null)`)).toHaveLength(1);
  });

  it('respects a block', async () => {
    await post(db, USER_C);
    await follow(db, USER_B, USER_C);
    await as(db, USER_C, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [USER_C, USER_B]);
    expect(await feed(USER_B)).toEqual([]);
  });

  it('does not count a like from someone who blocked you, so the count shows no block', async () => {
    const id = await post(db, USER_C);
    await follow(db, USER_B, USER_C);
    await as(db, USER_A, `insert into likes (post_id, user_id) values ($1, $2)`, [id, USER_A]);
    await as(db, USER_A, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [USER_A, USER_B]);
    const [row] = await feed(USER_B);
    expect(row.like_count).toBe(0);
    // the count is exactly what the likes the reader can see add up to, never more
    expect(await as(db, USER_B, `select 1 from likes`)).toHaveLength(0);
  });

  it('the view itself shows no more than posts does, across a block', async () => {
    await post(db, USER_C);
    await as(db, USER_C, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [USER_C, USER_B]);
    expect(await as(db, USER_B, `select * from feed_posts`)).toEqual([]);
    expect(await as(db, USER_C, `select title from feed_posts`)).toHaveLength(1);
  });

  it('can only be read by a signed-in user, not written', async () => {
    const [grants] = await as<{ read: boolean; write: boolean }>(
      db,
      USER_B,
      `select has_table_privilege('feed_posts', 'select') as read,
              has_table_privilege('feed_posts', 'insert, update, delete, truncate, references, trigger') as write`,
    );
    expect(grants).toEqual({ read: true, write: false });
  });

  it('is not open to someone signed out', async () => {
    await expect(as(db, null, `select * from feed_page(null, null, 20)`)).rejects.toThrow(/permission denied/);
    await expect(as(db, null, `select * from feed_posts`)).rejects.toThrow(/permission denied/);
  });
});

describe('the names the app spells out', () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await freshDatabase();
  });

  // `feed.ts` tells a second follow, like or block from a real failure by the
  // constraint name in the error, and reads the view's columns by name. Rename
  // one in a migration and the app stops swallowing a harmless duplicate, or
  // reads undefined, with nothing to say why. These are that contract.
  it('keeps the constraint names feed.ts matches on', async () => {
    const names = await as<{ conname: string }>(
      db,
      USER_A,
      `select conname from pg_constraint where connamespace = 'public'::regnamespace`,
    );
    expect(names.map((row) => row.conname)).toEqual(
      expect.arrayContaining(['follows_pkey', 'follows_follower_id_fkey', 'likes_pkey', 'blocks_pkey']),
    );
  });

  it('keeps the feed columns the app reads', async () => {
    const columns = await as<{ column_name: string }>(
      db,
      USER_A,
      `select column_name from information_schema.columns where table_name = 'feed_posts'`,
    );
    expect(columns.map((row) => row.column_name)).toEqual(
      expect.arrayContaining(['id', 'author_id', 'created_at', 'username', 'display_name', 'like_count', 'liked']),
    );
  });
});

describe('reports', () => {
  const reportPost = (user: string, id: string) =>
    as(db, user, `insert into reports (reporter_id, post_id, reason) values ($1, $2, 'spam')`, [user, id]);
  const reportThrice = async (id: string) => {
    await profile(db, USER_D, 'dave');
    for (const reporter of [USER_B, USER_A, USER_D]) await reportPost(reporter, id);
  };

  it('can be written about what you can see, and never read back', async () => {
    const id = await post(db, USER_C);
    await reportPost(USER_B, id);
    expect(await as(db, USER_B, `select * from reports`)).toEqual([]);
    expect(await as(db, USER_C, `select * from reports`)).toEqual([]);
  });

  it('cannot be made in someone else’s name', async () => {
    const id = await post(db, USER_C);
    await expect(
      as(db, USER_B, `insert into reports (reporter_id, post_id, reason) values ($1, $2, 'spam')`, [USER_A, id]),
    ).rejects.toThrow(/row-level security/);
  });

  it('cannot be about a post or a profile you cannot see', async () => {
    const id = await post(db, USER_A); // private, and bob does not follow alice
    await expect(reportPost(USER_B, id)).rejects.toThrow(/row-level security/);
    await as(db, USER_C, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [USER_C, USER_B]);
    await expect(
      as(db, USER_B, `insert into reports (reporter_id, profile_id, reason) values ($1, $2, 'abuse')`, [USER_B, USER_C]),
    ).rejects.toThrow(/row-level security/);
  });

  it('hide a post from everyone but its author at three different reporters', async () => {
    const id = await post(db, USER_C);
    await profile(db, USER_D, 'dave');
    await reportPost(USER_B, id);
    await reportPost(USER_B, id); // the same person twice counts once
    await reportPost(USER_A, id);
    expect(await titles(db, USER_B)).toHaveLength(1);
    await reportPost(USER_D, id);
    expect(await titles(db, USER_B)).toEqual([]);
    expect(await titles(db, USER_C)).toHaveLength(1);
  });

  it('take a hidden post out of the feed too, for everyone but its author', async () => {
    const id = await post(db, USER_C);
    await follow(db, USER_B, USER_C);
    await reportThrice(id);
    expect(await as(db, USER_B, `select * from feed_posts`)).toEqual([]);
    expect(await as(db, USER_B, `select * from feed_page(null, null, 20)`)).toEqual([]);
    expect(await as(db, USER_C, `select * from feed_page(null, null, 20)`)).toHaveLength(1);
  });

  it('cannot be undone by the author, who may not touch the hidden flag', async () => {
    const id = await post(db, USER_C);
    await reportThrice(id);
    await expect(as(db, USER_C, `update posts set hidden = false where id = $1`, [id])).rejects.toThrow(/permission denied/);
    await as(db, USER_C, `update posts set caption = 'edited' where id = $1`, [id]);
    expect(await titles(db, USER_B)).toEqual([]);
  });
});

describe('word filter', () => {
  beforeEach(async () => {
    await db.query(`insert into blocked_words (word) values ('badword')`);
  });

  it('refuses a caption, a username or a name containing a listed word', async () => {
    await expect(
      as(db, USER_B, `insert into posts (author_id, session_id, title, performed_on, duration_min, sets, exercises, caption)
                      values ($1, 'x', 'Push', '2026-10-12', 10, 1, '[]'::jsonb, 'what a BadWord day')`, [USER_B]),
    ).rejects.toThrow(/blocked_word/);
    await expect(as(db, USER_B, `update profiles set display_name = 'badword' where id = $1`, [USER_B])).rejects.toThrow(/blocked_word/);
  });

  it('refuses a listed word in a caption changed later', async () => {
    const id = await post(db, USER_B);
    await expect(as(db, USER_B, `update posts set caption = 'so badword' where id = $1`, [id])).rejects.toThrow(/blocked_word/);
  });

  it('refuses a listed word in a username, when the profile is made and when it is changed', async () => {
    await expect(
      as(db, USER_D, `insert into profiles (id, username, display_name) values ($1, 'x_badword_x', 'Dave')`, [USER_D]),
    ).rejects.toThrow(/blocked_word/);
    await expect(as(db, USER_B, `update profiles set username = 'badword99' where id = $1`, [USER_B])).rejects.toThrow(/blocked_word/);
  });

  it('refuses a listed word in a display name when the profile is made', async () => {
    await expect(
      as(db, USER_D, `insert into profiles (id, username, display_name) values ($1, 'dave', 'Bad Word? BADWORD')`, [USER_D]),
    ).rejects.toThrow(/blocked_word/);
  });

  it('raises exactly the error the app maps: P0001, message blocked_word', async () => {
    await expect(as(db, USER_B, `update profiles set display_name = 'badword' where id = $1`, [USER_B])).rejects.toMatchObject({
      code: 'P0001',
      message: 'blocked_word',
    });
  });

  it('lets ordinary text through', async () => {
    await as(db, USER_B, `update profiles set display_name = 'Bob the builder' where id = $1`, [USER_B]);
  });

  it('is not readable or writable by users', async () => {
    await expect(as(db, USER_B, `insert into blocked_words (word) values ('xyz')`)).rejects.toThrow(/row-level security|permission denied/);
    expect(await as(db, USER_B, `select * from blocked_words`)).toEqual([]);
  });
});

describe('my_blocked_profiles', () => {
  type Listed = { id: string; username: string; display_name: string };
  const listed = (user: string) => as<Listed>(db, user, `select id, username, display_name from my_blocked_profiles()`);

  it('lists the people you blocked, and only yours', async () => {
    await as(db, USER_C, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [USER_C, USER_B]);
    expect((await listed(USER_C)).map((r) => r.username)).toEqual(['bob']);
    expect(await listed(USER_B)).toEqual([]);
  });

  it('names someone who blocked you first as they were when you blocked, and never reads their live profile', async () => {
    await as(db, USER_C, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [USER_C, USER_B]);
    await as(db, USER_B, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [USER_B, USER_C]);
    expect(await listed(USER_B)).toEqual([{ id: USER_C, username: 'carol', display_name: 'carol' }]);
    await as(db, USER_C, `update profiles set username = 'carol2', display_name = 'Carol Two' where id = $1`, [USER_C]);
    expect(await listed(USER_B)).toEqual([{ id: USER_C, username: 'carol', display_name: 'carol' }]);
  });

  it('never returns an Instagram handle, even one the blocked person had when blocked', async () => {
    await as(db, USER_B, `update profiles set instagram = 'bob_lifts' where id = $1`, [USER_B]);
    await as(db, USER_C, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [USER_C, USER_B]);
    expect(await as(db, USER_C, `select username, display_name, instagram from my_blocked_profiles()`)).toEqual([
      { username: 'bob', display_name: 'bob', instagram: null },
    ]);
  });

  it('keeps what the database saw, not what the blocker sent', async () => {
    await as(db, USER_C, `insert into blocks (blocker_id, blocked_id, username) values ($1, $2, 'forged')`, [USER_C, USER_B]);
    expect((await listed(USER_C)).map((r) => r.username)).toEqual(['bob']);
  });

  it('is not open to someone signed out', async () => {
    await expect(as(db, null, `select * from my_blocked_profiles()`)).rejects.toThrow(/permission denied/);
  });
});

describe('a short word in the filter', () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await freshDatabase();
    await profile(db, USER_B, 'bob');
    // Three letters, and a piece of a dozen innocent words.
    await db.query(`insert into blocked_words (word) values ('ass'), ('onlyfans'), ('t.me/')`);
  });

  const caption = (said: string) =>
    as(db, USER_B, `insert into posts (author_id, session_id, title, performed_on, duration_min, sets, exercises, caption)
                    values ($1, $2, 'Push', '2026-10-14', 10, 1, '[]'::jsonb, $3)`, [USER_B, said.slice(0, 12), said]);

  it('leaves the innocent words it is a piece of alone', async () => {
    for (const said of ['A classic session', 'Just passing through', 'Grass outside', 'Assisted pull ups']) {
      await expect(caption(said)).resolves.toBeDefined();
    }
  });

  it('still catches it standing on its own, whatever is beside it', async () => {
    for (const said of ['ass', 'what an ass', 'ASS!', 'ass, honestly', '(ass)']) {
      await expect(caption(said)).rejects.toThrow(/blocked_word/);
    }
  });

  it('matches a long word anywhere inside, which is what those entries are for', async () => {
    await expect(caption('see myonlyfanspage')).rejects.toThrow(/blocked_word/);
  });

  it('matches an entry that is not just letters anywhere inside too', async () => {
    await expect(caption('join at t.me/whatever')).rejects.toThrow(/blocked_word/);
  });

  it('catches a short word someone has spelled with a digit in it', async () => {
    await db.query(`insert into blocked_words (word) values ('4ss')`);
    await expect(caption('what a 4ss')).rejects.toThrow(/blocked_word/);
  });
});

describe('training squads RLS and multiplayer constraints', () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await freshDatabase();
    await profile(db, USER_A, 'alice');
    await profile(db, USER_B, 'bob');
    await profile(db, USER_C, 'carol');
    await profile(db, USER_D, 'dave');
  });

  const createSquadSql = async (owner: string, name = 'Iron Squad', code = 'IRON99') => {
    const res = await as<{ id: string }>(
      db,
      owner,
      `insert into squads (name, invite_code, weekly_target, created_by)
       values ($1, $2, 16, $3) returning id`,
      [name, code, owner],
    );
    const squadId = res[0].id;
    await as(db, owner, `insert into squad_members (squad_id, user_id, role) values ($1, $2, 'owner')`, [squadId, owner]);
    return squadId;
  };

  it('owner can create a squad and is recorded as owner', async () => {
    const squadId = await createSquadSql(USER_A, 'Apex Club', 'APEX22');
    const squads = await as<{ name: string; created_by: string }>(db, USER_A, `select name, created_by from squads where id = $1`, [squadId]);
    expect(squads).toHaveLength(1);
    expect(squads[0].name).toBe('Apex Club');
    expect(squads[0].created_by).toBe(USER_A);
  });

  it('cannot create a squad in someone else’s name', async () => {
    await expect(
      as(db, USER_B, `insert into squads (name, invite_code, created_by) values ('Fake', 'FAKE22', $1)`, [USER_A]),
    ).rejects.toThrow(/row-level security/);
  });

  it('users can join a squad using its id', async () => {
    const squadId = await createSquadSql(USER_A, 'Apex Club', 'APEX23');
    await as(db, USER_B, `insert into squad_members (squad_id, user_id, role) values ($1, $2, 'member')`, [squadId, USER_B]);

    const members = await as<{ user_id: string }>(db, USER_B, `select user_id from squad_members where squad_id = $1`, [squadId]);
    expect(members.map((m) => m.user_id)).toContain(USER_B);
  });

  it('cannot join a squad in someone else’s name', async () => {
    const squadId = await createSquadSql(USER_A, 'Apex Club', 'APEX24');
    await expect(
      as(db, USER_B, `insert into squad_members (squad_id, user_id, role) values ($1, $2, 'member')`, [squadId, USER_C]),
    ).rejects.toThrow(/row-level security/);
  });

  it('enforces single squad per user constraint', async () => {
    const squad1 = await createSquadSql(USER_A, 'Squad 1', 'SQ2222');
    const squad2 = await createSquadSql(USER_B, 'Squad 2', 'SQ3333');

    // Carol joins squad 1
    await as(db, USER_C, `insert into squad_members (squad_id, user_id, role) values ($1, $2, 'member')`, [squad1, USER_C]);

    // Carol attempts to join squad 2 without leaving squad 1
    await expect(
      as(db, USER_C, `insert into squad_members (squad_id, user_id, role) values ($1, $2, 'member')`, [squad2, USER_C]),
    ).rejects.toThrow(/unique constraint|duplicate key/i);
  });

  it('enforces 6-member squad capacity limit via database trigger', async () => {
    const squadId = await createSquadSql(USER_A, 'Full Squad', 'FULL22');
    // Add members B, C, D (total now 4)
    await as(db, USER_B, `insert into squad_members (squad_id, user_id) values ($1, $2)`, [squadId, USER_B]);
    await as(db, USER_C, `insert into squad_members (squad_id, user_id) values ($1, $2)`, [squadId, USER_C]);
    await as(db, USER_D, `insert into squad_members (squad_id, user_id) values ($1, $2)`, [squadId, USER_D]);

    // Create 3 extra auth users and profiles in db
    const u5 = '00000000-0000-4000-8000-000000000005';
    const u6 = '00000000-0000-4000-8000-000000000006';
    const u7 = '00000000-0000-4000-8000-000000000007';
    await db.exec(`insert into auth.users (id) values ('${u5}'), ('${u6}'), ('${u7}')`);
    await profile(db, u5, 'lifter5');
    await profile(db, u6, 'lifter6');
    await profile(db, u7, 'lifter7');

    // 5th member joins
    await as(db, u5, `insert into squad_members (squad_id, user_id) values ($1, $2)`, [squadId, u5]);
    // 6th member joins (reaches 6 capacity)
    await as(db, u6, `insert into squad_members (squad_id, user_id) values ($1, $2)`, [squadId, u6]);

    // 7th member attempts to join -> trigger raises squad_full
    await expect(
      as(db, u7, `insert into squad_members (squad_id, user_id) values ($1, $2)`, [squadId, u7]),
    ).rejects.toThrow(/squad_full/);
  });

  it('squad checkins are readable only by squad members', async () => {
    const squadId = await createSquadSql(USER_A, 'Secret Squad', 'SECR22');
    await as(db, USER_B, `insert into squad_members (squad_id, user_id) values ($1, $2)`, [squadId, USER_B]);

    // Alice logs a checkin
    await as(
      db,
      USER_A,
      `insert into squad_checkins (squad_id, user_id, workout_id, performed_on, pr_highlight)
       values ($1, $2, 'w1', '2026-10-18', 'Squat 140kg')`,
      [squadId, USER_A],
    );

    // Member Bob can read the checkin
    const bobSees = await as(db, USER_B, `select pr_highlight from squad_checkins where squad_id = $1`, [squadId]);
    expect(bobSees).toHaveLength(1);
    expect(bobSees[0].pr_highlight).toBe('Squat 140kg');

    // Non-member Carol cannot read the checkin (RLS returns empty)
    const carolSees = await as(db, USER_C, `select pr_highlight from squad_checkins where squad_id = $1`, [squadId]);
    expect(carolSees).toHaveLength(0);
  });

  it('non-members cannot post checkins into another squad', async () => {
    const squadId = await createSquadSql(USER_A, 'Members Only', 'MEMB22');

    // Carol is not a member of Alice's squad
    await expect(
      as(
        db,
        USER_C,
        `insert into squad_checkins (squad_id, user_id, workout_id, performed_on)
         values ($1, $2, 'w2', '2026-10-18')`,
        [squadId, USER_C],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('cheers are restricted to squad members', async () => {
    const squadId = await createSquadSql(USER_A, 'Cheer Squad', 'CHER22');
    await as(db, USER_B, `insert into squad_members (squad_id, user_id) values ($1, $2)`, [squadId, USER_B]);

    const checkin = (
      await as<{ id: string }>(
        db,
        USER_A,
        `insert into squad_checkins (squad_id, user_id, workout_id, performed_on)
         values ($1, $2, 'w3', '2026-10-18') returning id`,
        [squadId, USER_A],
      )
    )[0];

    // Member Bob can cheer
    await as(
      db,
      USER_B,
      `insert into squad_cheers (squad_id, checkin_id, user_id) values ($1, $2, $3)`,
      [squadId, checkin.id, USER_B],
    );

    const cheers = await as(db, USER_A, `select user_id from squad_cheers where checkin_id = $1`, [checkin.id]);
    expect(cheers).toHaveLength(1);

    // Non-member Carol cannot cheer
    await expect(
      as(
        db,
        USER_C,
        `insert into squad_cheers (squad_id, checkin_id, user_id) values ($1, $2, $3)`,
        [squadId, checkin.id, USER_C],
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

