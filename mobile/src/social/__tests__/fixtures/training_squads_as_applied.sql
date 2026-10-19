-- What production actually ran as 20261018120000_training_squads, copied from
-- supabase_migrations.schema_migrations on 2026-10-19. The file in
-- supabase/migrations was edited after it was applied, so the two differ: this
-- version has no capacity trigger, no one-squad-per-person index, and open
-- cheers policies. Kept so later migrations can be tested against the database
-- that really exists, not only the one the repository describes.

create table public.squads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  invite_code text not null unique check (invite_code ~ '^[2-9A-Z]{4,8}$'),
  weekly_target integer not null default 16 check (weekly_target between 6 and 48),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.squad_members (
  squad_id uuid not null references public.squads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'member')) default 'member',
  joined_at timestamptz not null default now(),
  primary key (squad_id, user_id)
);

create table public.squad_checkins (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  workout_id text not null,
  performed_on date not null default current_date,
  pr_highlight text check (char_length(pr_highlight) <= 120),
  created_at timestamptz not null default now()
);

create table public.squad_cheers (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads (id) on delete cascade,
  checkin_id uuid not null references public.squad_checkins (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (checkin_id, user_id)
);

create index squad_members_user on public.squad_members (user_id);

create index squad_checkins_squad_date on public.squad_checkins (squad_id, performed_on desc);

alter table public.squads enable row level security;

alter table public.squad_members enable row level security;

alter table public.squad_checkins enable row level security;

alter table public.squad_cheers enable row level security;

-- Squads are readable by signed-in users (needed to find by invite_code)
create policy "squads are readable when signed in" on public.squads
  for select to authenticated using (true);

create policy "squads are created by their owner" on public.squads
  for insert to authenticated with check (created_by = (select auth.uid()));

create policy "squads are updated by their owner" on public.squads
  for update to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));

create policy "squads are deleted by their owner" on public.squads
  for delete to authenticated using (created_by = (select auth.uid()));

-- Members
create policy "members are readable when signed in" on public.squad_members
  for select to authenticated using (true);

create policy "users can join a squad" on public.squad_members
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "users can leave a squad" on public.squad_members
  for delete to authenticated using (user_id = (select auth.uid()));

-- Checkins
create policy "checkins are readable by squad members" on public.squad_checkins
  for select to authenticated using (
    exists (
      select 1 from public.squad_members m
      where m.squad_id = squad_checkins.squad_id and m.user_id = (select auth.uid())
    )
  );

create policy "checkins are created by squad members" on public.squad_checkins
  for insert to authenticated with check (
    user_id = (select auth.uid()) and
    exists (
      select 1 from public.squad_members m
      where m.squad_id = squad_checkins.squad_id and m.user_id = (select auth.uid())
    )
  );

-- Cheers
create policy "cheers are readable by squad members" on public.squad_cheers
  for select to authenticated using (true);

create policy "cheers are created by squad members" on public.squad_cheers
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "cheers can be removed by who gave them" on public.squad_cheers
  for delete to authenticated using (user_id = (select auth.uid()));
