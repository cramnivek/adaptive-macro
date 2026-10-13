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
-- The hide trigger counts reports by post on every insert.
create index reports_post on public.reports (post_id);
alter table public.reports enable row level security;
-- Written by the reporter, read by nobody here: the owner reviews them in the dashboard.
-- The subjects are checked with the caller's own row-level security, so a report can
-- only be about a post or a profile the reporter can see. Without that, the foreign
-- key alone would say whether a hidden post's id exists, and people who cannot see a
-- post could still count towards hiding it.
create policy "a report is made by the reporter" on public.reports
  for insert to authenticated with check (
    reporter_id = (select auth.uid())
    and (post_id is null or exists (select 1 from public.posts p where p.id = post_id))
    and (profile_id is null or exists (select 1 from public.profiles pr where pr.id = profile_id))
  );

alter table public.posts add column hidden boolean not null default false;

-- Posts could be updated column by column by their author, `hidden` included, which
-- would let an author un-hide a post three people reported. Only the trigger below
-- (security definer, so it is not bound by this) may change the flag. A column added
-- to posts later must be granted here to be updatable.
revoke update on public.posts from anon, authenticated;
grant update (id, author_id, session_id, title, performed_on, duration_min, sets, volume_kg, exercises, highlight, caption, created_at)
  on public.posts to authenticated;

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

-- A hidden post is still its author's to see; nobody else's. feed_posts and
-- feed_page read posts as the caller, so they follow this policy and need no change.
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

-- The message is exactly `blocked_word`, with no detail, because the app matches on it.
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

-- The people you have blocked. The list has to name them, but their live profile
-- is hidden from you by the profiles policy (a block hides both ways), and
-- reading it from here anyway would let anyone read a profile across a block:
-- block the account back and the list returns its current name and
-- privacy, following it through every rename. Leaving the row out instead would
-- tell you that you had been blocked. So a block keeps what you could see at the
-- moment you made it, and the list reads that and never joins profiles.
alter table public.blocks
  add column username text,
  add column display_name text,
  add column is_private boolean;

-- The row is always overwritten, so what a user sends for these columns is ignored.
-- The Instagram handle is deliberately not kept: the list shows a name and a
-- username, and a handle added after the block must never reach the blocked person.
-- One signal remains and is accepted on purpose: the snapshot is what you could see
-- when you blocked them, and blocking again (after unblocking) refreshes it, so
-- someone can learn the name you use at that moment. The alternative is a row with
-- no name, or one that disappears, and either would tell you that you had been blocked.
-- Triggers fire in name order, so this runs before blocks_target_exists; a block of
-- an account that does not exist gets nulls here and is then dropped by that
-- trigger, so it never lands. Either order would be correct.
create function public.snapshot_blocked_profile() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
  begin
    select p.username, p.display_name, p.is_private
      into new.username, new.display_name, new.is_private
      from public.profiles p where p.id = new.blocked_id;
    return new;
  end
  $$;
create trigger blocks_snapshot_profile before insert on public.blocks
  for each row execute function public.snapshot_blocked_profile();

-- Security invoker: the blocks policy already limits the rows to your own blocks.
-- instagram stays in the declared type because the app reads it; it is always null.
create function public.my_blocked_profiles()
  returns table (id uuid, username text, display_name text, instagram text, is_private boolean)
  language sql stable security invoker set search_path = ''
  as $$
    select b.blocked_id, b.username, b.display_name, null::text as instagram, b.is_private
      from public.blocks b
     where b.blocker_id = (select auth.uid())
     order by b.username
  $$;
revoke execute on function public.my_blocked_profiles() from public, anon;
grant execute on function public.my_blocked_profiles() to authenticated;
