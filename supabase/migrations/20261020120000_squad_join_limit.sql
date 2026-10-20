-- A limit on how often one person may try a squad invite code.
--
-- A code is six characters from 32, about a billion possibilities, and
-- join_squad answered as fast as anyone could call it. A billion is not many
-- for a script with no limit, and every wrong guess said so plainly
-- (squad_not_found), so walking the space was only a matter of patience.
-- Twenty tries an hour is far more than anyone typing a code from a message
-- needs, and turns the walk into thousands of years.
--
-- Counted per signed-in person, not per address: join_squad already requires
-- a session, and the address is not something the database can trust.

-- In `private`, which the Data API does not serve, and with no grants, so no
-- user can read whose attempts are logged or clear their own. Only
-- join_squad, running as its owner, touches it.
create table private.squad_join_attempts (
  user_id uuid not null,
  at timestamptz not null default now()
);
create index squad_join_attempts_user_at on private.squad_join_attempts (user_id, at desc);

-- The same function as 20261019120000_squad_access.sql, compared against
-- what production runs before this was written, with the limit in front. An
-- attempt is logged before the code is looked at, so right and wrong guesses
-- count the same and the limit says nothing about which a code was. Rows over
-- a day old are dropped as the caller's own come in, so the table stays the
-- size of one day's tries.
--
-- One change of contract: a code that matches no squad now returns null
-- instead of raising squad_not_found. Raising rolls back everything the call
-- did, the logged attempt included, so the wrong guesses — the only ones the
-- limit exists for — would never have been counted. The app reads null as
-- "no squad has that code", and still understands the old error.
create or replace function public.join_squad(code text) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
  declare
    me uuid := auth.uid();
    target uuid;
  begin
    if me is null then
      raise exception 'not_signed_in' using errcode = '42501';
    end if;

    delete from private.squad_join_attempts
     where user_id = me and at < now() - interval '1 day';
    if (select count(*) from private.squad_join_attempts
         where user_id = me and at > now() - interval '1 hour') >= 20 then
      raise exception 'too_many_attempts' using errcode = 'P0001';
    end if;
    insert into private.squad_join_attempts (user_id) values (me);

    select s.id into target from public.squads s where s.invite_code = upper(btrim(code));
    if target is null then
      return null;
    end if;
    if exists (select 1 from public.squad_members m where m.squad_id = target and m.user_id = me) then
      return target;
    end if;
    delete from public.squad_members where user_id = me;
    insert into public.squad_members (squad_id, user_id, role) values (target, me, 'member');
    return target;
  end;
  $$;
-- `create or replace` keeps the grants it had; restated so this file says on
-- its own who may call it.
revoke execute on function public.join_squad(text) from public, anon;
grant execute on function public.join_squad(text) to authenticated;
