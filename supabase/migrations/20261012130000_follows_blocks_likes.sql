-- Follows, blocks and likes: step 2 of the social feature.
-- See docs/superpowers/specs/2026-10-12-social-follows-and-feed-design.md.
--
-- Who may read a post is decided in one place, can_see(), and every policy
-- that needs the answer asks it, so the rule cannot drift between tables.
--
-- The binding rule for blocks: nobody can learn they have been blocked from
-- anything the API returns. Each place a block could show is closed below.

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
-- The account-deletion cascade looks rows up by the second person, here and in likes.
create index blocks_blocked on public.blocks (blocked_id);

create table public.likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index likes_user on public.likes (user_id);

-- The helpers live in a schema of their own. PostgREST exposes every function
-- in public as /rpc/..., and can_see(x) or visible_profile(x) called by hand
-- answers false exactly when x has blocked the caller: a block oracle. Policies
-- still reach them as the caller, so the roles get USAGE here; PostgREST does
-- not expose this schema, so there is no route to them from the API.
create schema private;
grant usage on schema private to authenticated;

-- Security definer because a block is visible only to the person who made it,
-- yet both people's reads must respect it. Granted to nobody: the definer
-- functions below call it as their owner.
create function private.blocked_between(a uuid, b uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select exists (
      select 1 from public.blocks
       where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
    )
  $$;
revoke execute on function private.blocked_between(uuid, uuid) from public, anon, authenticated;

-- The one rule: the author; otherwise, with no block either way, anyone when
-- the author is public, or an accepted follower when private.
create function private.can_see(author uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select author = auth.uid()
        or (
          not private.blocked_between(author, auth.uid())
          and (
            exists (select 1 from public.profiles p where p.id = author and not p.is_private)
            or exists (
              select 1 from public.follows f
               where f.follower_id = auth.uid() and f.followee_id = author and f.status = 'accepted'
            )
          )
        )
  $$;
revoke execute on function private.can_see(uuid) from public, anon;
grant execute on function private.can_see(uuid) to authenticated;

-- A policy checks EXECUTE on the functions it names against the caller, and
-- blocked_between is not granted to users, so the profile and like policies ask
-- through this narrower wrapper: it answers only "may I see this person".
create function private.visible_profile(profile uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select not private.blocked_between(profile, auth.uid()) $$;
revoke execute on function private.visible_profile(uuid) from public, anon;
grant execute on function private.visible_profile(uuid) to authenticated;

-- A follow's status is the followee's to decide, so the client never sets it:
-- pending for a private account, accepted for a public one.
-- Your own follow of someone who blocked you, or of an account that does not
-- exist, is dropped without an error, and the two look the same, so nobody can
-- test whether they are blocked. Only the caller's own row is treated so: this
-- trigger runs before row-level security, and a forged row (someone else as
-- the follower) must fall through to be refused as any forgery is, or the
-- silence would reveal whether the forged pair has a block.
create function public.follow_status() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
  begin
    if new.follower_id = auth.uid()
       and (private.blocked_between(new.follower_id, new.followee_id)
            or not exists (select 1 from public.profiles where id = new.followee_id)) then
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
-- No row for a profile the caller cannot see (missing, or blocked either way),
-- so the counts do not show that a blocker's account exists.
create function public.follow_counts(profile uuid) returns table (followers bigint, following bigint)
  language sql stable security definer set search_path = ''
  as $$
    select
      (select count(*) from public.follows where followee_id = profile and status = 'accepted'),
      (select count(*) from public.follows where follower_id = profile and status = 'accepted')
    where exists (select 1 from public.profiles where id = profile)
      and private.visible_profile(profile)
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
-- only on a post the reader can see. The author sees their own posts whatever
-- the block, so a like by anyone blocked either way is hidden separately.
create policy "likes are visible on posts you can see" on public.likes
  for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id) and private.visible_profile(user_id));
create policy "a like is your own, on a post you can see" on public.likes
  for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.posts p where p.id = post_id));
create policy "a like is removed by whoever made it" on public.likes
  for delete to authenticated using (user_id = (select auth.uid()));

-- Posts: step 1's author-only read becomes can_see().
drop policy "posts are readable by their author" on public.posts;
create policy "posts are readable by those allowed to see them" on public.posts
  for select to authenticated using (private.can_see(author_id));

-- Profiles stay findable by anyone signed in, except across a block, so a
-- blocked person cannot find the account that blocked them (visible_profile is
-- defined above, beside can_see).
drop policy "profiles are readable when signed in" on public.profiles;
create policy "profiles are readable unless blocked either way" on public.profiles
  for select to authenticated
  using (private.visible_profile(id));
