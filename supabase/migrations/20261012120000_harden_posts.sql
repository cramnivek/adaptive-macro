-- Harden posts before anyone else can read them: step 2 of the social feature
-- lets followers read what step 1 stores.
-- See docs/superpowers/specs/2026-10-12-social-follows-and-feed-design.md,
-- section "Harden posts first".
--
-- Until now the database checked only that `exercises` was an array of at most
-- thirty elements. Anyone with an account can write a row by hand, so a row
-- could carry a string where a number belongs, or a few megabytes, and crash
-- the phone of every follower who opened the feed. These checks make the
-- database refuse such a row, so a reader can rely on the shape. The app's
-- reader still tolerates a malformed row, because a row written before this
-- migration is not covered by it once it is already there.
--
-- Every row the app writes passes: `postPayload` produces exactly these keys
-- and ranges. The applied migration is left alone; this one only adds to it.

-- Immutable so a check constraint may call it. It only reads its argument, so
-- an empty search_path costs nothing and closes the door on a shadowed operator.
-- plpgsql with one `if` per test, rather than one long expression, because
-- Postgres does not promise to stop evaluating `a or b` when `a` is true:
-- `(x)::numeric` on a string would raise an error instead of returning false.
create function public.valid_post_exercises(value jsonb) returns boolean
  language plpgsql immutable set search_path = ''
  as $$
declare
  lift jsonb;
begin
  if value is null then return false; end if;
  if jsonb_typeof(value) <> 'array' then return false; end if;
  if jsonb_array_length(value) > 30 then return false; end if;

  for lift in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(lift) <> 'object' then return false; end if;

    -- Exactly four keys: the four are required, and a jsonb object has no
    -- duplicate keys, so a count of four means there is nothing else in it.
    if (select count(*) from jsonb_object_keys(lift)) <> 4 then return false; end if;
    if lift -> 'name' is null or lift -> 'sets' is null
       or lift -> 'best_kg' is null or lift -> 'best_reps' is null then
      return false;
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

-- The engine's `Milestone`: a kind, the landmark crossed, and for a load the
-- lift that crossed it. No highlight is a null column or a JSON null.
create function public.valid_post_highlight(value jsonb) returns boolean
  language plpgsql immutable set search_path = ''
  as $$
begin
  if value is null then return true; end if;
  if jsonb_typeof(value) = 'null' then return true; end if;
  if jsonb_typeof(value) <> 'object' then return false; end if;

  if value - array['kind', 'value', 'exercise'] <> '{}'::jsonb then return false; end if;
  if value -> 'kind' is null or value -> 'value' is null then return false; end if;

  if jsonb_typeof(value -> 'kind') <> 'string' then return false; end if;
  if (value ->> 'kind') not in ('load', 'volume', 'sessions') then return false; end if;

  if jsonb_typeof(value -> 'value') <> 'number' then return false; end if;
  if (value ->> 'value')::numeric < 0 then return false; end if;

  -- Optional, but a JSON null here is still not a string.
  if value -> 'exercise' is not null then
    if jsonb_typeof(value -> 'exercise') <> 'string' then return false; end if;
    if char_length(value ->> 'exercise') > 80 then return false; end if;
  end if;

  return true;
end;
$$;

-- Named, so a later change can tell which rule a refused post broke.
-- The size limits are on the stored binary jsonb form, in bytes (what
-- `pg_column_size` reports), not on the text. The shape limits count
-- characters, and a name of eighty emoji is over three hundred bytes. Thirty
-- ordinary lifts come to about 3.5 KB. Thirty of the longest names allowed come
-- to 5 KB in Latin letters, 7.5 KB in Cyrillic, 10 KB in Chinese or Japanese and
-- 12.4 KB in emoji, which is the largest post the shape rules permit. 16 KB
-- therefore leaves room for any post the app can write, while still stopping a
-- hand-written value of megabytes. The highlight needs far less: a kind, a
-- number and one name come to about 150 bytes, and 1 KB stops a number written
-- with tens of thousands of digits, which is still a valid JSON number.
alter table public.posts
  add constraint posts_exercises_valid check (public.valid_post_exercises(exercises)),
  add constraint posts_highlight_valid check (public.valid_post_highlight(highlight)),
  add constraint posts_session_id_length check (char_length(session_id) <= 64),
  add constraint posts_exercises_size check (pg_column_size(exercises) <= 16384),
  add constraint posts_highlight_size check (highlight is null or pg_column_size(highlight) <= 1024);
