-- A short word in the list only matches a whole word.
--
-- The filter looked for its words anywhere inside what was written, which is
-- right for "onlyfans" and wrong for anything short: "ass" in the list refuses
-- "classic", "passing" and "grass", and the person it refuses is the owner's
-- own user, mid-caption, with no way to see why. The workout title goes through
-- here too and cannot be edited at the moment of posting, so a collision there
-- makes a workout unpostable until the routine is renamed.
--
-- So the list now reads two ways, decided per word and not by whoever adds it:
--
--   * a word of six letters or more, or one carrying anything that is not a
--     letter — "t.me/", "only fans", "paypal.me" — still matches anywhere,
--     because that is what makes those entries useful and none of them is a
--     piece of an innocent word;
--   * anything shorter matches only as a whole word, so "ass" catches "ass",
--     "ASS!" and "an ass" and leaves "classic" alone.
--
-- The boundary is a letter test rather than Postgres's own \m \M, which treats
-- a digit as part of a word: a slur written with a number in it should still be
-- caught, and "4ss" is the obvious thing someone tries next.
create or replace function public.contains_blocked_word(value text) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select value is not null
       and exists (
         select 1
           from public.blocked_words w
          where case
                  when char_length(w.word) >= 6 or w.word !~ '^[a-z]+$'
                    then position(w.word in lower(value)) > 0
                  else lower(value) ~ ('(^|[^a-z])' || w.word || '([^a-z]|$)')
                end
       )
  $$;
-- The grant was taken away when the function was first written, and `create or
-- replace` keeps the privileges of the function it replaces, so there is
-- nothing to revoke again here. Said out loud because the opposite would be a
-- quiet hole.
