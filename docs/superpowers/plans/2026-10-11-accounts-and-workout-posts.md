# Accounts and Workout Posts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Someone can sign in with an email code, pick a username, post a finished workout with a caption from the finish sheet, see and delete their posts, and delete their account.

**Architecture:** Supabase holds `profiles` and `posts`, guarded by row-level security written as SQL migrations in `supabase/migrations/` (applied to the live project by Supabase's GitHub integration on push to `main`). The app talks to it through `src/social/` — a client, an API module that turns every failure into one sentence, and a provider that knows who is signed in. A post is computed from the finished session by a pure module that the share card is rebuilt on, so the two can never disagree.

**Tech Stack:** Expo 57 / expo-router, `@supabase/supabase-js` 2.x, `@react-native-async-storage/async-storage`, vitest 2 with `@electric-sql/pglite` 0.3.16 for the database tests.

**Spec:** `docs/superpowers/specs/2026-10-11-accounts-and-workout-posts-design.md`

## Global Constraints

- Signing in is optional: with no account, or with the Supabase variables unset, everything that works today works unchanged.
- Username `^[a-z0-9_.]{3,20}$`, stored lower-case, unique. Display name 1–40 characters. Instagram `^[A-Za-z0-9_.]{1,30}$`, stored without `@`, optional.
- `is_private` defaults to true.
- Caption at most 500 characters. Title 1–80. At most 30 exercises per post.
- Weights are stored in kilograms, durations in minutes; formatting happens in the reader's units.
- `anon` reads nothing. A post is readable by its author only in this step.
- A retry of the same workout makes one post (`unique (author_id, session_id)`), and "already posted" counts as success.
- The finish sheet remembers `settings.postWorkouts`: true after posting, false after DONE without posting.
- Never use or store the database password. The publishable key lives only in `mobile/.env.local` (git-ignored) as `EXPO_PUBLIC_SUPABASE_ANON_KEY`, beside `EXPO_PUBLIC_SUPABASE_URL`.
- Pushing a change under `supabase/migrations/` to `main` alters the live database. Push only after the PGlite tests pass.
- Match the surrounding code: comments explain *why*, in full sentences; no new abstractions beyond those named here.
- All commands run from `mobile/` unless stated. Tests: `npx vitest run`. Types: `npx tsc --noEmit -p .`.
- In each commit step, `<body>` is one short paragraph on what changed and why, and `<trailer>` is these two lines; commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014qkJZ1mg6EVVX6ZVXpnvyP
  ```

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/config.toml` | Minimal CLI config so the GitHub integration recognises the directory |
| `supabase/migrations/20261011120000_accounts_and_posts.sql` | Tables, constraints, row-level security, `delete_account()` |
| `mobile/src/social/__tests__/postgres.ts` | PGlite with a stand-in for what Supabase provides; run SQL as a user |
| `mobile/src/social/__tests__/rls.test.ts` | Who can read and write what |
| `mobile/src/social/postPayload.ts` | Finished workout → post row; post row → what a reader sees |
| `mobile/src/social/__tests__/postPayload.test.ts` | Its tests |
| `mobile/src/shareCard.ts` | Rebuilt on `postPayload`/`postView`; signature unchanged |
| `mobile/src/social/profileRules.ts` | Normalise and check profile fields before sending |
| `mobile/src/social/errors.ts` | Server and auth errors → one sentence |
| `mobile/src/social/__tests__/rules.test.ts` | Tests for both |
| `mobile/src/social/types.ts` | `Profile`, `Post` |
| `mobile/src/social/client.ts` | The Supabase client, or null when unconfigured |
| `mobile/src/social/api.ts` | Every call the screens make |
| `mobile/src/social/session.tsx` | `SocialProvider`, `useSocial()` |
| `mobile/src/components/PostCard.tsx` | One post, as "Your posts" (and later the feed) shows it |
| `mobile/app/sign-in.tsx`, `profile-setup.tsx`, `account.tsx`, `my-posts.tsx` | Screens |
| `mobile/app/_layout.tsx` | Provider and routes |
| `mobile/app/(tabs)/settings.tsx` | The Account row |
| `mobile/src/components/Controls.tsx` | `Field` gains `autoCapitalize` and `maxLength` |
| `mobile/src/state/settings.ts` | `postWorkouts` |
| `mobile/src/components/FinishSheet.tsx`, `mobile/app/session.tsx` | POST and caption |

---

### Task 1: Database schema, row-level security, and its tests

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/20261011120000_accounts_and_posts.sql`
- Create: `mobile/src/social/__tests__/postgres.ts`
- Create: `mobile/src/social/__tests__/rls.test.ts`
- Modify: `mobile/package.json` (dev dependency)

**Interfaces:**
- Produces: tables `public.profiles`, `public.posts`; function `public.delete_account()`; constraint names `profiles_username_check`, `profiles_username_key`, `posts_caption_check`, `posts_author_id_session_id_key`, `posts_author_id_fkey` (Task 3's error messages key on `username` and `session` appearing in them).

- [ ] **Step 1: Install PGlite**

Run: `npm install -D @electric-sql/pglite@0.3.16`
Expected: `mobile/package.json` devDependencies gains `"@electric-sql/pglite": "0.3.16"` (or `^0.3.16`).

- [ ] **Step 2: Write the test harness**

`mobile/src/social/__tests__/postgres.ts`:

```ts
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Real Postgres for the database tests, without Docker or a Supabase project.
 *
 * The migrations run unchanged. What they lean on from Supabase — the `auth`
 * schema's users and `auth.uid()`, the `anon` and `authenticated` roles, and
 * Supabase's habit of granting every new table and function to both roles — is
 * recreated here and nothing more. The grants matter most: on Supabase a table
 * is readable by `anon` until row-level security says otherwise, so the tests
 * must start from the same open door or they prove nothing about the lock.
 */

const MIGRATIONS = fileURLToPath(new URL('../../../../supabase/migrations/', import.meta.url));

const SUPABASE_STAND_IN = `
  create schema auth;
  create table auth.users (id uuid primary key);
  create role anon nologin;
  create role authenticated nologin;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`;

export const USER_A = '00000000-0000-4000-8000-00000000000a';
export const USER_B = '00000000-0000-4000-8000-00000000000b';
/** Signed up, but has not chosen a username yet. */
export const USER_C = '00000000-0000-4000-8000-00000000000c';

export const freshDatabase = async (): Promise<PGlite> => {
  const db = new PGlite();
  await db.exec(SUPABASE_STAND_IN);
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
  for (const file of files) await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  await db.exec(`insert into auth.users (id) values ('${USER_A}'), ('${USER_B}'), ('${USER_C}')`);
  return db;
};

/** One statement as a signed-in user, or as nobody (`null`), the way PostgREST runs it. */
export const as = async <T = Record<string, unknown>>(
  db: PGlite,
  user: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> => {
  await db.exec(`set role ${user === null ? 'anon' : 'authenticated'}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? '']);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
};
```

- [ ] **Step 3: Write the failing tests**

`mobile/src/social/__tests__/rls.test.ts`:

```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { as, freshDatabase, USER_A, USER_B, USER_C } from './postgres';

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

    expect((await db.query(`select id from auth.users order by id`)).rows).toEqual([{ id: USER_B }, { id: USER_C }]);
    expect((await db.query(`select username from profiles`)).rows).toEqual([{ username: 'bob' }]);
    expect((await db.query(`select author_id from posts`)).rows).toEqual([{ author_id: USER_B }]);
  });

  it('cannot be called signed out', async () => {
    await expect(as(db, null, `select delete_account()`)).rejects.toThrow(/permission denied/);
  });
});
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npx vitest run src/social/__tests__/rls.test.ts`
Expected: FAIL — `ENOENT` on `supabase/migrations/` (the directory does not exist yet).

- [ ] **Step 5: Write the migration and the CLI config**

`supabase/config.toml` (repo root):

```toml
# The Supabase CLI and GitHub integration look for this directory by this file.
# Everything not set here takes the CLI's defaults.
project_id = "adaptive-macro"
```

`supabase/migrations/20261011120000_accounts_and_posts.sql`:

```sql
-- Accounts and workout posts: step 1 of the social feature.
-- See docs/superpowers/specs/2026-10-11-accounts-and-workout-posts-design.md.
--
-- Row-level security is the guard. Supabase grants every new table to `anon`
-- and `authenticated`; with RLS on and no policy for `anon`, `anon` reads
-- nothing. `(select auth.uid())` rather than `auth.uid()` lets Postgres
-- evaluate it once per statement instead of once per row.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_.]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  instagram text check (instagram ~ '^[A-Za-z0-9_.]{1,30}$'),
  is_private boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  -- The workout's id on the device: a retry of the same workout is the same post.
  session_id text not null,
  title text not null check (char_length(title) between 1 and 80),
  performed_on date not null,
  duration_min integer not null check (duration_min >= 1),
  sets integer not null check (sets >= 0),
  -- Kilograms. Null on a day with no loaded sets, rather than a claimed zero.
  volume_kg numeric check (volume_kg is null or volume_kg > 0),
  exercises jsonb not null check (jsonb_typeof(exercises) = 'array' and jsonb_array_length(exercises) <= 30),
  highlight jsonb,
  caption text check (char_length(caption) <= 500),
  created_at timestamptz not null default now(),
  unique (author_id, session_id)
);

create index posts_author_created on public.posts (author_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.posts enable row level security;

-- A profile is a name, not content; step 2's username search needs to read them.
create policy "profiles are readable when signed in" on public.profiles
  for select to authenticated using (true);
create policy "a profile is created by its owner" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "a profile is changed by its owner" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- No delete policy: a profile goes only with its account.

-- Step 2 replaces the select policy with: the author, an approved follower, or
-- anyone when the author is public.
create policy "posts are readable by their author" on public.posts
  for select to authenticated using (author_id = (select auth.uid()));
create policy "posts are written by their author" on public.posts
  for insert to authenticated with check (author_id = (select auth.uid()));
create policy "posts are changed by their author" on public.posts
  for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "posts are deleted by their author" on public.posts
  for delete to authenticated using (author_id = (select auth.uid()));

-- Deleting the account deletes the user; the profile and posts follow by cascade.
-- Security definer because no signed-in role may touch auth.users directly.
create function public.delete_account() returns void
  language sql security definer set search_path = ''
  as $$ delete from auth.users where id = auth.uid(); $$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run src/social/__tests__/rls.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 7: Check the tests can fail**

Temporarily change the posts select policy to `using (true)`, rerun: "are readable by their author only" must FAIL. Temporarily remove `revoke execute … from public, anon`, rerun: "cannot be called signed out" must FAIL. Restore both and rerun: PASS.

- [ ] **Step 8: Full suite and types**

Run: `npx vitest run && npx tsc --noEmit -p .`
Expected: all pass, no type errors.

- [ ] **Step 9: Commit, push, and confirm the live database took it**

```bash
cd .. && git add supabase mobile/package.json package-lock.json mobile/src/social/__tests__/postgres.ts mobile/src/social/__tests__/rls.test.ts
git commit -m "feat(social): profiles and posts, readable only by their author" -m "<body>" -m "<trailer>"
git push origin main
```

Then, after a minute, from `mobile/`:

```bash
set -a; . ./.env.local; set +a
curl -s "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/profiles?select=id" -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY"
```

Expected: `[]` (the table exists; `anon` sees nothing). If the answer mentions `PGRST205` or "Could not find the table", the integration did not apply the migration: stop and ask the owner to check the integration's "Deploy to production" setting and the Supabase directory path (`supabase`), or to paste the migration into the SQL editor. Do not use the database password to apply it.

---

### Task 2: Post payload and view, with the share card rebuilt on them

**Files:**
- Create: `mobile/src/social/postPayload.ts`
- Create: `mobile/src/social/__tests__/postPayload.test.ts`
- Modify: `mobile/src/shareCard.ts` (whole file)
- Test (regression, unchanged): `mobile/src/__tests__/shareCard.test.ts`

**Interfaces:**
- Consumes: `LoggedSet` from `src/db`; `Milestone` from `@adaptive-macros/engine`; `displayWeight`, `formatDateLong` from `src/format`; `describeMilestone` from `src/milestones`; `UnitSystem` from `src/state/settings`; `ShareSummary` type from `src/shareCard`.
- Produces:
  - `MAX_CAPTION = 500`
  - `interface PostExercise { name: string; sets: number; best_kg: number | null; best_reps: number }`
  - `interface PostRow { session_id: string; title: string; performed_on: string; duration_min: number; sets: number; volume_kg: number | null; exercises: PostExercise[]; highlight: Milestone | null; caption: string | null }`
  - `interface FinishedWorkout { sessionId: string; title: string; date: string; startedAt: string; finishedAt: Date; sets: LoggedSet[]; milestone: Milestone | null }`
  - `postPayload(workout: FinishedWorkout, caption: string | null): PostRow` — throws `Error('A caption can be at most 500 characters.')`
  - `type PostView = ShareSummary & { caption: string | null }`
  - `postView(row: PostRow, units: UnitSystem, maxExercises = 3): PostView`

- [ ] **Step 1: Write the failing tests**

`mobile/src/social/__tests__/postPayload.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { LoggedSet } from '../../db';
import { type FinishedWorkout, postPayload, postView } from '../postPayload';

let id = 0;
const set = (exerciseName: string, weightKg: number | null, reps: number, setType: LoggedSet['setType'] = 'normal'): LoggedSet => {
  id += 1;
  return { id: `s${id}`, exerciseName, bodyweightBased: weightKg === null, setIndex: id, weightKg, reps, setType, rpe: null };
};

const workout = (overrides: Partial<FinishedWorkout> = {}): FinishedWorkout => ({
  sessionId: 'session-1',
  title: 'Push',
  date: '2026-10-11',
  startedAt: '2026-10-11T18:00:00',
  finishedAt: new Date('2026-10-11T19:12:00'),
  sets: [
    set('Bench Press (Barbell)', 20, 10, 'warmup'),
    set('Bench Press (Barbell)', 100, 5),
    set('Bench Press (Barbell)', 100, 6),
    set('Bench Press (Barbell)', 95, 8),
    set('Pull Up', null, 12),
    set('Pull Up', null, 9),
  ],
  milestone: null,
  ...overrides,
});

describe('postPayload', () => {
  it('stores kilograms and minutes, leaving warm-ups out', () => {
    const row = postPayload(workout(), null);
    expect(row).toMatchObject({ session_id: 'session-1', performed_on: '2026-10-11', duration_min: 72, sets: 5, volume_kg: 1860 });
  });

  it('keeps each lift’s best set as numbers', () => {
    const row = postPayload(workout(), null);
    expect(row.exercises).toEqual([
      { name: 'Bench Press (Barbell)', sets: 3, best_kg: 100, best_reps: 6 },
      { name: 'Pull Up', sets: 2, best_kg: null, best_reps: 12 },
    ]);
  });

  it('stores no volume for a bodyweight-only day', () => {
    expect(postPayload(workout({ sets: [set('Push-Up', null, 20)] }), null).volume_kg).toBeNull();
  });

  it('trims the caption and stores none for a blank one', () => {
    expect(postPayload(workout(), '  felt strong  ').caption).toBe('felt strong');
    expect(postPayload(workout(), '   ').caption).toBeNull();
  });

  it('refuses a caption over 500 characters', () => {
    expect(postPayload(workout(), 'x'.repeat(500)).caption).toHaveLength(500);
    expect(() => postPayload(workout(), 'x'.repeat(501))).toThrow('A caption can be at most 500 characters.');
  });

  it('cuts a title to 80 characters and never sends an empty one', () => {
    expect(postPayload(workout({ title: 'y'.repeat(90) }), null).title).toHaveLength(80);
    expect(postPayload(workout({ title: '  ' }), null).title).toBe('Workout');
  });

  it('keeps the day’s milestone as the engine made it', () => {
    const milestone = { kind: 'load' as const, value: 100, exercise: 'Bench Press (Barbell)' };
    expect(postPayload(workout({ milestone }), null).highlight).toEqual(milestone);
  });
});

describe('postView', () => {
  it('speaks pounds to a reader in pounds, whatever the poster used', () => {
    const view = postView(postPayload(workout({ sets: [set('Squat', 100, 5)] }), null), 'imperial');
    expect(view.exercises[0].best).toBe('220.5 lb × 5');
    expect(view.volume).toBe('1,102 lb');
  });

  it('quotes reps for a lift with no added load', () => {
    expect(postView(postPayload(workout(), null), 'metric').exercises[1].best).toBe('12 reps');
  });

  it('shows three lifts and counts the rest', () => {
    const many = Array.from({ length: 5 }, (_, i) => set(`Lift ${i}`, 50, 10));
    const view = postView(postPayload(workout({ sets: many }), null), 'metric');
    expect(view.exercises).toHaveLength(3);
    expect(view.more).toBe(2);
  });

  it('phrases the milestone in the reader’s units', () => {
    const row = postPayload(workout({ milestone: { kind: 'load', value: 100, exercise: 'Bench Press (Barbell)' } }), null);
    expect(postView(row, 'metric').highlight).toEqual({ label: 'BENCH PRESS (BARBELL)', figure: '100 kg' });
    expect(postView(row, 'imperial').highlight?.figure).toMatch(/ lb$/);
  });

  it('carries the caption and the duration in words', () => {
    const view = postView(postPayload(workout(), 'felt strong'), 'metric');
    expect(view.caption).toBe('felt strong');
    expect(view.duration).toBe('1 h 12 min');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/social/__tests__/postPayload.test.ts`
Expected: FAIL — cannot resolve `../postPayload`.

- [ ] **Step 3: Write `postPayload.ts`**

`mobile/src/social/postPayload.ts`:

```ts
import type { Milestone } from '@adaptive-macros/engine';
import type { LoggedSet } from '../db';
import { displayWeight, formatDateLong } from '../format';
import { describeMilestone } from '../milestones';
import type { ShareSummary } from '../shareCard';
import type { UnitSystem } from '../state/settings';

/**
 * A finished workout as the server keeps it, and as a reader sees it.
 *
 * Kept in kilograms and minutes, never as formatted text: a post is read by
 * people in other units, and "220.5 lb" written by a pound user is wrong for
 * every reader in kilograms. The reader formats. The share card is the same
 * view at a larger size and is built from here too, so the card and the post
 * can never disagree about which set was a lift's best.
 */

export const MAX_CAPTION = 500;
const MAX_TITLE = 80;
const MAX_EXERCISES = 30;

export interface PostExercise {
  name: string;
  sets: number;
  /** Null for a lift done with no added load; the reader quotes its reps instead. */
  best_kg: number | null;
  best_reps: number;
}

/** A `posts` row, column for column, less what the server fills in. */
export interface PostRow {
  session_id: string;
  title: string;
  performed_on: string;
  duration_min: number;
  sets: number;
  volume_kg: number | null;
  exercises: PostExercise[];
  highlight: Milestone | null;
  caption: string | null;
}

export interface FinishedWorkout {
  sessionId: string;
  title: string;
  date: string;
  startedAt: string;
  finishedAt: Date;
  sets: LoggedSet[];
  milestone: Milestone | null;
}

export const postPayload = (workout: FinishedWorkout, caption: string | null): PostRow => {
  const said = caption?.trim() ? caption.trim() : null;
  if (said !== null && said.length > MAX_CAPTION) {
    throw new Error(`A caption can be at most ${MAX_CAPTION} characters.`);
  }

  // Warm-ups are left out of all of it, as they are everywhere else — a post
  // that counts the empty bar is flattering, not honest.
  const working = workout.sets.filter((set) => set.setType !== 'warmup');
  const order: string[] = [];
  for (const set of working) if (!order.includes(set.exerciseName)) order.push(set.exerciseName);

  const exercises = order.map((name): PostExercise => {
    const mine = working.filter((set) => set.exerciseName === name);
    const loaded = mine.filter((set) => set.weightKg !== null && set.weightKg > 0);
    if (loaded.length === 0) {
      return { name, sets: mine.length, best_kg: null, best_reps: Math.max(...mine.map((set) => set.reps)) };
    }
    // Heaviest, and of those the most reps: the set someone would quote.
    const top = loaded.reduce((a, b) =>
      (b.weightKg as number) > (a.weightKg as number) ||
      ((b.weightKg as number) === (a.weightKg as number) && b.reps > a.reps)
        ? b
        : a,
    );
    return { name, sets: mine.length, best_kg: top.weightKg as number, best_reps: top.reps };
  });

  const volumeKg = working.reduce((sum, set) => sum + (set.weightKg ?? 0) * set.reps, 0);
  const minutes = Math.round((workout.finishedAt.getTime() - new Date(workout.startedAt).getTime()) / 60000);

  return {
    session_id: workout.sessionId,
    title: workout.title.trim().slice(0, MAX_TITLE) || 'Workout',
    performed_on: workout.date,
    duration_min: Math.max(1, minutes),
    sets: working.length,
    volume_kg: volumeKg > 0 ? volumeKg : null,
    exercises: exercises.slice(0, MAX_EXERCISES),
    highlight: workout.milestone,
    caption: said,
  };
};

export type PostView = ShareSummary & { caption: string | null };

const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

const trim = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));

export const postView = (row: PostRow, units: UnitSystem, maxExercises = 3): PostView => {
  const unit = units === 'metric' ? 'kg' : 'lb';
  const best = (lift: PostExercise): string =>
    lift.best_kg === null
      ? `${lift.best_reps} reps`
      : `${trim(Math.round(displayWeight(lift.best_kg, units) * 10) / 10)} ${unit} × ${lift.best_reps}`;
  const copy = row.highlight ? describeMilestone(row.highlight, units) : null;

  return {
    title: row.title,
    date: formatDateLong(row.performed_on),
    duration: formatDuration(row.duration_min),
    sets: row.sets,
    volume:
      row.volume_kg === null
        ? null
        : `${Math.round(displayWeight(row.volume_kg, units)).toLocaleString('en-US')} ${unit}`,
    exercises: row.exercises.slice(0, maxExercises).map((lift) => ({ name: lift.name, sets: lift.sets, best: best(lift) })),
    more: Math.max(0, row.exercises.length - maxExercises),
    highlight: copy ? { label: copy.label, figure: copy.figure } : null,
    caption: row.caption,
  };
};
```

- [ ] **Step 4: Rebuild `shareCard.ts` on it**

Replace the whole of `mobile/src/shareCard.ts` with:

```ts
import type { Milestone } from '@adaptive-macros/engine';
import type { LoggedSet } from './db';
import { postPayload, postView } from './social/postPayload';
import type { UnitSystem } from './state/settings';

/**
 * What a finished workout says about itself when it is shared.
 *
 * The figures someone would actually post: how long, how many sets, how much
 * was moved, and the best set of each lift. It is a post's view at story size —
 * six lifts rather than three — so the picture and the post are worked out by
 * the same code. Kept free of drawing so the canvas only has to put it where
 * it goes.
 */
export interface ShareSummary {
  title: string;
  date: string;
  duration: string;
  sets: number;
  volume: string | null;
  exercises: { name: string; sets: number; best: string }[];
  /** How many more lifts there were than the card has room for. */
  more: number;
  highlight: { label: string; figure: string } | null;
}

/** Lifts beyond this are summed into "+ 2 more": a story card is not a log. */
const MAX_EXERCISES = 6;

export const shareSummary = (input: {
  title: string;
  date: string;
  startedAt: string;
  finishedAt: Date;
  sets: LoggedSet[];
  units: UnitSystem;
  milestone: Milestone | null;
}): ShareSummary => postView(postPayload({ ...input, sessionId: '' }, null), input.units, MAX_EXERCISES);
```

- [ ] **Step 5: Run both test files**

Run: `npx vitest run src/social/__tests__/postPayload.test.ts src/__tests__/shareCard.test.ts`
Expected: PASS — 12 new tests, and all 9 share card tests unchanged.

- [ ] **Step 6: Full suite, types, commit**

Run: `npx vitest run && npx tsc --noEmit -p .` — all pass.

```bash
cd .. && git add mobile/src/social/postPayload.ts mobile/src/social/__tests__/postPayload.test.ts mobile/src/shareCard.ts
git commit -m "feat(social): a workout post is kept in kilograms and read in the reader's units" -m "<body>" -m "<trailer>"
```

---

### Task 3: Profile rules and error messages

**Files:**
- Create: `mobile/src/social/profileRules.ts`
- Create: `mobile/src/social/errors.ts`
- Create: `mobile/src/social/__tests__/rules.test.ts`

**Interfaces:**
- Produces:
  - `interface ProfileInput { username: string; displayName: string; instagram: string }`
  - `interface ProfileFields { username: string; display_name: string; instagram: string | null }`
  - `normaliseProfile(input: ProfileInput): ProfileFields`
  - `profileProblem(fields: ProfileFields): string | null`
  - `interface ServerError { code?: string; message?: string; status?: number; name?: string }`
  - `messageFor(error: ServerError): string`
  - `isAlreadyPosted(error: ServerError): boolean`

- [ ] **Step 1: Write the failing tests**

`mobile/src/social/__tests__/rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isAlreadyPosted, messageFor } from '../errors';
import { normaliseProfile, profileProblem } from '../profileRules';

const fields = (username: string, displayName = 'Marc', instagram = '') =>
  normaliseProfile({ username, displayName, instagram });

describe('normaliseProfile', () => {
  it('lower-cases the username and drops a typed @ from both handles', () => {
    expect(normaliseProfile({ username: ' @Marc.K ', displayName: ' Marc ', instagram: '@marc_k' })).toEqual({
      username: 'marc.k',
      display_name: 'Marc',
      instagram: 'marc_k',
    });
  });

  it('stores no Instagram handle when none was given', () => {
    expect(fields('marc').instagram).toBeNull();
  });
});

describe('profileProblem', () => {
  it('accepts a profile inside the rules', () => {
    expect(profileProblem(fields('marc_k.99', 'Marc', 'Marc.K'))).toBeNull();
  });

  it('refuses a username too short, too long, or with other characters', () => {
    for (const username of ['ab', 'a'.repeat(21), 'marc-k', 'marc k']) {
      expect(profileProblem(fields(username))).toBe('A username is 3 to 20 lower-case letters, numbers, _ or .');
    }
  });

  it('refuses an empty or overlong name', () => {
    expect(profileProblem(fields('marc', ' '))).toBe('A name is 1 to 40 characters.');
    expect(profileProblem(fields('marc', 'x'.repeat(41)))).toBe('A name is 1 to 40 characters.');
  });

  it('refuses something that is not an Instagram handle', () => {
    expect(profileProblem(fields('marc', 'Marc', 'instagram.com/marc!'))).toBe(
      'That is not an Instagram handle: up to 30 letters, numbers, _ or .',
    );
  });
});

describe('messageFor', () => {
  it('names a taken username', () => {
    expect(
      messageFor({ code: '23505', message: 'duplicate key value violates unique constraint "profiles_username_key"' }),
    ).toBe('That username is taken.');
  });

  it('explains a wrong or expired code', () => {
    expect(messageFor({ code: 'otp_expired', message: 'Token has expired or is invalid' })).toBe(
      'That code is wrong or has expired. Check it, or send a new one.',
    );
  });

  it('explains too many codes', () => {
    expect(messageFor({ code: 'over_email_send_rate_limit', status: 429 })).toBe(
      'Too many codes sent. Wait a few minutes and try again.',
    );
  });

  it('explains being offline', () => {
    expect(messageFor({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' })).toBe(
      'Could not reach the server. Check the connection and try again.',
    );
    expect(messageFor({ message: 'TypeError: Failed to fetch' })).toBe(
      'Could not reach the server. Check the connection and try again.',
    );
  });

  it('passes anything else through as the server said it', () => {
    expect(messageFor({ message: 'Something specific' })).toBe('Something specific');
    expect(messageFor({})).toBe('Something went wrong. Try again.');
  });
});

describe('isAlreadyPosted', () => {
  it('recognises the second copy of the same workout', () => {
    expect(
      isAlreadyPosted({ code: '23505', message: 'duplicate key value violates unique constraint "posts_author_id_session_id_key"' }),
    ).toBe(true);
    expect(isAlreadyPosted({ code: '23505', message: 'duplicate key value violates unique constraint "profiles_username_key"' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/social/__tests__/rules.test.ts`
Expected: FAIL — cannot resolve `../errors`.

- [ ] **Step 3: Write `profileRules.ts`**

```ts
/**
 * Profile fields checked on the phone before they are sent.
 *
 * The database enforces the same rules and is the one that counts; these exist
 * so that a mistake is explained in a sentence, not as a constraint name. The
 * patterns must stay identical to the checks in the migration.
 */

const USERNAME = /^[a-z0-9_.]{3,20}$/;
const INSTAGRAM = /^[A-Za-z0-9_.]{1,30}$/;

export interface ProfileInput {
  username: string;
  displayName: string;
  instagram: string;
}

/** The `profiles` columns a person can edit. */
export interface ProfileFields {
  username: string;
  display_name: string;
  instagram: string | null;
}

export const normaliseProfile = (input: ProfileInput): ProfileFields => ({
  username: input.username.trim().replace(/^@/, '').toLowerCase(),
  display_name: input.displayName.trim(),
  instagram: input.instagram.trim().replace(/^@/, '') || null,
});

export const profileProblem = (fields: ProfileFields): string | null => {
  if (!USERNAME.test(fields.username)) return 'A username is 3 to 20 lower-case letters, numbers, _ or .';
  if (fields.display_name.length < 1 || fields.display_name.length > 40) return 'A name is 1 to 40 characters.';
  if (fields.instagram !== null && !INSTAGRAM.test(fields.instagram)) {
    return 'That is not an Instagram handle: up to 30 letters, numbers, _ or .';
  }
  return null;
};
```

- [ ] **Step 4: Write `errors.ts`**

```ts
/**
 * Supabase failures in words someone can act on.
 *
 * Auth errors carry a `code` such as `otp_expired`; database errors carry the
 * Postgres code and the constraint's name in the message, which is how a taken
 * username is told apart from a workout already posted.
 */

export interface ServerError {
  code?: string;
  message?: string;
  status?: number;
  name?: string;
}

const OFFLINE = 'Could not reach the server. Check the connection and try again.';

export const isAlreadyPosted = (error: ServerError): boolean =>
  error.code === '23505' && (error.message?.includes('session') ?? false);

export const messageFor = (error: ServerError): string => {
  if (error.code === '23505' && error.message?.includes('username')) return 'That username is taken.';
  if (error.code === 'otp_expired') return 'That code is wrong or has expired. Check it, or send a new one.';
  if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
    return 'Too many codes sent. Wait a few minutes and try again.';
  }
  if (
    error.name === 'AuthRetryableFetchError' ||
    error.message?.includes('Failed to fetch') ||
    error.message?.includes('Network request failed')
  ) {
    return OFFLINE;
  }
  return error.message?.trim() || 'Something went wrong. Try again.';
};
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run src/social/__tests__/rules.test.ts` — PASS, 12 tests.

- [ ] **Step 6: Full suite, types, commit**

Run: `npx vitest run && npx tsc --noEmit -p .` — all pass.

```bash
cd .. && git add mobile/src/social/profileRules.ts mobile/src/social/errors.ts mobile/src/social/__tests__/rules.test.ts
git commit -m "feat(social): profile mistakes and server failures are explained in a sentence" -m "<body>" -m "<trailer>"
```

---

### Task 4: Supabase client, API, and who is signed in

Verified by typecheck here and end to end in Task 5; these modules import `react-native` and the network, which vitest does not run.

**Files:**
- Create: `mobile/src/social/types.ts`, `mobile/src/social/client.ts`, `mobile/src/social/api.ts`, `mobile/src/social/session.tsx`
- Modify: `mobile/app/_layout.tsx` (wrap in `SocialProvider`)
- Modify: `mobile/src/state/settings.ts` (`postWorkouts`)
- Modify: `mobile/package.json`

**Interfaces:**
- Consumes: `PostRow` (Task 2); `ProfileFields`, `messageFor`, `isAlreadyPosted`, `ServerError` (Task 3).
- Produces:
  - `types.ts`: `interface Profile { id: string; username: string; display_name: string; instagram: string | null; is_private: boolean }`, `interface Post extends PostRow { id: string; author_id: string; created_at: string }`
  - `client.ts`: `supabase: SupabaseClient | null`
  - `api.ts`: `sendCode(email): Promise<void>`, `verifyCode(email, code): Promise<void>`, `signOut(): Promise<void>`, `myProfile(): Promise<Profile | null>`, `saveProfile(fields: ProfileFields & { is_private: boolean }): Promise<Profile>`, `createPost(row: PostRow): Promise<void>`, `myPosts(): Promise<Post[]>`, `deletePost(id: string): Promise<void>`, `deleteAccount(): Promise<void>` — all throw `Error` whose message is shown as is.
  - `session.tsx`: `SocialProvider`, `useSocial(): { configured: boolean; session: Session | null | undefined; profile: Profile | null | undefined; refreshProfile(): Promise<Profile | null> }` — `session` undefined while the stored session is read; `profile` undefined while loading or after a failed load, null when signed in without one.
  - `settings.postWorkouts: boolean`, default `false`.

- [ ] **Step 1: Install**

Run: `npx expo install @supabase/supabase-js @react-native-async-storage/async-storage`
Expected: both added to `mobile/package.json` at Expo-compatible versions.

- [ ] **Step 2: `types.ts`**

```ts
import type { PostRow } from './postPayload';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  instagram: string | null;
  is_private: boolean;
}

export interface Post extends PostRow {
  id: string;
  author_id: string;
  created_at: string;
}
```

- [ ] **Step 3: `client.ts`**

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

/**
 * The connection to Supabase, or null in a build without its address and key.
 *
 * The key is the publishable one, made to ship inside apps; row-level security
 * in the database is what keeps one person's posts from another, not the key.
 * Null rather than a throw, so a build without social keeps every other feature.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          // The web build keeps the session in localStorage, supabase-js's default.
          ...(Platform.OS === 'web' ? {} : { storage: AsyncStorage }),
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: Platform.OS === 'web',
        },
      })
    : null;

// A backgrounded app's timers do not run, so a native build refreshes its
// token only while in front — Supabase's own advice for React Native.
if (supabase !== null && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
```

- [ ] **Step 4: `api.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './client';
import { isAlreadyPosted, messageFor, type ServerError } from './errors';
import type { PostRow } from './postPayload';
import type { ProfileFields } from './profileRules';
import type { Post, Profile } from './types';

/**
 * Every call the screens make to Supabase.
 *
 * Each one throws an Error whose message is ready to show, so a screen catches
 * and displays it and never has to know what Postgres or the auth server said.
 */

const PROFILE_COLUMNS = 'id, username, display_name, instagram, is_private';
const POST_COLUMNS =
  'id, author_id, session_id, title, performed_on, duration_min, sets, volume_kg, exercises, highlight, caption, created_at';

const client = (): SupabaseClient => {
  if (supabase === null) throw new Error('Sign-in is not set up in this build.');
  return supabase;
};

function fail(error: ServerError): never {
  throw new Error(messageFor(error));
}

const userId = async (): Promise<string> => {
  const { data } = await client().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('You are signed out. Sign in and try again.');
  return id;
};

export const sendCode = async (email: string): Promise<void> => {
  const { error } = await client().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  if (error) fail(error);
};

export const verifyCode = async (email: string, code: string): Promise<void> => {
  const { error } = await client().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
  if (error) fail(error);
};

export const signOut = async (): Promise<void> => {
  const { error } = await client().auth.signOut();
  if (error) fail(error);
};

export const myProfile = async (): Promise<Profile | null> => {
  const id = await userId();
  const { data, error } = await client().from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle();
  if (error) fail(error);
  return data as Profile | null;
};

export const saveProfile = async (fields: ProfileFields & { is_private: boolean }): Promise<Profile> => {
  const id = await userId();
  const { data, error } = await client().from('profiles').upsert({ id, ...fields }).select(PROFILE_COLUMNS).single();
  if (error) fail(error);
  return data as Profile;
};

export const createPost = async (row: PostRow): Promise<void> => {
  const author_id = await userId();
  const { error } = await client().from('posts').insert({ ...row, author_id });
  // A retry whose first attempt did reach the server: that one is the post.
  if (error && !isAlreadyPosted(error)) fail(error);
};

export const myPosts = async (): Promise<Post[]> => {
  const id = await userId();
  // Filtered by author although the policy already does it: step 2 widens the
  // policy to followers, and this list must stay "mine".
  const { data, error } = await client()
    .from('posts')
    .select(POST_COLUMNS)
    .eq('author_id', id)
    .order('created_at', { ascending: false });
  if (error) fail(error);
  // `numeric` can arrive as a string; the views do arithmetic on it.
  return (data ?? []).map((post) => ({
    ...post,
    volume_kg: post.volume_kg === null ? null : Number(post.volume_kg),
  })) as Post[];
};

export const deletePost = async (id: string): Promise<void> => {
  const { error } = await client().from('posts').delete().eq('id', id);
  if (error) fail(error);
};

export const deleteAccount = async (): Promise<void> => {
  const { error } = await client().rpc('delete_account');
  if (error) fail(error);
  // The user no longer exists on the server; only the local copy of the session is left to drop.
  await client().auth.signOut({ scope: 'local' });
};
```

- [ ] **Step 5: `session.tsx`**

```tsx
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { myProfile } from './api';
import { supabase } from './client';
import type { Profile } from './types';

/**
 * Who is signed in, and their profile, for the screens that care.
 *
 * `undefined` means "not known yet" for both, so a screen can show a spinner
 * rather than briefly claiming someone is signed out or has no username.
 */

interface SocialState {
  configured: boolean;
  session: Session | null | undefined;
  profile: Profile | null | undefined;
  refreshProfile: () => Promise<Profile | null>;
}

const SocialContext = createContext<SocialState | null>(null);

export const SocialProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null | undefined>(supabase === null ? null : undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  const refreshProfile = useCallback(async () => {
    const next = await myProfile();
    setProfile(next);
    return next;
  }, []);

  useEffect(() => {
    if (supabase === null) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    // Nothing else is called from inside this callback: supabase-js holds a
    // lock while it runs, and a call back into it from here can deadlock.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;
  // Keyed on the user, not the session object, which a token refresh replaces.
  const known = session !== undefined;
  useEffect(() => {
    if (userId === null) {
      setProfile(known ? null : undefined);
      return;
    }
    setProfile(undefined);
    // A failed load leaves the profile unknown, not missing: offline is not
    // the same as never having chosen a username.
    refreshProfile().catch(() => setProfile(undefined));
  }, [userId, known, refreshProfile]);

  return (
    <SocialContext.Provider value={{ configured: supabase !== null, session, profile, refreshProfile }}>
      {children}
    </SocialContext.Provider>
  );
};

export const useSocial = (): SocialState => {
  const state = useContext(SocialContext);
  if (state === null) throw new Error('useSocial is used outside SocialProvider.');
  return state;
};
```

- [ ] **Step 6: Mount the provider**

In `mobile/app/_layout.tsx`, add `import { SocialProvider } from '../src/social/session';` and wrap the `<StorageGate>…</StorageGate>` element inside `<AppProvider>`:

```tsx
      <AppProvider>
        <SocialProvider>
          {/* Inside the provider, because it reads the load error from the store. */}
          <StorageGate>
            …unchanged…
          </StorageGate>
        </SocialProvider>
      </AppProvider>
```

- [ ] **Step 7: The setting**

In `mobile/src/state/settings.ts`, after `restSound: boolean;` in `AppSettings`:

```ts
  /**
   * Whether the finish sheet leads with POST. Set by what someone did last
   * time — posted, or left without posting — so a regular poster gets one tap
   * and someone who never posts is not nagged.
   */
  postWorkouts: boolean;
```

and in `DEFAULT_SETTINGS`, after `restSound: true,`: `postWorkouts: false,`

- [ ] **Step 8: Types and tests**

Run: `npx tsc --noEmit -p . && npx vitest run` — no errors, all pass.

- [ ] **Step 9: Commit**

```bash
cd .. && git add mobile/src/social/types.ts mobile/src/social/client.ts mobile/src/social/api.ts mobile/src/social/session.tsx mobile/app/_layout.tsx mobile/src/state/settings.ts mobile/package.json package-lock.json
git commit -m "feat(social): the app can talk to Supabase and knows who is signed in" -m "<body>" -m "<trailer>"
```

---

### Task 5: Sign-in, profile, and the account screen

**Prerequisite (owner):** both Supabase email templates — Authentication → Emails → **Confirm signup** and **Magic Link** — contain `{{ .Token }}`. Without it the email has no code to type. Check before the end-to-end step; if not done, stop and ask.

**Files:**
- Create: `mobile/app/sign-in.tsx`, `mobile/app/profile-setup.tsx`, `mobile/app/account.tsx`
- Modify: `mobile/app/_layout.tsx` (three routes)
- Modify: `mobile/app/(tabs)/settings.tsx` (Account section)
- Modify: `mobile/src/components/Controls.tsx` (`Field` props)

**Interfaces:**
- Consumes: `sendCode`, `verifyCode`, `saveProfile`, `signOut`, `deleteAccount` (Task 4); `useSocial` (Task 4); `normaliseProfile`, `profileProblem` (Task 3).
- Produces: routes `/sign-in`, `/profile-setup`, `/account`. Contract used by Task 7: `/sign-in` ends with `router.back()` for a returning user, or `router.replace('/profile-setup')` for a new one; `/profile-setup` ends with `router.back()`. Either way the screen that pushed `/sign-in` gets focus back.

- [ ] **Step 1: `Field` gains two props**

In `mobile/src/components/Controls.tsx`, add to `FieldProps`:

```ts
  /** Emails, usernames and codes must not be capitalised by the keyboard. */
  autoCapitalize?: 'none' | 'sentences';
  maxLength?: number;
```

destructure `autoCapitalize = 'sentences', maxLength` in `Field`, and pass `autoCapitalize={autoCapitalize}` and `maxLength={maxLength}` to its `TextInput`.

- [ ] **Step 2: `app/sign-in.tsx`**

```tsx
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Card } from '../src/components/Card';
import { Button, Field } from '../src/components/Controls';
import { Screen } from '../src/components/Screen';
import { sendCode, verifyCode } from '../src/social/api';
import { useSocial } from '../src/social/session';
import { font, space, useTheme } from '../src/theme';

/**
 * Sign in with a code sent by email.
 *
 * A code rather than a link: the link would open in the mail app's browser,
 * and on an iPhone that is not the installed web app, so the session would
 * land somewhere the app cannot see. A code is typed where it is needed.
 * A first sign-in goes on to choosing a username; a returning one goes back.
 */
export default function SignInScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { refreshProfile } = useSocial();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const run = async (step: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await step();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    run(async () => {
      await sendCode(email);
      setSentTo(email.trim());
      setCode('');
    });

  const verify = () =>
    run(async () => {
      if (sentTo === null) return;
      await verifyCode(sentTo, code);
      const profile = await refreshProfile();
      if (profile === null) router.replace('/profile-setup');
      else router.back();
    });

  return (
    <Screen>
      <Card subtitle="An account is only needed to post workouts. Everything else works without one.">
        {sentTo === null ? (
          <>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="you@example.com"
            />
            <Button label={busy ? 'Sending…' : 'Send a code'} onPress={() => void send()} disabled={busy || !email.includes('@')} />
          </>
        ) : (
          <>
            <Text style={[styles.note, { color: colors.textMuted }]}>A 6-digit code is on its way to {sentTo}.</Text>
            <Field
              label="Code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoCapitalize="none"
              maxLength={6}
              placeholder="123456"
            />
            <Button label={busy ? 'Checking…' : 'Sign in'} onPress={() => void verify()} disabled={busy || code.trim().length !== 6} />
            <Button label="Use a different email" variant="subtle" onPress={() => setSentTo(null)} disabled={busy} />
          </>
        )}
        {problem && <Text style={[styles.problem, { color: colors.danger }]}>{problem}</Text>}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 14, marginBottom: space.md },
  problem: { fontFamily: font.ui, fontSize: 14, marginTop: space.sm },
});
```

- [ ] **Step 3: `app/profile-setup.tsx`**

```tsx
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Card } from '../src/components/Card';
import { Button, Field, Segmented } from '../src/components/Controls';
import { Screen } from '../src/components/Screen';
import { saveProfile } from '../src/social/api';
import { normaliseProfile, profileProblem } from '../src/social/profileRules';
import { useSocial } from '../src/social/session';
import { font, space, useTheme } from '../src/theme';

type Visibility = 'private' | 'public';

/** Choosing a username on first sign-in, and editing the profile after. */
export default function ProfileSetupScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { profile, refreshProfile } = useSocial();
  const [username, setUsername] = useState(profile?.username ?? '');
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [instagram, setInstagram] = useState(profile?.instagram ?? '');
  const [visibility, setVisibility] = useState<Visibility>(profile?.is_private === false ? 'public' : 'private');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    const fields = normaliseProfile({ username, displayName, instagram });
    const found = profileProblem(fields);
    if (found !== null) {
      setProblem(found);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await saveProfile({ ...fields, is_private: visibility === 'private' });
      await refreshProfile();
      router.back();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" maxLength={20} placeholder="marc.k" hint="3 to 20 lower-case letters, numbers, _ or ." />
        <Field label="Name" value={displayName} onChangeText={setDisplayName} maxLength={40} placeholder="Marc" />
        <Field label="Instagram (optional)" value={instagram} onChangeText={setInstagram} autoCapitalize="none" maxLength={31} placeholder="@yourhandle" />
        <Segmented
          label="Who can see your posts"
          options={[
            { value: 'private', label: 'People I approve' },
            { value: 'public', label: 'Anyone' },
          ]}
          value={visibility}
          onChange={setVisibility}
        />
        <Text style={[styles.note, { color: colors.textFaint }]}>
          Following arrives in the next update. Until then, only you can see your posts either way.
        </Text>
        <Button label={busy ? 'Saving…' : 'Save'} onPress={() => void save()} disabled={busy} />
        {problem && <Text style={[styles.problem, { color: colors.danger }]}>{problem}</Text>}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 13, marginVertical: space.sm },
  problem: { fontFamily: font.ui, fontSize: 14, marginTop: space.sm },
});
```

- [ ] **Step 4: `app/account.tsx`**

```tsx
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Card } from '../src/components/Card';
import { Button } from '../src/components/Controls';
import { Screen } from '../src/components/Screen';
import { confirm, notify } from '../src/dialog';
import { deleteAccount, signOut } from '../src/social/api';
import { useSocial } from '../src/social/session';
import { font, space, useTheme } from '../src/theme';

/** The account: who you are to other people, your posts, and the way out. */
export default function AccountScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { configured, session, profile, refreshProfile } = useSocial();
  const [busy, setBusy] = useState(false);

  const leave = async (step: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await step();
    } catch (error) {
      notify(failure, (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const sure = await confirm({
      title: 'Delete your account?',
      message: 'Your profile and every post are removed from the server for good. Your log on this phone is not touched.',
      confirmLabel: 'Delete account',
      destructive: true,
    });
    if (!sure) return;
    await leave(async () => {
      await deleteAccount();
      notify('Account deleted');
      router.back();
    }, 'Could not delete the account');
  };

  const note = (text: string) => <Text style={[styles.note, { color: colors.textMuted }]}>{text}</Text>;

  let body: React.ReactNode;
  if (!configured) {
    body = <Card>{note('Sign-in is not set up in this build.')}</Card>;
  } else if (session === undefined) {
    body = <ActivityIndicator color={colors.text} />;
  } else if (session === null) {
    body = (
      <Card>
        {note('An account is only needed to post workouts. Everything else works without one.')}
        <Button label="Sign in" onPress={() => router.push('/sign-in')} />
      </Card>
    );
  } else if (profile === undefined) {
    body = (
      <Card>
        {note('Could not load your profile.')}
        <Button label="Try again" onPress={() => void refreshProfile().catch(() => undefined)} />
      </Card>
    );
  } else if (profile === null) {
    body = (
      <Card>
        {note('Choose a username to finish setting up.')}
        <Button label="Choose a username" onPress={() => router.push('/profile-setup')} />
      </Card>
    );
  } else {
    body = (
      <>
        <Card title={`@${profile.username}`} subtitle={profile.display_name}>
          {profile.instagram && note(`Instagram: @${profile.instagram}`)}
          {note(profile.is_private ? 'Private: only people you approve will see your posts.' : 'Public: anyone will be able to see your posts.')}
          <Button label="Edit profile" onPress={() => router.push('/profile-setup')} />
        </Card>
        <Card>
          <Button label="Sign out" variant="subtle" disabled={busy} onPress={() => void leave(signOut, 'Could not sign out')} />
          <Button label="Delete account" variant="danger" disabled={busy} onPress={() => void remove()} />
        </Card>
      </>
    );
  }

  return <Screen>{body}</Screen>;
}

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 14, marginBottom: space.md },
});
```

- [ ] **Step 5: Routes**

In `mobile/app/_layout.tsx`, after the `import-workouts` `Stack.Screen`, add three entries in the same shape (`presentation: 'modal'`, `headerShown: true`, `headerStyle: { backgroundColor: colors.surface }`, `headerTintColor: colors.text`) with names and titles: `sign-in` / `Sign in`, `profile-setup` / `Your profile`, `account` / `Account`.

- [ ] **Step 6: The Account row in Settings**

In `mobile/app/(tabs)/settings.tsx`: import `useSocial` from `../../src/social/session`; in the component, `const social = useSocial();`. Immediately before `<Section title="Your data">`, add:

```tsx
      <Section title="Account">
        <Card
          subtitle={
            social.profile
              ? `Signed in as @${social.profile.username}`
              : 'Sign in to post workouts. Everything else works without an account.'
          }
        >
          <Button label={social.profile ? 'Open account' : 'Sign in'} onPress={() => router.push('/account')} />
        </Card>
      </Section>
```

- [ ] **Step 7: Types and tests**

Restart Metro first if typed routes complain about the new routes (they regenerate on start). Run: `npx tsc --noEmit -p . && npx vitest run`.

- [ ] **Step 8: End to end in the browser**

Start Metro on a fresh port (`npx expo start --web --port <new> --clear`, in the background; stop it at the end). Then:
1. Settings → Account → Sign in. Enter the owner's test address (ask the owner which to use; do not invent one). Send a code.
2. Ask the owner for the 6-digit code from the email. Enter it. Expected: the profile screen opens.
3. Save with username `Al` → the sentence about usernames appears, nothing is sent. Save a valid one → back on Account showing `@username`, Private.
4. Edit profile → change the name → Save → Account shows the new name.
5. Sign out → Account offers Sign in. Sign in again with a new code → goes straight back (profile exists).
6. Leave Delete account for Task 6's check.

Stub `window.confirm` before any step that confirms (browser dialogs block automation).

- [ ] **Step 9: Commit**

```bash
cd .. && git add mobile/app/sign-in.tsx mobile/app/profile-setup.tsx mobile/app/account.tsx mobile/app/_layout.tsx "mobile/app/(tabs)/settings.tsx" mobile/src/components/Controls.tsx
git commit -m "feat(social): sign in with an emailed code and choose a username" -m "<body>" -m "<trailer>"
```

---

### Task 6: Your posts

**Files:**
- Create: `mobile/src/components/PostCard.tsx`
- Create: `mobile/app/my-posts.tsx`
- Modify: `mobile/app/_layout.tsx` (route `my-posts` / `Your posts`)
- Modify: `mobile/app/account.tsx` (the Your posts button)

**Interfaces:**
- Consumes: `myPosts`, `deletePost` (Task 4); `postView`, `PostView` (Task 2); `Post` (Task 4).
- Produces: `PostCard({ view: PostView; onDelete?: () => void })` — reused by step 2's feed.

- [ ] **Step 1: `PostCard.tsx`**

```tsx
import { StyleSheet, Text, View } from 'react-native';
import type { PostView } from '../social/postPayload';
import { font, radius, space, useTheme } from '../theme';
import { Button } from './Controls';

/** One workout post: the figures, the day's best, the first lifts, and what was said about it. */
export const PostCard = ({ view, onDelete }: { view: PostView; onDelete?: () => void }) => {
  const { colors } = useTheme();
  const facts = [view.date, view.duration, `${view.sets} ${view.sets === 1 ? 'set' : 'sets'}`, view.volume]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>{view.title}</Text>
      <Text style={[styles.facts, { color: colors.textMuted }]}>{facts}</Text>
      {view.caption && <Text style={[styles.caption, { color: colors.text }]}>{view.caption}</Text>}
      {view.highlight && (
        <Text style={[styles.highlight, { color: colors.accent }]}>
          NEW BEST · {view.highlight.label} · {view.highlight.figure}
        </Text>
      )}
      {view.exercises.map((lift) => (
        <Text key={lift.name} style={[styles.lift, { color: colors.text }]}>
          {lift.sets} {lift.sets === 1 ? 'set' : 'sets'} {lift.name} — {lift.best}
        </Text>
      ))}
      {view.more > 0 && (
        <Text style={[styles.more, { color: colors.textFaint }]}>
          + {view.more} more {view.more === 1 ? 'exercise' : 'exercises'}
        </Text>
      )}
      {onDelete && <Button label="Delete post" variant="subtle" onPress={onDelete} />}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.lg, marginBottom: space.md },
  title: { fontFamily: font.display, fontSize: 20 },
  facts: { fontFamily: font.figure, fontSize: 13, marginTop: 4, marginBottom: space.sm },
  caption: { fontFamily: font.ui, fontSize: 15, marginBottom: space.sm },
  highlight: { fontFamily: font.uiStrong, fontSize: 13, marginBottom: space.sm },
  lift: { fontFamily: font.ui, fontSize: 14, marginBottom: 2 },
  more: { fontFamily: font.ui, fontSize: 13, marginTop: 2, marginBottom: space.sm },
});
```

- [ ] **Step 2: `app/my-posts.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Button } from '../src/components/Controls';
import { PostCard } from '../src/components/PostCard';
import { Screen } from '../src/components/Screen';
import { confirm, notify } from '../src/dialog';
import { deletePost, myPosts } from '../src/social/api';
import { postView } from '../src/social/postPayload';
import type { Post } from '../src/social/types';
import { useApp } from '../src/state/AppStore';
import { font, space, useTheme } from '../src/theme';

/** What you have posted, newest first — how you can tell posting worked before there is a feed. */
export default function MyPostsScreen() {
  const { colors } = useTheme();
  const { settings } = useApp();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    setProblem(null);
    try {
      setPosts(await myPosts());
    } catch (error) {
      setProblem((error as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (post: Post) => {
    const sure = await confirm({
      title: 'Delete this post?',
      message: 'It is removed from your profile. The workout stays in your log.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!sure) return;
    try {
      await deletePost(post.id);
      setPosts((current) => current?.filter((p) => p.id !== post.id) ?? null);
    } catch (error) {
      notify('Could not delete the post', (error as Error).message);
    }
  };

  const say = (text: string) => <Text style={[styles.note, { color: colors.textMuted }]}>{text}</Text>;

  return (
    <Screen>
      {problem !== null ? (
        <>
          {say(problem)}
          <Button label="Try again" onPress={() => void load()} />
        </>
      ) : posts === null ? (
        <ActivityIndicator color={colors.text} />
      ) : posts.length === 0 ? (
        say('Nothing posted yet. Finish a workout and tap POST.')
      ) : (
        posts.map((post) => (
          <PostCard key={post.id} view={postView(post, settings.units)} onDelete={() => void remove(post)} />
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 14, marginBottom: space.md },
});
```

- [ ] **Step 3: Route, types, tests**

Add `my-posts` / `Your posts` to `_layout.tsx` in the same shape as Task 5's routes. In `app/account.tsx`, after the Edit profile button: `<Button label="Your posts" variant="subtle" onPress={() => router.push('/my-posts')} />`. Run `npx tsc --noEmit -p . && npx vitest run`.

- [ ] **Step 4: End to end**

Signed in from Task 5: Account → Your posts → "Nothing posted yet". (Posting arrives in Task 7; re-check this screen there.)

- [ ] **Step 5: Commit**

```bash
cd .. && git add mobile/src/components/PostCard.tsx mobile/app/my-posts.tsx mobile/app/_layout.tsx mobile/app/account.tsx
git commit -m "feat(social): your posts, newest first, each deletable" -m "<body>" -m "<trailer>"
```

---

### Task 7: POST on the finish sheet

**Files:**
- Modify: `mobile/src/components/FinishSheet.tsx`
- Modify: `mobile/app/session.tsx`

**Interfaces:**
- Consumes: `postPayload`, `FinishedWorkout`, `MAX_CAPTION` (Task 2); `createPost` (Task 4); `useSocial` (Task 4); `settings.postWorkouts` (Task 4); the `/sign-in` and `/profile-setup` contract (Task 5).
- Produces: `FinishSheet` props become `{ summary: ShareSummary | null; hidden: boolean; account: 'unavailable' | 'signed-out' | 'needs-profile' | 'ready'; postFirst: boolean; onPost: (caption: string) => Promise<void>; onNeedAccount: () => void; onDone: (posted: boolean) => void }`.

- [ ] **Step 1: FinishSheet**

In `mobile/src/components/FinishSheet.tsx`:

1. Imports: add `TextInput` to the `react-native` import, and `import { MAX_CAPTION } from '../social/postPayload';`.
2. Props interface:

```ts
interface FinishSheetProps {
  /** The finished workout, or null when the sheet is closed. */
  summary: ShareSummary | null;
  /** Out of the way while sign-in is open over it, keeping the caption typed so far. */
  hidden: boolean;
  /** Whether posting is possible, and if not, what stands in the way. */
  account: 'unavailable' | 'signed-out' | 'needs-profile' | 'ready';
  /** Lead with POST and an open caption: what this person did last time. */
  postFirst: boolean;
  onPost: (caption: string) => Promise<void>;
  onNeedAccount: () => void;
  onDone: (posted: boolean) => void;
}
```

3. State and the reset, inside the component:

```ts
  const [caption, setCaption] = useState('');
  const [writing, setWriting] = useState(postFirst);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
```

and in the existing `useEffect` on `[summary]`, after `setNote(null);`, add `setCaption(''); setPosted(false); setWriting(postFirst);`. Leave the dependency list as `[summary]`: the choice is read once per finished workout, and a change to the setting mid-sheet (posting sets it) must not snap the caption shut.

4. The action:

```ts
  const post = async () => {
    if (account === 'signed-out' || account === 'needs-profile') {
      onNeedAccount();
      return;
    }
    // Someone who does not usually post sees the caption only once they ask to.
    if (!writing) {
      setWriting(true);
      return;
    }
    setPosting(true);
    setNote(null);
    try {
      await onPost(caption);
      setPosted(true);
    } catch (error) {
      setNote((error as Error).message);
    } finally {
      setPosting(false);
    }
  };
```

5. Render: `visible={summary !== null && !hidden}`. The preview's height is `writing ? 240 : 360` (both on `styles.preview` and `styles.image` — pass `{ height }` inline). Below the preview, when `account !== 'unavailable' && writing && !posted`:

```tsx
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Say something about it (optional)"
            placeholderTextColor={loud.figureFaint}
            maxLength={MAX_CAPTION}
            multiline
            style={[styles.caption, { color: loud.figure, borderColor: loud.rule, backgroundColor: loud.panel }]}
          />
```

Then the buttons, in this order. Define `const postLeads = account !== 'unavailable' && writing;` and a POST button:

```tsx
  const postButton = account === 'unavailable' ? null : (
    <Tappable onPress={() => { if (!posting && !posted) void post(); }} scaleTo={0.97} style={styles.action}>
      <SlashPanel color={postLeads ? loud.loud : loud.panel} style={styles.button}>
        <Text style={[styles.buttonLabel, { color: postLeads ? loud.onLoud : loud.figure }]}>
          {posted ? 'POSTED' : posting ? 'POSTING…' : 'POST'}
        </Text>
      </SlashPanel>
    </Tappable>
  );
```

The SHARE button's panel colour becomes `postLeads ? loud.panel : loud.loud` and its label colour `postLeads ? loud.figure : loud.onLoud`. Render: `{postLeads && postButton}`, SHARE, `{!postLeads && postButton}`, the note, DONE. DONE calls `onDone(posted)`; `onRequestClose` does the same.

6. Style: `caption: { minHeight: 64, maxHeight: 120, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.sm, fontFamily: font.ui, fontSize: 14, textAlignVertical: 'top', marginBottom: space.sm },`

- [ ] **Step 2: Session screen**

In `mobile/app/session.tsx`:

1. Imports: `useFocusEffect` joins the `expo-router` import; `useCallback` joins the React import if absent; add `import { createPost } from '../src/social/api';`, `import { type FinishedWorkout, postPayload } from '../src/social/postPayload';`, `import { useSocial } from '../src/social/session';`. Pull `updateSettings` from `useApp()` if it is not already destructured.
2. Replace the `finished` state with:

```ts
  /** The finished workout and its card, for the sheet that offers to share and post it. */
  const [finished, setFinished] = useState<{ workout: FinishedWorkout; summary: ShareSummary } | null>(null);
  /** Sign-in is open over the finish sheet. */
  const [signingIn, setSigningIn] = useState(false);
  const social = useSocial();
  // Back from sign-in (or profile setup), the sheet comes back with its caption.
  useFocusEffect(useCallback(() => setSigningIn(false), []));
```

3. In `finish`, replace the `setFinished(shareSummary({...}))` call with:

```ts
      const workout: FinishedWorkout = {
        sessionId: session.id,
        title: session.name,
        date: session.date,
        startedAt: session.startedAt,
        finishedAt: new Date(),
        sets: await sessionSets(session.id),
        milestone: reached[0] ?? null,
      };
      setFinished({ workout, summary: shareSummary({ ...workout, units: settings.units }) });
```

4. Replace the `<FinishSheet … />` element with:

```tsx
      <FinishSheet
        summary={milestone === null ? (finished?.summary ?? null) : null}
        hidden={signingIn}
        account={
          !social.configured
            ? 'unavailable'
            : !social.session
              ? 'signed-out'
              : social.profile
                ? 'ready'
                : 'needs-profile'
        }
        postFirst={settings.postWorkouts}
        onPost={async (caption) => {
          if (finished === null) return;
          await createPost(postPayload(finished.workout, caption));
          if (!settings.postWorkouts) void updateSettings({ postWorkouts: true });
        }}
        onNeedAccount={() => {
          setSigningIn(true);
          router.push(social.session ? '/profile-setup' : '/sign-in');
        }}
        onDone={(posted) => {
          if (social.configured && !posted && settings.postWorkouts) void updateSettings({ postWorkouts: false });
          setFinished(null);
          router.back();
        }}
      />
```

5. The `MilestoneSheet` `onDismiss` check `if (finished === null) router.back();` stays as is (still correct with the new state shape).

- [ ] **Step 3: Types and tests**

Run: `npx tsc --noEmit -p . && npx vitest run` — no errors, all pass.

- [ ] **Step 4: End to end in the browser**

On the Metro from Task 5, signed in with a profile:
1. Start a blank workout, add an exercise, log one set (blur the fields first — see the autofill note in `session.tsx`), FINISH, dismiss any milestone.
2. With `postWorkouts` false: SHARE is red, POST is grey. Tap POST → caption opens, POST turns red. Type a caption, tap POST → POSTED.
3. DONE. Account → Your posts → the post, with the caption, in the viewer's units.
4. Retry safety is proven without the browser: the database test "are one per workout" and the rules test for `isAlreadyPosted` together cover a retry that reached the server twice.
5. Next workout: the sheet opens with the caption open and POST red. DONE without posting → the workout after that leads with SHARE again.
6. Sign out, finish a workout, tap POST → sign-in opens over the session; sign in → back on the sheet with the caption still there → POST works.
7. Offline: in DevTools set the network offline, tap POST → "Could not reach the server…", POST still available; back online, POST → POSTED.
8. Your posts → Delete post (stub `window.confirm` to true) → gone. Account → Delete account (stub confirm) → "Account deleted"; signing in again with the same email creates a fresh account with no profile.

- [ ] **Step 5: Commit**

```bash
cd .. && git add mobile/src/components/FinishSheet.tsx mobile/app/session.tsx
git commit -m "feat(session): a finished workout can be posted with a caption" -m "<body>" -m "<trailer>"
```

- [ ] **Step 6: Deploy the web build** (owner approval for the deploy; see `services/gemini-proxy/README.md`)

From `mobile/`: `rm -rf dist && npx expo export --platform web`, copy `dist` to `services/gemini-proxy/web`, then run `gcloud run deploy …` **from PowerShell** (it fails from Git Bash). Verify `/_health` says `ok` and the live `entry-*.js` hash matches the staged one. The Supabase site URL / redirect allow-list must include the Cloud Run origin before Google sign-in (Task 8); the email code needs no redirect.

---

### Task 8: Google sign-in

**Blocked until the owner has:** created an OAuth client (Google Cloud Console → APIs & Services → Credentials → OAuth client ID, type *Web application*, authorised redirect URI `https://eigtmrtavtpzzjzfcskc.supabase.co/auth/v1/callback`), entered its id and secret in Supabase → Authentication → Providers → Google, and added to Supabase → Authentication → URL Configuration → Redirect URLs: the Cloud Run origin, `http://localhost:*/**` for development, and `adaptivemacros://**`. Ask before starting; do not proceed without it.

**Files:**
- Modify: `mobile/src/social/api.ts` (`signInWithGoogle`)
- Modify: `mobile/app/sign-in.tsx` (button)
- Modify: `mobile/package.json`

**Interfaces:**
- Produces: `signInWithGoogle(): Promise<void>` — on the web the page leaves for Google and comes back to `/account`; on Android it resolves once the session is set, or quietly if the person closed the browser.

- [ ] **Step 1: Install**

Run: `npx expo install expo-web-browser expo-auth-session`

- [ ] **Step 2: `signInWithGoogle` in `api.ts`**

Add imports `import { makeRedirectUri } from 'expo-auth-session';`, `import * as WebBrowser from 'expo-web-browser';`, `import { Platform } from 'react-native';`, and:

```ts
/**
 * Google through Supabase. On the web the whole page goes to Google and comes
 * back, and supabase-js reads the session from the address. A native build
 * opens Google in a browser sheet that returns through the app's own scheme,
 * and the session is taken from the address it returns to.
 */
export const signInWithGoogle = async (): Promise<void> => {
  if (Platform.OS === 'web') {
    const { error } = await client().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/account` },
    });
    if (error) fail(error);
    return;
  }
  const redirectTo = makeRedirectUri({ scheme: 'adaptivemacros', path: 'account' });
  const { data, error } = await client().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) fail(error);
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return; // closed by the person: not a failure
  const params = new URLSearchParams(result.url.split('#')[1] ?? '');
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) throw new Error('Google did not finish signing you in. Try again.');
  const { error: sessionError } = await client().auth.setSession({ access_token, refresh_token });
  if (sessionError) fail(sessionError);
};
```

- [ ] **Step 3: The button**

In `app/sign-in.tsx`, in the email step, after the "Send a code" button:

```tsx
            <Button
              label="Continue with Google"
              variant="subtle"
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  await signInWithGoogle();
                  // On the web the page has already left; on Android the session is now set.
                  if (Platform.OS !== 'web') {
                    const profile = await refreshProfile();
                    if (profile === null) router.replace('/profile-setup');
                    else router.back();
                  }
                })
              }
            />
```

(import `Platform` from `react-native` and `signInWithGoogle` from the API.) On the web the return lands on `/account`, which shows "Choose a username" for a first sign-in.

- [ ] **Step 4: Types, tests, end to end**

`npx tsc --noEmit -p . && npx vitest run`. In the browser: Continue with Google → Google's page (the owner signs in; never type credentials) → back on Account. Then the owner checks on an iPhone with the app installed to the home screen: does Google come back into the installed app, signed in? If it returns in Safari instead, hide the Google button in the iOS standalone PWA (`Platform.OS === 'web' && (navigator as { standalone?: boolean }).standalone === true`) and say so in the commit.

- [ ] **Step 5: Commit**

```bash
cd .. && git add mobile/src/social/api.ts mobile/app/sign-in.tsx mobile/package.json package-lock.json
git commit -m "feat(social): sign in with Google" -m "<body>" -m "<trailer>"
```
