# Follows and the Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-in people can find each other by username, follow, approve follow requests, see a feed of the workouts of people they follow, like posts, and report or block anyone, all from a new Social tab.

**Architecture:**
- **Database.** Three Supabase migrations add `follows`, `blocks`, `likes` and `reports`, with row-level security. A single `security definer` function, `can_see(author)`, decides who may read a post, and the posts, likes and profiles policies all use it. A security-invoker view, `feed_posts`, joins each post to its author and like counts, and an RPC, `feed_page`, pages through the people you follow.
- **App.** All calls go through `mobile/src/social/feed.ts`, which turns every failure into a sentence. The screens are a Social tab (which replaces Settings in the tab bar), Find people, Profile, Requests, a report sheet, and Blocked people.

**Tech Stack:** Supabase Postgres with RLS, tested with PGlite 0.3.16 via `mobile/src/social/__tests__/postgres.ts`. The app uses Expo 57, expo-router (typed routes), supabase-js 2 and vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-social-follows-and-feed-design.md`. Its first step, hardening posts, is already live: migration `20261012120000_harden_posts.sql`. Comments are deferred to a later plan.

## Global Constraints

- **The live migrations stay untouched:** `20261011120000_accounts_and_posts.sql` and `20261012120000_harden_posts.sql` are applied in production and are never edited. New work goes into new migration files.
- **Pushing to `main` changes the live database.** A change under `supabase/migrations/` takes effect on push. Push only after the PGlite tests pass and the owner has agreed.
- **Who can read a post:** its author, an approved follower, or anyone signed in when the author is public, and in every case only when neither has blocked the other.
- **Privacy defaults:** private by default. A follow of a private account is `pending` until the followee accepts it; a follow of a public account is `accepted` at once. The client never chooses the status.
- **Blocks:**
  - A block hides posts, likes and profiles in both directions and removes follows in both directions.
  - Nobody can learn that they have been blocked from what the API returns. A blocked follow attempt quietly does nothing.
- **Reports:** writable, never readable, by users. A post reported by 3 different people is hidden from everyone except its author.
- **The feed:** your own posts and those of people you follow with `accepted` status, newest first, 20 at a time. Public strangers are not in the feed.
- **Errors:** every user-facing failure is a single sentence, mapped through `mobile/src/social/errors.ts`.
- **Comments in code** explain why, in full sentences, matching the surrounding code. No new abstractions beyond those named here.
- **Paths:** commands run from `mobile/` unless a step says otherwise. Tests use `npx vitest run`, types use `npx tsc --noEmit -p .`.
- **Commit messages** end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014qkJZ1mg6EVVX6ZVXpnvyP
  ```

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/20261012130000_follows_blocks_likes.sql` | `follows`, `blocks`, `likes`, triggers, `can_see`, the new read policies, `follow_counts` |
| `supabase/migrations/20261012140000_feed.sql` | the `feed_posts` view and the `feed_page(before, size)` RPC |
| `supabase/migrations/20261012150000_reports_and_filter.sql` | `reports`, `posts.hidden` and auto-hide, the `blocked_words` filter |
| `mobile/src/social/__tests__/social-rls.test.ts` | PGlite tests for every rule above |
| `mobile/src/social/feed.ts` | the app's calls: search, follow, requests, feed, profile, like, report, block |
| `mobile/src/social/feedRules.ts` | pure helpers: escaping a search, turning a feed row into a `Post`, the follow button's state |
| `mobile/src/social/__tests__/feedRules.test.ts` | their tests |
| `mobile/src/components/PostCard.tsx` | gains an author line, a like control and a ⋯ menu |
| `mobile/src/components/ReportSheet.tsx` | pick a reason, add a note, send |
| `mobile/app/(tabs)/social.tsx` | the Social tab: header, request badge, feed |
| `mobile/app/people.tsx` | Find people |
| `mobile/app/profile.tsx` | someone's profile, `/profile?username=` |
| `mobile/app/requests.tsx` | pending follow requests |
| `mobile/app/blocked.tsx` | people you've blocked |
| `mobile/app/(tabs)/_layout.tsx` | Social in the bar; Settings hidden from it but still routable |
| `mobile/src/components/Screen.tsx` | an optional `action` slot in the header, for the Settings gear |

---

### Task 1: Follows, blocks, likes and who can see what

**Files:**
- Create: `supabase/migrations/20261012130000_follows_blocks_likes.sql`
- Create: `mobile/src/social/__tests__/social-rls.test.ts`

**Interfaces:**
- Produces:
  - tables `public.follows(follower_id, followee_id, status, created_at)`, `public.blocks(blocker_id, blocked_id, created_at)` and `public.likes(post_id, user_id, created_at)`;
  - functions `public.can_see(author uuid) returns boolean` and `public.follow_counts(profile uuid) returns table(followers bigint, following bigint)`.
- Task 3's error mapping keys on the constraint names `follows_pkey` and `likes_pkey`.

- [ ] **Step 1: Write the failing tests**

`mobile/src/social/__tests__/social-rls.test.ts`:

```ts
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
    await as(db, USER_C, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [USER_C, USER_B]);

    expect(await statusOf(db, USER_B, USER_C)).toBeNull();
    expect(await titles(db, USER_B)).toEqual([]);
    expect(await as(db, USER_B, `select username from profiles where id = $1`, [USER_C])).toEqual([]);
    expect(await as(db, USER_C, `select username from profiles where id = $1`, [USER_B])).toEqual([]);
    expect(await as(db, USER_C, `select user_id from likes`)).toEqual([]);
  });

  it('make a later follow attempt quietly do nothing, so the blocked person learns nothing', async () => {
    await as(db, USER_C, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [USER_C, USER_B]);
    await follow(db, USER_B, USER_C); // no error
    expect(await statusOf(db, USER_B, USER_C)).toBeNull();
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
  it('are not callable signed out', async () => {
    await expect(as(db, null, `select public.can_see($1)`, [USER_A])).rejects.toThrow(/permission denied/);
    await expect(as(db, null, `select * from public.follow_counts($1)`, [USER_A])).rejects.toThrow(/permission denied/);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/social/__tests__/social-rls.test.ts`
Expected: FAIL. The relation `follows` does not exist.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261012130000_follows_blocks_likes.sql`:

```sql
-- Follows, blocks and likes: step 2 of the social feature.
-- See docs/superpowers/specs/2026-10-12-social-follows-and-feed-design.md.
--
-- Who may read a post is decided in one place, can_see(), and every policy
-- that needs the answer asks it, so the rule cannot drift between tables.

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee on public.follows (followee_id, status);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Security definer because a block is visible only to the person who made it,
-- yet both people's reads must respect it. Not callable by users directly: it
-- would tell anyone whether a given person has blocked them.
create function public.blocked_between(a uuid, b uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select exists (
      select 1 from public.blocks
       where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
    )
  $$;
revoke execute on function public.blocked_between(uuid, uuid) from public, anon, authenticated;

-- The one rule: the author; otherwise, with no block either way, anyone when
-- the author is public, or an accepted follower when private.
create function public.can_see(author uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select author = auth.uid()
        or (
          not public.blocked_between(author, auth.uid())
          and (
            exists (select 1 from public.profiles p where p.id = author and not p.is_private)
            or exists (
              select 1 from public.follows f
               where f.follower_id = auth.uid() and f.followee_id = author and f.status = 'accepted'
            )
          )
        )
  $$;
revoke execute on function public.can_see(uuid) from public, anon;
grant execute on function public.can_see(uuid) to authenticated;

-- A follow's status is the followee's to decide, so the client never sets it:
-- pending for a private account, accepted for a public one. A follow across a
-- block is dropped without an error, so nobody can test whether they are blocked.
create function public.follow_status() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
  begin
    if public.blocked_between(new.follower_id, new.followee_id) then
      return null;
    end if;
    new.status := case
      when (select is_private from public.profiles where id = new.followee_id) then 'pending'
      else 'accepted'
    end;
    return new;
  end
  $$;
create trigger follows_status before insert on public.follows
  for each row execute function public.follow_status();

-- Turning public means "anyone may follow", so the requests already waiting are let in.
create function public.accept_pending_on_public() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
  begin
    if old.is_private and not new.is_private then
      update public.follows set status = 'accepted' where followee_id = new.id and status = 'pending';
    end if;
    return new;
  end
  $$;
create trigger profiles_accept_pending after update of is_private on public.profiles
  for each row execute function public.accept_pending_on_public();

-- A block ends any following between the two, in both directions.
create function public.unfollow_on_block() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
  begin
    delete from public.follows
     where (follower_id = new.blocker_id and followee_id = new.blocked_id)
        or (follower_id = new.blocked_id and followee_id = new.blocker_id);
    return new;
  end
  $$;
create trigger blocks_unfollow after insert on public.blocks
  for each row execute function public.unfollow_on_block();

-- Follower and following counts for any profile. Rows of follows are private to
-- the two people in them, so the counts come from here rather than a count(*).
create function public.follow_counts(profile uuid) returns table (followers bigint, following bigint)
  language sql stable security definer set search_path = ''
  as $$
    select
      (select count(*) from public.follows where followee_id = profile and status = 'accepted'),
      (select count(*) from public.follows where follower_id = profile and status = 'accepted')
  $$;
revoke execute on function public.follow_counts(uuid) from public, anon;
grant execute on function public.follow_counts(uuid) to authenticated;

alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.likes enable row level security;

create policy "follows are visible to the two people in them" on public.follows
  for select to authenticated
  using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()));
create policy "a follow is made by the follower" on public.follows
  for insert to authenticated with check (follower_id = (select auth.uid()));
create policy "a request is accepted by the followee" on public.follows
  for update to authenticated
  using (followee_id = (select auth.uid()) and status = 'pending')
  with check (followee_id = (select auth.uid()) and status = 'accepted');
create policy "either side can end a follow" on public.follows
  for delete to authenticated
  using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()));
-- Only the status can change on an update; the people in a follow cannot be swapped.
revoke update on public.follows from anon, authenticated;
grant update (status) on public.follows to authenticated;

create policy "blocks are the blocker's own" on public.blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
create policy "a block is made by the blocker" on public.blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy "a block is lifted by the blocker" on public.blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));

-- Likes ride on the post's own visibility: a like is visible, and can be made,
-- only on a post the reader can see.
create policy "likes are visible on posts you can see" on public.likes
  for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
create policy "a like is your own, on a post you can see" on public.likes
  for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.posts p where p.id = post_id));
create policy "a like is removed by whoever made it" on public.likes
  for delete to authenticated using (user_id = (select auth.uid()));

-- Posts: step 1's author-only read becomes can_see().
drop policy "posts are readable by their author" on public.posts;
create policy "posts are readable by those allowed to see them" on public.posts
  for select to authenticated using (public.can_see(author_id));

-- Profiles stay findable by anyone signed in, except across a block, so a
-- blocked person cannot find the account that blocked them. A policy checks
-- EXECUTE on the functions it names against the caller, and blocked_between is
-- not granted to users, so the policy asks through this narrower wrapper: it
-- answers only "may I see this profile", which its absence would say anyway.
create function public.visible_profile(profile uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select not public.blocked_between(profile, auth.uid()) $$;
revoke execute on function public.visible_profile(uuid) from public, anon;
grant execute on function public.visible_profile(uuid) to authenticated;

drop policy "profiles are readable when signed in" on public.profiles;
create policy "profiles are readable unless blocked either way" on public.profiles
  for select to authenticated
  using (public.visible_profile(id));
```


- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/social/__tests__/social-rls.test.ts`
Expected: PASS, all tests. Fix the migration, not the tests, until it does. Then run the step 1 tests, `rls.test.ts` and `posts-shape.test.ts`. They must still pass; in `rls.test.ts`, "posts are readable by their author only" still holds, because every test user there is private and none follows another.

- [ ] **Step 5: Check the tests can fail**

Temporarily change `can_see` so that the private branch ignores `status`, and run the tests: "not a stranger, nor a pending follower" must fail. Temporarily remove `return null` from `follow_status`: "make a later follow attempt quietly do nothing" must fail. Restore both.

- [ ] **Step 6: Full suite and types, then commit (do not push)**

Run: `npx vitest run && npx tsc --noEmit -p .`

```bash
cd .. && git add supabase/migrations/20261012130000_follows_blocks_likes.sql mobile/src/social/__tests__/social-rls.test.ts
git commit -m "feat(social): follows, blocks and likes, and who can see a post" -m "<body>" -m "<trailer>"
```

---

### Task 2: The feed view and page

**Files:**
- Create: `supabase/migrations/20261012140000_feed.sql`
- Modify: `mobile/src/social/__tests__/social-rls.test.ts` (add a `describe('feed')`)

**Interfaces:**
- Consumes: Task 1's tables and `can_see`.
- Produces:
  - view `public.feed_posts`, with every `posts` column plus `username`, `display_name`, `like_count bigint` and `liked boolean`;
  - RPC `public.feed_page(before timestamptz default null, size integer default 20) returns setof public.feed_posts`.

- [ ] **Step 1: Write the failing tests**

Append to `social-rls.test.ts`:

```ts
describe('feed', () => {
  const feed = (user: string, before: string | null = null) =>
    as<{ title: string; username: string; like_count: number; liked: boolean; created_at: string }>(
      db,
      user,
      `select title, username, like_count::int as like_count, liked, created_at::text from feed_page($1, 20)`,
      [before],
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
    const older = await feed(USER_B, first[0].created_at);
    expect(older).toHaveLength(1);
  });

  it('respects a block', async () => {
    await post(db, USER_C);
    await follow(db, USER_B, USER_C);
    await as(db, USER_C, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [USER_C, USER_B]);
    expect(await feed(USER_B)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/social/__tests__/social-rls.test.ts`
Expected: FAIL. The function `feed_page` does not exist.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261012140000_feed.sql`:

```sql
-- The feed: a post with its author and likes, read as the person asking.
-- security_invoker makes the view obey the caller's row-level security, so it
-- can never show more than selecting from posts would.

create view public.feed_posts with (security_invoker = true) as
  select p.*,
         pr.username,
         pr.display_name,
         (select count(*) from public.likes l where l.post_id = p.id) as like_count,
         exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = (select auth.uid())) as liked
    from public.posts p
    join public.profiles pr on pr.id = p.author_id;

-- Your posts and those of the people you follow (accepted), newest first. Public
-- strangers are left out: a feed is the people you chose, not everyone.
create function public.feed_page(before timestamptz default null, size integer default 20)
  returns setof public.feed_posts
  language sql stable security invoker set search_path = ''
  as $$
    select * from public.feed_posts fp
     where (fp.author_id = (select auth.uid())
            or exists (select 1 from public.follows f
                        where f.follower_id = (select auth.uid())
                          and f.followee_id = fp.author_id
                          and f.status = 'accepted'))
       and (before is null or fp.created_at < before)
     order by fp.created_at desc
     limit least(greatest(size, 1), 50)
  $$;
revoke execute on function public.feed_page(timestamptz, integer) from public, anon;
grant execute on function public.feed_page(timestamptz, integer) to authenticated;
revoke all on public.feed_posts from anon;
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/social/__tests__/social-rls.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite, types, commit (do not push)**

```bash
cd .. && git add supabase/migrations/20261012140000_feed.sql mobile/src/social/__tests__/social-rls.test.ts
git commit -m "feat(social): a feed of the people you follow, newest first" -m "<body>" -m "<trailer>"
```

---

### Task 3: The app's social calls

**Files:**
- Create: `mobile/src/social/feedRules.ts`
- Create: `mobile/src/social/__tests__/feedRules.test.ts`
- Create: `mobile/src/social/feed.ts`
- Modify: `mobile/src/social/types.ts` (add `FeedPost`, `PublicProfile`)
- Modify: `mobile/src/social/errors.ts` (add one branch, with a test in `rules.test.ts`)

**Interfaces:**
- Consumes: `Post` and `Profile` from `types.ts`, plus `messageFor`. The private helpers `client`, `fail` and `userId` live in `api.ts`. Export them from `api.ts` with the same names. That's a one-word `export` change per helper; don't move them.
- Produces:
  - `types.ts`:
    - `interface FeedPost extends Post { username: string; display_name: string; like_count: number; liked: boolean }`
    - `interface PublicProfile { id: string; username: string; display_name: string; instagram: string | null; is_private: boolean }`
    - `type FollowState = 'self' | 'none' | 'requested' | 'following'`
  - `feedRules.ts`:
    - `escapeSearch(text: string): string | null`
    - `toFeedPost(row: Record<string, unknown>): FeedPost`
    - `followStateFor(me: string, them: string, follow: { status: string } | null): FollowState`
  - `feed.ts`:
    - `searchProfiles(text: string): Promise<PublicProfile[]>`
    - `profileByUsername(username: string): Promise<PublicProfile | null>`
    - `followCounts(id: string): Promise<{ followers: number; following: number }>`
    - `followState(them: string): Promise<FollowState>`
    - `follow(them: string): Promise<void>`
    - `unfollow(them: string): Promise<void>`
    - `pendingRequests(): Promise<PublicProfile[]>`
    - `acceptRequest(from: string): Promise<void>`
    - `declineRequest(from: string): Promise<void>`
    - `feedPage(before: FeedCursor | null): Promise<FeedPost[]>`
    - `postsBy(author: string, before: FeedCursor | null): Promise<FeedPost[]>`, with `type FeedCursor = { at: string; id: string }` (the last post's `created_at` and `id`: Task 2 pages by both so posts at the same moment are never skipped)
    - `like(postId: string): Promise<void>`
    - `unlike(postId: string): Promise<void>`
    - `block(them: string): Promise<void>`
    - `unblock(them: string): Promise<void>`
    - `blockedProfiles(): Promise<PublicProfile[]>`
    - `report(input: { postId?: string; profileId?: string; reason: ReportReason; note: string }): Promise<void>`, with `type ReportReason = 'spam' | 'abuse' | 'nudity' | 'other'`. `report` writes to the `reports` table from Task 4, so its call fails until Task 4 lands; that's fine, because it is only used by Task 8's screens.

- [ ] **Step 1: Write the failing tests**

`mobile/src/social/__tests__/feedRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { escapeSearch, followStateFor, toFeedPost } from '../feedRules';

describe('escapeSearch', () => {
  it('lower-cases, trims, drops a typed @, and escapes the LIKE wildcards', () => {
    expect(escapeSearch('  @Bo_b% ')).toBe('bo\\_b\\%');
  });
  it('asks for at least two characters, since one matches half the app', () => {
    expect(escapeSearch('b')).toBeNull();
    expect(escapeSearch('  ')).toBeNull();
  });
  it('refuses characters no username can contain', () => {
    expect(escapeSearch('bob!')).toBeNull();
  });
});

describe('toFeedPost', () => {
  it('turns numeric strings into numbers and keeps the author', () => {
    const post = toFeedPost({
      id: 'p', author_id: 'a', session_id: 's', title: 'Push', performed_on: '2026-10-12', duration_min: 45,
      sets: 5, volume_kg: '2400', exercises: [], highlight: null, caption: null, created_at: '2026-10-12T10:00:00Z',
      username: 'bob', display_name: 'Bob', like_count: '3', liked: true,
    });
    expect(post).toMatchObject({ volume_kg: 2400, like_count: 3, liked: true, username: 'bob' });
  });
});

describe('followStateFor', () => {
  it('reads the button off the follow row', () => {
    expect(followStateFor('me', 'me', null)).toBe('self');
    expect(followStateFor('me', 'them', null)).toBe('none');
    expect(followStateFor('me', 'them', { status: 'pending' })).toBe('requested');
    expect(followStateFor('me', 'them', { status: 'accepted' })).toBe('following');
  });
});
```

Add to `mobile/src/social/__tests__/rules.test.ts`:

```ts
describe('messageFor on a filtered word', () => {
  it('says the text has a word the app does not allow', () => {
    expect(messageFor({ code: 'P0001', message: 'blocked_word' })).toBe('That has a word Ascend doesn’t allow. Change it and try again.');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/social/__tests__/feedRules.test.ts src/social/__tests__/rules.test.ts`
Expected: FAIL. The module `../feedRules` is missing, and the new `messageFor` case returns the generic sentence.

- [ ] **Step 3: Write `feedRules.ts`**

```ts
import type { FeedPost, FollowState } from './types';

/**
 * Small decisions the social screens make, kept apart from the network so they can be tested.
 */

/**
 * A username search as a safe LIKE prefix, or null when it isn't worth sending.
 * Usernames are `a–z 0–9 _ .`, so anything else can only match nothing, and `_`
 * and `%` are LIKE wildcards that must be escaped to mean themselves.
 */
export const escapeSearch = (text: string): string | null => {
  const query = text.trim().replace(/^@/, '').toLowerCase();
  if (query.length < 2 || !/^[a-z0-9_.]+$/.test(query)) return null;
  return query.replace(/[\\%_]/g, (c) => `\\${c}`);
};

/** A feed_posts row as the app's type. Counts and numerics can arrive as strings. */
export const toFeedPost = (row: Record<string, unknown>): FeedPost =>
  ({
    ...row,
    volume_kg: row.volume_kg === null || row.volume_kg === undefined ? null : Number(row.volume_kg),
    like_count: Number(row.like_count ?? 0),
    liked: row.liked === true,
  }) as FeedPost;

export const followStateFor = (me: string, them: string, follow: { status: string } | null): FollowState => {
  if (me === them) return 'self';
  if (follow === null) return 'none';
  return follow.status === 'accepted' ? 'following' : 'requested';
};
```

- [ ] **Step 4: Add the types and the error branch**

Append to `mobile/src/social/types.ts`:

```ts
/** A post as the feed returns it: with its author and its likes. */
export interface FeedPost extends Post {
  username: string;
  display_name: string;
  like_count: number;
  liked: boolean;
}

/** Someone else's profile, as far as anyone signed in may see it. */
export interface PublicProfile {
  id: string;
  username: string;
  display_name: string;
  instagram: string | null;
  is_private: boolean;
}

/** What the follow button on a profile says. */
export type FollowState = 'self' | 'none' | 'requested' | 'following';
```

In `mobile/src/social/errors.ts`, inside `messageFor`, directly after the taken-username line:

```ts
  // The database's word filter (Task 4) raises P0001 with this message.
  if (error.code === 'P0001' && error.message === 'blocked_word') {
    return 'That has a word Ascend doesn’t allow. Change it and try again.';
  }
```

- [ ] **Step 5: Write `feed.ts`**

First add `export` in front of `const client`, `function fail` and `const userId` in `mobile/src/social/api.ts`. Then:

```ts
import { client, fail, userId } from './api';
import { escapeSearch, followStateFor, toFeedPost } from './feedRules';
import type { FeedPost, FollowState, PublicProfile } from './types';

/**
 * Following, the feed, likes, reports and blocks.
 *
 * Every rule about who may see what is in the database. These calls just ask,
 * and each failure comes back as a sentence the screen can show as it is.
 */

const PROFILE_COLUMNS = 'id, username, display_name, instagram, is_private';
const PAGE = 20;

export type ReportReason = 'spam' | 'abuse' | 'nudity' | 'other';

export const searchProfiles = async (text: string): Promise<PublicProfile[]> => {
  const prefix = escapeSearch(text);
  if (prefix === null) return [];
  const { data, error } = await client()
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .like('username', `${prefix}%`)
    .order('username')
    .limit(20);
  if (error) fail(error);
  return (data ?? []) as PublicProfile[];
};

export const profileByUsername = async (username: string): Promise<PublicProfile | null> => {
  const { data, error } = await client()
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('username', username.toLowerCase())
    .maybeSingle();
  if (error) fail(error);
  return data as PublicProfile | null;
};

export const followCounts = async (id: string): Promise<{ followers: number; following: number }> => {
  const { data, error } = await client().rpc('follow_counts', { profile: id });
  if (error) fail(error);
  const row = (data as { followers: number | string; following: number | string }[] | null)?.[0];
  return { followers: Number(row?.followers ?? 0), following: Number(row?.following ?? 0) };
};

export const followState = async (them: string): Promise<FollowState> => {
  const me = await userId();
  if (me === them) return 'self';
  const { data, error } = await client()
    .from('follows')
    .select('status')
    .eq('follower_id', me)
    .eq('followee_id', them)
    .maybeSingle();
  if (error) fail(error);
  return followStateFor(me, them, data as { status: string } | null);
};

export const follow = async (them: string): Promise<void> => {
  const me = await userId();
  const { error } = await client().from('follows').insert({ follower_id: me, followee_id: them });
  // Following twice is still following.
  if (error && !(error.code === '23505' && error.message?.includes('follows_pkey'))) fail(error);
};

export const unfollow = async (them: string): Promise<void> => {
  const me = await userId();
  const { error } = await client().from('follows').delete().eq('follower_id', me).eq('followee_id', them);
  if (error) fail(error);
};

export const pendingRequests = async (): Promise<PublicProfile[]> => {
  const me = await userId();
  const { data, error } = await client()
    .from('follows')
    .select(`created_at, follower:profiles!follows_follower_id_fkey(${PROFILE_COLUMNS})`)
    .eq('followee_id', me)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) fail(error);
  return ((data ?? []) as unknown as { follower: PublicProfile | null }[])
    .map((row) => row.follower)
    .filter((p): p is PublicProfile => p !== null);
};

export const acceptRequest = async (from: string): Promise<void> => {
  const me = await userId();
  const { error } = await client()
    .from('follows')
    .update({ status: 'accepted' })
    .eq('follower_id', from)
    .eq('followee_id', me);
  if (error) fail(error);
};

export const declineRequest = async (from: string): Promise<void> => {
  const me = await userId();
  const { error } = await client().from('follows').delete().eq('follower_id', from).eq('followee_id', me);
  if (error) fail(error);
};

export type FeedCursor = { at: string; id: string };

/** The cursor that asks for the page after this one. */
export const cursorAfter = (posts: FeedPost[]): FeedCursor | null =>
  posts.length === 0 ? null : { at: posts[posts.length - 1].created_at, id: posts[posts.length - 1].id };

export const feedPage = async (before: FeedCursor | null): Promise<FeedPost[]> => {
  const { data, error } = await client().rpc('feed_page', { before: before?.at ?? null, before_id: before?.id ?? null, size: PAGE });
  if (error) fail(error);
  return ((data ?? []) as Record<string, unknown>[]).map(toFeedPost);
};

export const postsBy = async (author: string, before: FeedCursor | null): Promise<FeedPost[]> => {
  let query = client()
    .from('feed_posts')
    .select('*')
    .eq('author_id', author)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE);
  // (created_at, id) < (at, id), spelled for PostgREST: earlier, or the same moment with a smaller id.
  if (before !== null) query = query.or(`created_at.lt.${before.at},and(created_at.eq.${before.at},id.lt.${before.id})`);
  const { data, error } = await query;
  if (error) fail(error);
  return ((data ?? []) as Record<string, unknown>[]).map(toFeedPost);
};

export const like = async (postId: string): Promise<void> => {
  const me = await userId();
  const { error } = await client().from('likes').insert({ post_id: postId, user_id: me });
  // A second tap that raced the first is still a like.
  if (error && !(error.code === '23505' && error.message?.includes('likes_pkey'))) fail(error);
};

export const unlike = async (postId: string): Promise<void> => {
  const me = await userId();
  const { error } = await client().from('likes').delete().eq('post_id', postId).eq('user_id', me);
  if (error) fail(error);
};

export const block = async (them: string): Promise<void> => {
  const me = await userId();
  const { error } = await client().from('blocks').insert({ blocker_id: me, blocked_id: them });
  if (error && !(error.code === '23505' && error.message?.includes('blocks_pkey'))) fail(error);
};

export const unblock = async (them: string): Promise<void> => {
  const me = await userId();
  const { error } = await client().from('blocks').delete().eq('blocker_id', me).eq('blocked_id', them);
  if (error) fail(error);
};

export const blockedProfiles = async (): Promise<PublicProfile[]> => {
  // Profiles across a block are hidden from both people, so the blocked person's
  // name comes from a function that answers for the caller's own blocks only.
  const { data, error } = await client().rpc('my_blocked_profiles');
  if (error) fail(error);
  return (data ?? []) as PublicProfile[];
};

export const report = async (input: {
  postId?: string;
  profileId?: string;
  reason: ReportReason;
  note: string;
}): Promise<void> => {
  const me = await userId();
  const { error } = await client().from('reports').insert({
    reporter_id: me,
    post_id: input.postId ?? null,
    profile_id: input.profileId ?? null,
    reason: input.reason,
    note: input.note.trim() || null,
  });
  if (error) fail(error);
};
```

`blockedProfiles` calls `my_blocked_profiles`, which Task 4 adds; until then it fails, which is fine because only Task 8 uses it.

- [ ] **Step 6: Run the tests to see them pass, then types**

Run: `npx vitest run src/social && npx tsc --noEmit -p .`
Expected: PASS, with no type errors.

- [ ] **Step 7: Commit**

```bash
cd .. && git add mobile/src/social/feedRules.ts mobile/src/social/__tests__/feedRules.test.ts mobile/src/social/feed.ts mobile/src/social/types.ts mobile/src/social/errors.ts mobile/src/social/__tests__/rules.test.ts mobile/src/social/api.ts
git commit -m "feat(social): the app can search, follow, page the feed, like, block and report" -m "<body>" -m "<trailer>"
```

---

### Task 4: Reports, hiding, the word filter, and the blocked list

**Files:**
- Create: `supabase/migrations/20261012150000_reports_and_filter.sql`
- Modify: `mobile/src/social/__tests__/social-rls.test.ts` (add `describe('reports')` and `describe('word filter')`)

**Interfaces:**
- Produces:
  - table `public.reports`;
  - column `public.posts.hidden boolean`;
  - table `public.blocked_words(word text primary key)`;
  - RPC `public.my_blocked_profiles() returns setof (id, username, display_name, instagram, is_private)`;
  - filter errors raised as SQLSTATE `P0001` with the message `blocked_word`.

- [ ] **Step 1: Write the failing tests**

Append to `social-rls.test.ts`:

```ts
describe('reports', () => {
  const reportPost = (user: string, id: string) =>
    as(db, user, `insert into reports (reporter_id, post_id, reason) values ($1, $2, 'spam')`, [user, id]);

  it('can be written about what you can see, and never read back', async () => {
    const id = await post(db, USER_C);
    await reportPost(db, USER_B, id);
    expect(await as(db, USER_B, `select * from reports`)).toEqual([]);
    expect(await as(db, USER_C, `select * from reports`)).toEqual([]);
  });

  it('cannot be made in someone else’s name', async () => {
    const id = await post(db, USER_C);
    await expect(
      as(db, USER_B, `insert into reports (reporter_id, post_id, reason) values ($1, $2, 'spam')`, [USER_A, id]),
    ).rejects.toThrow(/row-level security/);
  });

  it('hide a post from everyone but its author at three different reporters', async () => {
    const id = await post(db, USER_C);
    await profile(db, USER_D, 'dave');
    await reportPost(db, USER_B, id);
    await reportPost(db, USER_B, id); // the same person twice counts once
    await reportPost(db, USER_A, id);
    expect(await titles(db, USER_B)).toHaveLength(1);
    await reportPost(db, USER_D, id);
    expect(await titles(db, USER_B)).toEqual([]);
    expect(await titles(db, USER_C)).toHaveLength(1);
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

  it('lets ordinary text through', async () => {
    await as(db, USER_B, `update profiles set display_name = 'Bob the builder' where id = $1`, [USER_B]);
  });

  it('is not readable or writable by users', async () => {
    await expect(as(db, USER_B, `insert into blocked_words (word) values ('x')`)).rejects.toThrow(/row-level security|permission denied/);
    expect(await as(db, USER_B, `select * from blocked_words`)).toEqual([]);
  });
});

describe('my_blocked_profiles', () => {
  it('lists the people you blocked, and only yours', async () => {
    await as(db, USER_C, `insert into blocks (blocker_id, blocked_id) values ($1, $2)`, [USER_C, USER_B]);
    expect((await as<{ username: string }>(db, USER_C, `select username from my_blocked_profiles()`)).map((r) => r.username)).toEqual(['bob']);
    expect(await as(db, USER_B, `select username from my_blocked_profiles()`)).toEqual([]);
  });
});
```

This needs a fourth user: add `export const USER_D = '00000000-0000-4000-8000-00000000000d';` to `postgres.ts`, insert it into `auth.users` in `freshDatabase()` beside the others, and import it in the test.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/social/__tests__/social-rls.test.ts`
Expected: FAIL. The relation `reports` does not exist.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261012150000_reports_and_filter.sql`:

```sql
-- Reports, hiding, and a word filter: what Apple requires of user-generated content.

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid references public.posts (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('spam', 'abuse', 'nudity', 'other')),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  check (post_id is not null or profile_id is not null)
);
alter table public.reports enable row level security;
-- Written by the reporter, read by nobody here: the owner reviews them in the dashboard.
create policy "a report is made by the reporter" on public.reports
  for insert to authenticated with check (reporter_id = (select auth.uid()));

alter table public.posts add column hidden boolean not null default false;

-- Three different people reporting a post hides it until reviewed.
create function public.hide_on_reports() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
  begin
    if new.post_id is not null
       and (select count(distinct reporter_id) from public.reports where post_id = new.post_id) >= 3 then
      update public.posts set hidden = true where id = new.post_id;
    end if;
    return new;
  end
  $$;
create trigger reports_hide after insert on public.reports
  for each row execute function public.hide_on_reports();

-- A hidden post is still its author's to see; nobody else's.
drop policy "posts are readable by those allowed to see them" on public.posts;
create policy "posts are readable by those allowed to see them" on public.posts
  for select to authenticated
  using (private.can_see(author_id) and (not hidden or author_id = (select auth.uid())));

-- The word filter. The list lives in a table so it grows without an app release;
-- the owner edits it in the dashboard. Matching is case-insensitive and by
-- substring, which over-matches rather than under-matches — the right side to err on.
create table public.blocked_words (word text primary key check (word = lower(word) and char_length(word) >= 3));
alter table public.blocked_words enable row level security;
-- No policies: users can neither read nor write the list.

create function public.contains_blocked_word(value text) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select value is not null
       and exists (select 1 from public.blocked_words w where position(w.word in lower(value)) > 0)
  $$;
revoke execute on function public.contains_blocked_word(text) from public, anon, authenticated;

create function public.reject_blocked_words() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
  begin
    if tg_table_name = 'posts' then
      if public.contains_blocked_word(new.caption) or public.contains_blocked_word(new.title) then
        raise exception 'blocked_word' using errcode = 'P0001';
      end if;
    elsif tg_table_name = 'profiles' then
      if public.contains_blocked_word(new.username) or public.contains_blocked_word(new.display_name) then
        raise exception 'blocked_word' using errcode = 'P0001';
      end if;
    end if;
    return new;
  end
  $$;
create trigger posts_word_filter before insert or update of caption, title on public.posts
  for each row execute function public.reject_blocked_words();
create trigger profiles_word_filter before insert or update of username, display_name on public.profiles
  for each row execute function public.reject_blocked_words();

-- The people you have blocked. Their profiles are hidden from you by the profiles
-- policy (a block hides both ways), so the list comes from here, for your own blocks only.
create function public.my_blocked_profiles()
  returns table (id uuid, username text, display_name text, instagram text, is_private boolean)
  language sql stable security definer set search_path = ''
  as $$
    select p.id, p.username, p.display_name, p.instagram, p.is_private
      from public.blocks b join public.profiles p on p.id = b.blocked_id
     where b.blocker_id = auth.uid()
     order by p.username
  $$;
revoke execute on function public.my_blocked_profiles() from public, anon;
grant execute on function public.my_blocked_profiles() to authenticated;
```

- [ ] **Step 4: Run all the database tests**

Run: `npx vitest run src/social`
Expected: PASS, including `rls.test.ts` and `posts-shape.test.ts` from earlier.

- [ ] **Step 5: Full suite, types, commit (do not push)**

```bash
cd .. && git add supabase/migrations/20261012150000_reports_and_filter.sql mobile/src/social/__tests__/social-rls.test.ts mobile/src/social/__tests__/postgres.ts
git commit -m "feat(social): reports hide a post at three, a word filter, and your blocked list" -m "<body>" -m "<trailer>"
```

---

### Task 5: The Social tab and the feed

**Files:**
- Create: `mobile/app/(tabs)/social.tsx`
- Modify: `mobile/app/(tabs)/_layout.tsx` (Social in the bar, Settings hidden)
- Modify: `mobile/src/components/Screen.tsx` (an `action` prop)
- Modify: `mobile/app/(tabs)/index.tsx` (a Settings gear in its header)
- Modify: `mobile/src/components/PostCard.tsx` (author, like, more)

**Interfaces:**
- Consumes: from Task 3, `feedPage`, `like`, `unlike` and `pendingRequests`, plus `FeedPost`; `postView` and `useSocial`.
- Produces: `PostCard` props become `{ view: PostView; onDelete?: () => void; author?: { username: string; displayName: string; onPress: () => void }; likes?: { count: number; liked: boolean; onToggle: () => void }; onMore?: () => void }`. Existing callers (`my-posts.tsx`) are unchanged.

- [ ] **Step 1: `Screen` gains an action slot**

In `mobile/src/components/Screen.tsx`:
- add `action?: React.ReactNode` to `ScreenProps` with the comment `/** Drawn at the right of the title, e.g. a settings gear. */`;
- destructure it;
- in the header, wrap the title in a row `<View style={styles.titleRow}><Text …title…/>{action}</View>` with `titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }`;
- leave the subtitle under the row.

- [ ] **Step 2: The tab bar**

In `mobile/app/(tabs)/_layout.tsx`, before the `settings` screen, add:

```tsx
      <Tabs.Screen
        name="social"
        options={{
          title: 'Social',
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} />,
        }}
      />
```

and change the `settings` screen's options to `{ title: 'Settings', href: null }`. It stays a route (`/settings`) but leaves the bar, which keeps five tabs; six labels don't fit at phone width. Add the comment:

```tsx
        // Out of the bar, which holds five at phone width, but still a route: the
        // gear on Today and on Social opens it.
```

- [ ] **Step 3: A gear on Today**

In `mobile/app/(tabs)/index.tsx`, pass `action` to its `Screen`:

```tsx
action={
  <Tappable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Settings" style={{ padding: 10 }}>
    <Ionicons name="settings-outline" size={22} color={colors.textMuted} />
  </Tappable>
}
```

Use the screen's existing `router`, `colors` and imports, adding `Ionicons` from `@expo/vector-icons/Ionicons` and `Tappable` if they're missing.

- [ ] **Step 4: `PostCard` gains author, like and more**

Extend `mobile/src/components/PostCard.tsx`. Keep the current body and add:

```tsx
export const PostCard = ({
  view,
  onDelete,
  author,
  likes,
  onMore,
}: {
  view: PostView;
  onDelete?: () => void;
  /** Whose post, for the feed and other people's profiles; tapping opens their profile. */
  author?: { username: string; displayName: string; onPress: () => void };
  likes?: { count: number; liked: boolean; onToggle: () => void };
  /** The ⋯ menu: report, block. */
  onMore?: () => void;
}) => {
```

- When `author` or `onMore` is given, draw a row above the title. On the left, a `Tappable` with `accessibilityRole="button"` showing the display name in `font.uiStrong` and `@username` in `textFaint`. On the right, a `Tappable` with `accessibilityLabel="More"` showing Ionicons `ellipsis-horizontal`.
- When `likes` is given, draw a row under the lifts. It holds a `Tappable` with `accessibilityRole="button"`, `accessibilityLabel={likes.liked ? 'Unlike' : 'Like'}` and `accessibilityState={{ selected: likes.liked }}`. Inside it go Ionicons `heart` (`colors.danger`) when liked, or `heart-outline`, plus the count.
- The `Tappable`s get `hitSlop` and `padding: 8`, so each target is 44 px.

- [ ] **Step 5: The Social tab**

`mobile/app/(tabs)/social.tsx`:

```tsx
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Controls';
import { PostCard } from '../../src/components/PostCard';
import { Screen } from '../../src/components/Screen';
import { Tappable } from '../../src/components/Tappable';
import { notify } from '../../src/dialog';
import { cursorAfter, feedPage, like, pendingRequests, unlike } from '../../src/social/feed';
import { postView } from '../../src/social/postPayload';
import { useSocial } from '../../src/social/session';
import type { FeedPost } from '../../src/social/types';
import { useApp } from '../../src/state/AppStore';
import { font, space, useTheme } from '../../src/theme';

/**
 * Workouts from the people you follow, newest first.
 *
 * A feed of the people you chose rather than of everyone: public accounts you
 * don't follow are found through Find people, never pushed at you.
 */
export default function SocialScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { settings } = useApp();
  const { configured, session, profile } = useSocial();
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [requests, setRequests] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [more, setMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setProblem(null);
    try {
      const [page, pending] = await Promise.all([feedPage(null), pendingRequests()]);
      setPosts(page);
      setMore(page.length === 20);
      setRequests(pending.length);
    } catch (error) {
      setProblem((error as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (session && profile) void load();
    }, [session, profile, load]),
  );

  const loadMore = async () => {
    if (!posts || posts.length === 0 || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await feedPage(cursorAfter(posts));
      setPosts([...posts, ...page]);
      setMore(page.length === 20);
    } catch (error) {
      notify('Could not load more', (error as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  // Optimistic: the heart changes at once and is put back if the server says no.
  const toggleLike = async (post: FeedPost) => {
    const flip = (p: FeedPost): FeedPost =>
      p.id === post.id ? { ...p, liked: !p.liked, like_count: p.like_count + (p.liked ? -1 : 1) } : p;
    setPosts((current) => current?.map(flip) ?? null);
    try {
      await (post.liked ? unlike(post.id) : like(post.id));
    } catch (error) {
      setPosts((current) => current?.map(flip) ?? null);
      notify('Could not save that', (error as Error).message);
    }
  };

  const gear = (
    <Tappable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Settings" style={styles.icon}>
      <Ionicons name="settings-outline" size={22} color={colors.textMuted} />
    </Tappable>
  );

  const say = (text: string) => <Text style={[styles.note, { color: colors.textMuted }]}>{text}</Text>;

  if (!configured) return <Screen title="Social" action={gear}>{say('Social is not set up in this build.')}</Screen>;
  if (session === undefined) return <Screen title="Social" action={gear}><ActivityIndicator color={colors.text} /></Screen>;
  if (session === null || profile === null) {
    return (
      <Screen title="Social" action={gear}>
        <Card>
          {say('Follow friends and see their workouts. Sign in and choose a username to start.')}
          <Button label={session === null ? 'Sign in' : 'Choose a username'} onPress={() => router.push(session === null ? '/sign-in' : '/profile-setup')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      title="Social"
      action={
        <View style={styles.actions}>
          <Tappable onPress={() => router.push('/requests')} accessibilityRole="button" accessibilityLabel={`Follow requests, ${requests}`} style={styles.icon}>
            <Ionicons name="person-add-outline" size={22} color={colors.textMuted} />
            {requests > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                <Text style={styles.badgeText}>{requests}</Text>
              </View>
            )}
          </Tappable>
          <Tappable onPress={() => router.push('/people')} accessibilityRole="button" accessibilityLabel="Find people" style={styles.icon}>
            <Ionicons name="search-outline" size={22} color={colors.textMuted} />
          </Tappable>
          {gear}
        </View>
      }
    >
      {problem !== null ? (
        <>
          {say(problem)}
          <Button label="Try again" onPress={() => void load()} />
        </>
      ) : posts === null ? (
        <ActivityIndicator color={colors.text} />
      ) : posts.length === 0 ? (
        <Card>
          {say('Follow people to see their workouts here. Yours show up too, once you post one.')}
          <Button label="Find people" onPress={() => router.push('/people')} />
        </Card>
      ) : (
        <>
          {posts.map((post) => (
            <PostCard
              key={post.id}
              view={postView(post, settings.units)}
              author={{
                username: post.username,
                displayName: post.display_name,
                onPress: () => router.push({ pathname: '/profile', params: { username: post.username } }),
              }}
              likes={{ count: post.like_count, liked: post.liked, onToggle: () => void toggleLike(post) }}
              onMore={() => router.push({ pathname: '/report', params: { postId: post.id, profileId: post.author_id, username: post.username } })}
            />
          ))}
          {more && <Button label={loadingMore ? 'Loading…' : 'Load more'} variant="subtle" disabled={loadingMore} onPress={() => void loadMore()} />}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 14, marginBottom: space.md },
  actions: { flexDirection: 'row', alignItems: 'center' },
  icon: { padding: 10 },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontFamily: font.uiStrong, fontSize: 10 },
});
```

The `/requests`, `/people`, `/profile` and `/report` routes are created in Tasks 6–8. Typed routes reject them until those files exist, so for this task create each of `mobile/app/people.tsx`, `profile.tsx`, `requests.tsx` and `report.tsx` as a placeholder that renders `<Screen title="…" />` with a one-line note. Tasks 6–8 replace them. Register all four in `mobile/app/_layout.tsx` as modal stack screens, in the same shape as `my-posts`, with titles "Find people", "Profile", "Follow requests" and "Report".

- [ ] **Step 6: Types, tests, browser check, commit**

Run `npx tsc --noEmit -p .` (regenerate the typed routes as earlier tasks did if needed: `CI=1 npx expo start --web --port 8199`, wait until `.expo/types/router.d.ts` mentions `/people`, then stop it) and `npx vitest run`.

The controller checks in the browser that:
- the bar shows Today, Weight, Train, Trends and Social;
- the gear opens Settings;
- your own post appears in the feed;
- the heart toggles and the count persists after a reload.

```bash
cd .. && git add -A mobile/app mobile/src/components
git commit -m "feat(social): a Social tab with the feed, in place of Settings in the bar" -m "<body>" -m "<trailer>"
```

---

### Task 6: Find people and profiles

**Files:**
- Replace: `mobile/app/people.tsx`, `mobile/app/profile.tsx`

**Interfaces:**
- Consumes: from Task 3, `searchProfiles`, `profileByUsername`, `followCounts`, `followState`, `follow`, `unfollow` and `postsBy`, with `FollowState`.

- [ ] **Step 1: `app/people.tsx`**

- A `Field` labelled "Username" (`autoCapitalize="none"`, `autoCorrect={false}`, placeholder `@username`).
- Searching runs 300 ms after the person stops typing: a `setTimeout` in a `useEffect` on the text, cleared on change. The search is `searchProfiles(text)`.
- Results are rows showing display name, `@username` and "Private" when `is_private`. Tapping a row pushes `/profile?username=…`.
- **Empty states:**
  - fewer than 2 characters: "Type at least two letters of a username.";
  - no match: "No one by that name.";
  - an error shows its sentence.
- The screen comment says why search is by username only: suggestions are where strangers and spam come from (see the spec's non-goals).

- [ ] **Step 2: `app/profile.tsx`**

Read `username` from `useLocalSearchParams`, then load with `profileByUsername`. When the result is null, the screen says "That account isn't available." The same sentence covers "doesn't exist" and "blocked", so it never reveals a block.

With a profile:

- **Header card:** display name, `@username`, an Instagram link when set (a `Tappable` that opens `https://instagram.com/<handle>` with `Linking.openURL`), and "N followers · N following" from `followCounts`.
- **Follow button:** reads `followState`:
  - `self`: hidden; show "Edit profile", which pushes `/profile-setup`;
  - `none`: "Follow". On success, re-read the state, so a private account shows Requested and a public one Following.
  - `requested`: "Requested" (subtle). Tapping withdraws via `unfollow`, after a confirm: "Withdraw your follow request?".
  - `following`: "Following" (subtle). Tapping unfollows, after a confirm: "Unfollow @username?".
- **Posts:** use `postsBy(profile.id, null)` and render them with `PostCard`, with author and likes as in the feed, plus "Load more" as in the feed.
  - A private account you don't follow gets an empty result from RLS. In that case, show "This account is private. Follow to see their workouts." instead of an empty list.
  - Tell the cases apart with `profile.is_private && state !== 'following' && state !== 'self'`.
- A ⋯ in the header (`Screen` `action`) pushes `/report?profileId=…&username=…`. That screen also offers Block.

- [ ] **Step 3: Types, tests, browser check, commit**

The controller checks, using the owner's account and a second account (`marcarlinghaus+test@gmail.com`):
- search finds the other username;
- following a private account shows Requested;
- the other account sees the request (Task 7 builds that screen, so check this after Task 7).

```bash
cd .. && git add mobile/app/people.tsx mobile/app/profile.tsx
git commit -m "feat(social): find people by username and see their profile and workouts" -m "<body>" -m "<trailer>"
```

---

### Task 7: Follow requests

**Files:**
- Replace: `mobile/app/requests.tsx`

**Interfaces:**
- Consumes: from Task 3, `pendingRequests`, `acceptRequest` and `declineRequest`.

- [ ] **Step 1: `app/requests.tsx`**

- The list from `pendingRequests()`. Each row shows display name and `@username` (tap opens their profile), plus two buttons, **Approve** and **Decline**.
- On success, the row leaves the list. On failure, show `notify` with the sentence.
- Empty: "No follow requests."
- Reload on focus.
- The screen comment says that approving is what lets someone see a private account's posts. This screen is the only way in.

- [ ] **Step 2: Types, tests, browser check, commit**

The controller checks, as the second account, that:
- approving the owner's request makes the owner's feed show the second account's post;
- declining a later one removes it.

```bash
cd .. && git add mobile/app/requests.tsx
git commit -m "feat(social): approve or decline follow requests" -m "<body>" -m "<trailer>"
```

---

### Task 8: Report and block

**Files:**
- Replace: `mobile/app/report.tsx`
- Create: `mobile/app/blocked.tsx`
- Modify: `mobile/app/account.tsx` (a "Blocked people" button)
- Modify: `mobile/app/_layout.tsx` (route `blocked`, title "Blocked people")

**Interfaces:**
- Consumes: from Task 3, `report`, `block`, `unblock` and `blockedProfiles`, with `ReportReason`.

- [ ] **Step 1: `app/report.tsx`**

Params: `postId?`, `profileId` and `username`.

- **Title:** "Report this workout" when `postId` is set, otherwise "Report @username".
- **Reason:** a `Segmented`, or four rows, offering Spam, Abusive, Nudity and Something else (`spam`, `abuse`, `nudity` and `other`).
- **Note:** an optional field, 300 characters at most.
- **Send:** calls `report(...)`, then `notify('Thanks — we’ll look at it')`, then `router.back()`.
- **Block @username:** a separate `danger` button. It confirms with "Block @username? You won't see each other's workouts or profiles, and any following between you ends.", then calls `block(profileId)`, notifies, and goes `router.back()` twice, or to the Social tab.
- The comment says why Report and Block are offered together: someone reporting abuse usually wants it to stop now, not after a review.

- [ ] **Step 2: `app/blocked.tsx`**

- The list from `blockedProfiles()`, with an **Unblock** button per row that confirms first.
- Empty: "You haven't blocked anyone."
- In `app/account.tsx`, add `<Button label="Blocked people" variant="subtle" onPress={() => router.push('/blocked')} />` after "Your posts".

- [ ] **Step 3: Types, tests, browser check, commit**

The controller checks that blocking the second account removes it from search, the feed and the profile ("That account isn't available."), and that unblocking brings search back.

```bash
cd .. && git add mobile/app/report.tsx mobile/app/blocked.tsx mobile/app/account.tsx mobile/app/_layout.tsx
git commit -m "feat(social): report a workout or a person, and block or unblock" -m "<body>" -m "<trailer>"
```

---

### Task 9: Ship (owner approval required)

- [ ] **Step 1:** The final whole-branch review on the most capable model, then fixes, per the subagent-driven-development skill.
- [ ] **Step 2:** The owner adds starting words to `blocked_words` in the Supabase dashboard (Table editor → blocked_words). The table ships empty, and the filter has nothing to match until it's filled.
- [ ] **Step 3:** With the owner's OK, merge to `main`. This applies the three migrations live; check that `curl …/rest/v1/follows?select=*` with the publishable key answers `[]`. Then deploy the web build (`services/gemini-proxy/README.md`, from PowerShell). Then run the two-account check on the live site.
