-- A lift in a post may say that its quoted set was an all-time record.
--
-- The share card and the feed mark a lift that set a personal record with a
-- medal, and a post is the feed's only copy of the workout, so the post has to
-- carry it. It is one optional key, `pr`, on a lift in `exercises`, and when
-- present it is the JSON value true and nothing else: a lift with no record
-- leaves it out rather than writing false, so every post written so far, and
-- every lift without a record, keeps the exact four-key shape it had.
--
-- The same function as 20261012120000_harden_posts.sql, compared against what
-- production runs before this was written, with the key count relaxed to four
-- or five and the fifth allowed only as `pr: true`. `create or replace` keeps
-- the function's grants and the check constraint that calls it, and a looser
-- rule cannot make an existing row invalid.
create or replace function public.valid_post_exercises(value jsonb) returns boolean
  language plpgsql immutable set search_path = ''
  as $$
declare
  lift jsonb;
  keys int;
begin
  if value is null then return false; end if;
  if jsonb_typeof(value) <> 'array' then return false; end if;
  if jsonb_array_length(value) > 30 then return false; end if;

  for lift in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(lift) <> 'object' then return false; end if;

    -- Four required keys, and at most one more, which must be `pr`. A jsonb
    -- object has no duplicate keys, so with the four present a count of five
    -- and a `pr` key means there is nothing else in it.
    keys := (select count(*) from jsonb_object_keys(lift));
    if keys not in (4, 5) then return false; end if;
    if lift -> 'name' is null or lift -> 'sets' is null
       or lift -> 'best_kg' is null or lift -> 'best_reps' is null then
      return false;
    end if;
    if keys = 5 then
      if lift -> 'pr' is null then return false; end if;
      if lift -> 'pr' <> 'true'::jsonb then return false; end if;
    end if;

    if jsonb_typeof(lift -> 'name') <> 'string' then return false; end if;
    if char_length(lift ->> 'name') not between 1 and 80 then return false; end if;

    -- "Integer" is a number with no fractional part, so 3.0 is accepted: that
    -- is what a JSON encoder may write for a whole number.
    if jsonb_typeof(lift -> 'sets') <> 'number' then return false; end if;
    if (lift ->> 'sets')::numeric <> trunc((lift ->> 'sets')::numeric) then return false; end if;
    if (lift ->> 'sets')::numeric not between 0 and 100 then return false; end if;

    -- Null is a lift done with no added load; it is not a claimed zero.
    if jsonb_typeof(lift -> 'best_kg') <> 'null' then
      if jsonb_typeof(lift -> 'best_kg') <> 'number' then return false; end if;
      if (lift ->> 'best_kg')::numeric not between 0 and 1000 then return false; end if;
    end if;

    if jsonb_typeof(lift -> 'best_reps') <> 'number' then return false; end if;
    if (lift ->> 'best_reps')::numeric <> trunc((lift ->> 'best_reps')::numeric) then return false; end if;
    if (lift ->> 'best_reps')::numeric not between 0 and 1000 then return false; end if;
  end loop;

  return true;
end;
$$;
