-- Squads become private to their members, and an invite code becomes the only
-- way in.
--
-- The first squads migration let any signed-in user read every squad — invite
-- code included — and insert themselves into any of them by id, so the code
-- guarded nothing. It also let anyone read every squad's member list, and none
-- of the squad tables looked at blocks, so a person you had blocked could read
-- your check-ins and cheers through a shared squad.
--
-- It also has to repair a drift. Production ran an earlier draft of
-- 20261018120000_training_squads.sql, and the file was edited afterwards, so
-- the live database never got the six-member trigger, the one-squad-per-person
-- index, or the cheers policies the file now shows: there, every cheer is
-- readable by everyone and anyone can cheer any check-in. Everything below is
-- therefore written to land on either version: the trigger and index are
-- (re)created here, and the policies it drops have the same names in both.
--
-- Accepted, as with the other social tables: someone who blocked you can still
-- be in a squad you join. Refusing the join would say "this person blocked you"
-- to anyone holding the code, so the join succeeds and the two of you simply do
-- not see each other's membership, check-ins or cheers. What remains visible is
-- the squad being full: a squad of six with a blocked member reads as full to
-- the person who cannot see them.

-- Whether the caller is in a given squad. Security definer because the member
-- policies below ask it, and a policy on squad_members that read squad_members
-- under its own RLS would recurse. It answers only about the caller, so it is
-- no oracle, and it sits in `private`, which the Data API does not serve.
create function private.in_squad(squad uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select exists (
      select 1 from public.squad_members m
       where m.squad_id = squad and m.user_id = auth.uid()
    )
  $$;
revoke execute on function private.in_squad(uuid) from public, anon;
grant execute on function private.in_squad(uuid) to authenticated;

-- Squads: members see their squad and its code (to share it); the creator
-- always sees theirs, which `insert ... returning` needs before the owner's
-- membership row exists.
drop policy "squads are readable when signed in" on public.squads;
create policy "squads are readable by their members" on public.squads
  for select to authenticated using (
    created_by = (select auth.uid()) or private.in_squad(id)
  );

-- Members: visible only inside the squad, and never across a block.
drop policy "members are readable when signed in" on public.squad_members;
create policy "members are readable by their squad" on public.squad_members
  for select to authenticated using (
    private.in_squad(squad_id) and private.visible_profile(user_id)
  );

-- A direct insert is now only the creator adding themselves as owner of their
-- own squad. Everyone else joins through `join_squad`, which checks the code.
-- The old policy also let anyone insert with role 'owner' into any squad.
drop policy "users can join a squad" on public.squad_members;
create policy "creators add themselves as owner" on public.squad_members
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and role = 'owner'
    and exists (
      select 1 from public.squads s
       where s.id = squad_id and s.created_by = (select auth.uid())
    )
  );

-- Joining by code. Security definer so it can find a squad the caller cannot
-- read yet, and so leaving the old squad and joining the new one happen in one
-- transaction: if the new squad is full, the old membership is kept. The two
-- failures are distinct messages because both are things the person holding
-- the code can act on, and neither depends on a block.
create function public.join_squad(code text) returns uuid
  language plpgsql security definer set search_path = ''
  as $$
  declare
    me uuid := auth.uid();
    target uuid;
  begin
    if me is null then
      raise exception 'not_signed_in' using errcode = '42501';
    end if;
    select s.id into target from public.squads s where s.invite_code = upper(btrim(code));
    if target is null then
      raise exception 'squad_not_found' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.squad_members m where m.squad_id = target and m.user_id = me) then
      return target;
    end if;
    delete from public.squad_members where user_id = me;
    insert into public.squad_members (squad_id, user_id, role) values (target, me, 'member');
    return target;
  end;
  $$;
revoke execute on function public.join_squad(text) from public, anon;
grant execute on function public.join_squad(text) to authenticated;

-- The capacity check locks the squad row before counting, so two people taking
-- the last place at once are counted one after the other instead of both seeing
-- five and both getting in. It also runs as its owner now. Every join goes
-- through join_squad, which already counts as owner, but with the member list
-- private, any later path that inserted as the caller would count only the
-- members it could see and walk into a full squad.
create or replace function public.check_squad_capacity() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
  begin
    perform 1 from public.squads s where s.id = new.squad_id for update;
    if (select count(*) from public.squad_members m where m.squad_id = new.squad_id) >= 6 then
      raise exception 'squad_full' using errcode = 'P0001';
    end if;
    return new;
  end;
  $$;
-- A trigger function needs no execute grant, and the first migration left the
-- default one in place, so the advisor listed it as reachable over /rpc.
revoke execute on function public.check_squad_capacity() from public, anon, authenticated;

drop trigger if exists check_squad_capacity_trigger on public.squad_members;
create trigger check_squad_capacity_trigger
  before insert on public.squad_members
  for each row execute function public.check_squad_capacity();

-- One squad per person, which join_squad and the app both assume. Checked
-- before writing this: nobody in production is in two squads.
create unique index if not exists squad_members_single_squad on public.squad_members (user_id);

-- Check-ins and cheers: the squad's, minus anyone on the other side of a block.
drop policy "checkins are readable by squad members" on public.squad_checkins;
create policy "checkins are readable by squad members" on public.squad_checkins
  for select to authenticated using (
    private.in_squad(squad_id) and private.visible_profile(user_id)
  );

drop policy "checkins are created by squad members" on public.squad_checkins;
create policy "checkins are created by squad members" on public.squad_checkins
  for insert to authenticated with check (
    user_id = (select auth.uid()) and private.in_squad(squad_id)
  );

drop policy "cheers are readable by squad members" on public.squad_cheers;
create policy "cheers are readable by squad members" on public.squad_cheers
  for select to authenticated using (
    private.in_squad(squad_id) and private.visible_profile(user_id)
  );

-- A cheer must be for a check-in in the same squad, one the cheerer can see.
-- The old policy only checked the squad id given with the cheer, so a member of
-- one squad could cheer a check-in in another by naming their own squad. The
-- lookup runs under the check-ins policy, so a blocked author's check-in is not
-- there to be cheered.
drop policy "cheers are created by squad members" on public.squad_cheers;
create policy "cheers are created by squad members" on public.squad_cheers
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and private.in_squad(squad_id)
    and exists (
      select 1 from public.squad_checkins c
       where c.id = checkin_id and c.squad_id = squad_cheers.squad_id
    )
  );
