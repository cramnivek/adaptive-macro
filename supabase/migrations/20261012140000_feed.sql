-- The feed: a post with its author and likes, read as the person asking.
-- security_invoker makes the view obey the caller's row-level security, so it
-- can never show more than selecting from posts would. That also keeps blocks
-- out of it: the posts, profiles and likes policies already hide a blocked
-- person, so the like_count below counts only the likes the caller can see (a
-- like by someone who blocked you is not in it) and a post by someone who
-- blocked you is not a row at all.

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
