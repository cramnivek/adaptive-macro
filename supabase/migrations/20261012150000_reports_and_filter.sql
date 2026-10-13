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
