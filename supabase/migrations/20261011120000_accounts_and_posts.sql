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
