-- Profile avatars, bio, training focus, and PR highlights
-- Expands public.profiles and updates feed_posts view.

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists bio text check (bio is null or char_length(bio) <= 240),
  add column if not exists training_focus text check (training_focus is null or char_length(training_focus) <= 60),
  add column if not exists pr_highlight text check (pr_highlight is null or char_length(pr_highlight) <= 80);

-- Recreate feed_posts view to include avatar_url and training_focus
drop view if exists public.feed_posts cascade;

create view public.feed_posts with (security_invoker = true) as
  select p.*,
         pr.username,
         pr.display_name,
         pr.avatar_url,
         pr.training_focus,
         (select count(*) from public.likes l where l.post_id = p.id) as like_count,
         exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = (select auth.uid())) as liked
    from public.posts p
    join public.profiles pr on pr.id = p.author_id;

-- Recreate feed_page function referencing updated feed_posts
create or replace function public.feed_page(before timestamptz default null, before_id uuid default null, size integer default 20)
  returns setof public.feed_posts
  language sql stable security invoker set search_path = ''
  as $$
    select * from public.feed_posts fp
     where (fp.author_id = (select auth.uid())
            or exists (select 1 from public.follows f
                        where f.follower_id = (select auth.uid())
                          and f.followee_id = fp.author_id
                          and f.status = 'accepted'))
       and (before is null or (fp.created_at, fp.id) < (before, before_id))
     order by fp.created_at desc, fp.id desc
     limit least(greatest(coalesce(size, 20), 1), 50)
  $$;

revoke execute on function public.feed_page(timestamptz, uuid, integer) from public, anon;
grant execute on function public.feed_page(timestamptz, uuid, integer) to authenticated;
revoke all on public.feed_posts from anon;
revoke insert, update, delete, truncate, references, trigger on public.feed_posts from authenticated;
